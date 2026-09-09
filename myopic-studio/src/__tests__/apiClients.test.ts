import { parseScenePrompt } from '../lib/parser';
import { listScenes, loadScene, saveScene } from '../lib/sceneApi';
import { getStoryboard, saveStoryboard } from '../lib/storyboardApi';
import { makeScene } from '../testUtils/sceneFixture';
import type { StoryboardFrame } from '../types/storyboard';

// The three thin wrappers over the backend's routes. Nothing here reaches the network —
// what is under test is the request each one builds and how it unwraps the reply. The
// routes' own behaviour is covered against the real Express app in serverRoutes.test.ts.
const ORIGINAL_FETCH = globalThis.fetch;

/** A fetch reply whose body parses as JSON. */
function mockJson(body: unknown, { ok = true, status = 200 } = {}): jest.Mock {
  const mock = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

/**
 * A failing reply with no JSON body at all — an HTML 502 from a proxy, or a dead
 * backend. `response.json()` rejects, which is what the wrappers' .catch() is for.
 */
function mockNonJson({ status = 500 } = {}): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** The [url, init] pair the wrapper passed to fetch. */
function callArgs(mock: jest.Mock): [string, RequestInit | undefined] {
  return mock.mock.calls[0] as [string, RequestInit | undefined];
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('parseScenePrompt', () => {
  test('POSTs the prompt as JSON to /api/parse', async () => {
    const mock = mockJson({ scene: makeScene(), rawJson: '{}' });
    await parseScenePrompt('a rooftop at dusk');

    const [url, init] = callArgs(mock);
    expect(url).toBe('/api/parse');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ prompt: 'a rooftop at dusk' });
  });

  test('returns the envelope whole — both the scene and the raw JSON', async () => {
    const result = { scene: makeScene(), rawJson: '{"title":"Rooftop"}' };
    mockJson(result);

    // rawJson feeds the panel's "show raw" view, so it must survive the wrapper.
    await expect(parseScenePrompt('a rooftop')).resolves.toEqual(result);
  });

  // The parse route is the one that surfaces upstream Anthropic failures (502 with the
  // API's own message). That message is what the app shows in its error banner, so the
  // server's text has to win over the generic fallback.
  test('prefers the server error message over the status fallback', async () => {
    mockJson({ error: 'Anthropic API error 529: overloaded' }, { ok: false, status: 502 });
    await expect(parseScenePrompt('a scene')).rejects.toThrow(
      'Anthropic API error 529: overloaded'
    );
  });

  test('falls back to the status when the error body carries no message', async () => {
    mockJson({}, { ok: false, status: 400 });
    await expect(parseScenePrompt('a scene')).rejects.toThrow('Parse request failed (400)');
  });

  test('falls back to the status when the body is not JSON at all', async () => {
    mockNonJson({ status: 502 });
    await expect(parseScenePrompt('a scene')).rejects.toThrow('Parse request failed (502)');
  });
});

describe('saveScene', () => {
  test('POSTs the scene wrapped in { scene } — the shape the route destructures', async () => {
    const mock = mockJson({ filename: 'abc.myo' });
    const scene = makeScene();
    await saveScene(scene);

    const [url, init] = callArgs(mock);
    expect(url).toBe('/api/scenes');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ scene });
  });

  test('resolves with the filename the server chose', async () => {
    mockJson({ filename: '3f2504e0-4f89-41d3-9a0c-0305e82c3301.myo' });
    await expect(saveScene(makeScene())).resolves.toEqual({
      filename: '3f2504e0-4f89-41d3-9a0c-0305e82c3301.myo',
    });
  });

  test('prefers the server error message', async () => {
    mockJson({ error: 'invalid sceneId' }, { ok: false, status: 400 });
    await expect(saveScene(makeScene())).rejects.toThrow('invalid sceneId');
  });

  test.each([
    [{}, 'Save failed (500)'],
    [{ notAnError: 'x' }, 'Save failed (500)'],
  ])('falls back to the status for %p', async (body, expected) => {
    mockJson(body, { ok: false, status: 500 });
    await expect(saveScene(makeScene())).rejects.toThrow(expected);
  });

  test('falls back to the status when the body is not JSON at all', async () => {
    mockNonJson({ status: 502 });
    await expect(saveScene(makeScene())).rejects.toThrow('Save failed (502)');
  });
});

describe('listScenes', () => {
  test('GETs /api/scenes with no request body', async () => {
    const mock = mockJson({ scenes: [] });
    await listScenes();

    const [url, init] = callArgs(mock);
    expect(url).toBe('/api/scenes');
    expect(init).toBeUndefined();
  });

  // The route replies { scenes: [...] }; callers get the array.
  test('unwraps the scenes array out of the envelope', async () => {
    const scenes = [
      { filename: 'a.myo', sceneId: 'a', title: 'Wide', created: '2026-08-01T12:00:00.000Z' },
    ];
    mockJson({ scenes });
    await expect(listScenes()).resolves.toEqual(scenes);
  });

  test('an empty library is an empty array, not an error', async () => {
    mockJson({ scenes: [] });
    await expect(listScenes()).resolves.toEqual([]);
  });

  test('throws with the List fallback on a failure with no message', async () => {
    mockJson({}, { ok: false, status: 500 });
    await expect(listScenes()).rejects.toThrow('List failed (500)');
  });
});

describe('loadScene', () => {
  test('GETs the scene by filename', async () => {
    const mock = mockJson({ scene: makeScene() });
    await loadScene('abc.myo');
    expect(callArgs(mock)[0]).toBe('/api/scenes/abc.myo');
  });

  // The filename is interpolated into the path, so it is encoded on the way out. The
  // route rejects anything outside [A-Za-z0-9_-].myo, and an unencoded name would
  // change which path is requested rather than being refused by the server.
  test.each([
    ['../storyboard.json', '/api/scenes/..%2Fstoryboard.json'],
    ['scene one.myo', '/api/scenes/scene%20one.myo'],
    ['a?b.myo', '/api/scenes/a%3Fb.myo'],
  ])('encodes %p into the path', async (filename, expected) => {
    const mock = mockJson({ scene: makeScene() });
    await loadScene(filename).catch(() => undefined);
    expect(callArgs(mock)[0]).toBe(expected);
  });

  test('unwraps the scene out of the envelope', async () => {
    const scene = makeScene();
    mockJson({ scene });
    await expect(loadScene('abc.myo')).resolves.toEqual(scene);
  });

  test('surfaces the route’s 404 message', async () => {
    mockJson({ error: 'not found' }, { ok: false, status: 404 });
    await expect(loadScene('missing.myo')).rejects.toThrow('not found');
  });

  test('falls back to the Load message when the body carries none', async () => {
    mockJson({}, { ok: false, status: 404 });
    await expect(loadScene('missing.myo')).rejects.toThrow('Load failed (404)');
  });
});

describe('getStoryboard', () => {
  test('GETs /api/storyboard and unwraps the frames', async () => {
    const frames: StoryboardFrame[] = [
      {
        frameId: 'f1',
        sceneFilename: 'a.myo',
        sceneTitle: 'Server Room — Night',
        shotNumber: 10,
        notes: '',
        cameraLabel: '35mm MCU',
      },
    ];
    const mock = mockJson({ frames });

    await expect(getStoryboard()).resolves.toEqual(frames);
    expect(callArgs(mock)[0]).toBe('/api/storyboard');
  });

  test('an absent strip comes back as an empty array', async () => {
    mockJson({ frames: [] });
    await expect(getStoryboard()).resolves.toEqual([]);
  });

  test('throws with the status on a failure', async () => {
    mockJson({}, { ok: false, status: 500 });
    await expect(getStoryboard()).rejects.toThrow('Failed to load storyboard (500)');
  });
});

describe('saveStoryboard', () => {
  test('PUTs the frames wrapped in { frames }', async () => {
    const mock = mockJson({ ok: true });
    await saveStoryboard([]);

    const [url, init] = callArgs(mock);
    expect(url).toBe('/api/storyboard');
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ frames: [] });
  });

  test('resolves with nothing — the caller has already updated the store', async () => {
    mockJson({ ok: true });
    await expect(saveStoryboard([])).resolves.toBeUndefined();
  });

  // Storyboard edits persist with no save gate, so this rejection is the only signal
  // that memory and disk have diverged.
  test('throws with the status on a failure', async () => {
    mockJson({ error: 'frames (array) is required' }, { ok: false, status: 400 });
    await expect(saveStoryboard([])).rejects.toThrow('Failed to save storyboard (400)');
  });
});

// sceneApi routes every failure through unwrapError, which prefers the server's { error }
// message; storyboardApi throws a fixed string and never reads the body. Both routes do
// send { error }, so the storyboard wrappers discard a message they were handed. Pinned
// here as current behaviour rather than changed — the fix belongs with whatever surfaces
// these to the user, since nothing today shows the difference.
describe('error-message handling is not consistent across the wrappers', () => {
  test('sceneApi surfaces the server message', async () => {
    mockJson({ error: 'invalid sceneId' }, { ok: false, status: 400 });
    await expect(saveScene(makeScene())).rejects.toThrow('invalid sceneId');
  });

  test('storyboardApi discards it in favour of the status', async () => {
    mockJson({ error: 'frames (array) is required' }, { ok: false, status: 400 });
    await expect(saveStoryboard([])).rejects.toThrow('Failed to save storyboard (400)');

    mockJson({ error: 'frames (array) is required' }, { ok: false, status: 400 });
    await expect(saveStoryboard([])).rejects.not.toThrow(/frames \(array\)/);
  });
});

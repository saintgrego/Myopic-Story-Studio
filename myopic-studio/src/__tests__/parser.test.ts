const { parsePromptToScene, collectFlaggedPaths } = require('../../server/parser');

export {}; // satisfy --isolatedModules; the file has no ES imports of its own

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_FETCH = globalThis.fetch;

// Minimal valid parser output — the server trusts the model's shape and only
// post-processes flags and poseNote.
function modelScene(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Rooftop — Dusk',
    environment: { locationName: 'Rooftop', setting: 'Exterior', timeOfDay: 'Dusk', weather: '[?]' },
    lighting: { scheme: 'Natural', keyLightAzimuth: 270, keyLightElevation: 10, keyLightColor: '#FFD580', fillIntensity: 0.3, rimLight: true, rimIntensity: 0.5, shadowSoftness: 0.6, moodPreset: 'Golden Hour' },
    camera: { shotType: 'LS', angle: 'Low', focalLength: 35, depthOfField: 5.6, focusSubjectId: null, position: { x: 0, y: 1.2, z: 5 }, movement: 'Static', aspectRatio: '2.39:1' },
    characters: [],
    props: [],
    storyboardNotes: '',
    ...overrides,
  };
}

function mockApiResponse(body: unknown, ok = true, status = 200) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('collectFlaggedPaths', () => {
  test('returns dot-paths for every "[?]" sentinel', () => {
    const paths = collectFlaggedPaths({
      environment: { weather: '[?]', timeOfDay: 'Night' },
      camera: { position: { x: '[?]', y: 1.6, z: 4 } },
    });
    expect(paths.sort()).toEqual(['camera.position.x', 'environment.weather']);
  });

  test('uses bracket indices for array entries', () => {
    const paths = collectFlaggedPaths({
      characters: [
        { figureName: 'the guard', poseNote: '[?]' },
        { figureName: '[?]' },
      ],
    });
    expect(paths.sort()).toEqual(['characters[0].poseNote', 'characters[1].figureName']);
  });

  test('returns an empty list when nothing is flagged', () => {
    expect(collectFlaggedPaths(modelScene())).toEqual(['environment.weather']);
    expect(collectFlaggedPaths({ a: 1, b: [{ c: 'x' }] })).toEqual([]);
  });
});

describe('parsePromptToScene', () => {
  test('throws without ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(parsePromptToScene('a scene')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  test('selects the text block by type, not by index (thinking blocks lead)', async () => {
    mockApiResponse({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: 'considering the scene…' },
        { type: 'text', text: JSON.stringify(modelScene()) },
      ],
    });
    const { scene } = await parsePromptToScene('rooftop at dusk');
    expect(scene.title).toBe('Rooftop — Dusk');
    expect(scene.prompt).toBe('rooftop at dusk');
    expect(scene.flaggedParams).toEqual(['environment.weather']);
  });

  test('strips markdown code fences if the model ignores the rule', async () => {
    mockApiResponse({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(modelScene()) + '\n```' }],
    });
    const { scene } = await parsePromptToScene('rooftop at dusk');
    expect(scene.title).toBe('Rooftop — Dusk');
  });

  test('flags poseNote in flaggedParams but strips it from the scene', async () => {
    const character = {
      id: 'char_01',
      figureName: 'the sleeper',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      visible: true,
      mesh: { kind: 'gltf', path: '/assets/poses/sitting.glb' },
      poseNote: '[?]',
    };
    mockApiResponse({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(modelScene({ characters: [character] })) }],
    });
    const { scene } = await parsePromptToScene('someone lying on a bench');
    expect(scene.flaggedParams).toContain('characters[0].poseNote');
    expect(scene.characters[0]).not.toHaveProperty('poseNote');
  });

  test('throws when the response was truncated at max_tokens', async () => {
    mockApiResponse({ stop_reason: 'max_tokens', content: [] });
    await expect(parsePromptToScene('a scene')).rejects.toThrow(/max_tokens/);
  });

  test('throws with status on a non-ok API response', async () => {
    mockApiResponse({ error: { message: 'overloaded' } }, false, 529);
    await expect(parsePromptToScene('a scene')).rejects.toThrow(/529/);
  });

  test('throws on invalid JSON output', async () => {
    mockApiResponse({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sure! Here is your scene: {' }],
    });
    await expect(parsePromptToScene('a scene')).rejects.toThrow(/invalid JSON/);
  });
});

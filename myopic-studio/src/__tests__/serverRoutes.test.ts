/**
 * @jest-environment node
 *
 * These drive the Express app itself, so they run in the environment it actually runs
 * in. jsdom is also actively wrong here: supertest's dependency chain reaches for
 * TextEncoder, which Jest 27's jsdom does not expose (the same generation gap
 * setupTests.ts patches for structuredClone and TextDecoder).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { makeScene } from '../testUtils/sceneFixture';

export {}; // satisfy --isolatedModules; server/ is reached via require, not import

// server/parser.js talks to the Anthropic API over the network. The /api/parse route
// only has to be shown wiring the call up and mapping its outcomes, so the module is
// mocked outright — the parser's own behaviour is covered in parser.test.ts.
jest.mock('../../server/parser', () => ({
  parsePromptToScene: jest.fn(),
  collectFlaggedPaths: jest.fn(),
}));

// The user's real scenes/ and storyboard.json are working-tree data (CLAUDE.md); these
// tests write through the same routes the app does, so they get their own directory.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'myopic-routes-'));
const SCENES_DIR = path.join(TMP_ROOT, 'scenes');
const STORYBOARD_PATH = path.join(TMP_ROOT, 'storyboard.json');

process.env.MYOPIC_SCENES_DIR = SCENES_DIR;
process.env.MYOPIC_STORYBOARD_PATH = STORYBOARD_PATH;

// Required only after the env vars above are set — server/index.js resolves both
// paths once, at module load.
const { app } = require('../../server/index');
const { toMyoEnvelope } = require('../../server/myoFormat');
const { parsePromptToScene } = require('../../server/parser');

function writeSceneFile(filename: string, contents: string): void {
  fs.writeFileSync(path.join(SCENES_DIR, filename), contents, 'utf-8');
}

beforeEach(() => {
  for (const entry of fs.readdirSync(SCENES_DIR)) {
    fs.rmSync(path.join(SCENES_DIR, entry), { recursive: true, force: true });
  }
  fs.rmSync(STORYBOARD_PATH, { force: true });
  (parsePromptToScene as jest.Mock).mockReset();
});

afterAll(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe('POST /api/scenes', () => {
  test('writes <sceneId>.myo and returns the filename', async () => {
    const scene = makeScene();
    const res = await request(app).post('/api/scenes').send({ scene });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ filename: `${scene.sceneId}.myo` });
    expect(fs.existsSync(path.join(SCENES_DIR, `${scene.sceneId}.myo`))).toBe(true);
  });

  test('the file on disk is the snake_case envelope, not the in-memory scene', async () => {
    const scene = makeScene();
    await request(app).post('/api/scenes').send({ scene });

    const written = JSON.parse(
      fs.readFileSync(path.join(SCENES_DIR, `${scene.sceneId}.myo`), 'utf-8')
    );
    expect(written).toEqual(toMyoEnvelope(scene));
    expect(written).toHaveProperty('scene_id');
    expect(written).not.toHaveProperty('sceneId');
  });

  test('400 when the body carries no scene', async () => {
    const res = await request(app).post('/api/scenes').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scene/);
  });

  test('400 when the scene has no sceneId', async () => {
    const { sceneId, ...withoutId } = makeScene();
    const res = await request(app).post('/api/scenes').send({ scene: withoutId });
    expect(res.status).toBe(400);
  });

  // The sceneId becomes a path segment. The read route has always guarded :filename;
  // this pins the same guard on the write side.
  test.each([
    ['../../../escaped', 'traversal'],
    ['nested/child', 'a path separator'],
    ['has space', 'a space'],
    ['dotted.name', 'an embedded dot'],
  ])('rejects a sceneId containing %s', async (sceneId) => {
    const res = await request(app)
      .post('/api/scenes')
      .send({ scene: makeScene({ sceneId }) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sceneId/);
  });

  test('a traversal sceneId writes nothing anywhere', async () => {
    await request(app)
      .post('/api/scenes')
      .send({ scene: makeScene({ sceneId: '../escaped' }) });

    expect(fs.existsSync(path.join(TMP_ROOT, 'escaped.myo'))).toBe(false);
    expect(fs.readdirSync(SCENES_DIR)).toEqual([]);
  });

  test('accepts the randomUUID form the parser actually issues', async () => {
    const scene = makeScene({ sceneId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' });
    const res = await request(app).post('/api/scenes').send({ scene });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/scenes', () => {
  test('returns an empty list when nothing is saved', async () => {
    const res = await request(app).get('/api/scenes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scenes: [] });
  });

  test('summarises each saved scene from its envelope keys', async () => {
    const scene = makeScene();
    await request(app).post('/api/scenes').send({ scene });

    const res = await request(app).get('/api/scenes');
    expect(res.body.scenes).toEqual([
      {
        filename: `${scene.sceneId}.myo`,
        sceneId: scene.sceneId,
        title: scene.title,
        created: scene.created,
      },
    ]);
  });

  test('ignores files that are not .myo', async () => {
    await request(app).post('/api/scenes').send({ scene: makeScene() });
    writeSceneFile('notes.txt', 'not a scene');
    writeSceneFile('storyboard.json', '{"frames":[]}');

    const res = await request(app).get('/api/scenes');
    expect(res.body.scenes).toHaveLength(1);
  });

  // scenes/ is hand-editable user data in the working tree, so one bad file used to
  // throw away the whole listing — the user's other scenes became unreachable.
  test('skips a malformed .myo instead of failing the listing', async () => {
    const scene = makeScene();
    await request(app).post('/api/scenes').send({ scene });
    writeSceneFile('corrupt.myo', '{ this is not json');

    const res = await request(app).get('/api/scenes');
    expect(res.status).toBe(200);
    expect(res.body.scenes.map((s: { filename: string }) => s.filename)).toEqual([
      `${scene.sceneId}.myo`,
    ]);
  });

  test('a directory named like a scene does not break the listing', async () => {
    fs.mkdirSync(path.join(SCENES_DIR, 'weird.myo'));
    const res = await request(app).get('/api/scenes');
    expect(res.status).toBe(200);
    expect(res.body.scenes).toEqual([]);
  });
});

describe('GET /api/scenes/:filename', () => {
  test('maps the envelope back to the camelCase scene the app speaks', async () => {
    const scene = makeScene();
    await request(app).post('/api/scenes').send({ scene });

    const res = await request(app).get(`/api/scenes/${scene.sceneId}.myo`);
    expect(res.status).toBe(200);
    expect(res.body.scene).toEqual(scene);
  });

  test('404 for a well-formed filename that is not on disk', async () => {
    const res = await request(app).get('/api/scenes/does-not-exist.myo');
    expect(res.status).toBe(404);
  });

  test.each([
    ['..%2F..%2Fetc%2Fpasswd', 'an encoded traversal'],
    ['..%2Fstoryboard.json', 'an encoded parent-directory hop'],
    ['scene.json', 'a non-.myo extension'],
    ['scene%20one.myo', 'a space'],
  ])('400 for %s', async (filename) => {
    const res = await request(app).get(`/api/scenes/${filename}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid filename/);
  });
});

describe('GET /api/storyboard', () => {
  test('reports an empty strip when the file does not exist yet', async () => {
    const res = await request(app).get('/api/storyboard');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ frames: [] });
  });

  test('returns the stored frames verbatim', async () => {
    const frames = [
      {
        frameId: 'f1',
        sceneFilename: 'a.myo',
        sceneTitle: 'Server Room — Night',
        shotNumber: 10,
        notes: '',
        cameraLabel: '35mm MCU',
      },
    ];
    fs.writeFileSync(STORYBOARD_PATH, JSON.stringify({ frames }), 'utf-8');

    const res = await request(app).get('/api/storyboard');
    expect(res.body.frames).toEqual(frames);
  });
});

describe('PUT /api/storyboard', () => {
  test('persists frames immediately — there is no save gate on the strip', async () => {
    const frames = [
      {
        frameId: 'f1',
        sceneFilename: 'a.myo',
        sceneTitle: 'Server Room — Night',
        shotNumber: 10,
        notes: '',
        cameraLabel: '35mm MCU',
      },
    ];
    const res = await request(app).put('/api/storyboard').send({ frames });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(JSON.parse(fs.readFileSync(STORYBOARD_PATH, 'utf-8'))).toEqual({ frames });
  });

  test('an empty array is a legitimate strip, not a rejected body', async () => {
    const res = await request(app).put('/api/storyboard').send({ frames: [] });
    expect(res.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(STORYBOARD_PATH, 'utf-8'))).toEqual({ frames: [] });
  });

  test.each([[{}], [{ frames: null }], [{ frames: 'nope' }], [{ frames: { a: 1 } }]])(
    '400 for a non-array frames body (%p), leaving the file untouched',
    async (body) => {
      const res = await request(app).put('/api/storyboard').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/frames/);
      expect(fs.existsSync(STORYBOARD_PATH)).toBe(false);
    }
  );
});

describe('POST /api/parse', () => {
  test('passes the prompt through and returns the parser result', async () => {
    const result = { scene: makeScene(), rawJson: '{}' };
    (parsePromptToScene as jest.Mock).mockResolvedValue(result);

    const res = await request(app).post('/api/parse').send({ prompt: 'a rooftop at dusk' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(parsePromptToScene).toHaveBeenCalledWith('a rooftop at dusk');
  });

  test.each([[{}], [{ prompt: '' }], [{ prompt: 42 }], [{ prompt: null }]])(
    '400 for %p without calling the parser',
    async (body) => {
      const res = await request(app).post('/api/parse').send(body);
      expect(res.status).toBe(400);
      expect(parsePromptToScene).not.toHaveBeenCalled();
    }
  );

  // An upstream failure is the API's, not the client's — the app surfaces this
  // message in its error banner.
  test('502 carrying the parser error message when the upstream call fails', async () => {
    (parsePromptToScene as jest.Mock).mockRejectedValue(
      new Error('Anthropic API error 529: overloaded')
    );

    const res = await request(app).post('/api/parse').send({ prompt: 'a scene' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/529/);
  });
});

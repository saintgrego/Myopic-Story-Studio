import { makeScene } from '../testUtils/sceneFixture';

// server/ is CommonJS — require keeps the module untranspiled and matches how
// the backend actually loads it.
const { toMyoEnvelope, fromMyoEnvelope } = require('../../server/myoFormat');

describe('myoFormat envelope mapping (PRD §7.1)', () => {
  test('top-level keys are snake_case per spec', () => {
    const envelope = toMyoEnvelope(makeScene());
    expect(Object.keys(envelope).sort()).toEqual(
      [
        'scene_id',
        'title',
        'created',
        'prompt',
        'environment',
        'lighting',
        'camera',
        'characters',
        'props',
        'storyboard_notes',
        'flagged_params',
      ].sort()
    );
    expect(envelope).not.toHaveProperty('sceneId');
    expect(envelope).not.toHaveProperty('storyboardNotes');
    expect(envelope).not.toHaveProperty('flaggedParams');
  });

  test('nested content stays camelCase and untouched', () => {
    const scene = makeScene();
    const envelope = toMyoEnvelope(scene);
    expect(envelope.environment).toEqual(scene.environment);
    expect(envelope.environment.locationName).toBe('Server room');
    expect(envelope.camera.focalLength).toBe(35);
    expect(envelope.characters[0].figureName).toBe('the technician');
  });

  test('round-trips a scene without loss', () => {
    const scene = makeScene();
    expect(fromMyoEnvelope(toMyoEnvelope(scene))).toEqual(scene);
  });

  test('fromMyoEnvelope maps snake_case top-level keys back', () => {
    const restored = fromMyoEnvelope(toMyoEnvelope(makeScene()));
    expect(restored.sceneId).toBe('00000000-0000-4000-8000-000000000000');
    expect(restored.storyboardNotes).toBe('Tense, isolated mood.');
    expect(restored.flaggedParams).toEqual(['environment.weather']);
  });
});

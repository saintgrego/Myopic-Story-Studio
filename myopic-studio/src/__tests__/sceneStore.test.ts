import { useSceneStore, characterIndex, propIndex } from '../store/sceneStore';
import { makeScene } from '../testUtils/sceneFixture';

// Zustand stores work outside React — drive the store via getState().
beforeEach(() => {
  useSceneStore.setState({ scene: null, selection: null, dirty: false });
});

describe('sceneStore', () => {
  test('loadScene selects the scene root and clears dirty', () => {
    useSceneStore.getState().loadScene(makeScene());
    const state = useSceneStore.getState();
    expect(state.scene?.title).toBe('Server Room — Night');
    expect(state.selection).toEqual({ kind: 'scene' });
    expect(state.dirty).toBe(false);
  });

  test('setField writes a nested object path and marks dirty', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['camera', 'focalLength'], 85);
    const state = useSceneStore.getState();
    expect(state.scene?.camera.focalLength).toBe(85);
    expect(state.dirty).toBe(true);
  });

  test('setField writes through array indices', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['characters', 0, 'position', 'x'], 2.5);
    expect(useSceneStore.getState().scene?.characters[0].position.x).toBe(2.5);
  });

  test('setField replaces the scene object immutably', () => {
    useSceneStore.getState().loadScene(makeScene());
    const before = useSceneStore.getState().scene!;
    useSceneStore.getState().setField(['title'], 'Renamed');
    const after = useSceneStore.getState().scene!;
    expect(after).not.toBe(before);
    expect(before.title).toBe('Server Room — Night');
    expect(after.title).toBe('Renamed');
  });

  test('setField is a no-op with no scene loaded', () => {
    useSceneStore.getState().setField(['title'], 'nope');
    const state = useSceneStore.getState();
    expect(state.scene).toBeNull();
    expect(state.dirty).toBe(false);
  });

  test('markSaved clears dirty without touching the scene', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['title'], 'Edited');
    useSceneStore.getState().markSaved();
    const state = useSceneStore.getState();
    expect(state.dirty).toBe(false);
    expect(state.scene?.title).toBe('Edited');
  });

  test('setField clears the flag for a resolved param', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['environment', 'weather'], 'Clear');
    const scene = useSceneStore.getState().scene!;
    expect(scene.environment.weather).toBe('Clear');
    expect(scene.flaggedParams).not.toContain('environment.weather');
  });

  test('setField keeps the flag when the value is still [?]', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['environment', 'weather'], '[?]');
    expect(useSceneStore.getState().scene?.flaggedParams).toContain('environment.weather');
  });

  test('setField clears bracket-format flags for array paths', () => {
    const scene = makeScene();
    scene.flaggedParams = ['characters[0].position.x'];
    useSceneStore.getState().loadScene(scene);
    useSceneStore.getState().setField(['characters', 0, 'position', 'x'], 1.5);
    expect(useSceneStore.getState().scene?.flaggedParams).toEqual([]);
  });

  test('setField on an unflagged path leaves flaggedParams alone', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['camera', 'focalLength'], 85);
    expect(useSceneStore.getState().scene?.flaggedParams).toEqual(['environment.weather']);
  });

  test('setField adds fillColor/rimColor to a scene that lacks them (PRD §11 v1.6)', () => {
    useSceneStore.getState().loadScene(makeScene());
    expect(useSceneStore.getState().scene?.lighting.fillColor).toBeUndefined();
    useSceneStore.getState().setField(['lighting', 'fillColor'], '#a8c8e8');
    useSceneStore.getState().setField(['lighting', 'rimColor'], '#ffd9a0');
    const state = useSceneStore.getState();
    expect(state.scene?.lighting.fillColor).toBe('#a8c8e8');
    expect(state.scene?.lighting.rimColor).toBe('#ffd9a0');
    expect(state.dirty).toBe(true);
  });

  test('setField leaves the other lighting fields alone when writing a gel colour', () => {
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['lighting', 'fillColor'], '#a8c8e8');
    const { lighting } = useSceneStore.getState().scene!;
    expect(lighting.keyLightColor).toBe('#88AAFF');
    expect(lighting.fillIntensity).toBe(0.2);
    expect(lighting.rimIntensity).toBe(0.4);
  });

  test('characterIndex and propIndex find by id', () => {
    const scene = makeScene();
    expect(characterIndex(scene, 'char_01')).toBe(0);
    expect(characterIndex(scene, 'char_99')).toBe(-1);
    expect(propIndex(scene, 'prop_01')).toBe(0);
    expect(propIndex(scene, 'prop_99')).toBe(-1);
  });
});

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

  test('characterIndex and propIndex find by id', () => {
    const scene = makeScene();
    expect(characterIndex(scene, 'char_01')).toBe(0);
    expect(characterIndex(scene, 'char_99')).toBe(-1);
    expect(propIndex(scene, 'prop_01')).toBe(0);
    expect(propIndex(scene, 'prop_99')).toBe(-1);
  });
});

import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import {
  CATEGORY_LABELS,
  MIN_SET_PIECE_EXTENT,
  SET_PIECE_KINDS,
  SET_VISIBILITY_KEYS,
  allSetsHidden,
  buildSetGroups,
  buildSetPiece,
  categoryForKind,
  defaultSetVisibility,
  resolveDimensions,
  withSetDefaults,
} from '../lib/sets';
import { COOL_GREYS, SET_MATERIALS, WARM_GREYS, setPieceColor } from '../palette';
import { useSceneStore } from '../store/sceneStore';
import { makeScene, makeSetPiece } from '../testUtils/sceneFixture';
import type { SceneFile, SetVisibility } from '../types/scene';

const { fromMyoEnvelope, toMyoEnvelope } = require('../../server/myoFormat');

const SCENES_DIR = path.join(__dirname, '..', '..', 'scenes');

/** A scene as it existed before v1.9 — the fields simply are not there. */
function legacyScene(): SceneFile {
  const scene = makeScene() as Partial<SceneFile>;
  delete scene.sets;
  delete scene.setVisibility;
  return scene as SceneFile;
}

function meshCount(group: THREE.Object3D): number {
  let n = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) n++;
  });
  return n;
}

describe('set-piece defaults (PRD §11 v1.9 backward compatibility)', () => {
  test('a scene without sets/setVisibility gets an empty array and all-true visibility', () => {
    const restored = withSetDefaults(legacyScene());
    expect(restored.sets).toEqual([]);
    expect(restored.setVisibility).toEqual({
      walls: true,
      floors: true,
      ceilings: true,
      doors: true,
      windows: true,
    });
  });

  test('a partially-specified setVisibility keeps its own values and fills the rest', () => {
    const scene = makeScene({
      setVisibility: { ceilings: false } as unknown as SetVisibility,
    });
    const restored = withSetDefaults(scene);
    expect(restored.setVisibility.ceilings).toBe(false);
    expect(restored.setVisibility.walls).toBe(true);
    expect(restored.setVisibility.windows).toBe(true);
  });

  test('existing values are preserved, not overwritten by the defaults', () => {
    const sets = [makeSetPiece('wall')];
    const restored = withSetDefaults(
      makeScene({ sets, setVisibility: { ...defaultSetVisibility(), doors: false } }),
    );
    expect(restored.sets).toEqual(sets);
    expect(restored.setVisibility.doors).toBe(false);
  });

  test('nothing else on the scene is disturbed', () => {
    const before = legacyScene();
    const after = withSetDefaults(before);
    expect(after.characters).toEqual(before.characters);
    expect(after.camera).toEqual(before.camera);
    expect(after.flaggedParams).toEqual(before.flaggedParams);
  });

  // Manifest-style, like poses.test.ts: the assertion is over whatever is actually on
  // disk, so a .myo added later is covered without touching this file.
  test('every pre-existing .myo on disk loads with the v1.9 defaults', () => {
    const files = fs.readdirSync(SCENES_DIR).filter((f) => f.endsWith('.myo'));
    expect(files.length).toBeGreaterThan(0);

    for (const filename of files) {
      const envelope = JSON.parse(fs.readFileSync(path.join(SCENES_DIR, filename), 'utf-8'));
      const scene = fromMyoEnvelope(envelope);
      expect(Array.isArray(scene.sets)).toBe(true);
      for (const key of SET_VISIBILITY_KEYS) {
        expect(typeof scene.setVisibility[key]).toBe('boolean');
      }
      // These files predate the amendment, so the defaults are what they must get.
      if (envelope.sets === undefined) expect(scene.sets).toEqual([]);
      if (envelope.set_visibility === undefined) {
        expect(scene.setVisibility).toEqual(defaultSetVisibility());
      }
      // Loading one must not lose anything it did carry.
      expect(scene.sceneId).toBe(envelope.scene_id);
      expect(scene.characters).toEqual(envelope.characters);
    }
  });

  test('the envelope carries sets and set_visibility through a round trip', () => {
    const scene = makeScene({
      sets: [makeSetPiece('wall'), makeSetPiece('door', { state: 'open' })],
      setVisibility: { ...defaultSetVisibility(), ceilings: false },
    });
    const envelope = toMyoEnvelope(scene);
    expect(envelope.set_visibility.ceilings).toBe(false);
    expect(envelope.sets).toHaveLength(2);
    expect(envelope).not.toHaveProperty('setVisibility');
    expect(fromMyoEnvelope(envelope)).toEqual(scene);
  });

  test('loadScene applies the defaults, so the store never holds a scene without them', () => {
    useSceneStore.setState({ scene: null, selection: null, dirty: false });
    useSceneStore.getState().loadScene(legacyScene());
    const state = useSceneStore.getState();
    expect(state.scene?.sets).toEqual([]);
    expect(state.scene?.setVisibility).toEqual(defaultSetVisibility());
    expect(state.dirty).toBe(false);
  });

  test('setField drives visibility through the normal path, one key or all five', () => {
    useSceneStore.setState({ scene: null, selection: null, dirty: false });
    useSceneStore.getState().loadScene(makeScene());
    useSceneStore.getState().setField(['setVisibility', 'walls'], false);
    expect(useSceneStore.getState().scene?.setVisibility).toEqual({
      ...defaultSetVisibility(),
      walls: false,
    });
    useSceneStore.getState().setField(['setVisibility'], allSetsHidden());
    expect(useSceneStore.getState().scene?.setVisibility).toEqual({
      walls: false,
      floors: false,
      ceilings: false,
      doors: false,
      windows: false,
    });
    expect(useSceneStore.getState().dirty).toBe(true);
  });
});

describe('set-piece categories', () => {
  test('every kind maps to exactly one category, and every category is reachable', () => {
    const mapped = SET_PIECE_KINDS.map(categoryForKind);
    expect(new Set(mapped).size).toBe(SET_VISIBILITY_KEYS.length);
    expect([...mapped].sort()).toEqual([...SET_VISIBILITY_KEYS].sort());
  });

  test('every category has a label', () => {
    for (const key of SET_VISIBILITY_KEYS) {
      expect(CATEGORY_LABELS[key]).toBeTruthy();
    }
  });
});

describe('buildSetGroups', () => {
  test('an empty sets array renders five empty groups and zero geometry', () => {
    const groups = buildSetGroups(makeScene({ sets: [] }));
    expect(groups).toHaveLength(5);
    for (const group of groups) {
      expect(group.children).toHaveLength(0);
      expect(group.visible).toBe(true);
    }
  });

  test('one piece per category lands in its own group', () => {
    const scene = makeScene({ sets: SET_PIECE_KINDS.map((kind) => makeSetPiece(kind)) });
    const groups = buildSetGroups(scene);
    expect(groups.map((g) => g.name)).toEqual(SET_VISIBILITY_KEYS.map((k) => `sets:${k}`));
    for (const group of groups) {
      expect(meshCount(group)).toBe(1);
    }
  });

  // Category by category, so a mapping that quietly hid two things at once would fail.
  test.each(SET_VISIBILITY_KEYS)('toggling %s hides only that category', (target) => {
    const scene = makeScene({
      sets: SET_PIECE_KINDS.map((kind) => makeSetPiece(kind)),
      setVisibility: { ...defaultSetVisibility(), [target]: false },
    });
    const groups = buildSetGroups(scene);
    for (const [i, key] of SET_VISIBILITY_KEYS.entries()) {
      expect(groups[i].visible).toBe(key !== target);
      // Hiding is a group-level flag only — no per-mesh visibility anywhere.
      groups[i].traverse((child) => {
        if (child !== groups[i]) expect(child.visible).toBe(true);
      });
    }
  });

  test('hiding everything leaves the groups in place, still holding their pieces', () => {
    const scene = makeScene({
      sets: SET_PIECE_KINDS.map((kind) => makeSetPiece(kind)),
      setVisibility: allSetsHidden(),
    });
    const groups = buildSetGroups(scene);
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => !g.visible)).toBe(true);
    expect(groups.reduce((n, g) => n + meshCount(g), 0)).toBe(5);
  });

  test('a scene missing the v1.9 fields entirely still builds five visible groups', () => {
    const groups = buildSetGroups(legacyScene());
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => g.visible && g.children.length === 0)).toBe(true);
  });

  test('an unrecognised kind is dropped rather than rendered uncontrollably', () => {
    const scene = makeScene({
      sets: [{ ...makeSetPiece('wall'), kind: 'staircase' as never }],
    });
    const groups = buildSetGroups(scene);
    expect(groups.reduce((n, g) => n + meshCount(g), 0)).toBe(0);
  });
});

describe('buildSetPiece geometry', () => {
  test('a piece is base-anchored: its box is lifted by half its height', () => {
    const piece = makeSetPiece('wall');
    const box = new THREE.Box3().setFromObject(buildSetPiece(piece));
    expect(box.min.y).toBeCloseTo(piece.transform.position.y, 5);
    expect(box.max.y).toBeCloseTo(piece.transform.position.y + piece.dimensions.height, 5);
  });

  test('a ceiling placed at room height sits its underside there', () => {
    const piece = makeSetPiece('ceiling');
    const box = new THREE.Box3().setFromObject(buildSetPiece(piece));
    expect(box.min.y).toBeCloseTo(2.7, 5);
  });

  test('dimensions drive the box extents', () => {
    const piece = makeSetPiece('wall');
    const box = new THREE.Box3().setFromObject(buildSetPiece(piece));
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(piece.dimensions.width, 5);
    expect(size.y).toBeCloseTo(piece.dimensions.height, 5);
    expect(size.z).toBeCloseTo(piece.dimensions.depth, 5);
  });

  test('shadows are cast and received, per the existing convention', () => {
    buildSetPiece(makeSetPiece('wall')).traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.castShadow).toBe(true);
        expect(child.receiveShadow).toBe(true);
      }
    });
  });

  test('rotation is read as degrees, like characters and props', () => {
    const piece = makeSetPiece('wall', {
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 90, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
    const group = buildSetPiece(piece);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
    // A wall rotated a quarter turn runs along Z, not X.
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(piece.dimensions.width, 5);
  });

  test('an open door swings off its hinge; a closed one stays in its frame', () => {
    const closed = new THREE.Box3().setFromObject(buildSetPiece(makeSetPiece('door', { state: 'closed' })));
    const open = new THREE.Box3().setFromObject(buildSetPiece(makeSetPiece('door', { state: 'open' })));
    expect(closed.getSize(new THREE.Vector3()).z).toBeCloseTo(0.05, 5);
    // Swung, the leaf reaches back into the room rather than lying flat.
    expect(open.getSize(new THREE.Vector3()).z).toBeGreaterThan(0.5);
    // The hinge edge stays put. The pivot is the leaf's mid-thickness line, so a
    // swung leaf reaches past it by at most its own thickness — the opening the
    // door sits in does not move.
    expect(Math.abs(open.min.x - closed.min.x)).toBeLessThanOrEqual(0.05);
  });

  test('an omitted state renders the same as closed', () => {
    const noState = new THREE.Box3().setFromObject(buildSetPiece(makeSetPiece('door')));
    const closed = new THREE.Box3().setFromObject(buildSetPiece(makeSetPiece('door', { state: 'closed' })));
    expect(noState.min.toArray()).toEqual(closed.min.toArray());
    expect(noState.max.toArray()).toEqual(closed.max.toArray());
  });

  test('a zero-depth cutout renders as a thin plane, not degenerate geometry', () => {
    const piece = makeSetPiece('window', {
      dimensions: { width: 1.2, height: 1.4, depth: 0 },
    });
    const group = buildSetPiece(piece);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    // Thin, but real: a hair of depth rather than a zero-volume box. (Three.js
    // stores positions as float32, so the clamp comes back a hair off exact.)
    expect(size.z).toBeGreaterThan(0);
    expect(size.z).toBeCloseTo(MIN_SET_PIECE_EXTENT, 6);
    expect(size.x).toBeCloseTo(1.2, 5);
    expect(box.min.toArray().every(Number.isFinite)).toBe(true);
  });

  test('a whole scene of degenerate pieces builds without throwing or going NaN', () => {
    const broken = SET_PIECE_KINDS.map((kind) =>
      makeSetPiece(kind, {
        dimensions: { width: 0, height: NaN, depth: -1 },
      }),
    );
    const groups = buildSetGroups(makeScene({ sets: broken }));
    for (const group of groups) {
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        expect(box.min.toArray().every(Number.isFinite)).toBe(true);
        expect(box.max.toArray().every(Number.isFinite)).toBe(true);
      }
    }
  });

  test('resolveDimensions clamps rather than inventing a size', () => {
    expect(resolveDimensions({ width: 2, height: 3, depth: 0 })).toEqual({
      width: 2,
      height: 3,
      depth: MIN_SET_PIECE_EXTENT,
    });
    expect(resolveDimensions(undefined)).toEqual({
      width: MIN_SET_PIECE_EXTENT,
      height: MIN_SET_PIECE_EXTENT,
      depth: MIN_SET_PIECE_EXTENT,
    });
  });

  test('a zero scale falls back to 1 instead of collapsing the piece', () => {
    const piece = makeSetPiece('wall', {
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0, y: 1, z: 1 },
      },
    });
    expect(buildSetPiece(piece).scale.x).toBe(1);
  });
});

describe('set-piece materials', () => {
  // Manifest-style over the table itself, so a surface added later is covered.
  test.each(SET_MATERIALS.map((m) => m.ref))('%s resolves to a cool grey', (ref) => {
    const color = setPieceColor(ref);
    expect(COOL_GREYS).toContain(color);
    expect(WARM_GREYS).not.toContain(color);
  });

  test('refs are unique and each names a real step in the ramp', () => {
    expect(new Set(SET_MATERIALS.map((m) => m.ref)).size).toBe(SET_MATERIALS.length);
    for (const { step } of SET_MATERIALS) {
      expect(COOL_GREYS[step]).toBeDefined();
    }
  });

  test('lookup ignores case and surrounding space', () => {
    expect(setPieceColor(' Concrete ')).toBe(setPieceColor('concrete'));
  });

  test('an unknown or missing ref degrades to the neutral grey, never to a warm one', () => {
    for (const ref of ['velvet', '', undefined as unknown as string]) {
      const color = setPieceColor(ref);
      expect(COOL_GREYS).toContain(color);
      expect(WARM_GREYS).not.toContain(color);
    }
  });

  test('set pieces are coloured by surface, not by index', () => {
    const scene = makeScene({
      sets: [makeSetPiece('wall'), makeSetPiece('wall'), makeSetPiece('wall')],
    });
    const colors: number[] = [];
    buildSetGroups(scene)[0].traverse((child) => {
      if (child instanceof THREE.Mesh) {
        colors.push((child.material as THREE.MeshStandardMaterial).color.getHex());
      }
    });
    expect(colors).toHaveLength(3);
    expect(new Set(colors).size).toBe(1);
  });
});

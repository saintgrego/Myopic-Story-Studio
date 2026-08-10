import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { makeScene, makeSetPieces } from '../testUtils/sceneFixture';
import {
  SET_CATEGORIES,
  allSetsHidden,
  buildSetGroups,
  buildSetPiece,
  categoryOfKind,
  defaultSetVisibility,
  withSetDefaults,
} from '../lib/sets';
import { COOL_GREYS, WARM_GREYS, setPieceColor } from '../palette';
import type { SceneFile, SetPiece } from '../types/scene';

const { fromMyoEnvelope, toMyoEnvelope } = require('../../server/myoFormat');

const SCENES_DIR = path.resolve(__dirname, '../../scenes');

function groupNamed(root: THREE.Group, name: string): THREE.Group {
  const found = root.children.find((c) => c.name === name);
  if (!found) throw new Error(`no category group named ${name}`);
  return found as THREE.Group;
}

/** The manifest the whole feature is indexed by — every test below iterates it. */
describe('set-piece categories (PRD §11 v1.9)', () => {
  test('there are exactly five, and every kind maps into one', () => {
    expect([...SET_CATEGORIES]).toEqual(['walls', 'floors', 'ceilings', 'doors', 'windows']);
    const mapped = makeSetPieces().map((p) => categoryOfKind(p.kind));
    expect(mapped.sort()).toEqual([...SET_CATEGORIES].sort());
  });
});

describe('backward compatibility with pre-v1.9 scenes', () => {
  test('a scene with neither field defaults to empty sets and all-visible', () => {
    const legacy = makeScene();
    delete (legacy as Partial<SceneFile>).sets;
    delete (legacy as Partial<SceneFile>).setVisibility;

    const normalised = withSetDefaults(legacy);
    expect(normalised.sets).toEqual([]);
    expect(normalised.setVisibility).toEqual(defaultSetVisibility());
    for (const category of SET_CATEGORIES) expect(normalised.setVisibility[category]).toBe(true);
  });

  // The point of the amendment's no-migration stance: the files already on disk
  // must load, not just a synthetic fixture shaped like them.
  test('every .myo already on disk loads through the real path', () => {
    const files = fs.readdirSync(SCENES_DIR).filter((f) => f.endsWith('.myo'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const envelope = JSON.parse(fs.readFileSync(path.join(SCENES_DIR, file), 'utf8'));
      const scene = withSetDefaults(fromMyoEnvelope(envelope));
      expect(Array.isArray(scene.sets)).toBe(true);
      expect(Object.values(scene.setVisibility).every((v) => typeof v === 'boolean')).toBe(true);
      // Pre-v1.9 files carry no sets at all; nothing may invent geometry for them.
      if (envelope.sets === undefined) {
        expect(scene.sets).toEqual([]);
        expect(scene.setVisibility).toEqual(defaultSetVisibility());
        expect(buildSetGroups(scene).children.every((g) => g.children.length === 0)).toBe(true);
      }
    }
  });

  test('a partially-written setVisibility keeps its values and fills the rest', () => {
    const scene = withSetDefaults({
      ...makeScene(),
      setVisibility: { ceilings: false } as SceneFile['setVisibility'],
    });
    expect(scene.setVisibility.ceilings).toBe(false);
    expect(scene.setVisibility.walls).toBe(true);
  });

  test('sets survive a .myo round-trip', () => {
    const scene = { ...makeScene(), sets: makeSetPieces() };
    const envelope = toMyoEnvelope(scene);
    expect(envelope.set_visibility).toEqual(scene.setVisibility);
    expect(withSetDefaults(fromMyoEnvelope(envelope))).toEqual(scene);
  });
});

describe('buildSetGroups', () => {
  test('always yields all five category groups, empty when there are no sets', () => {
    const root = buildSetGroups({ ...makeScene(), sets: [] });
    expect(root.children.map((c) => c.name)).toEqual([...SET_CATEGORIES]);
    for (const child of root.children) expect(child.children).toHaveLength(0);
  });

  test('routes one piece per kind into its own category group', () => {
    const root = buildSetGroups({ ...makeScene(), sets: makeSetPieces() });
    for (const category of SET_CATEGORIES) {
      expect(groupNamed(root, category).children).toHaveLength(1);
    }
  });

  test.each([...SET_CATEGORIES])('hiding %s hides only that group', (hidden) => {
    const scene = {
      ...makeScene(),
      sets: makeSetPieces(),
      setVisibility: { ...defaultSetVisibility(), [hidden]: false },
    };
    const root = buildSetGroups(scene);
    for (const category of SET_CATEGORIES) {
      expect(groupNamed(root, category).visible).toBe(category !== hidden);
    }
    // Visibility is category-level only — no per-mesh flag may be carrying it.
    groupNamed(root, hidden).traverse((o) => {
      if (o.name !== hidden) expect(o.visible).toBe(true);
    });
  });

  test('hide-all leaves every group present but invisible', () => {
    const root = buildSetGroups({ ...makeScene(), sets: makeSetPieces(), setVisibility: allSetsHidden() });
    expect(root.children).toHaveLength(5);
    expect(root.children.every((g) => g.visible === false)).toBe(true);
  });

  test('an unknown kind from a hand-edited file is skipped, not thrown on', () => {
    const bogus = { ...makeSetPieces()[0], kind: 'skylight' } as unknown as SetPiece;
    const root = buildSetGroups({ ...makeScene(), sets: [bogus] });
    expect(root.children.every((g) => g.children.length === 0)).toBe(true);
  });
});

describe('buildSetPiece geometry', () => {
  test('is base-anchored: the box is lifted by half its height', () => {
    const [wall] = makeSetPieces();
    const group = buildSetPiece(wall, 0);
    const box = new THREE.Box3().setFromObject(group);
    expect(box.min.y).toBeCloseTo(wall.transform.position.y, 5);
    expect(box.max.y).toBeCloseTo(wall.transform.position.y + wall.dimensions.height, 5);
  });

  test.each([
    ['zero depth', { width: 0.9, height: 2.1, depth: 0 }],
    ['zero on every axis', { width: 0, height: 0, depth: 0 }],
    ['negative depth', { width: 0.9, height: 2.1, depth: -0.05 }],
    ['NaN width', { width: NaN, height: 2.1, depth: 0.1 }],
  ])('%s renders a thin plane with finite geometry', (_label, dimensions) => {
    const piece: SetPiece = { ...makeSetPieces()[3], dimensions };
    let group!: THREE.Object3D;
    expect(() => {
      group = buildSetPiece(piece, 0);
    }).not.toThrow();

    const box = new THREE.Box3().setFromObject(group);
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
    const size = box.getSize(new THREE.Vector3());
    // Thin, but never degenerate — a zero extent gives NaN normals under shadows.
    expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(0);
  });

  test('castShadow and receiveShadow follow the existing convention', () => {
    buildSetPiece(makeSetPieces()[0], 0).traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.castShadow).toBe(true);
        expect(child.receiveShadow).toBe(true);
      }
    });
  });
});

describe('set-piece material (v1.9 §3)', () => {
  test('named refs resolve to the cool ramp, never the warm one', () => {
    for (const [i, ref] of ['cool-0', 'cool-1', 'cool-2', 'cool-3', 'cool-4'].entries()) {
      expect(setPieceColor(ref, 0)).toBe(COOL_GREYS[i]);
    }
  });

  test('an unknown ref falls back within the cool ramp, deterministically', () => {
    const color = setPieceColor('brushed-oak', 3);
    expect(COOL_GREYS).toContain(color);
    expect(WARM_GREYS).not.toContain(color);
    expect(setPieceColor('brushed-oak', 3)).toBe(color);
  });

  test('every built piece is coloured from the cool ramp', () => {
    const root = buildSetGroups({ ...makeScene(), sets: makeSetPieces() });
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(COOL_GREYS).toContain((child.material as THREE.MeshStandardMaterial).color.getHex());
      }
    });
  });
});

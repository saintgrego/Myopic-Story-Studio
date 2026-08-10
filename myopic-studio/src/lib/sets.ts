import * as THREE from 'three';
import type { SceneFile, SetCategory, SetPiece, SetPieceKind, SetVisibility } from '../types/scene';
import { setPieceColor } from '../palette';

/**
 * Set pieces — walls, floors, ceilings, doors, windows (PRD §11 v1.9).
 *
 * Kept out of Viewport.tsx on purpose: Viewport can't run under jsdom, and the
 * category-group/visibility contract this file implements is exactly what the
 * amendment is worth testing for. Viewport calls buildSetGroups() and adds the
 * result; it holds no set-piece logic of its own.
 */

export const SET_CATEGORIES: readonly SetCategory[] = [
  'walls',
  'floors',
  'ceilings',
  'doors',
  'windows',
] as const;

/** One category per kind — the plural is the group name and the visibility key. */
const CATEGORY_OF_KIND: Record<SetPieceKind, SetCategory> = {
  wall: 'walls',
  floor: 'floors',
  ceiling: 'ceilings',
  door: 'doors',
  window: 'windows',
};

export function categoryOfKind(kind: SetPieceKind): SetCategory {
  return CATEGORY_OF_KIND[kind];
}

/** Every category visible — what a scene saved before v1.9 means by saying nothing. */
export function defaultSetVisibility(): SetVisibility {
  return { walls: true, floors: true, ceilings: true, doors: true, windows: true };
}

export function allSetsHidden(): SetVisibility {
  return { walls: false, floors: false, ceilings: false, doors: false, windows: false };
}

/**
 * The v1.9 backward-compatibility rule, applied at the single point every scene
 * enters the store (parser output and loaded .myo alike). No migration, no
 * rewrite on disk — a pre-v1.9 file re-saved from an untouched session gets an
 * empty `sets` and an all-true `setVisibility`, which render identically to
 * before the amendment.
 *
 * A partially-written setVisibility (a hand-edited .myo, a future field) fills
 * its gaps from the defaults rather than being discarded.
 */
export function withSetDefaults(scene: SceneFile): SceneFile {
  const sets = Array.isArray(scene.sets) ? scene.sets : [];
  const stored = scene.setVisibility;
  const setVisibility = defaultSetVisibility();
  if (stored && typeof stored === 'object') {
    for (const category of SET_CATEGORIES) {
      if (typeof stored[category] === 'boolean') setVisibility[category] = stored[category];
    }
  }
  return { ...scene, sets, setVisibility };
}

// A door or window authored as a flat cutout arrives with depth 0. BoxGeometry
// accepts it, but a zero-extent axis gives degenerate faces and a normal of
// (0,0,0), which shows up as black shading and NaNs once it meets a shadow
// matrix. Clamp to a thickness that still reads as a plane at blocking scale.
const MIN_EXTENT = 0.01;

function extent(value: number): number {
  return Number.isFinite(value) ? Math.max(Math.abs(value), MIN_EXTENT) : MIN_EXTENT;
}

function scaleComponent(value: number): number {
  return Number.isFinite(value) && value !== 0 ? value : 1;
}

function coord(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * One piece. Base-anchored like everything else in the scene model: transform
 * .position.y is where the piece meets the floor, so the box is lifted by half
 * its height inside its own group — the same lift buildObject() applies to
 * primitives.
 */
export function buildSetPiece(piece: SetPiece, index: number): THREE.Object3D {
  const width = extent(piece.dimensions?.width);
  const height = extent(piece.dimensions?.height);
  const depth = extent(piece.dimensions?.depth);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: setPieceColor(piece.materialRef, index),
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = height / 2;

  const group = new THREE.Group();
  group.name = `set:${piece.kind}`;
  group.add(mesh);

  const t = piece.transform;
  group.position.set(coord(t?.position?.x), coord(t?.position?.y), coord(t?.position?.z));
  group.rotation.set(
    THREE.MathUtils.degToRad(coord(t?.rotation?.x)),
    THREE.MathUtils.degToRad(coord(t?.rotation?.y)),
    THREE.MathUtils.degToRad(coord(t?.rotation?.z)),
  );
  group.scale.set(
    scaleComponent(t?.scale?.x),
    scaleComponent(t?.scale?.y),
    scaleComponent(t?.scale?.z),
  );
  return group;
}

/**
 * The five category groups, always all five, in SET_CATEGORIES order — an empty
 * `sets` array yields five empty groups and no geometry, not an absent group.
 * Visibility is set on the group and nowhere else (v1.9 §2): no per-mesh flag
 * exists to fall out of step with it.
 */
export function buildSetGroups(scene: SceneFile): THREE.Group {
  const root = new THREE.Group();
  root.name = 'sets';

  const byCategory = new Map<SetCategory, THREE.Group>();
  for (const category of SET_CATEGORIES) {
    const group = new THREE.Group();
    group.name = category;
    group.visible = scene.setVisibility?.[category] !== false;
    byCategory.set(category, group);
    root.add(group);
  }

  for (const [i, piece] of (scene.sets ?? []).entries()) {
    const group = byCategory.get(categoryOfKind(piece.kind));
    if (!group) continue; // unknown kind from a hand-edited file — skip, don't throw
    group.add(buildSetPiece(piece, i));
  }
  return root;
}

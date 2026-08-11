import * as THREE from 'three';
import { setPieceColor } from '../palette';
import type { SceneFile, SetPiece, SetPieceDimensions, SetPieceKind, SetVisibility } from '../types/scene';

/**
 * Set pieces (PRD §11 v1.9): the walls, floors, ceilings, doors and windows a
 * blocking view needs in order to answer "can she see him from the doorway".
 *
 * This lives outside Viewport.tsx for the same reason dof.ts and framing.ts do:
 * anything inside that file is untestable by construction (no WebGL under jsdom).
 * Nothing here touches the renderer — it builds plain Three.js objects, which
 * jsdom is perfectly happy to hold — so the group/visibility contract can be
 * asserted directly. See STATE.md, v1.3.
 */

/** Declaration order is the order the panel lists categories in. */
export const SET_VISIBILITY_KEYS: readonly (keyof SetVisibility)[] = [
  'walls',
  'floors',
  'ceilings',
  'doors',
  'windows',
];

/** One category per kind, and exactly one — the pluralisation is the whole mapping. */
const CATEGORY_BY_KIND: Record<SetPieceKind, keyof SetVisibility> = {
  wall: 'walls',
  floor: 'floors',
  ceiling: 'ceilings',
  door: 'doors',
  window: 'windows',
};

export const SET_PIECE_KINDS = Object.keys(CATEGORY_BY_KIND) as SetPieceKind[];

export function categoryForKind(kind: SetPieceKind): keyof SetVisibility {
  return CATEGORY_BY_KIND[kind];
}

/** Human label for a category, for the panel. */
export const CATEGORY_LABELS: Record<keyof SetVisibility, string> = {
  walls: 'Walls',
  floors: 'Floors',
  ceilings: 'Ceilings',
  doors: 'Doors',
  windows: 'Windows',
};

/** Everything shows. A scene predating v1.9 had no way to hide anything. */
export function defaultSetVisibility(): SetVisibility {
  return { walls: true, floors: true, ceilings: true, doors: true, windows: true };
}

/** What the panel's "hide all sets" button writes — one value, one store update. */
export function allSetsHidden(): SetVisibility {
  return { walls: false, floors: false, ceilings: false, doors: false, windows: false };
}

/**
 * The v1.9 backward-compatibility rule, applied at the load boundary so the rest of
 * the app never sees a scene without these fields: same shape as `environment.setting`
 * and `fillColor`/`rimColor` before it — default in place, no migration, no rewrite of
 * files on disk. A per-key merge rather than a spread of the whole object, so a `.myo`
 * that carries only some of the five booleans still gets the rest.
 */
export function withSetDefaults(scene: SceneFile): SceneFile {
  const incoming = (scene.setVisibility ?? {}) as Partial<SetVisibility>;
  const setVisibility = defaultSetVisibility();
  for (const key of SET_VISIBILITY_KEYS) {
    if (typeof incoming[key] === 'boolean') setVisibility[key] = incoming[key] as boolean;
  }
  return {
    ...scene,
    sets: Array.isArray(scene.sets) ? scene.sets : [],
    setVisibility,
  };
}

/**
 * A door with `depth: 0` is a legitimate way to describe a flat cutout, and a
 * hand-edited file can hold worse (negative, NaN, missing). BoxGeometry accepts all
 * of them and produces geometry with no volume — invisible, and NaN propagates into
 * the bounding sphere, which breaks frustum culling for the whole scene. Clamping to
 * a millimetre keeps a zero-depth piece renderable as the thin plane it was meant
 * to be.
 */
export const MIN_SET_PIECE_EXTENT = 0.001;

function extent(value: number): number {
  return Number.isFinite(value) ? Math.max(Math.abs(value), MIN_SET_PIECE_EXTENT) : MIN_SET_PIECE_EXTENT;
}

export function resolveDimensions(dimensions: SetPieceDimensions | undefined): SetPieceDimensions {
  return {
    width: extent(dimensions?.width as number),
    height: extent(dimensions?.height as number),
    depth: extent(dimensions?.depth as number),
  };
}

/**
 * How far an open door or window swings. `state` is fixed at placement — there is no
 * runtime open/close control (v1.9 §3) — but a door drawn flush in its frame answers
 * the wrong question: whether the leaf is in the shot, and whether it blocks the
 * sightline through the opening, is exactly the blocking question the piece exists
 * for. The leaf swings about its own hinge edge (-X), so the opening stays put.
 */
const OPEN_SWING_DEG = 75;

function nonZeroScale(value: number): number {
  return Number.isFinite(value) && value !== 0 ? value : 1;
}

/**
 * One set piece as a positioned Three.js group.
 *
 * Base-anchored like everything else in the scene model: `transform.position.y` is
 * where the piece meets the floor, and the box is lifted by half its height inside
 * the group. A ceiling at y = 2.7 therefore sits its underside at 2.7.
 */
export function buildSetPiece(piece: SetPiece, index = 0): THREE.Object3D {
  const { width, height, depth } = resolveDimensions(piece.dimensions);
  const material = new THREE.MeshStandardMaterial({
    color: setPieceColor(piece.materialRef, index),
    roughness: 0.9,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = height / 2;

  const group = new THREE.Group();
  const swings = piece.state === 'open' && (piece.kind === 'door' || piece.kind === 'window');
  if (swings) {
    // Hinge pivot on the leaf's -X edge: shift the leaf so that edge is at the
    // pivot's origin, then rotate the pivot.
    const hinge = new THREE.Group();
    hinge.position.x = -width / 2;
    hinge.rotation.y = -THREE.MathUtils.degToRad(OPEN_SWING_DEG);
    mesh.position.x = width / 2;
    hinge.add(mesh);
    group.add(hinge);
  } else {
    group.add(mesh);
  }

  const { position, rotation, scale } = piece.transform;
  group.position.set(position.x, position.y, position.z);
  group.rotation.set(
    THREE.MathUtils.degToRad(rotation.x),
    THREE.MathUtils.degToRad(rotation.y),
    THREE.MathUtils.degToRad(rotation.z),
  );
  group.scale.set(nonZeroScale(scale.x), nonZeroScale(scale.y), nonZeroScale(scale.z));
  return group;
}

/**
 * The five category groups, in `SET_VISIBILITY_KEYS` order, each holding its pieces
 * and carrying its category's `.visible`. All five always exist — an empty `sets`
 * array yields five empty groups and zero geometry, not an error — and visibility is
 * only ever set on the group, never per mesh.
 */
export function buildSetGroups(scene: SceneFile): THREE.Group[] {
  const visibility = { ...defaultSetVisibility(), ...(scene.setVisibility ?? {}) };
  const groups = new Map<keyof SetVisibility, THREE.Group>();
  for (const key of SET_VISIBILITY_KEYS) {
    const group = new THREE.Group();
    group.name = `sets:${key}`;
    group.visible = visibility[key] !== false;
    groups.set(key, group);
  }
  // The palette index is the piece's position in `scene.sets`, NOT a per-category
  // counter — hiding one category must not re-colour the pieces in another.
  for (const [i, piece] of (scene.sets ?? []).entries()) {
    const group = groups.get(categoryForKind(piece.kind));
    // An unrecognised kind (hand-edited file) has no category to hide it by, so it
    // is dropped rather than rendered into geometry no checkbox controls.
    if (group) group.add(buildSetPiece(piece, i));
  }
  return SET_VISIBILITY_KEYS.map((key) => groups.get(key) as THREE.Group);
}

import type { Character, SceneFile, Vec3 } from '../types/scene';

/**
 * Scene-model geometry with no Three.js in it. Viewport.tsx wraps these in
 * THREE.Vector3; PropertiesPanel reads them directly for the focus readout. Keeping
 * the maths here is also what makes it testable — Viewport itself can't run under
 * jsdom (no WebGL), so anything left inside it is untestable by construction.
 */

export function num(v: number | '[?]', fallback: number): number {
  return v === '[?]' ? fallback : v;
}

// Position is base-anchored (object's floor contact point), matching how a director thinks
// about blocking — "stand here" means feet-at-XYZ, not geometric-center-at-XYZ. This offset
// lifts each primitive so its bottom sits at the group's local origin.
export function verticalHalfExtent(shape: string, dims: number[]): number {
  switch (shape) {
    case 'sphere':
      return dims[0] ?? 0.5;
    case 'box':
      return (dims[1] ?? 1) / 2;
    case 'cylinder':
      return (dims[2] ?? 1) / 2;
    case 'cone':
      return (dims[1] ?? 1) / 2;
    case 'capsule':
    default:
      return (dims[1] ?? 1.8) / 2;
  }
}

// Where the shot camera aims when no focus subject is set: centre stage, a metre up.
// Scenes authored before focusSubjectId drove the camera were all framed against this.
export const DEFAULT_AIM: Vec3 = { x: 0, y: 1, z: 0 };

// Posed .glb figures have no synchronously-known bounds — GLTFLoader is still in
// flight when the camera is positioned — so aim at a nominal human mid-height.
export const NOMINAL_FIGURE_MID_HEIGHT = 0.9;

// The camera's own position fallbacks, matching what the viewport has always used.
export const DEFAULT_CAMERA_POSITION: Vec3 = { x: 0, y: 1.6, z: 4 };

// Characters are base-anchored (position.y is floor contact), so the aim point is
// the figure's mid-height above that: its geometric centre for a primitive.
export function aimPointForCharacter(char: Character): Vec3 {
  const midHeight =
    char.mesh.kind === 'primitive'
      ? verticalHalfExtent(char.mesh.shape, char.mesh.dimensions)
      : NOMINAL_FIGURE_MID_HEIGHT;
  return {
    x: num(char.position.x, 0),
    y: num(char.position.y, 0) + midHeight * (char.scale || 1),
    z: num(char.position.z, 0),
  };
}

// focusSubjectId aims the shot camera. An unset, unknown, or hidden subject falls
// back to centre stage rather than leaving the camera pointed at nothing.
export function cameraAimPoint(scene: SceneFile): Vec3 {
  const { focusSubjectId } = scene.camera;
  if (!focusSubjectId) return { ...DEFAULT_AIM };
  const subject = scene.characters.find((c) => c.id === focusSubjectId && c.visible);
  return subject ? aimPointForCharacter(subject) : { ...DEFAULT_AIM };
}

export function cameraPosition(scene: SceneFile): Vec3 {
  return {
    x: num(scene.camera.position.x, DEFAULT_CAMERA_POSITION.x),
    y: num(scene.camera.position.y, DEFAULT_CAMERA_POSITION.y),
    z: num(scene.camera.position.z, DEFAULT_CAMERA_POSITION.z),
  };
}

/** True when the camera aims at a real character rather than falling back to centre stage. */
export function hasResolvedFocusSubject(scene: SceneFile): boolean {
  const { focusSubjectId } = scene.camera;
  if (!focusSubjectId) return false;
  return scene.characters.some((c) => c.id === focusSubjectId && c.visible);
}

/** Metres from the camera to whatever it is aimed at. This is the focus distance. */
export function subjectDistance(scene: SceneFile): number {
  const p = cameraPosition(scene);
  const a = cameraAimPoint(scene);
  return Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z);
}

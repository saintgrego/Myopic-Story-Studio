import type { Character, Flagged, SceneFile, ShotType, Vec3 } from '../types/scene';

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
// flight when the camera is positioned — so the camera works from a nominal figure.
// The pose library measures 1.690 m (default figure) and 1.639 m (female).
export const NOMINAL_FIGURE_HEIGHT = 1.7;

// Mid-height of that nominal figure: what the camera aimed at for EVERY shot before
// shot type drove the aim. Retained because it is still the fallback fraction's
// result, and because the focus readout's older evidence in STATE.md cites it.
export const NOMINAL_FIGURE_MID_HEIGHT = 0.9;

// The camera's own position fallbacks, matching what the viewport has always used.
export const DEFAULT_CAMERA_POSITION: Vec3 = { x: 0, y: 1.6, z: 4 };

// The wide-shot fraction, DERIVED rather than written down as ~0.53: it is exactly the
// old mid-height aim expressed as a fraction, so a .glb figure in a wide shot aims
// precisely where it did before this change and only tight shots move. Hardcoding 0.53
// would miss by a millimetre and quietly re-frame every existing wide shot.
//
// A *primitive* character does shift, by (this − 0.5) of its height — about 5 cm on a
// 1.8 m capsule — because its old aim was its exact geometric centre. Immaterial at
// wide-shot framing, but it is a shift, not a no-op.
const MID_HEIGHT_FRACTION = NOMINAL_FIGURE_MID_HEIGHT / NOMINAL_FIGURE_HEIGHT;

// WHAT THE FRAME IS CENTRED ON, as a fraction of the subject's height.
//
// `lookAt` puts the aim point at the exact centre of frame, so the aim height alone
// decides what a given shot can contain. Aiming at mid-height for every shot — which
// is what this did before — makes a tight shot impossible to express: to include a
// 1.7 m figure's head the frame needs a half-height of 0.8 m, which drags the bottom
// of frame down to the ankles no matter where the camera stands or what lens is on it.
// An "MCU" could be requested and the viewport would show a full-length shot.
//
// Shot type is the field that already declares how tight the framing is, so it is what
// the aim reads. Fractions are the centre of each conventional frame on a standing
// figure: MCU runs mid-chest to just over the head, so its centre sits at 0.86.
export const AIM_FRACTION: Record<ShotType, number> = {
  ECU: 0.94, // eye line
  CU: 0.9, // head and shoulders
  MCU: 0.86, // mid-chest up
  MS: 0.79, // waist up
  MLS: 0.65, // knees up
  LS: MID_HEIGHT_FRACTION, // full figure — the pre-existing aim, unchanged
  ELS: MID_HEIGHT_FRACTION,
};

// Unset or flagged shot type keeps the old behaviour.
export const DEFAULT_AIM_FRACTION = MID_HEIGHT_FRACTION;

export function aimFraction(shotType?: Flagged<ShotType>): number {
  if (!shotType || shotType === '[?]') return DEFAULT_AIM_FRACTION;
  return AIM_FRACTION[shotType] ?? DEFAULT_AIM_FRACTION;
}

// Characters are base-anchored (position.y is floor contact), so the aim point is a
// fraction of the subject's height above that. A primitive's height is known exactly;
// a .glb's is not, so it uses the nominal figure.
export function aimPointForCharacter(char: Character, shotType?: Flagged<ShotType>): Vec3 {
  const height =
    char.mesh.kind === 'primitive'
      ? verticalHalfExtent(char.mesh.shape, char.mesh.dimensions) * 2
      : NOMINAL_FIGURE_HEIGHT;
  return {
    x: num(char.position.x, 0),
    y: num(char.position.y, 0) + height * aimFraction(shotType) * (char.scale || 1),
    z: num(char.position.z, 0),
  };
}

// focusSubjectId aims the shot camera. An unset, unknown, or hidden subject falls
// back to centre stage rather than leaving the camera pointed at nothing.
export function cameraAimPoint(scene: SceneFile): Vec3 {
  const { focusSubjectId, shotType } = scene.camera;
  if (!focusSubjectId) return { ...DEFAULT_AIM };
  const subject = scene.characters.find((c) => c.id === focusSubjectId && c.visible);
  return subject ? aimPointForCharacter(subject, shotType) : { ...DEFAULT_AIM };
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

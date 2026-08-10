export type TimeOfDay = 'Dawn' | 'Morning' | 'Midday' | 'Dusk' | 'Night';
export type LightingScheme = 'Natural' | 'Studio' | 'Dramatic' | 'Practical';
export type MoodPreset = 'Noir' | 'Golden Hour' | 'Overcast' | 'Neon Night' | 'High Key' | 'Neutral';
export type ShotType = 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'ELS';
export type CameraAngle = 'Eye Level' | 'Low' | 'High' | 'Dutch' | "Bird's Eye" | "Worm's Eye";
export type CameraMovement = 'Static' | 'Pan' | 'Tilt' | 'Dolly' | 'Crane' | 'Handheld';
export type AspectRatio = '16:9' | '2.39:1' | '4:3' | '1:1';
export type PrimitiveShape = 'capsule' | 'box' | 'sphere' | 'cylinder' | 'cone';

// A value that may be flagged as ambiguous by the parser
export type Flagged<T> = T | '[?]';

export type Vec3 = { x: number; y: number; z: number };
export type FlaggedVec3 = { x: Flagged<number>; y: Flagged<number>; z: Flagged<number> };

/**
 * Central architectural requirement (PRD section 4): every scene object holds a mesh
 * reference that is EITHER a primitive OR a glTF path. V1 only ever produces 'primitive'
 * meshes, but the renderer must treat both variants as equally first-class from day one.
 * Dimensions are interpreted per-shape: capsule=[radius,height], box=[width,height,depth],
 * sphere=[radius], cylinder=[radiusTop,radiusBottom,height], cone=[radius,height].
 */
export type MeshRef =
  | { kind: 'primitive'; shape: PrimitiveShape; dimensions: number[] }
  | { kind: 'gltf'; path: string };

export type Setting = 'Interior' | 'Exterior';

export interface Environment {
  locationName: Flagged<string>;
  setting: Flagged<Setting>;
  timeOfDay: Flagged<TimeOfDay>;
  weather: Flagged<string>;
}

export interface Lighting {
  scheme: Flagged<LightingScheme>;
  keyLightAzimuth: Flagged<number>;    // degrees 0–360
  keyLightElevation: Flagged<number>;  // degrees 0–90
  keyLightColor: Flagged<string>;      // hex
  fillIntensity: Flagged<number>;      // 0–1
  // PRD §11 v1.6 (gel filters). Optional because every .myo written before the
  // amendment lacks them; absent means '#ffffff', which is cosmetically neutral,
  // so pre-v1.6 scenes render identically and need no migration. Resolve with
  // resolveLightColor() in src/lib/lighting.ts rather than reading directly.
  fillColor?: Flagged<string>;         // hex, default '#ffffff'
  rimLight: boolean;
  rimIntensity: Flagged<number>;       // 0–1
  rimColor?: Flagged<string>;          // hex, default '#ffffff'
  shadowSoftness: Flagged<number>;     // 0–1
  moodPreset: Flagged<MoodPreset>;
}

export interface Camera {
  shotType: Flagged<ShotType>;
  angle: Flagged<CameraAngle>;
  focalLength: Flagged<number>;        // mm
  depthOfField: Flagged<number>;       // f-stop
  focusSubjectId: string | null;
  position: FlaggedVec3;
  movement: Flagged<CameraMovement>;   // metadata only — nothing animates in V1
  aspectRatio: Flagged<AspectRatio>;
}

export interface Character {
  id: string;
  figureName: Flagged<string>;
  position: FlaggedVec3;
  rotation: Vec3;
  scale: number;
  visible: boolean;
  mesh: MeshRef;
}

export interface Prop {
  id: string;
  propName: Flagged<string>;
  position: FlaggedVec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  mesh: MeshRef;
}

/**
 * PRD §11 v1.9 — set pieces.
 *
 * The amendment's schema block refers to "the existing Transform type"; no such
 * type existed, so it is defined here once, matching the shape Prop already uses
 * (rotation in DEGREES, converted at render time like every other rotation).
 * Character/Prop keep their flat position/rotation/scale — folding them into
 * this would change the .myo envelope for every saved scene, which v1.9 does
 * not authorise.
 */
export interface Transform {
  position: Vec3;
  rotation: Vec3;  // degrees
  scale: Vec3;
}

export type SetPieceKind = 'wall' | 'floor' | 'ceiling' | 'door' | 'window';

export interface SetPiece {
  kind: SetPieceKind;
  transform: Transform;
  /** Metres. position.y is base-anchored, as everywhere else in the model. */
  dimensions: { width: number; height: number; depth: number };
  /** Cool-palette material name (PRD §11 v1.9 §3). Resolve via setPieceColor(). */
  materialRef: string;
  /**
   * Doors/windows only. Fixed at placement — v1.9 §4 explicitly rules out a
   * runtime open↔closed toggle, so nothing in the UI may write this.
   */
  state?: 'open' | 'closed';
}

/** Category-level visibility. v1.9 §1: there is deliberately no per-piece flag. */
export interface SetVisibility {
  walls: boolean;
  floors: boolean;
  ceilings: boolean;
  doors: boolean;
  windows: boolean;
}

export type SetCategory = keyof SetVisibility;

export interface SceneFile {
  sceneId: string;
  title: string;
  created: string;           // ISO 8601
  prompt: string;
  environment: Environment;
  lighting: Lighting;
  camera: Camera;
  characters: Character[];
  props: Prop[];
  /**
   * PRD §11 v1.9. Every .myo written before the amendment lacks both fields, so
   * they are normalised at the load boundary (withSetDefaults in src/lib/sets.ts)
   * rather than migrated on disk — same no-migration stance as environment.setting
   * and fillColor/rimColor. Absent sets means [], absent visibility means all-true.
   */
  sets: SetPiece[];
  setVisibility: SetVisibility;
  storyboardNotes: string;
  flaggedParams: string[];   // dot-paths of fields set to '[?]'
}

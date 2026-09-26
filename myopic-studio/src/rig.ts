import * as THREE from 'three';

// The figure skeleton (PRD §3 "v2.0 Articulation", decisions 1 and 2).
//
// Mixamo-style names, stored WITHOUT the `mixamorig:` prefix. The rigged figure library
// (`public/assets/figures/`, built by scripts/blender/build-figure-glbs.py) is written with
// exactly these names; anything arriving with a prefix has it stripped on load by
// `stripRigPrefixes`, so every later phase can address joints by these names alone.
//
// Mirrored in build-figure-glbs.py's JOINT_PARENT, and `figures.test.ts` asserts every
// figure .glb carries exactly this set with exactly this hierarchy.
export const JOINT_PARENT = {
  Hips: null,
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
} as const;

export type JointName = keyof typeof JOINT_PARENT;

export const JOINTS = Object.keys(JOINT_PARENT) as JointName[];

// `mixamorig:Hips`, and the forms the same name takes after passing through a loader.
// GLTFLoader runs every node name through PropertyBinding.sanitizeNodeName, which DELETES
// the colon — so by the time a Mixamo export reaches the scene graph its bones are named
// `mixamorigHips`, and a pattern that only knew about the colon would match nothing.
// Re-exports from Blender tend to turn it into an underscore instead, and a second
// character in one Mixamo session gets `mixamorig1:`.
const RIG_PREFIX = /^mixamorig\d*[:_]?/;

export function stripRigPrefix(name: string): string {
  const stripped = name.replace(RIG_PREFIX, '');
  // Only strip when what is left is a real name. `mixamorig` alone, or a prefix glued to
  // nothing, is left exactly as it came.
  return stripped.length > 0 ? stripped : name;
}

/** Rename every node under `root` that carries a Mixamo rig prefix, in place. */
export function stripRigPrefixes(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.name = stripRigPrefix(node.name);
  });
}

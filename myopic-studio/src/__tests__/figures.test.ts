import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { JOINTS, JOINT_PARENT, stripRigPrefix, stripRigPrefixes } from '../rig';

// The rigged figure library (PRD §11 v2.0, phase 1). Built by
// scripts/blender/build-figure-glbs.py; nothing in the app references these yet — phase 2
// (the pose model) is what starts posing them.
const FIGURE_DIR = path.join(process.cwd(), 'public', 'assets', 'figures');
const FIGURES = fs.readdirSync(FIGURE_DIR).filter((f) => f.endsWith('.glb')).sort();

// PRD §11 v2.0: "the rigged figure .glbs get a per-file and total byte ceiling, asserted
// in the test suite", with the values "set when the first rigged figure's real size is
// known, not estimated". Known now: 821,072 and 838,036 bytes (STATE.md, "Rig: phase 1").
// Ceilings are those sizes plus ~20% — room for a legitimate rebuild to move, none for a
// figure that quietly doubles (a lost weld, split normals, multires left on).
const MAX_FIGURE_BYTES = 1_000_000;
const MAX_LIBRARY_BYTES = 2_000_000;

// Same realm copy as poses.test.ts — see measureGlb there for why it is load-bearing.
async function loadGlb(file: string): Promise<THREE.Object3D> {
  const data = Uint8Array.from(fs.readFileSync(file)).buffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) =>
    new GLTFLoader().parse(data, '', resolve, reject),
  );
  return gltf.scene;
}

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

describe('joint set', () => {
  // PRD §3 v2.0 decision 2 names six centreline joints plus seven per side. Its heading
  // says "19"; the list it gives is 20, and the list is what §5's JointName type spells
  // out. This pins the list.
  test('is the six centreline joints plus seven per side', () => {
    expect(JOINTS).toHaveLength(6 + 2 * 7);
    for (const side of ['Left', 'Right']) {
      for (const j of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot']) {
        expect(JOINTS).toContain(`${side}${j}`);
      }
    }
  });

  test('has one root, Hips, and every parent is itself a joint', () => {
    expect(JOINTS.filter((j) => JOINT_PARENT[j] === null)).toEqual(['Hips']);
    for (const j of JOINTS) {
      const parent = JOINT_PARENT[j];
      if (parent !== null) expect(JOINTS).toContain(parent);
    }
  });
});

describe('rig prefix stripping (PRD §3 v2.0 decision 1)', () => {
  test.each([
    ['mixamorig:Hips', 'Hips'],
    // What GLTFLoader leaves after sanitizeNodeName deletes the colon.
    ['mixamorigHips', 'Hips'],
    ['mixamorig_LeftForeArm', 'LeftForeArm'],
    ['mixamorig1:Spine2', 'Spine2'],
    ['Hips', 'Hips'],
    ['mixamorig', 'mixamorig'],
    ['Body', 'Body'],
  ])('%s → %s', (input, expected) => {
    expect(stripRigPrefix(input)).toBe(expected);
  });

  // End to end through the real loader, because the loader rewrites the names first: a
  // Mixamo-style file must come out addressable by bare joint names.
  test('a prefixed glTF loads with bare joint names', async () => {
    const gltf = {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'mixamorig:Hips', children: [1] },
        { name: 'mixamorig:Spine', translation: [0, 0.1, 0] },
      ],
    };
    const scene = await new Promise<THREE.Object3D>((resolve, reject) =>
      new GLTFLoader().parse(JSON.stringify(gltf), '', (g) => resolve(g.scene), reject),
    );
    stripRigPrefixes(scene);
    expect(scene.getObjectByName('Hips')).toBeDefined();
    expect(scene.getObjectByName('Spine')?.parent?.name).toBe('Hips');
  });
});

describe('rigged figure library', () => {
  test('exists', () => {
    expect(FIGURES).toEqual(['mannequin-female.glb', 'mannequin.glb']);
  });

  test('stays under its byte ceilings (PRD §11 v2.0)', () => {
    const sizes = FIGURES.map((f) => ({ f, bytes: fs.statSync(path.join(FIGURE_DIR, f)).size }));
    for (const { f, bytes } of sizes) {
      expect({ f, under: bytes <= MAX_FIGURE_BYTES }).toEqual({ f, under: true });
    }
    expect(sizes.reduce((sum, s) => sum + s.bytes, 0)).toBeLessThanOrEqual(MAX_LIBRARY_BYTES);
  });

  describe.each(FIGURES)('%s', (file) => {
    let scene: THREE.Object3D;
    beforeAll(async () => {
      scene = await loadGlb(path.join(FIGURE_DIR, file));
      scene.updateMatrixWorld(true);
      // Bone matrices are only filled on update (normally at render); without this a
      // skinned bounding box is computed from zeros.
      skinnedMeshes(scene).forEach((m) => m.skeleton.update());
    });

    test('is one skinned mesh — the palette colours a figure as one object', () => {
      expect(skinnedMeshes(scene)).toHaveLength(1);
    });

    test('its skeleton is exactly the joint set, with the joint hierarchy', () => {
      const [mesh] = skinnedMeshes(scene);
      const names = mesh.skeleton.bones.map((b) => b.name).sort();
      expect(names).toEqual([...JOINTS].sort());
      for (const bone of mesh.skeleton.bones) {
        const parent = (bone.parent as THREE.Bone).isBone ? bone.parent!.name : null;
        expect({ joint: bone.name, parent }).toEqual({
          joint: bone.name,
          parent: JOINT_PARENT[bone.name as keyof typeof JOINT_PARENT],
        });
      }
    });

    test('no joint carries a rig prefix (files are written bare)', () => {
      const [mesh] = skinnedMeshes(scene);
      for (const bone of mesh.skeleton.bones) expect(bone.name).toBe(stripRigPrefix(bone.name));
    });

    // Positions are base-anchored (PRD §4), in the rest pose as for every pose .glb.
    test('rests exactly on the floor in its rest pose (min.y = 0)', () => {
      const box = new THREE.Box3().setFromObject(scene);
      expect(Math.abs(box.min.y)).toBeLessThan(0.001);
      expect(box.max.y).toBeGreaterThan(1.4);
    });

    // The local-axis convention phase 2's rotation tables are written against (see
    // LOCAL AXES in build-figure-glbs.py). Asserted rather than described, because a
    // re-export that rolled the bones differently would silently re-mean every stored
    // rotation.
    test('every bone points +Y at its child, with +Z to the front (feet: +Z up)', () => {
      const [mesh] = skinnedMeshes(scene);
      const bone = (n: string) => mesh.skeleton.bones.find((b) => b.name === n)!;
      for (const b of mesh.skeleton.bones) {
        // Along the chain only: a hip or clavicle branches off its parent's side, not its tip.
        const chain = b.children.filter(
          (c) => (c as THREE.Bone).isBone && !/(UpLeg|Shoulder)$/.test(c.name),
        );
        for (const child of chain) {
          const dir = child.position.clone().normalize();
          expect({ joint: child.name, alongY: dir.y > 0.999 }).toEqual({
            joint: child.name,
            alongY: true,
          });
        }
        const z = new THREE.Vector3(0, 0, 1).transformDirection(b.matrixWorld);
        // The figure faces +Z in glTF space.
        const want = b.name.endsWith('Foot') ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        expect({ joint: b.name, aligned: z.dot(want) > 0.7 }).toEqual({ joint: b.name, aligned: true });
      }
      // Left is the figure's own left: facing +Z, that is +X.
      expect(bone('LeftHand').getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(0);
      expect(bone('RightFoot').getWorldPosition(new THREE.Vector3()).x).toBeLessThan(0);
    });
  });
});

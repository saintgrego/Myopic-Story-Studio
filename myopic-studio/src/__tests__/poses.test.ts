import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import poses from '../poses.json';

// Load a .glb off disk and return its world-space bounding box.
//
// The realm copy is load-bearing, not tidiness: GLTFLoader gates its binary path on
// `data instanceof ArrayBuffer`, and an ArrayBuffer that came out of Node's fs belongs
// to a different realm than the jsdom sandbox's ArrayBuffer, so the check fails silently
// and the loader treats the raw buffer as a parsed glTF object. The symptom is a bogus
// "Unsupported asset. glTF versions >=2.0 are supported." on a perfectly valid file.
// `Uint8Array.from(buf)` re-allocates inside the sandbox realm.
async function measureGlb(filePath: string): Promise<THREE.Box3> {
  const data = Uint8Array.from(fs.readFileSync(filePath)).buffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) =>
    new GLTFLoader().parse(data, '', resolve, reject),
  );
  return new THREE.Box3().setFromObject(gltf.scene);
}

// poses.json is the single source of truth for the pose library (PRD §11):
// PropertiesPanel imports it, server/parser.js requires it, and each path must
// resolve to a real .glb under public/. Jest's cwd is myopic-studio/.
describe('pose library consistency', () => {
  test('every pose has a name, a /assets/poses/ path, and a hint', () => {
    expect(poses.length).toBeGreaterThan(0);
    for (const pose of poses) {
      expect(pose.name).toMatch(/^[a-z][a-z-]*$/);
      expect(pose.path).toBe(`/assets/poses/${pose.name}.glb`);
      expect(pose.hint.length).toBeGreaterThan(0);
    }
  });

  test('pose names are unique', () => {
    const names = poses.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every pose path resolves to a .glb file under public/', () => {
    for (const pose of poses) {
      const filePath = path.join(process.cwd(), 'public', pose.path);
      expect({ pose: pose.name, exists: fs.existsSync(filePath) }).toEqual({ pose: pose.name, exists: true });
    }
  });

  // Positions are base-anchored: position.y is where the object touches the floor, so a
  // pose .glb must bottom out at y = 0 with nothing below it. This asserts the convention
  // rather than freezing a hash — a byte-equality baseline would have to be regenerated
  // (and blindly re-blessed) every time a pose legitimately changes, whereas this stays
  // true across any edit that keeps the figure on the floor. It is the check that was
  // missing when a stale 87 KB lying.glb shipped beside three 156 KB siblings, and when
  // all four poses drifted up to 5.4 cm off the floor unnoticed.
  test('every pose .glb rests exactly on the floor (base-anchored, min.y = 0)', async () => {
    for (const pose of poses) {
      const box = await measureGlb(path.join(process.cwd(), 'public', pose.path));
      // 1 mm — well under anything visible at blocking scale, well over float error.
      expect({ pose: pose.name, grounded: Math.abs(box.min.y) < 0.001 }).toEqual({
        pose: pose.name,
        grounded: true,
      });
      // A figure that loaded but has no geometry would pass min.y = 0 trivially.
      expect(box.max.y).toBeGreaterThan(0.1);
    }
  });
});

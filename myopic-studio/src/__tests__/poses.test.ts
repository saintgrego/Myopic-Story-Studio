import fs from 'fs';
import path from 'path';
import poses from '../poses.json';

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
});

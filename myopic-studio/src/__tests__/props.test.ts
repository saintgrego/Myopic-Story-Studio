import fs from 'fs';
import path from 'path';
import props from '../props.json';

// props.json is the single source of truth for the prop proxy library (PRD §11,
// v1.3), mirroring poses.json: PropertiesPanel imports it, server/parser.js
// requires it, and each path must resolve to a real .glb under public/. Jest's
// cwd is myopic-studio/.
describe('prop library consistency', () => {
  test('every prop has a name, a /assets/props/ path, a hint, and a footprint', () => {
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(prop.name).toMatch(/^[a-z][a-z-]*$/);
      expect(prop.path).toBe(`/assets/props/${prop.name}.glb`);
      expect(prop.hint.length).toBeGreaterThan(0);
      // The footprint is fed to the parser so it can judge whether a proxy fits
      // the described object; W×H×D in metres, all positive.
      expect(prop.footprint).toHaveLength(3);
      for (const d of prop.footprint) expect(d).toBeGreaterThan(0);
    }
  });

  test('prop names are unique', () => {
    const names = props.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every prop path resolves to a .glb file under public/', () => {
    for (const prop of props) {
      const filePath = path.join(process.cwd(), 'public', prop.path);
      expect({ prop: prop.name, exists: fs.existsSync(filePath) }).toEqual({ prop: prop.name, exists: true });
    }
  });

  // The reverse direction: a .glb generated but never registered is invisible to
  // both the panel and the parser, which is the failure mode that looks like
  // "the generator ran but nothing changed".
  test('every .glb under public/assets/props is registered in props.json', () => {
    const dir = path.join(process.cwd(), 'public', 'assets', 'props');
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort();
    const registered = props.map((p) => `${p.name}.glb`).sort();
    expect(onDisk).toEqual(registered);
  });
});

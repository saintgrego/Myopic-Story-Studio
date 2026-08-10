import { create } from 'zustand';
import type { SceneFile } from '../types/scene';
import { withSetDefaults } from '../lib/sets';

export type Selection =
  | { kind: 'scene' }
  | { kind: 'environment' }
  | { kind: 'lighting' }
  | { kind: 'camera' }
  | { kind: 'character'; id: string }
  | { kind: 'prop'; id: string }
  | null;

export type PathSegment = string | number;

function setAtPath(scene: SceneFile, path: PathSegment[], value: unknown): SceneFile {
  const clone = structuredClone(scene) as unknown as Record<string, unknown>;
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < path.length - 1; i++) {
    cursor = cursor[path[i] as keyof typeof cursor] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return clone as unknown as SceneFile;
}

// Same dot-path format the parser's collectFlaggedPaths emits:
// keys joined with '.', array indices as '[i]' (e.g. characters[0].position.x).
function toFlagPath(path: PathSegment[]): string {
  return path.reduce<string>(
    (acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg),
    ''
  );
}

interface SceneStore {
  scene: SceneFile | null;
  selection: Selection;
  dirty: boolean;
  loadScene: (scene: SceneFile) => void;
  select: (selection: Selection) => void;
  setField: (path: PathSegment[], value: unknown) => void;
  markSaved: () => void;
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scene: null,
  selection: null,
  dirty: false,
  // The one funnel every scene passes through — parser output and loaded .myo
  // alike — so the v1.9 set defaults are applied in exactly one place and the
  // rest of the app can treat `sets`/`setVisibility` as always present.
  loadScene: (scene) => set({ scene: withSetDefaults(scene), selection: { kind: 'scene' }, dirty: false }),
  select: (selection) => set({ selection }),
  setField: (path, value) => {
    const { scene } = get();
    if (!scene) return;
    let next = setAtPath(scene, path, value);
    if (value !== '[?]' && next.flaggedParams.length > 0) {
      const flagPath = toFlagPath(path);
      if (next.flaggedParams.includes(flagPath)) {
        next = { ...next, flaggedParams: next.flaggedParams.filter((p) => p !== flagPath) };
      }
    }
    set({ scene: next, dirty: true });
  },
  markSaved: () => set({ dirty: false }),
}));

export function characterIndex(scene: SceneFile, id: string): number {
  return scene.characters.findIndex((c) => c.id === id);
}

export function propIndex(scene: SceneFile, id: string): number {
  return scene.props.findIndex((p) => p.id === id);
}

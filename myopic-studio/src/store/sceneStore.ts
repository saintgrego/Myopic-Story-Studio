import { create } from 'zustand';
import type { SceneFile } from '../types/scene';

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
  loadScene: (scene) => set({ scene, selection: { kind: 'scene' }, dirty: false }),
  select: (selection) => set({ selection }),
  setField: (path, value) => {
    const { scene } = get();
    if (!scene) return;
    set({ scene: setAtPath(scene, path, value), dirty: true });
  },
  markSaved: () => set({ dirty: false }),
}));

export function characterIndex(scene: SceneFile, id: string): number {
  return scene.characters.findIndex((c) => c.id === id);
}

export function propIndex(scene: SceneFile, id: string): number {
  return scene.props.findIndex((p) => p.id === id);
}

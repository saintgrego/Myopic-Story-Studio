import { create } from 'zustand';
import { getStoryboard, saveStoryboard } from '../lib/storyboardApi';
import type { StoryboardFrame } from '../types/storyboard';

interface StoryboardStore {
  frames: StoryboardFrame[];
  loaded: boolean;
  load: () => Promise<void>;
  addFrame: (frame: Omit<StoryboardFrame, 'frameId' | 'shotNumber'>) => Promise<void>;
  removeFrame: (frameId: string) => Promise<void>;
  moveFrame: (fromIndex: number, toIndex: number) => Promise<void>;
  updateFrame: (frameId: string, patch: Partial<StoryboardFrame>) => Promise<void>;
}

function nextShotNumber(frames: StoryboardFrame[]): number {
  return frames.reduce((max, f) => Math.max(max, f.shotNumber), 0) + 10;
}

export const useStoryboardStore = create<StoryboardStore>((set, get) => ({
  frames: [],
  loaded: false,

  load: async () => {
    const frames = await getStoryboard();
    set({ frames, loaded: true });
  },

  addFrame: async (frame) => {
    const frames = [
      ...get().frames,
      { ...frame, frameId: crypto.randomUUID(), shotNumber: nextShotNumber(get().frames) },
    ];
    set({ frames });
    await saveStoryboard(frames);
  },

  removeFrame: async (frameId) => {
    const frames = get().frames.filter((f) => f.frameId !== frameId);
    set({ frames });
    await saveStoryboard(frames);
  },

  moveFrame: async (fromIndex, toIndex) => {
    const frames = [...get().frames];
    if (toIndex < 0 || toIndex >= frames.length) return;
    const [moved] = frames.splice(fromIndex, 1);
    frames.splice(toIndex, 0, moved);
    set({ frames });
    await saveStoryboard(frames);
  },

  updateFrame: async (frameId, patch) => {
    const frames = get().frames.map((f) => (f.frameId === frameId ? { ...f, ...patch } : f));
    set({ frames });
    await saveStoryboard(frames);
  },
}));

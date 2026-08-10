import React from 'react';
import { useSceneStore } from '../store/sceneStore';
import { SET_CATEGORIES, allSetsHidden, categoryOfKind } from '../lib/sets';
import type { SetCategory } from '../types/scene';

const LABELS: Record<SetCategory, string> = {
  walls: 'Walls',
  floors: 'Floors',
  ceilings: 'Ceilings',
  doors: 'Doors',
  windows: 'Windows',
};

/**
 * PRD §11 v1.9 §2. Category toggles only — there is no per-piece visibility to
 * expose, and no open↔closed control: SetPiece.state is fixed at placement.
 * Every write goes through setField like the rest of the app.
 */
export default function SetsPanel() {
  const scene = useSceneStore((s) => s.scene);
  const setField = useSceneStore((s) => s.setField);

  if (!scene) {
    return <div className="p-4 text-xs text-zinc-600">No scene loaded yet.</div>;
  }

  const counts = scene.sets.reduce<Partial<Record<SetCategory, number>>>((acc, piece) => {
    const category = categoryOfKind(piece.kind);
    if (category) acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const anyVisible = SET_CATEGORIES.some((c) => scene.setVisibility[c]);

  return (
    <div className="px-3 py-2">
      {scene.sets.length === 0 && (
        <p className="pb-2 text-[11px] text-zinc-600">
          No set pieces in this scene. Toggles still apply to anything added later.
        </p>
      )}
      {SET_CATEGORIES.map((category) => (
        <label
          key={category}
          className="flex cursor-pointer items-center gap-2 py-1 text-sm text-zinc-300"
        >
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={scene.setVisibility[category]}
            onChange={(e) => setField(['setVisibility', category], e.target.checked)}
          />
          <span className="flex-1">{LABELS[category]}</span>
          <span className="text-[11px] tabular-nums text-zinc-600">{counts[category] ?? 0}</span>
        </label>
      ))}
      <button
        // One store write, not five: setField replaces the whole setVisibility
        // object so the viewport rebuilds once.
        onClick={() => setField(['setVisibility'], allSetsHidden())}
        disabled={!anyVisible}
        className="mt-2 w-full rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
      >
        Hide all sets
      </button>
    </div>
  );
}

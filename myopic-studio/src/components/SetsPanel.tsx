import React from 'react';
import { useSceneStore } from '../store/sceneStore';
import { CATEGORY_LABELS, SET_VISIBILITY_KEYS, allSetsHidden, categoryForKind } from '../lib/sets';

/**
 * Set visibility (PRD §11 v1.9 §2). Category toggles only — there is no per-piece
 * visibility to expose, and no open↔closed control: `SetPiece.state` is fixed at
 * placement. Every write goes through `setField` like the rest of the app.
 */
export default function SetsPanel() {
  const scene = useSceneStore((s) => s.scene);
  const setField = useSceneStore((s) => s.setField);

  if (!scene) {
    return <div className="p-4 text-xs text-zinc-600">No scene loaded yet.</div>;
  }

  const counts = SET_VISIBILITY_KEYS.map(
    (key) => scene.sets.filter((piece) => categoryForKind(piece.kind) === key).length,
  );
  const anyVisible = SET_VISIBILITY_KEYS.some((key) => scene.setVisibility[key]);

  return (
    <div className="px-3 py-2">
      {scene.sets.length === 0 && (
        <p className="pb-2 text-[11px] text-zinc-600">
          No set pieces in this scene. Toggles still apply to anything added later.
        </p>
      )}
      {SET_VISIBILITY_KEYS.map((key, i) => (
        <label
          key={key}
          className="flex cursor-pointer items-center gap-2 py-1 text-sm text-zinc-300"
        >
          <input
            type="checkbox"
            className="accent-indigo-500"
            checked={scene.setVisibility[key]}
            onChange={(e) => setField(['setVisibility', key], e.target.checked)}
          />
          <span className="flex-1">{CATEGORY_LABELS[key]}</span>
          <span className="text-[11px] tabular-nums text-zinc-600">{counts[i]}</span>
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

import React, { useEffect } from 'react';
import { useStoryboardStore } from '../store/storyboardStore';

export default function StoryboardStrip({ onLoadFilename }: { onLoadFilename: (filename: string) => void }) {
  const frames = useStoryboardStore((s) => s.frames);
  const loaded = useStoryboardStore((s) => s.loaded);
  const load = useStoryboardStore((s) => s.load);
  const removeFrame = useStoryboardStore((s) => s.removeFrame);
  const moveFrame = useStoryboardStore((s) => s.moveFrame);
  const updateFrame = useStoryboardStore((s) => s.updateFrame);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div className="border-t border-zinc-700 bg-zinc-800/30 px-6 py-3">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-500">Storyboard</h2>
      {frames.length === 0 ? (
        <div className="text-xs text-zinc-600">
          No frames yet — save a scene, then click "Add to Storyboard" above.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {frames.map((frame, i) => (
            <div
              key={frame.frameId}
              className="flex w-56 shrink-0 flex-col gap-1.5 rounded-lg bg-zinc-800 p-3 ring-1 ring-zinc-700"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  value={frame.shotNumber}
                  onChange={(e) => updateFrame(frame.frameId, { shotNumber: e.target.valueAsNumber || 0 })}
                  className="w-16 rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-100 ring-1 ring-zinc-700 outline-none"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => moveFrame(i, i - 1)}
                    disabled={i === 0}
                    className="rounded px-1.5 text-xs text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
                    title="Move earlier"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveFrame(i, i + 1)}
                    disabled={i === frames.length - 1}
                    className="rounded px-1.5 text-xs text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
                    title="Move later"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeFrame(frame.frameId)}
                    className="rounded px-1.5 text-xs text-red-400 hover:bg-red-950/60"
                    title="Remove frame"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="truncate text-sm font-semibold text-zinc-100" title={frame.sceneTitle}>
                {frame.sceneTitle}
              </div>
              <div className="text-[11px] text-zinc-500">{frame.cameraLabel}</div>

              <textarea
                value={frame.notes}
                onChange={(e) => updateFrame(frame.frameId, { notes: e.target.value })}
                placeholder="Director notes…"
                rows={2}
                className="resize-none rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 ring-1 ring-zinc-700 outline-none placeholder-zinc-600"
              />

              <button
                onClick={() => onLoadFilename(frame.sceneFilename)}
                className="mt-1 rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-600"
              >
                Load into editor
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

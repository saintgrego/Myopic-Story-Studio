import React from 'react';
import { useSceneStore } from '../store/sceneStore';
import { CATEGORY_LABELS, SET_VISIBILITY_KEYS, allSetsHidden, categoryForKind } from '../lib/sets';
import { CheckboxField, PanelSection } from './fields';

/**
 * Set visibility (PRD §11 v1.9). Five checkboxes, one per category — there is no
 * per-piece visibility, deliberately: the question a director asks is "take the
 * fourth wall out", not "hide this particular panel".
 */
export default function SetsPanel() {
  const scene = useSceneStore((s) => s.scene);
  const setField = useSceneStore((s) => s.setField);

  if (!scene) return null;

  const { sets, setVisibility } = scene;
  const counts = SET_VISIBILITY_KEYS.map(
    (key) => sets.filter((piece) => categoryForKind(piece.kind) === key).length,
  );
  const anyVisible = SET_VISIBILITY_KEYS.some((key) => setVisibility[key]);

  return (
    <PanelSection title="Sets">
      {sets.length === 0 && (
        <p className="pb-2 text-xs text-zinc-600">
          No set pieces in this scene. The toggles below still apply as pieces are added.
        </p>
      )}
      {SET_VISIBILITY_KEYS.map((key, i) => (
        <CheckboxField
          key={key}
          label={`${CATEGORY_LABELS[key]} (${counts[i]})`}
          value={setVisibility[key]}
          onChange={(v) => setField(['setVisibility', key], v)}
        />
      ))}
      <button
        // One write of the whole object, not five sequential field writes: five
        // writes would be five store updates, five re-renders and five viewport
        // rebuilds for what is a single decision.
        onClick={() => setField(['setVisibility'], allSetsHidden())}
        disabled={!anyVisible}
        className="mt-2 w-full rounded bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
      >
        Hide all sets
      </button>
    </PanelSection>
  );
}

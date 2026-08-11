import React from 'react';
import { Selection, useSceneStore } from '../store/sceneStore';

function isSameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if ((a.kind === 'character' || a.kind === 'prop') && (b.kind === 'character' || b.kind === 'prop')) {
    return a.id === b.id;
  }
  return true;
}

function Node({
  label,
  depth,
  selection,
  current,
  onClick,
}: {
  label: string;
  depth: number;
  selection: Selection;
  current: Selection;
  onClick: () => void;
}) {
  const active = isSameSelection(selection, current);
  return (
    <button
      onClick={onClick}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      className={`block w-full truncate rounded py-1 pr-2 text-left text-sm transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}

export default function SceneHierarchy() {
  const scene = useSceneStore((s) => s.scene);
  const selection = useSceneStore((s) => s.selection);
  const select = useSceneStore((s) => s.select);

  if (!scene) {
    return <div className="p-4 text-xs text-zinc-600">No scene loaded yet.</div>;
  }

  return (
    <div className="py-2">
      <Node
        label={scene.title || 'Scene'}
        depth={0}
        selection={{ kind: 'scene' }}
        current={selection}
        onClick={() => select({ kind: 'scene' })}
      />
      <Node
        label="Environment"
        depth={1}
        selection={{ kind: 'environment' }}
        current={selection}
        onClick={() => select({ kind: 'environment' })}
      />
      <Node
        label="Lighting"
        depth={1}
        selection={{ kind: 'lighting' }}
        current={selection}
        onClick={() => select({ kind: 'lighting' })}
      />
      <Node
        label="Camera"
        depth={1}
        selection={{ kind: 'camera' }}
        current={selection}
        onClick={() => select({ kind: 'camera' })}
      />

      <div className="mt-1 px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
        Characters
      </div>
      {scene.characters.length === 0 && (
        <div className="px-4 py-1 text-xs text-zinc-600">None</div>
      )}
      {scene.characters.map((c) => (
        <Node
          key={c.id}
          label={`${c.id}${c.figureName !== '[?]' ? ` — ${c.figureName}` : ''}`}
          depth={1}
          selection={{ kind: 'character', id: c.id }}
          current={selection}
          onClick={() => select({ kind: 'character', id: c.id })}
        />
      ))}

      <div className="mt-1 px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
        Props
      </div>
      {scene.props.length === 0 && <div className="px-4 py-1 text-xs text-zinc-600">None</div>}
      {scene.props.map((p) => (
        <Node
          key={p.id}
          label={`${p.id}${p.propName !== '[?]' ? ` — ${p.propName}` : ''}`}
          depth={1}
          selection={{ kind: 'prop', id: p.id }}
          current={selection}
          onClick={() => select({ kind: 'prop', id: p.id })}
        />
      ))}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { parseScenePrompt } from './lib/parser';
import { saveScene, listScenes, loadScene as fetchScene, SceneSummary } from './lib/sceneApi';
import { useSceneStore } from './store/sceneStore';
import SceneHierarchy from './components/SceneHierarchy';
import PropertiesPanel from './components/PropertiesPanel';
import Viewport from './components/Viewport';
import StoryboardStrip from './components/StoryboardStrip';
import { useStoryboardStore } from './store/storyboardStore';

const EXAMPLE_PROMPT =
  'Interior. A cramped server room, late night. Banks of blinking servers. A lone technician hunches over a terminal, face lit by screen glow. Tight over-the-shoulder shot.';

export default function App() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [selectedFilename, setSelectedFilename] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const scene = useSceneStore((s) => s.scene);
  const dirty = useSceneStore((s) => s.dirty);
  const loadSceneIntoStore = useSceneStore((s) => s.loadScene);
  const markSaved = useSceneStore((s) => s.markSaved);
  const addStoryboardFrame = useStoryboardStore((s) => s.addFrame);
  const [addingToStoryboard, setAddingToStoryboard] = useState(false);

  async function refreshScenes() {
    try {
      setScenes(await listScenes());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refreshScenes();
  }, []);

  async function handleParse() {
    setLoading(true);
    setError(null);
    setSaveStatus(null);
    try {
      const r = await parseScenePrompt(prompt);
      loadSceneIntoStore(r.scene);
      setSelectedFilename('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!scene) return;
    setSaving(true);
    setSaveStatus(null);
    setError(null);
    try {
      const { filename } = await saveScene(scene);
      setSaveStatus(`Saved to scenes/${filename}`);
      setSelectedFilename(filename);
      markSaved();
      await refreshScenes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(filename: string) {
    if (!filename) return;
    setSelectedFilename(filename);
    setLoading(true);
    setError(null);
    setSaveStatus(null);
    try {
      const loaded = await fetchScene(filename);
      loadSceneIntoStore(loaded);
      setPrompt(loaded.prompt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToStoryboard() {
    if (!scene) return;
    setAddingToStoryboard(true);
    setError(null);
    try {
      let filename = selectedFilename;
      if (!filename || dirty) {
        const saved = await saveScene(scene);
        filename = saved.filename;
        setSelectedFilename(filename);
        markSaved();
        await refreshScenes();
      }
      await addStoryboardFrame({
        sceneFilename: filename,
        sceneTitle: scene.title,
        notes: '',
        cameraLabel: `${scene.camera.shotType} · ${scene.camera.focalLength}mm`,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingToStoryboard(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-900 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-700 px-6 py-4">
        <h1 className="text-lg font-bold tracking-tight">
          Myopic! <span className="text-zinc-500 font-normal">3-D Studio</span>
        </h1>
        <select
          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 ring-1 ring-zinc-700 outline-none"
          value={selectedFilename}
          onChange={(e) => handleLoad(e.target.value)}
        >
          <option value="">Load saved scene…</option>
          {scenes.map((s) => (
            <option key={s.filename} value={s.filename}>
              {s.title} — {new Date(s.created).toLocaleString()}
            </option>
          ))}
        </select>
      </header>

      {/* Prompt bar */}
      <div className="border-b border-zinc-700 bg-zinc-800/50 px-6 py-4">
        <textarea
          className="w-full rounded bg-zinc-900 p-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-1 ring-zinc-700 focus:ring-indigo-500"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your scene…"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={loading || !prompt.trim()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {loading ? 'Parsing…' : 'Parse Scene'}
          </button>
          {scene && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save .myo *' : 'Save .myo'}
            </button>
          )}
          {scene && (
            <button onClick={() => setShowRaw(!showRaw)} className="text-xs text-zinc-500 hover:text-zinc-300">
              {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>
          )}
          {scene && (
            <button
              onClick={handleAddToStoryboard}
              disabled={addingToStoryboard}
              className="rounded bg-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
            >
              {addingToStoryboard ? 'Adding…' : '+ Add to Storyboard'}
            </button>
          )}
          {saveStatus && <span className="text-xs text-emerald-400">{saveStatus}</span>}
          {scene && scene.flaggedParams.length > 0 && (
            <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
              {scene.flaggedParams.length} param{scene.flaggedParams.length !== 1 ? 's' : ''} need review
            </span>
          )}
        </div>
      </div>

      {/* Output */}
      <main className="flex-1 px-6 py-6">
        {error && (
          <div className="mb-4 rounded border border-red-700 bg-red-950/40 p-4 text-sm text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {scene && showRaw && (
          <pre className="overflow-auto rounded bg-zinc-800 p-4 text-xs text-zinc-300">
            {JSON.stringify(scene, null, 2)}
          </pre>
        )}

        {scene && !showRaw && (
          <div className="grid h-[70vh] grid-cols-[240px,1fr,320px] gap-4">
            <div className="overflow-y-auto rounded-lg bg-zinc-800/60">
              <h2 className="border-b border-zinc-700 px-3 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Hierarchy
              </h2>
              <SceneHierarchy />
            </div>

            <Viewport />

            <div className="overflow-y-auto rounded-lg bg-zinc-800/60">
              <h2 className="border-b border-zinc-700 px-3 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                Properties
              </h2>
              <div className="px-3">
                <PropertiesPanel />
              </div>
            </div>
          </div>
        )}

        {!scene && !error && (
          <div className="text-sm text-zinc-600">Parse a prompt or load a saved scene to begin.</div>
        )}
      </main>

      <StoryboardStrip onLoadFilename={handleLoad} />
    </div>
  );
}

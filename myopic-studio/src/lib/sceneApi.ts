import type { SceneFile } from '../types/scene';

export interface SceneSummary {
  filename: string;
  sceneId: string;
  title: string;
  created: string;
}

async function unwrapError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}) as { error?: string });
  throw new Error(body.error ?? fallback);
}

export async function saveScene(scene: SceneFile): Promise<{ filename: string }> {
  const response = await fetch('/api/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene }),
  });
  if (!response.ok) return unwrapError(response, `Save failed (${response.status})`);
  return response.json();
}

export async function listScenes(): Promise<SceneSummary[]> {
  const response = await fetch('/api/scenes');
  if (!response.ok) return unwrapError(response, `List failed (${response.status})`);
  const body = await response.json();
  return body.scenes;
}

export async function loadScene(filename: string): Promise<SceneFile> {
  const response = await fetch(`/api/scenes/${encodeURIComponent(filename)}`);
  if (!response.ok) return unwrapError(response, `Load failed (${response.status})`);
  const body = await response.json();
  return body.scene;
}

import type { SceneFile } from '../types/scene';

export interface ParseResult {
  scene: SceneFile;
  rawJson: string;
}

export async function parseScenePrompt(prompt: string): Promise<ParseResult> {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `Parse request failed (${response.status})`);
  }

  return response.json();
}

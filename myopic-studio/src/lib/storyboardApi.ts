import type { StoryboardFrame } from '../types/storyboard';

export async function getStoryboard(): Promise<StoryboardFrame[]> {
  const response = await fetch('/api/storyboard');
  if (!response.ok) throw new Error(`Failed to load storyboard (${response.status})`);
  const body = await response.json();
  return body.frames;
}

export async function saveStoryboard(frames: StoryboardFrame[]): Promise<void> {
  const response = await fetch('/api/storyboard', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames }),
  });
  if (!response.ok) throw new Error(`Failed to save storyboard (${response.status})`);
}

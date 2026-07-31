export interface StoryboardFrame {
  frameId: string;
  sceneFilename: string;
  sceneTitle: string;
  shotNumber: number;
  notes: string;
  cameraLabel: string;
}

export interface Storyboard {
  frames: StoryboardFrame[];
}

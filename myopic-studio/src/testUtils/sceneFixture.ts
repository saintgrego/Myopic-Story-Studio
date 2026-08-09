import type { SceneFile } from '../types/scene';

// A complete, valid SceneFile for tests. Kept outside __tests__/ because CRA's
// Jest treats every file in a __tests__ directory as a test suite.
export function makeScene(overrides: Partial<SceneFile> = {}): SceneFile {
  return {
    sceneId: '00000000-0000-4000-8000-000000000000',
    title: 'Server Room — Night',
    created: '2026-08-01T12:00:00.000Z',
    prompt: 'A technician hunches over a terminal in a dark server room.',
    environment: {
      locationName: 'Server room',
      setting: 'Interior',
      timeOfDay: 'Night',
      weather: '[?]',
    },
    lighting: {
      scheme: 'Practical',
      keyLightAzimuth: 220,
      keyLightElevation: 35,
      keyLightColor: '#88AAFF',
      fillIntensity: 0.2,
      fillColor: '#ffffff',
      rimLight: true,
      rimIntensity: 0.4,
      rimColor: '#ffffff',
      shadowSoftness: 0.3,
      moodPreset: 'Noir',
    },
    camera: {
      shotType: 'MCU',
      angle: 'Eye Level',
      focalLength: 35,
      depthOfField: 2.8,
      focusSubjectId: 'char_01',
      position: { x: 0, y: 1.6, z: 4 },
      movement: 'Static',
      aspectRatio: '16:9',
    },
    characters: [
      {
        id: 'char_01',
        figureName: 'the technician',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 180, z: 0 },
        scale: 1,
        visible: true,
        mesh: { kind: 'gltf', path: '/assets/poses/crouching.glb' },
      },
    ],
    props: [
      {
        id: 'prop_01',
        propName: 'server rack',
        position: { x: -1.2, y: 0, z: -0.5 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visible: true,
        mesh: { kind: 'primitive', shape: 'box', dimensions: [0.8, 2, 1] },
      },
    ],
    storyboardNotes: 'Tense, isolated mood.',
    flaggedParams: ['environment.weather'],
    ...overrides,
  };
}

import { useStoryboardStore } from '../store/storyboardStore';
import { getStoryboard, saveStoryboard } from '../lib/storyboardApi';
import type { StoryboardFrame } from '../types/storyboard';

// Every action on this store writes to disk with no dirty/save gate (CLAUDE.md), so
// the persistence call is part of the behaviour under test, not an incidental detail.
jest.mock('../lib/storyboardApi', () => ({
  getStoryboard: jest.fn(),
  saveStoryboard: jest.fn(),
}));

const mockGet = getStoryboard as jest.MockedFunction<typeof getStoryboard>;
const mockSave = saveStoryboard as jest.MockedFunction<typeof saveStoryboard>;

function frame(overrides: Partial<StoryboardFrame> = {}): StoryboardFrame {
  return {
    frameId: 'frame_01',
    sceneFilename: 'a.myo',
    sceneTitle: 'Server Room — Night',
    shotNumber: 10,
    notes: '',
    cameraLabel: '35mm MCU',
    ...overrides,
  };
}

/** What StoryboardStrip hands addFrame: everything but the two fields the store mints. */
function newFrame(
  overrides: Partial<Omit<StoryboardFrame, 'frameId' | 'shotNumber'>> = {}
): Omit<StoryboardFrame, 'frameId' | 'shotNumber'> {
  const { frameId, shotNumber, ...rest } = frame();
  return { ...rest, ...overrides };
}

/** The frames argument of the most recent saveStoryboard call. */
function lastSaved(): StoryboardFrame[] {
  return mockSave.mock.calls[mockSave.mock.calls.length - 1][0];
}

beforeEach(() => {
  useStoryboardStore.setState({ frames: [], loaded: false });
  mockGet.mockReset();
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
  // Jest 27's jsdom has no crypto.randomUUID; addFrame mints frame ids with it.
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...globalThis.crypto, randomUUID: () => 'generated-uuid' },
      configurable: true,
    });
  }
});

describe('load', () => {
  test('fills frames from the server and flips loaded', async () => {
    const frames = [frame()];
    mockGet.mockResolvedValue(frames);

    await useStoryboardStore.getState().load();

    expect(useStoryboardStore.getState().frames).toEqual(frames);
    expect(useStoryboardStore.getState().loaded).toBe(true);
  });

  test('reading the strip does not write it back', async () => {
    mockGet.mockResolvedValue([]);
    await useStoryboardStore.getState().load();
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('addFrame', () => {
  test('numbers the first shot 10', async () => {
    await useStoryboardStore.getState().addFrame(newFrame());
    expect(useStoryboardStore.getState().frames[0].shotNumber).toBe(10);
  });

  test('numbers each later shot ten past the highest so far', async () => {
    useStoryboardStore.setState({ frames: [frame({ shotNumber: 10 }), frame({ shotNumber: 40 })] });
    await useStoryboardStore.getState().addFrame(newFrame({ sceneFilename: 'c.myo' }));

    const { frames } = useStoryboardStore.getState();
    expect(frames[2].shotNumber).toBe(50);
  });

  // The highest, not the last: renumbering a shot down must not start handing out
  // numbers that collide with one already in the strip.
  test('goes past the highest shot number even when it is not the last frame', async () => {
    useStoryboardStore.setState({ frames: [frame({ shotNumber: 90 }), frame({ shotNumber: 20 })] });
    await useStoryboardStore.getState().addFrame(newFrame({ sceneFilename: 'c.myo' }));

    expect(useStoryboardStore.getState().frames[2].shotNumber).toBe(100);
  });

  test('appends to the end and persists the whole strip', async () => {
    useStoryboardStore.setState({ frames: [frame({ frameId: 'existing' })] });
    await useStoryboardStore.getState().addFrame(newFrame({ sceneFilename: 'b.myo' }));

    expect(lastSaved()).toHaveLength(2);
    expect(lastSaved()[0].frameId).toBe('existing');
    expect(lastSaved()).toEqual(useStoryboardStore.getState().frames);
  });
});

describe('removeFrame', () => {
  test('drops the matching frame and persists', async () => {
    useStoryboardStore.setState({
      frames: [frame({ frameId: 'a' }), frame({ frameId: 'b' })],
    });
    await useStoryboardStore.getState().removeFrame('a');

    expect(useStoryboardStore.getState().frames.map((f) => f.frameId)).toEqual(['b']);
    expect(lastSaved().map((f) => f.frameId)).toEqual(['b']);
  });

  test('an unknown id removes nothing', async () => {
    useStoryboardStore.setState({ frames: [frame({ frameId: 'a' })] });
    await useStoryboardStore.getState().removeFrame('nope');

    expect(useStoryboardStore.getState().frames.map((f) => f.frameId)).toEqual(['a']);
  });
});

describe('updateFrame', () => {
  test('patches only the named frame, only the named keys', async () => {
    useStoryboardStore.setState({
      frames: [frame({ frameId: 'a', notes: 'Wide' }), frame({ frameId: 'b', notes: 'Close' })],
    });
    await useStoryboardStore.getState().updateFrame('a', { notes: 'Establishing' });

    const { frames } = useStoryboardStore.getState();
    expect(frames[0].notes).toBe('Establishing');
    expect(frames[0].shotNumber).toBe(10);
    expect(frames[0].sceneFilename).toBe('a.myo');
    expect(frames[1].notes).toBe('Close');
  });

  test('an unknown id leaves the strip alone but still persists', async () => {
    useStoryboardStore.setState({ frames: [frame({ frameId: 'a' })] });
    await useStoryboardStore.getState().updateFrame('nope', { notes: 'x' });

    expect(useStoryboardStore.getState().frames.map((f) => f.notes)).toEqual(['']);
  });
});

describe('moveFrame', () => {
  function threeFrames() {
    return [frame({ frameId: 'a' }), frame({ frameId: 'b' }), frame({ frameId: 'c' })];
  }

  test('moves a frame later in the strip', async () => {
    useStoryboardStore.setState({ frames: threeFrames() });
    await useStoryboardStore.getState().moveFrame(0, 2);
    expect(useStoryboardStore.getState().frames.map((f) => f.frameId)).toEqual(['b', 'c', 'a']);
  });

  test('moves a frame earlier in the strip', async () => {
    useStoryboardStore.setState({ frames: threeFrames() });
    await useStoryboardStore.getState().moveFrame(2, 0);
    expect(useStoryboardStore.getState().frames.map((f) => f.frameId)).toEqual(['c', 'a', 'b']);
  });

  test('shot numbers ride along with their frames — reordering does not renumber', async () => {
    useStoryboardStore.setState({
      frames: [
        frame({ frameId: 'a', shotNumber: 10 }),
        frame({ frameId: 'b', shotNumber: 20 }),
      ],
    });
    await useStoryboardStore.getState().moveFrame(1, 0);

    expect(useStoryboardStore.getState().frames.map((f) => [f.frameId, f.shotNumber])).toEqual([
      ['b', 20],
      ['a', 10],
    ]);
  });

  // Both ends need the bounds check. An out-of-range fromIndex used to make splice
  // return [] and reinsert undefined — and with no save gate, that hole went straight
  // to storyboard.json, where the next load handed the strip a null frame.
  test.each([
    [5, 0],
    [-1, 0],
    [3, 1],
  ])('an out-of-range move %i → %i is a no-op, not a hole', async (from, to) => {
    useStoryboardStore.setState({ frames: threeFrames() });
    await useStoryboardStore.getState().moveFrame(from, to);

    const { frames } = useStoryboardStore.getState();
    expect(frames.map((f) => f.frameId)).toEqual(['a', 'b', 'c']);
    expect(frames).not.toContain(undefined);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test.each([
    [0, 3],
    [0, -1],
  ])('an out-of-range move %i → %i is a no-op', async (from, to) => {
    useStoryboardStore.setState({ frames: threeFrames() });
    await useStoryboardStore.getState().moveFrame(from, to);

    expect(useStoryboardStore.getState().frames.map((f) => f.frameId)).toEqual(['a', 'b', 'c']);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('a move on an empty strip is a no-op', async () => {
    await useStoryboardStore.getState().moveFrame(0, 0);
    expect(useStoryboardStore.getState().frames).toEqual([]);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('a real move persists the reordered strip', async () => {
    useStoryboardStore.setState({ frames: threeFrames() });
    await useStoryboardStore.getState().moveFrame(0, 1);

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(lastSaved().map((f) => f.frameId)).toEqual(['b', 'a', 'c']);
  });
});

// src/ui/motivation/MotivationSettings.test.tsx
//
// The Settings section for the motivation clip (P6 Task 6).
//
// The asset store is real here: fake-indexeddb backs it, and `saveCustomVideo` and
// `deleteCustomVideo` run their shipped implementations behind spies, so the ordering
// assertions are about calls that actually wrote to a database. Only the two READ paths the
// preview needs are stubbed (`resolveVideoSrc`, `probeBundledVideo`), because what the modal
// then plays is MotivationModal.test.tsx's subject, not this one's.

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotivationSettings } from './MotivationSettings';
import {
  BUNDLED_VIDEO_SRC,
  MAX_VIDEO_BYTES,
  deleteCustomVideo,
  getCustomVideoMeta,
  getCustomVideoUrl,
  probeBundledVideo,
  resetAssetDbForTests,
  resolveVideoSrc,
  saveCustomVideo,
} from '../../domain/motivation/assets';
import { FORMAT, copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { PROFILE_ID, seedState } from '../../test/scheduleFixtures';
import type { MotivationState, WeeklyReview } from '../../domain/types';

vi.mock('../../domain/motivation/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/motivation/assets')>();
  return {
    ...actual,
    saveCustomVideo: vi.fn(actual.saveCustomVideo),
    deleteCustomVideo: vi.fn(actual.deleteCustomVideo),
    getCustomVideoMeta: vi.fn(actual.getCustomVideoMeta),
    resolveVideoSrc: vi.fn(),
    probeBundledVideo: vi.fn(),
  };
});

/** 1 MiB = 2^20 bytes, the unit the section reports a stored clip in. */
const BYTES_PER_MIB = 1_048_576; // [bytes/MiB]

/** A picked file. `bytes` is the payload length, which is also what File.size reports. */
function videoFile(bytes: number, type = 'video/mp4', name = 'clip.mp4'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Monday 2026-08-24 to Sunday 2026-08-30: one closed week, three sessions short. */
const REVIEW: WeeklyReview = {
  profileId: PROFILE_ID,
  weekStart: '2026-08-24',
  weekEnd: '2026-08-30',
  target: 4, // [sessions/week]
  completed: 1, // [sessions]
  skipped: 0, // [sessions]
  paused: false,
  delta: -3, // completed - target, [sessions]
  evaluatedAt: 1_756_000_000_000, // [ms] epoch, UTC
  missHandled: false,
};

/**
 * The store's own action, reached through the state object as it was BEFORE any test put a
 * counter in front of it (the argument SettingsView.test.tsx makes for the same pattern:
 * zustand carries a spy installed on one state object forward onto every later one).
 */
const PRISTINE_STATE = useAppStore.getState();

const REAL_SET_CUSTOM_VIDEO = (profileId: string, assetId: string | null): void => {
  PRISTINE_STATE.setCustomVideo(profileId, assetId);
};

let setCustomVideo: ReturnType<typeof vi.fn<typeof REAL_SET_CUSTOM_VIDEO>>;

/** One profile's motivation state, with only the asset id worth varying here. */
function motivationFor(profileId: string, customVideoAssetId: string | null): MotivationState {
  return { profileId, lastShownForWeek: null, lastShownAt: null, customVideoAssetId };
}

/** The asset id the profile currently names, or null. */
function storedId(): string | null {
  return useAppStore.getState().motivation[PROFILE_ID]?.customVideoAssetId ?? null;
}

/** The nth call's position in vitest's global invocation counter, for ordering assertions. */
function callOrder(mock: { mock: { invocationCallOrder: number[] } }, nth: number): number {
  const order = mock.mock.invocationCallOrder[nth];
  if (order === undefined) throw new Error(`no call ${nth}`);
  return order;
}

function chooseLabel(): HTMLElement {
  return screen.getByLabelText(copy('label.motivationClipChoose'));
}

/**
 * Waits for the picker to carry `label` and to be enabled again.
 *
 * The wait is on the CONTROL rather than on the store, and that is the whole point of the
 * helper. The section disables the picker and the remove button while a save is in flight, and
 * userEvent does nothing at all to a disabled control: a second pick issued on the strength of
 * the store write alone lands in the render between that write and `busy` clearing, and is
 * silently dropped. Waiting here for `toBeEnabled` waits for the render that actually reopens
 * the control.
 */
async function pickerSettled(label: string): Promise<HTMLElement> {
  const input = await screen.findByLabelText(label);
  await waitFor(() => {
    expect(input).toBeEnabled();
  });
  return input;
}

beforeEach(() => {
  // fake-indexeddb keeps its databases on the factory, so a fresh factory is a fresh disk.
  globalThis.indexedDB = new IDBFactory();
  resetAssetDbForTests();
  installFakeStorage();
  useAppStore.setState({
    ...seedState({ labels: ['Push'], weekdays: [1] }),
    weeklyReviews: { [PROFILE_ID]: [REVIEW] },
    motivation: {},
  });
  setCustomVideo = vi.fn(REAL_SET_CUSTOM_VIDEO);
  useAppStore.setState({ setCustomVideo });
  // restoreMocks clears spies, not the vi.fn()s a module factory made: their call history
  // would otherwise accumulate across this file's tests.
  vi.mocked(saveCustomVideo).mockClear();
  vi.mocked(deleteCustomVideo).mockClear();
  vi.mocked(getCustomVideoMeta).mockClear();
  vi.mocked(resolveVideoSrc).mockResolvedValue({
    src: BUNDLED_VIDEO_SRC,
    revoke: () => {
      /* the bundled path holds nothing to release */
    },
  });
  // No clip is deployed in a test build, so the preview renders its copy and no element.
  vi.mocked(probeBundledVideo).mockResolvedValue(false);
});

afterEach(() => {
  useAppStore.setState({ setCustomVideo: REAL_SET_CUSTOM_VIDEO });
});

describe('MotivationSettings', () => {
  it('stores a picked clip, names it, and reports its size', async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    expect(screen.getByText(copy('status.motivationClipNone'))).toBeInTheDocument();

    await user.upload(chooseLabel(), videoFile(BYTES_PER_MIB, 'video/mp4', 'holiday.mp4'));

    await pickerSettled(copy('label.motivationClipReplace'));
    expect(storedId()).not.toBeNull();
    expect(screen.getByText(FORMAT.motivationClipName('holiday.mp4'))).toBeInTheDocument();
    expect(screen.getByText(FORMAT.motivationClipSize('1.0'))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deletes the replaced asset only after the new id is in the store', async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);

    await user.upload(chooseLabel(), videoFile(16, 'video/mp4', 'first.mp4'));
    const picker = await pickerSettled(copy('label.motivationClipReplace'));
    const first = storedId();
    expect(first).not.toBeNull();

    await user.upload(picker, videoFile(16, 'video/mp4', 'second.mp4'));
    await waitFor(() => {
      expect(vi.mocked(deleteCustomVideo)).toHaveBeenCalledWith(first);
    });

    const second = storedId();
    expect(second).not.toBe(first);
    expect(screen.getByText(FORMAT.motivationClipName('second.mp4'))).toBeInTheDocument();
    // Save, then the id move, then the delete. In any other order a failure between two of
    // them leaves the profile naming an asset that is gone.
    expect(callOrder(vi.mocked(saveCustomVideo), 1)).toBeLessThan(
      callOrder(vi.mocked(deleteCustomVideo), 0),
    );
    expect(callOrder(setCustomVideo, 1)).toBeLessThan(callOrder(vi.mocked(deleteCustomVideo), 0));
    expect(setCustomVideo).toHaveBeenNthCalledWith(2, PROFILE_ID, second);
  });

  it('removes the clip and deletes its asset', async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    await user.upload(chooseLabel(), videoFile(16));
    await pickerSettled(copy('label.motivationClipReplace'));
    const id = storedId();
    expect(id).not.toBeNull();

    await user.click(screen.getByRole('button', { name: copy('button.motivationClipRemove') }));

    await waitFor(() => {
      expect(storedId()).toBeNull();
    });
    expect(vi.mocked(deleteCustomVideo)).toHaveBeenCalledWith(id);
    expect(id === null ? null : await getCustomVideoUrl(id)).toBeNull();
    expect(screen.getByText(copy('status.motivationClipNone'))).toBeInTheDocument();
  });

  it('refuses a file over the size limit and leaves the store alone', async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    const oversize = videoFile(0);
    // The payload stays empty: saveCustomVideo reads File.size and refuses before it reads
    // the bytes, so allocating 150 MiB in a test would prove nothing extra.
    Object.defineProperty(oversize, 'size', { value: MAX_VIDEO_BYTES + 1 }); // bytes

    await user.upload(chooseLabel(), oversize);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      copy('status.motivationClipTooLarge'),
    );
    expect(storedId()).toBeNull();
    expect(setCustomVideo).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a video', async () => {
    render(<MotivationSettings />);
    // fireEvent, not userEvent: userEvent.upload honours the accept="video/*" filter, which is
    // exactly the path being bypassed to exercise the module's own validation.
    fireEvent.change(chooseLabel(), {
      target: { files: [videoFile(4, 'image/png', 'x.png')] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      copy('status.motivationClipNotVideo'),
    );
    expect(storedId()).toBeNull();
    expect(setCustomVideo).not.toHaveBeenCalled();
  });

  it('previews the popup without recording a week', async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);

    await user.click(screen.getByRole('button', { name: copy('button.motivationClipPreview') }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: copy('hero.motivationPreview') }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy('advice.motivationPreview'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy('button.dismiss') }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // Nothing was answered: no shown week, and the seeded miss is still unhandled.
    expect(useAppStore.getState().motivation[PROFILE_ID]).toBeUndefined();
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]?.[0]?.missHandled).toBe(false);
  });

  it("spares every other profile's clip and sweeps only the id it replaces", async () => {
    // One videos store backs every profile, so the sweep inside saveCustomVideo is told what
    // state still names. The id being REPLACED is deliberately not on that list: this section
    // deletes it itself, and only after the new id is in the store.
    const other = await saveCustomVideo(videoFile(16, 'video/mp4', 'other.mp4'), 1); // EpochMs
    useAppStore.setState({ motivation: { 'p-other': motivationFor('p-other', other) } });
    vi.mocked(saveCustomVideo).mockClear();

    const user = userEvent.setup();
    render(<MotivationSettings />);
    await user.upload(chooseLabel(), videoFile(16, 'video/mp4', 'first.mp4'));
    const picker = await pickerSettled(copy('label.motivationClipReplace'));
    const first = storedId();
    expect(first).not.toBeNull();

    await user.upload(picker, videoFile(16, 'video/mp4', 'second.mp4'));
    await waitFor(() => {
      expect(storedId()).not.toBe(first);
    });

    expect(vi.mocked(saveCustomVideo).mock.calls[0]?.[2]?.keep).toEqual(new Set([other]));
    expect(vi.mocked(saveCustomVideo).mock.calls[1]?.[2]?.keep).toEqual(new Set([other]));
    const url = await getCustomVideoUrl(other);
    expect(url).not.toBeNull();
    if (url !== null) URL.revokeObjectURL(url);
  });

  it('keeps the new clip on screen when releasing the replaced one fails', async () => {
    const user = userEvent.setup();
    render(<MotivationSettings />);
    await user.upload(chooseLabel(), videoFile(16, 'video/mp4', 'first.mp4'));
    const picker = await pickerSettled(copy('label.motivationClipReplace'));

    vi.mocked(deleteCustomVideo).mockRejectedValueOnce(new Error('the delete was refused'));
    await user.upload(picker, videoFile(16, 'video/mp4', 'second.mp4'));

    await waitFor(() => {
      expect(screen.getByText(FORMAT.motivationClipName('second.mp4'))).toBeInTheDocument();
    });
    // The new clip IS stored, so saying it was not is a lie the user would act on by picking
    // the file again. A record nothing names any more is the next save's problem, not theirs.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(storedId()).not.toBeNull();
  });

  it('names and measures the stored clip when nothing has been picked this session', async () => {
    const id = await saveCustomVideo(videoFile(2 * BYTES_PER_MIB, 'video/mp4', 'holiday.mp4'), 1);
    useAppStore.setState({ motivation: { [PROFILE_ID]: motivationFor(PROFILE_ID, id) } });

    render(<MotivationSettings />);
    // What a reload shows before the record has been read: that one is stored, and no more.
    expect(screen.getByText(copy('status.motivationClipStored'))).toBeInTheDocument();

    expect(await screen.findByText(FORMAT.motivationClipName('holiday.mp4'))).toBeInTheDocument();
    expect(screen.getByText(FORMAT.motivationClipSize('2.0'))).toBeInTheDocument(); // MiB
  });

  it('reports only that a clip is stored when its record is gone', async () => {
    useAppStore.setState({
      motivation: { [PROFILE_ID]: motivationFor(PROFILE_ID, 'never-stored') },
    });

    render(<MotivationSettings />);
    await waitFor(() => {
      expect(vi.mocked(getCustomVideoMeta)).toHaveBeenCalledWith('never-stored');
    });
    await expect(vi.mocked(getCustomVideoMeta).mock.results[0]?.value).resolves.toBeNull();

    expect(screen.getByText(copy('status.motivationClipStored'))).toBeInTheDocument();
    // No name line at all, rather than a name line reading "Clip: undefined".
    const namePrefix = FORMAT.motivationClipName('');
    expect(screen.queryByText((text) => text.startsWith(namePrefix))).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { ComponentProps } from 'react';
import { MotivationModal, POSTER_DATA_URI, TAP_TO_MUTE_LABEL } from './MotivationModal';
import {
  BUNDLED_VIDEO_SRC,
  probeBundledVideo,
  resolveVideoSrc,
} from '../../domain/motivation/assets';
import { copy, copyFor } from '../../content/copy';
import { describeMiss } from '../../domain/motivation/trigger';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { PROFILE_ID, seedState } from '../../test/scheduleFixtures';
import type { WeeklyReview } from '../../domain/types';
import type { SkinId } from '../../domain/types';

/*
 * The clip itself is out of scope here: this suite pins the modal's contract, so the two
 * asset lookups are mocked and every branch of "which source, or none" is driven directly.
 * importOriginal keeps BUNDLED_VIDEO_SRC real, because the component compares against it.
 */
vi.mock('../../domain/motivation/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/motivation/assets')>();
  return { ...actual, resolveVideoSrc: vi.fn(), probeBundledVideo: vi.fn() };
});

/** Monday 2026-08-24 to Sunday 2026-08-30: one closed week, one short of its target. */
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

const BLOB_SRC = 'blob:motivation-clip';

let play: MockInstance<HTMLMediaElement['play']>;

/** A custom clip: an object URL whose revoke releases it, as assets.ts's does. */
function customSource(): { src: string; revoke: () => void } {
  return {
    src: BLOB_SRC,
    revoke: () => {
      URL.revokeObjectURL(BLOB_SRC);
    },
  };
}

function seed(): void {
  installFakeStorage();
  useAppStore.setState({
    ...seedState({ labels: ['Push'], weekdays: [1] }),
    weeklyReviews: { [PROFILE_ID]: [REVIEW] },
    motivation: {},
  });
}

function renderModal(over: Partial<ComponentProps<typeof MotivationModal>> = {}) {
  const props = {
    review: REVIEW,
    profileId: PROFILE_ID,
    onDismiss: vi.fn(),
    ...over,
  };
  return { props, ...render(<MotivationModal {...props} />) };
}

function dismissButton(): HTMLElement {
  return screen.getByRole('button', { name: copy('button.dismiss') });
}

beforeEach(() => {
  seed();
  vi.mocked(resolveVideoSrc).mockResolvedValue(customSource());
  vi.mocked(probeBundledVideo).mockResolvedValue(true);
  // Held rather than reached for through the prototype: jsdom has no media pipeline, and an
  // unbound prototype method is not a value this codebase's lint gate lets a test assert on.
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('MotivationModal', () => {
  it('states the miss and plays the resolved clip', async () => {
    renderModal();
    expect(screen.getByRole('heading', { name: copy('hero.weeklyTargetMissed') })).toBeDefined();
    expect(screen.getByText(describeMiss(REVIEW))).toBeDefined();
    const video = await screen.findByTestId('motivation-video');
    expect(video.getAttribute('src')).toBe(BLOB_SRC);
  });

  it('obeys the iOS policy: playsinline, muted, autoplay, looping, no controls', async () => {
    renderModal();
    const video = await screen.findByTestId('motivation-video');
    expect(video.getAttribute('playsinline')).not.toBeNull();
    expect(video.hasAttribute('autoplay')).toBe(true);
    expect(video.hasAttribute('loop')).toBe(true);
    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('poster')).toBe(POSTER_DATA_URI);
    expect(video instanceof HTMLVideoElement && video.muted).toBe(true);
  });

  it('keeps the copy and drops the element when no clip resolves', async () => {
    vi.mocked(resolveVideoSrc).mockResolvedValue({
      src: BUNDLED_VIDEO_SRC,
      revoke: () => {
        /* the bundled path holds nothing to release */
      },
    });
    vi.mocked(probeBundledVideo).mockResolvedValue(false);
    renderModal();
    await waitFor(() => {
      expect(vi.mocked(probeBundledVideo)).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('motivation-video')).toBeNull();
    expect(screen.getByText(describeMiss(REVIEW))).toBeDefined();
    expect(dismissButton()).toBeDefined();
  });

  it('hides the element when the clip fails to load, and keeps the copy', async () => {
    renderModal();
    const video = await screen.findByTestId('motivation-video');
    fireEvent.error(video);
    await waitFor(() => {
      expect(screen.queryByTestId('motivation-video')).toBeNull();
    });
    expect(screen.getByText(describeMiss(REVIEW))).toBeDefined();
  });

  it('carries exactly one control, and focus lands on it', async () => {
    const { container } = renderModal();
    await screen.findByTestId('motivation-video');
    // Counted by class, not by role: the clip is itself a control (role="button", below), so
    // "one control" is the claim that one thing in the dialog closes it, not that one thing
    // in the dialog can be operated.
    expect(container.querySelectorAll('.mmod-dismiss')).toHaveLength(1);
    expect(document.activeElement).toBe(dismissButton());
  });

  it('exposes the clip as a control whose name follows the muted state', async () => {
    const user = userEvent.setup();
    renderModal();
    const video = await screen.findByTestId('motivation-video');
    // aria-label alone does not name a <video> to JAWS; the role is what makes the name
    // reach the user, and the tap target is a button in every sense but its tag.
    expect(video.getAttribute('role')).toBe('button');
    expect(screen.getByRole('button', { name: copy('advice.tapForSound') })).toBe(video);

    await user.click(video);
    expect(screen.getByRole('button', { name: TAP_TO_MUTE_LABEL })).toBe(video);
  });

  it('follows a mute change made outside the tap handler', async () => {
    renderModal();
    const video = await screen.findByTestId('motivation-video');
    expect(screen.getByText(copy('advice.tapForSound'))).toBeDefined();

    // The element is the source of truth for mute. An engine that refuses the unmute, an OS
    // mute, or a hardware media key moves it with no click for the component to observe, and
    // a hint reading "tap for sound" over a clip that is already audible states the opposite
    // of the truth.
    if (video instanceof HTMLVideoElement) video.muted = false;
    fireEvent(video, new Event('volumechange'));
    await waitFor(() => {
      expect(screen.queryByText(copy('advice.tapForSound'))).toBeNull();
    });
    expect(video.getAttribute('aria-label')).toBe(TAP_TO_MUTE_LABEL);

    if (video instanceof HTMLVideoElement) video.muted = true;
    fireEvent(video, new Event('volumechange'));
    await waitFor(() => {
      expect(screen.getByText(copy('advice.tapForSound'))).toBeDefined();
    });
  });

  it('records one dismissal when Escape is followed by Dismiss', async () => {
    const user = userEvent.setup();
    const mark = vi.spyOn(useAppStore.getState(), 'markMotivationShown');
    const { props } = renderModal();

    // Both routes are live at once: ModalShell's Escape handler and the button. The caller
    // owns the unmount, so nothing here stops the second route from firing before the mount
    // is gone, and the week must be recorded once whatever order they arrive in.
    await user.keyboard('{Escape}');
    await user.click(dismissButton());

    expect(mark).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('records the dismissal against the reviewed week and closes', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    const before = Date.now(); // [ms] epoch, UTC
    await user.click(dismissButton());
    const state = useAppStore.getState();
    expect(state.motivation[PROFILE_ID]?.lastShownForWeek).toBe(REVIEW.weekStart);
    expect(state.motivation[PROFILE_ID]?.lastShownAt ?? 0).toBeGreaterThanOrEqual(before);
    expect(state.weeklyReviews[PROFILE_ID]?.[0]?.missHandled).toBe(true);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('treats Escape as Dismiss', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.keyboard('{Escape}');
    expect(useAppStore.getState().motivation[PROFILE_ID]?.lastShownForWeek).toBe(REVIEW.weekStart);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('unmutes on a tap of the clip itself', async () => {
    const user = userEvent.setup();
    renderModal();
    const video = await screen.findByTestId('motivation-video');
    expect(screen.getByText(copy('advice.tapForSound'))).toBeDefined();
    await user.click(video);
    expect(video instanceof HTMLVideoElement && video.muted).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(copy('advice.tapForSound'))).toBeNull();
  });

  it('revokes the object URL once, on unmount', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { unmount } = renderModal();
    await screen.findByTestId('motivation-video');
    expect(revoke).not.toHaveBeenCalled();
    unmount();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(BLOB_SRC);
  });

  it('previews without reporting a week', async () => {
    const user = userEvent.setup();
    const { props } = renderModal({ review: null });
    expect(screen.getByRole('heading', { name: copy('hero.motivationPreview') })).toBeDefined();
    expect(screen.getByText(copy('advice.motivationPreview'))).toBeDefined();
    await user.click(dismissButton());
    expect(useAppStore.getState().motivation[PROFILE_ID]).toBeUndefined();
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('names the dialog by its heading', async () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    const heading = screen.getByRole('heading', { name: copy('hero.weeklyTargetMissed') });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    await screen.findByTestId('motivation-video');
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('MotivationModal under a skin', () => {
  it('heads the miss in the limelight words, and in the default ones under clinical', () => {
    pinSkin('limelight');
    const view = renderModal();
    expect(
      screen.getByRole('heading', { name: copyFor('limelight', 'hero.weeklyTargetMissed') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.dismiss') }),
    ).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    renderModal();
    expect(
      screen.getByRole('heading', { name: copyFor('clinical', 'hero.weeklyTargetMissed') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copyFor('clinical', 'button.dismiss') }),
    ).toBeInTheDocument();
  });
});

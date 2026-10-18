import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../ui/styles/crt.css';
import { App } from './App';
import { syncSchedule } from '../domain/reminders/client';
import { defaultState, useAppStore } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { makeBlankState } from '../test/migrationFactories';
import { installFakeStorage } from '../store/testStorage';
import { downloadText } from './download';
import { FORMAT, LIMELIGHT_COPY, copy as defaultCopy, copyFor } from '../content/copy';
import type { CopyKey } from '../content/copy';
import { WARMUP_NOTICE } from '../content/formCues';
import { unlockAudio } from '../ui/audio/chime';
import type { LocalDate, SkinId, WeeklyReview } from '../domain/types';
import { addDays, todayLocal } from '../domain/dates';
import { probeBundledVideo, resolveVideoSrc } from '../domain/motivation/assets';
import { EMPTY_SESSION } from '../store/sessionMirror';
import { MONDAY, NOW_MS, PROFILE_ID, TZ_ATHENS, seedState } from '../test/scheduleFixtures';
import { VIEWS } from '../ui/nav/views';
import type { ViewId } from '../ui/nav/views';
import { resetPlanBrowse } from '../ui/planBrowse';

const copy = (key: CopyKey): string => copyFor('limelight', key);

/**
 * The download helper is the seam. It is the one thing in these tests that
 * touches the platform (an object URL and a synthetic click), and what matters
 * here is *which text* each banner hands it, not that jsdom can download.
 */
vi.mock('./download', () => ({ downloadText: vi.fn() }));

/**
 * Web Audio does not exist in jsdom, so the real unlockAudio would return false whether or not
 * the Start handler reached it. The double is the only way to assert that it did.
 */
vi.mock('../ui/audio/chime', () => ({
  playChime: vi.fn(() => true),
  unlockAudio: vi.fn(() => Promise.resolve(true)),
  releaseAudio: vi.fn(),
  vibrate: vi.fn(() => true),
  // The sound-effect player reads P4's one context through this (src/skins/sfx.ts), and the
  // shell now imports that module for the first-gesture unlock below. null is what jsdom would
  // yield anyway, and it keeps the player's unlock() a no-op whatever `ui.sounds` says.
  getAudioContext: vi.fn(() => null),
}));

/**
 * The reminder build flag, made switchable.
 *
 * `REMINDERS_CONFIGURED` is FALSE in a vitest run: it is `REMINDER_API_BASE !== null &&
 * VAPID_PUBLIC_KEY !== null`, and neither VITE_REMINDER_API nor VITE_VAPID_PUBLIC_KEY reaches
 * the test environment. ReminderSync attaches nothing at all when it is false, so the mounted
 * component would be indistinguishable from an unmounted one. The flag is therefore driven
 * from here, exactly as src/app/ReminderSync.test.tsx drives it, and it defaults to the real
 * value so no other test in this file sees a configured build.
 */
const reminderConfig = vi.hoisted(() => ({ configured: false }));

vi.mock('../config/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/reminders')>();
  return {
    ...actual,
    get REMINDERS_CONFIGURED(): boolean {
      return reminderConfig.configured;
    },
  };
});

/**
 * The Worker client is the seam. What is asserted in this file is that the sync component is
 * MOUNTED, never what it uploads: the trigger policy and the recovery path are
 * ReminderSync.test.tsx's.
 */
vi.mock('../domain/reminders/client', () => ({
  subscribe: vi.fn(),
  syncSchedule: vi.fn(),
}));

/**
 * The motivation clip is the modal's business, not the shell's, and jsdom has no media
 * pipeline. Both lookups are doubled exactly as MotivationModal.test.tsx doubles them;
 * importOriginal keeps BUNDLED_VIDEO_SRC real, because the modal compares against it.
 */
vi.mock('../domain/motivation/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/motivation/assets')>();
  return { ...actual, resolveVideoSrc: vi.fn(), probeBundledVideo: vi.fn() };
});

/** A save failure as the store records it: the reason plus the thrown message. */
const SERIALIZE_FAILURE = { reason: 'serialize' as const, error: 'BigInt' };

function seedSaveError(): void {
  useAppStore.setState({
    status: {
      lastSaveError: SERIALIZE_FAILURE,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: true,
      lastActionError: null,
    },
  });
}

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: false,
      lastActionError: null,
    },
  });
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a view that reads the
 * table through `useCopy()` renders the limelight words, and the assertions in this file quote
 * them through `copyFor('limelight', key)` (the local `copy` below). The pin restates the only
 * skin; until clinical was removed it pinned clinical and the assertions quoted the default
 * table.
 *
 * A seed that REPLACES `ui` puts the shipped skin back, so it is a named function rather than
 * an inline hook body: a test that reseeds calls it again, after the seed.
 */
function pinSkin(skin: SkinId = 'limelight'): void {
  useAppStore.setState((state) => ({ ui: { ...state.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('SaveErrorBanner', () => {
  it('says the change could not be saved and that the stored copy is unchanged', () => {
    installFakeStorage();
    seedSaveError();

    render(<App />);

    // Not "storage is full" and not "storage is unavailable": the store was
    // never touched, so advice about the store would send the user nowhere.
    expect(screen.getByText(copy('banner.saveFailed.body'))).toBeInTheDocument();
    expect(screen.getByText(copy('banner.saveFailed.tag'))).toBeInTheDocument();
    expect(screen.queryByText(copy('banner.saveQuota.body'))).toBeNull();
    expect(screen.queryByText(copy('banner.saveUnavailable.body'))).toBeNull();
  });

  it('offers the last stored document, not the in-memory one, and does not throw', async () => {
    installFakeStorage({ [STORAGE_KEY]: '{"stored":"document"}' });
    seedSaveError();

    render(<App />);

    await userEvent.click(
      screen.getByRole('button', { name: copy('button.exportStoredCopy') }),
    );

    // exportJson() would have produced a pretty-printed AppState. The raw
    // stored text proves this branch never went near it: a document that
    // JSON.stringify refused is exactly the document an export cannot carry.
    expect(downloadText).toHaveBeenCalledWith(
      'fixthisinjustice-recovery.json',
      '{"stored":"document"}',
    );
  });

  it('re-runs the persistence save when Retry save is used', async () => {
    const data = installFakeStorage();
    seedSaveError();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: copy('button.retrySave') }));

    expect(data.get(STORAGE_KEY)).toContain('"schemaVersion":3');
    // A write that now succeeds clears the banner, through the same
    // reportSaveResult path the debounced subscription uses.
    expect(useAppStore.getState().status.lastSaveError).toBeNull();
  });

  it('keeps the quota branch on the in-memory export', async () => {
    installFakeStorage();
    useAppStore.setState({
      status: {
        lastSaveError: { reason: 'quota', error: 'full' },
        lastLoadError: null,
        lastLoadRaw: null,
        hydrated: true,
        lastActionError: null,
      },
    });

    render(<App />);
    expect(screen.getByText(copy('banner.saveQuota.body'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy('button.exportData') }));

    // The in-memory document, pretty-printed by exportJson().
    expect(downloadText).toHaveBeenCalledWith(
      'fixthisinjustice-export.json',
      expect.stringContaining('"schemaVersion": 3'),
    );
  });
});

describe('LoadErrorBanner', () => {
  it('offers the original corrupt text after storage has moved on underneath it', async () => {
    const data = installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });

    render(<App />);
    // The reason is the validator's own, read back from the store rather than restated here:
    // the assertion is that the banner frames THAT reason, not that this test can predict it.
    const reason = useAppStore.getState().status.lastLoadError;
    expect(reason).not.toBeNull();
    expect(screen.getByText(FORMAT.loadInvalid(reason ?? ''))).toBeInTheDocument();

    // Another tab, or this app's own wipeAll(), removes the key. The snapshot
    // taken at hydrate time is now the user's only copy.
    data.delete(STORAGE_KEY);
    await userEvent.click(
      screen.getByRole('button', { name: copy('button.exportStoredData') }),
    );

    expect(downloadText).toHaveBeenCalledWith('fixthisinjustice-recovery.json', '{"week":999}');
  });
});

describe('CRT presentation preferences', () => {
  it('paints neither layer when both preferences are off', () => {
    installFakeStorage();
    useAppStore.setState({ ui: { ...defaultState().ui, scanlines: false, flicker: false } });

    const { container } = render(<App />);
    expect(container.querySelector('.crt')?.className).toBe('crt');
  });

  it('paints both layers when the preferences ask for them', () => {
    installFakeStorage();
    useAppStore.setState({ ui: { ...defaultState().ui, scanlines: true, flicker: true } });

    const { container } = render(<App />);
    expect(container.querySelector('.crt')).toHaveClass('crt', 'sc', 'fl');
  });

  it('disables the flicker under prefers-reduced-motion', () => {
    // A full-viewport opacity animation is exactly what that setting exists to
    // stop, and the class this component now applies is what makes the rule
    // reachable. jsdom does not evaluate media queries, so the guarantee is
    // asserted in the injected stylesheet text rather than a computed style.
    const stylesheet = [...document.querySelectorAll('style')]
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.crt\.fl\s*\{\s*animation:\s*none/,
    );
  });
});


/**
 * The top bar's per-view instruction, and the plan position it now carries (P10 Brief D, part
 * 1). The marquee carries both, and its static copy (`.ll-marquee-static`, one line per item) is
 * what these tests read. The static fallback line the brief asked for on clinical, where the
 * marquee rendered nothing, went with that skin. `advice.todayInstruction` is the row under test
 * throughout because `ui.lastView` defaults to `'today'` (src/domain/schema.ts) and none of these
 * tests changes it.
 *
 * The session position itself stays covered by SessionIndicator.test.tsx, which renders the
 * standalone component directly; the brief displaced it into the marquee rather than dropping
 * it.
 */
describe('top bar', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

  beforeEach(() => {
    // Writes stay in an in-memory map, and the empty store makes hydrate() take its "absent"
    // branch, which keeps the seeded document in memory instead of replacing it.
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('carries a setup instruction before a profile exists, not an empty bar', () => {
    // Round 1 claim C1.03.1 was an empty top bar. Scoping instructions to the seven views left
    // the bar holding only the brand for the whole wizard, which is the same defect by another
    // route, so setup carries one instruction of its own.
    render(<App />);

    const instruction = screen.getByRole('banner').querySelector('.ll-marquee-static');
    expect(instruction).not.toBeNull();
    expect(instruction?.textContent).toBe(copy('advice.setupInstruction'));
  });

  it('carries the instruction and plan position in limelight static marquee copy', () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);

    const staticCopy = screen.getByRole('banner').querySelector('.ll-marquee-static');
    expect(staticCopy).not.toBeNull();
    expect(staticCopy?.textContent).toContain(copy('advice.todayInstruction'));
    expect(staticCopy?.textContent).toContain(
      FORMAT.planPositionLabel(1, LABELS.length, '', LIMELIGHT_COPY),
    );
  });

  it('carries the instruction and the plan position in the marquee on limelight', () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
    pinSkin('limelight');

    render(<App />);

    const header = screen.getByRole('banner');
    expect(within(header).queryByTestId('topbar-instruction')).toBeNull();
    const lines = [...header.querySelectorAll('.ll-marquee-static .ll-marquee-line')].map(
      (node) => node.textContent,
    );
    expect(lines).toContain(copy('advice.todayInstruction'));
    // "ep. 1 of 6": limelight's own row for status.sessionCursor (copy.limelight.ts), read
    // through the overrides FORMAT.planPositionLabel takes, never a calendar day (code review
    // A11).
    expect(lines).toContain(FORMAT.planPositionLabel(1, LABELS.length, '', LIMELIGHT_COPY));
  });
});

/**
 * The site footer (P10 Brief D): mounted once at the foot of the app shell, outside <main> and
 * outside the view switch, so its presence does not depend on which screen -- Setup or a view
 * -- happens to be showing above it.
 */
describe('site footer', () => {
  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('renders before a profile exists, during setup', () => {
    render(<App />);

    expect(screen.getByText(copy('footer.licence'))).toBeTruthy();
  });

  it('renders on every view, carrying the on-device promise', () => {
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));

    render(<App />);

    expect(screen.getByText(copy('advice.dataOnDevice'))).toBeTruthy();

    act(() => {
      useAppStore.getState().setUi({ lastView: 'plan' });
    });
    expect(screen.getByText(copy('advice.dataOnDevice'))).toBeTruthy();
  });
});

/**
 * The view shell subscribes to `ui.lastView` (P3 close-out, master plan section 10: "the app
 * shell seeds its view from ui.lastView once and does not subscribe, so Today's Start does not
 * switch to Train until the shell subscribes").
 *
 * Both halves are asserted here, because either one alone is a broken shell: a nav tap must
 * still change the view, and a store write from another view must reach it too.
 */
describe('view shell', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('switches view on a nav tap and records it', async () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: copy('nav.plan') }));

    expect(useAppStore.getState().ui.lastView).toBe('plan');
    expect(screen.getByRole('button', { name: copy('nav.plan') })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('follows a lastView written by another view', () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);
    act(() => {
      useAppStore.getState().setUi({ lastView: 'train' });
    });

    // No assignment has been opened on this day, so Train renders its "nothing assigned"
    // branch. That is still the Train view: what is asserted here is that the shell followed
    // the write, not what the view had to say once it was mounted.
    expect(screen.getByText(copy('advice.noSessionToday'))).toBeInTheDocument();
  });

  it("lands on Train from Today's Start, with the training day recorded", async () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: copy('button.startSession') }));

    // The session slice carries the day the sets are logged against, so a reload mid-session
    // resumes the same training day rather than re-deriving it from the clock.
    expect(useAppStore.getState().session.activeAssignmentDate).toBe(MONDAY);
    expect(useAppStore.getState().ui.lastView).toBe('train');
    // Train is mounted on an open session: its Finish control is there. This is the profile's
    // first session, so the one-time warm-up notice is shown above the cards (owner 2026-10-18:
    // "Showing it once is ok"); TrainView.test.tsx covers its dismissal.
    expect(screen.getByRole('button', { name: copy('button.finishSession') })).toBeInTheDocument();
    expect(screen.getByText(WARMUP_NOTICE)).toBeInTheDocument();
  });

  it('unlocks the audio context on the Start tap, inside the gesture', async () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: copy('button.startSession') }));

    // Code review A29: resume() outside a user gesture is refused by every browser, so the
    // call has to be made from the handler the tap runs, not from the Train view's mount.
    expect(unlockAudio).toHaveBeenCalled();
  });
});

/**
 * The first gesture of the session (P8 Task 15 hand-off).
 *
 * The Start tap is not the only way into a session: a PWA resumed from the home screen lands
 * straight back on Train with a session already under way, and nothing there is tapped before
 * the rest interval ends. The shell therefore arms ONE unlock on the first gesture of any kind.
 * It is not autoplay - nothing sounds because of it, and `ui.sounds` still gates every sound.
 */
describe('first-gesture audio unlock', () => {
  it('unlocks the audio context on the first pointer event and disarms both listeners', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    vi.mocked(unlockAudio).mockClear();

    render(<App />);
    // Armed, not fired: resume() at mount is the call every browser refuses.
    expect(unlockAudio).not.toHaveBeenCalled();

    fireEvent.pointerDown(window);

    expect(unlockAudio).toHaveBeenCalledTimes(1);
    // BOTH listeners go, not only the one that fired: { once: true } would remove the pointer
    // listener and leave the keydown one armed for the life of the document.
    const removed = remove.mock.calls.map(([type]) => String(type));
    expect(removed).toContain('pointerdown');
    expect(removed).toContain('keydown');

    // And the disarm is what it claims: neither kind of gesture unlocks a second time.
    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: 'a' });
    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });
});

/**
 * The Worker schedule sync (P5 Task 6, wiring deferred here).
 *
 * ReminderSync renders nothing, so the only evidence it is mounted is that its mount effect
 * ran: one `syncSchedule` call, against the active profile, on the first commit. The effect
 * also returns immediately when `activeProfileId` is null, so a profile is seeded first;
 * without one the assertion would pass for an unmounted component too.
 */
describe('reminder sync', () => {
  const LABELS = ['Push', 'Legs', 'Pull'];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    /*
     * Reset, not merely re-stubbed: `restoreMocks` restores spies, and a module mock declared
     * with vi.fn() keeps its call history across tests in this file. Without the reset the
     * unconfigured case would inherit the configured case's call and fail on it.
     */
    vi.mocked(syncSchedule).mockReset();
    vi.mocked(syncSchedule).mockResolvedValue({ status: 'unchanged' });
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
  });

  afterEach(() => {
    // Left false for every other describe in this file, which is the real build's value here.
    reminderConfig.configured = false;
  });

  it('syncs the schedule once on mount when the build carries the reminder variables', async () => {
    reminderConfig.configured = true;

    render(<App />);

    await waitFor(() => {
      expect(syncSchedule).toHaveBeenCalledTimes(1);
    });
  });

  it('syncs nothing when the build carried no Worker origin', async () => {
    // The unmocked value in a vitest run. Asserted as behaviour rather than as a constant:
    // an unconfigured build must reach neither the client nor the permission prompt.
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(syncSchedule).not.toHaveBeenCalled();
  });
});

/**
 * The old console's import is gone (ROADMAP N5, owner ruling 2026-10-18). A device that still
 * holds that app's document under `fti.console.v2` is treated like any other: the shell renders
 * exactly what it renders without the key, and the key is left as stored. Removing a user's
 * data is not this code's decision, so nothing reads, rewrites or deletes it.
 *
 * Compared against a render WITHOUT the key rather than against a named heading, so the check
 * does not depend on copy that no longer exists and still catches any UI the key would trigger.
 */
describe('a device that still holds the old console document', () => {
  const OLD_CONSOLE_KEY = 'fti.console.v2';
  const OLD_CONSOLE_TEXT = '{"week":2}';

  it('renders the same app as without it and leaves it as stored', () => {
    const data = installFakeStorage();
    const headings = (): string[] =>
      screen.queryAllByRole('heading').map((h) => h.textContent ?? '');

    useAppStore.getState().replaceState(makeBlankState());
    const { unmount } = render(<App />);
    const without = headings();
    unmount();

    data.set(OLD_CONSOLE_KEY, OLD_CONSOLE_TEXT);
    useAppStore.getState().replaceState(makeBlankState());
    render(<App />);

    expect(headings()).toEqual(without);
    expect(data.get(OLD_CONSOLE_KEY)).toBe(OLD_CONSOLE_TEXT);
  });
});

/**
 * The weekly-miss popup (P6 Task 5, wiring deferred here).
 *
 * MotivationGate is self-gating and covered in full by MotivationGate.test.tsx. What is
 * asserted here is that the shell mounts it, and mounts it OUTSIDE <main>, as the last child
 * of the CRT root: it is a modal over the whole app, not a panel inside the view area.
 *
 * The clock is pinned to NOW_MS, Monday 2026-09-07 09:30 in Athens (ROADMAP B6). Only `Date`
 * is faked: `useMinuteClock` and `useWeeklyClose` read Date.now(), while testing-library's
 * waitFor keeps real timers. On the real clock this suite broke once the date passed the
 * fixture's fixed plan start (MONDAY): `useWeeklyClose` then graded every week since it as 0
 * of target, a miss inside the 14 day window, and the popup opened over the "not missed" case.
 * Pinned, the plan starts on the Monday of the seeded week, the ISO week that ended yesterday,
 * so the only finished week is the seeded one and the closure cannot add to it.
 */
describe('weekly-miss popup', () => {
  const TODAY: LocalDate = todayLocal(TZ_ATHENS, NOW_MS); // MONDAY

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS); // [ms] epoch, UTC
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A closed week three sessions short of its target, ending on the given civil day. */
  function miss(end: LocalDate): WeeklyReview {
    return {
      profileId: PROFILE_ID,
      weekStart: addDays(end, -6),
      weekEnd: end,
      target: 4, // [sessions/week]
      completed: 1, // [sessions]
      skipped: 0, // [sessions]
      paused: false,
      delta: -3, // completed - target, [sessions]; negative = sessions missed
      evaluatedAt: 1_756_000_000_000, // [ms] epoch, UTC
      missHandled: false,
    };
  }

  function seedReviews(reviews: WeeklyReview[]): void {
    installFakeStorage();
    useAppStore.setState({
      /*
       * The plan starts on the Monday of the first seeded week. A review of a week before the
       * programme started belongs to a plan it replaced and opens no popup (ROADMAP B1d,
       * isBeforeProgramme), so a seed with the plan starting after its own review modelled a
       * state closeWeeks cannot produce. The closure still adds nothing: the seeded week is
       * already reviewed, and the current one has not ended.
       */
      ...seedState({ labels: ['Push'], weekdays: [1], startedOn: reviews[0]?.weekStart ?? TODAY }),
      weeklyReviews: { [PROFILE_ID]: reviews },
      motivation: {},
      // The session slice is store-only and survives between tests in a file, so it is pinned.
      session: { ...EMPTY_SESSION },
    });
  }

  beforeEach(() => {
    vi.mocked(resolveVideoSrc).mockResolvedValue({
      src: 'blob:motivation-clip',
      revoke: () => {
        /* nothing is held: the source is a literal, not a real object URL */
      },
    });
    vi.mocked(probeBundledVideo).mockResolvedValue(true);
    // jsdom has no media pipeline, and the modal autoplays.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('shows the popup for a miss inside the window and no session in progress', async () => {
    seedReviews([miss(addDays(TODAY, -1))]);

    render(<App />);

    expect(await screen.findByTestId('motivation-video')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: copy('hero.weeklyTargetMissed') }),
    ).toBeInTheDocument();
  });

  it('shows nothing when the week was not missed', () => {
    seedReviews([{ ...miss(addDays(TODAY, -1)), completed: 4, delta: 0 }]);

    render(<App />);

    // Premise: the weekly closure added no week of its own, so the seeded one is all there is.
    expect(useAppStore.getState().weeklyReviews[PROFILE_ID]).toHaveLength(1);
    expect(screen.queryByTestId('motivation-video')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

/**
 * The spotlight palette (P8 Tasks 8 and 9, wiring deferred here).
 *
 * The palette is a CONTROLLED component and registers no key listener of its own (code review
 * A54: two window listeners bound the same combo and both ran). This shell therefore owns the
 * open state and the button that sets it, and binds no combo: SPOTLIGHT_COMBO belongs to the
 * hotkey registry task, and binding it here would recreate the second listener.
 *
 * The button lives in the nav because SPOTLIGHT_COMBO cannot be pressed on a phone, which
 * would otherwise leave the palette unreachable on a touch device. Escape is ModalShell's, so
 * what is asserted here is that one press reaches this shell's onClose and the palette stays
 * shut - a caller that toggled rather than cleared would reopen it.
 */
describe('spotlight palette', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
  });

  it('opens from the nav button, with the query box focused, and closes on Escape', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: copy('nav.label') });
    await userEvent.click(
      within(nav).getByRole('button', { name: copy('button.openSpotlight') }),
    );

    const queryBox = screen.getByRole('combobox');
    // Focus is the palette's whole point: it opens onto a query the user types immediately.
    expect(document.activeElement).toBe(queryBox);

    fireEvent.keyDown(queryBox, { key: 'Escape' });

    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

/**
 * The global toast queue (P8 Task 3, wiring deferred here).
 *
 * Two facts are asserted, and they are the two the queue cannot supply for itself. First, the
 * PROVIDER is above the app: `useToasts` throws outside one, so a `ToastQueue` that renders at
 * all proves the context reaches it, and so it will reach the views that push. Second, BOTH
 * live regions are in the DOM before any toast exists - a region a screen reader first meets
 * at the moment its content arrives is announced unreliably, and politeness is a property of
 * the region, not of the moment, which is why there are two rather than one that flips.
 *
 * The Train view's own toast list is gone with P8 Task 10: every toast it raises now goes
 * through this queue, which is why the provider being above the app is load-bearing rather
 * than decorative.
 */
describe('toast queue', () => {
  const LABELS = ['Push', 'Legs', 'Pull'];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
  });

  it('mounts both live regions, empty, on the first render', () => {
    const { container } = render(<App />);

    const stack = container.querySelector<HTMLElement>('.toast-stack');
    if (stack === null) throw new Error('the toast stack is not mounted');

    expect(within(stack).getByRole('status')).toBeInTheDocument();
    expect(within(stack).getByRole('alert')).toBeInTheDocument();
  });
});

/**
 * The skin attribute (P8 Task 12, mounted here).
 *
 * `useApplySkin` is unit-tested where it lives. What is asserted here is the one thing it
 * cannot assert for itself: that the app shell calls it, so <html> carries the skin the store
 * holds from the first commit, and that unmounting the app leaves no attribute behind for the
 * next test to inherit.
 */
describe('skin attribute', () => {
  const LABELS = ['Push', 'Legs', 'Pull'];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
  });

  it('mirrors the stored skin onto the document root and removes it on unmount', () => {
    /*
     * This test is about the SHIPPED default, so it puts the shipped `ui` back first and
     * states what that default is.
     */
    useAppStore.setState({ ui: defaultState().ui });
    // The schema default, so this is what a document that never chose a skin renders under.
    expect(useAppStore.getState().ui.skin).toBe('limelight');

    const view = render(<App />);
    expect(document.documentElement.dataset.skin).toBe('limelight');

    view.unmount();
    expect(document.documentElement.dataset.skin).toBeUndefined();
  });
});

/**
 * The two P8 shell mounts this task adds (Task 10).
 *
 * Both components decide for themselves whether they are on screen, and both are unit-tested
 * where they live. What is asserted here is the one thing neither can assert for itself: that
 * the shell mounts it at all, and that a document in which it must NOT appear leaves the app
 * untouched.
 */
describe('boot sequence and block transition mounts', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

  /** Two three-session blocks, so a cursor at session 3 has just crossed into the second. */
  const TWO_BLOCKS = [
    {
      index: 0,
      firstSessionIndex: 0, // [sessions] offset
      sessionCount: 3, // [sessions]
      setModifier: 1, // dimensionless
      loadModifier: 1, // dimensionless
      isDeload: false,
    },
    {
      index: 1,
      firstSessionIndex: 3, // [sessions] offset
      sessionCount: 3, // [sessions]
      setModifier: 1, // dimensionless
      loadModifier: 1, // dimensionless
      isDeload: false,
    },
  ];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    // The session slice is not part of AppState, so a test that opened a session elsewhere
    // would leave an active assignment date behind and suppress the cutscene here.
    useAppStore.setState({ session: { ...EMPTY_SESSION } });
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
  });

  it('mounts the boot sequence for a document that has not seen it', () => {
    const base = seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY });
    useAppStore.setState({ ...base, ui: { ...base.ui, bootSeen: false } });

    render(<App />);

    expect(screen.getByTestId('boot-text')).toBeInTheDocument();
  });

  it('mounts nothing for a document that has already booted', () => {
    render(<App />);

    expect(screen.queryByTestId('boot-text')).toBeNull();
  });

  it('mounts the block transition when the cursor has crossed into a new block', () => {
    useAppStore.setState(
      seedState({
        labels: LABELS,
        weekdays: [1, 3, 5],
        startedOn: MONDAY,
        blocks: TWO_BLOCKS,
        nextSessionIndex: 3, // [sessions] offset: the first session of block 1
      }),
    );

    render(<App />);

    expect(screen.getByTestId('phase-transition')).toBeInTheDocument();
    expect(
      screen.getByText(FORMAT.withSlots('status.blockTransition', { from: 1, to: 2 })),
    ).toBeInTheDocument();
  });

  it('mounts no block transition while the cursor is inside the block already seen', () => {
    useAppStore.setState(
      seedState({
        labels: LABELS,
        weekdays: [1, 3, 5],
        startedOn: MONDAY,
        blocks: TWO_BLOCKS,
        nextSessionIndex: 2, // [sessions] offset: still inside block 0
      }),
    );

    render(<App />);

    expect(screen.queryByTestId('phase-transition')).toBeNull();
  });
});

/**
 * The keyboard (P8 Task 9).
 *
 * ONE window listener holds every binding (src/ui/hotkeys.tsx). Code review A54 was two of
 * them bound to the same keys, so what is asserted here is the wiring the registry cannot
 * assert for itself: that the shell binds the registry's digits and SPOTLIGHT_COMBO, that the
 * plan keys are scoped to the Plan view, and that both guards - a text field and an open modal
 * dialog - hold in the real app rather than only against a stub tree.
 */
describe('keyboard', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
  /** [weeks] Six sessions at three a week, which is what the scrubber shows. */
  const WEEKS = 2;

  /** The digit the registry gives a view, so the test presses what the app binds. */
  function digitFor(id: ViewId): string {
    const view = VIEWS.find((v) => v.id === id);
    if (view === undefined) throw new Error(`no view '${id}' in the registry`);
    return String(view.digit);
  }

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    useAppStore.setState(
      seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }),
    );
    // Module state: a week left browsed by one test would be the week the next one opens on.
    resetPlanBrowse();
  });

  afterEach(() => {
    resetPlanBrowse();
  });

  it('switches view on the digit the registry gives it', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: digitFor('plan') });

    expect(useAppStore.getState().ui.lastView).toBe('plan');
    expect(screen.getByRole('button', { name: copy('nav.plan') })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('opens the spotlight palette on the combo the registry names', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  /*
   * WCAG 2.1 SC 2.1.4, Character Key Shortcuts: a shortcut a single character key fires on its
   * own must be switchable off. `ui.hotkeys` is that switch, and what it must NOT take away is
   * a combo carrying a modifier - the criterion does not reach one, and the palette is the only
   * way to every view from the keyboard once the digits are gone.
   */
  it('answers no digit while ui.hotkeys is off, and still opens the palette', () => {
    act(() => {
      useAppStore.getState().setUi({ hotkeys: false });
    });
    render(<App />);
    const before = useAppStore.getState().ui.lastView;

    fireEvent.keyDown(window, { key: digitFor('plan') });
    expect(useAppStore.getState().ui.lastView).toBe(before);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  /*
   * The digits were undiscoverable: nothing on the tab said which key reached it, and a screen
   * reader had no way to find out. aria-keyshortcuts is the attribute for exactly that, and it
   * is read from the registry entry rather than written out here, so a re-ordered VIEWS list
   * cannot leave the announcement naming the old key.
   */
  it('names the digit each tab answers to, for assistive technology', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: copy('nav.today') })).toHaveAttribute(
      'aria-keyshortcuts',
      '1',
    );
    expect(screen.getByRole('button', { name: copy('nav.plan') })).toHaveAttribute(
      'aria-keyshortcuts',
      digitFor('plan'),
    );
  });

  it('announces no shortcut once the switch has taken the digits away', () => {
    act(() => {
      useAppStore.getState().setUi({ hotkeys: false });
    });
    render(<App />);

    // A shortcut that is switched off is not a shortcut the element has, and announcing one
    // the key press will not honour misleads the users the criterion is written for.
    expect(screen.getByRole('button', { name: copy('nav.today') })).not.toHaveAttribute(
      'aria-keyshortcuts',
    );
  });

  it('reaches the Atlas, which is a tab like any other', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: copy('nav.atlas') }));

    expect(screen.getByRole('heading', { name: copy('hero.atlas') })).toBeInTheDocument();

    // And by its digit, which is the same routing reached the other way.
    fireEvent.keyDown(window, { key: digitFor('today') });
    expect(useAppStore.getState().ui.lastView).toBe('today');
    fireEvent.keyDown(window, { key: digitFor('atlas') });
    expect(screen.getByRole('heading', { name: copy('hero.atlas') })).toBeInTheDocument();
  });

  it('ignores a key typed into a field', () => {
    act(() => {
      useAppStore.getState().setUi({ lastView: 'plan' });
    });
    render(<App />);

    // The week scrubber: an INPUT, which is what the guard is about. In a browser the range
    // control handles this key itself; what must not happen is the app switching view under
    // a user who is operating a control.
    fireEvent.keyDown(screen.getByLabelText(copy('label.week')), { key: digitFor('today') });

    expect(useAppStore.getState().ui.lastView).toBe('plan');
  });

  it('ignores a key while a modal dialog is open', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: digitFor('log') });

    // The palette is still the thing on screen, and nothing switched behind it.
    expect(useAppStore.getState().ui.lastView).toBe('today');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('browses the plan by week, and only while the Plan view is showing', () => {
    act(() => {
      useAppStore.getState().setUi({ lastView: 'plan' });
    });
    render(<App />);
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(2, WEEKS));

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));

    // j and k move by BLOCK. This plan has one block, so the shown week does not move, which
    // is the clamped end of the strip rather than a wrap to the other end.
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));

    // The same key on another view reaches nothing: the binding is in the 'plan' scope, and
    // binding it globally is what made `j` advance the week from inside Train (A54).
    fireEvent.keyDown(window, { key: digitFor('log') });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: digitFor('plan') });
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(1, WEEKS));
  });

  it('opens the Konami overlay on the sequence, and closes it on any key', () => {
    render(<App />);

    for (const key of [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ]) {
      fireEvent.keyDown(window, { key });
    }

    expect(screen.getByText(copy('status.konami'))).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'q' });

    expect(screen.queryByText(copy('status.konami'))).toBeNull();
  });

  it('lets no key reach the app behind the Konami overlay', () => {
    render(<App />);
    for (const key of [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ]) {
      fireEvent.keyDown(window, { key });
    }

    // The overlay is a modal dialog, so the digit dismisses it and switches nothing: one key
    // press, one visible effect.
    fireEvent.keyDown(window, { key: digitFor('settings') });

    expect(screen.queryByText(copy('status.konami'))).toBeNull();
    expect(useAppStore.getState().ui.lastView).toBe('today');
  });
});

/**
 * THE TAB STRIP UNDER A SKIN (P8 review).
 *
 * The strip rendered `ViewDef.label`, which src/ui/nav/views.ts resolves from the DEFAULT table
 * at MODULE LOAD, and named the landmark through a bare `copy('nav.label')`. Both are baked
 * before any skin is known, so under limelight the palette listed "the run" and the tab beside
 * it still said "Plan": one app speaking two languages about the same view.
 *
 * Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the table
 * instead of having to be rewritten beside it. This is the convention
 * src/ui/components/Spotlight.test.tsx already uses for the same rows.
 */
describe('the tab strip under a skin', () => {
  const LABELS = ['Push', 'Legs', 'Pull'];

  beforeEach(() => {
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
    // seedState writes the shipped skin (src/test/scheduleFixtures.ts, emptyState); each case
    // below still states the skin it is about rather than inheriting one.
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));
  });

  it('names the landmark and the tabs in the limelight words', () => {
    pinSkin('limelight');
    render(<App />);

    expect(
      screen.getByRole('navigation', { name: copyFor('limelight', 'nav.label') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'nav.today') }),
    ).toBeInTheDocument();
    // The base-table word is GONE rather than merely joined: a strip carrying both would be the
    // same defect in a different shape.
    expect(screen.queryByRole('button', { name: defaultCopy('nav.today') })).toBeNull();
    // Two more tabs, kept from the board case this file carried until that skin was removed.
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'nav.train') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'nav.targets') }),
    ).toBeInTheDocument();
  });
});

/*
 * The top bar's dynamic half, round 2 claim `r2-onboarding.general`.
 *
 * "The banner of the web page (That now says FIX THIS INJUSTICE) is not dynamic. I would Like it
 * to append some information as the user moves forward."
 *
 * The five states are asserted through the SHELL rather than against the component in isolation,
 * because three of them are properties of where the app is (no profile, the intro unseen, the
 * review step on screen) rather than of a prop anybody passes.
 */
describe('the top bar banner', () => {
  /** The text beside the fixed brand. */
  function banner(): string {
    return screen.getByTestId('topbar-title').textContent ?? '';
  }

  /** The wizard's forward control. `button.continue` reads "Next" (round 1 claim C1.05.2). */
  function next(): void {
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
  }

  /** No profile, and both first-run sequences already seen: the wizard is the whole screen. */
  function seedSetupScreen(): void {
    installFakeStorage();
    useAppStore.setState((s) => ({ ui: { ...s.ui, introSeen: true, bootSeen: true } }));
  }

  /** The body step's four required quantities, so Next is not blocked. */
  function fillBodyStep(): void {
    // Sex is stated because r2.11 makes `nd` the default and the body-fat percentage required
    // on that path; every other field here is a number the nutrition domain needs.
    fireEvent.click(screen.getByLabelText('Male'));
    fireEvent.change(screen.getByLabelText(/^age \(years\)$/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/^metres$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^centimetres$/i), { target: { value: '78' } });
    fireEvent.change(screen.getByLabelText(/body mass \(kg\)/i), { target: { value: '70' } });
  }

  /**
   * The rest of the wizard, from the body step to Review.
   *
   * A duplicate of SetupWizard.test.tsx's own fixture rather than an import of it, and
   * deliberately so: what is under test here is that walking the real wizard to its last step
   * moves the banner in the shell ABOVE it, which is a fact about the two together. Nothing is
   * asserted about the wizard's own screens; those have their own suite.
   */
  function walkFromBodyToReview(): void {
    next(); // 3 body
    next(); // 4 equipment, every slider and the Gym Comfort picker on a valid default
    /*
     * 5 goal, which AVAILABILITY now opens (round 3 Task 9): the weekday selection has no valid
     * default and BLOCKED.goal carries its guards, so the days are chosen here, above the target
     * date the feasibility calendar assesses. C1.10.8 still holds -- the training frequency is
     * stated before the date, on the same screen. Four days for the default four-session split.
     */
    for (const day of ['Monday', 'Tuesday', 'Thursday', 'Friday']) {
      fireEvent.click(screen.getByLabelText(day));
    }
    next(); // 6 programme length, 12 weeks by default
    next(); // 7 guidance
    next(); // 8 review
  }

  it('greets on the intro, which is the first thing a fresh document shows', () => {
    installFakeStorage();
    // defaultState() leaves `introSeen` false, which is exactly what IntroGate mounts on.
    render(<App />);

    expect(banner()).toBe(copy('status.bannerIntro'));
  });

  it('welcomes aboard once setup starts, before a name is given', () => {
    seedSetupScreen();
    render(<App />);

    expect(banner()).toBe(copy('status.bannerSetup'));
  });

  it('appends the name on the keystroke that types it', () => {
    seedSetupScreen();
    render(<App />);
    next();
    next();

    fireEvent.change(screen.getByLabelText(/^How should I refer to you\?$/i), {
      target: { value: 'Ada' },
    });
    /*
     * The SAME keystroke, not the one after it and not 400 ms later. The banner follows the
     * wizard's MERGED draft (the uncommitted buffer over the committed answers), which is what
     * the field itself renders from, so the two cannot disagree; reading the persisted draft
     * instead would trail by SETUP_DRAFT_SAVE_DEBOUNCE_MS, and reading the committed tier alone
     * would leave the banner a whole step behind.
     */
    expect(banner()).toBe('Welcome Aboard: Ada');

    fireEvent.change(screen.getByLabelText(/^How should I refer to you\?$/i), {
      target: { value: 'Ada Lovelace' },
    });
    expect(banner()).toBe('Welcome Aboard: Ada Lovelace');
  });

  it('renders the name exactly as typed, and expands nothing inside it', () => {
    seedSetupScreen();
    render(<App />);
    next();
    next();

    // Mixed case that no title-casing would survive, leading and trailing spaces, and the two
    // replacement patterns String.prototype.replace would otherwise expand.
    const typed = '  ada $& LOVELACE `$` ';
    fireEvent.change(screen.getByLabelText(/^How should I refer to you\?$/i), {
      target: { value: typed },
    });

    expect(banner()).toBe(`Welcome Aboard: ${typed}`);
  });

  it('does NOT make the blank-name joke before the last step', () => {
    seedSetupScreen();
    render(<App />);
    next();
    next();

    // The name field is on screen and empty. That is someone who has not typed it yet, not
    // someone who reached the end and declined to.
    expect(screen.getByLabelText(/^How should I refer to you\?$/i)).toHaveValue('');
    expect(banner()).toBe(copy('status.bannerSetup'));
    expect(banner()).not.toBe(copy('status.bannerSetupAnonymous'));
  });

  it('makes the joke at Review, and only there', () => {
    seedSetupScreen();
    render(<App />);
    next();
    next();
    fillBodyStep(); // the name is deliberately left blank
    walkFromBodyToReview();

    // The review step really is on screen: the control that writes the profile names it.
    expect(screen.getByRole('button', { name: copy('button.confirmStart') })).toBeInTheDocument();
    expect(banner()).toBe(copy('status.bannerSetupAnonymous'));
  });

  it('keeps the name at Review when one was given, rather than the joke', () => {
    seedSetupScreen();
    render(<App />);
    next();
    next();
    fireEvent.change(screen.getByLabelText(/^How should I refer to you\?$/i), {
      target: { value: 'Ada' },
    });
    fillBodyStep();
    walkFromBodyToReview();

    expect(screen.getByRole('button', { name: copy('button.confirmStart') })).toBeInTheDocument();
    expect(banner()).toBe('Welcome Aboard: Ada');
  });

  it('names the view once setup is done, and follows a tab change', () => {
    installFakeStorage();
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
    pinSkin('limelight');
    render(<App />);

    act(() => {
      useAppStore.getState().setUi({ lastView: 'atlas' });
    });
    expect(banner()).toBe(copy('nav.atlas'));

    act(() => {
      useAppStore.getState().setUi({ lastView: 'log' });
    });
    expect(banner()).toBe(copy('nav.log'));
  });

  it('names the view in the words of the active skin, not the default table', () => {
    installFakeStorage();
    useAppStore.setState(seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY }));
    pinSkin('limelight');
    render(<App />);

    act(() => {
      useAppStore.getState().setUi({ lastView: 'train' });
    });
    expect(banner()).toBe(copyFor('limelight', 'nav.train'));
  });

  it('falls back to the same view the shell falls back to', () => {
    // A document written by a later version can name a view this build does not have, and the
    // banner must not then name a different view than the one rendered below it.
    installFakeStorage();
    const base = seedState({ labels: ['Push'], weekdays: [1], startedOn: MONDAY });
    useAppStore.setState({ ...base, ui: { ...base.ui, lastView: 'a-view-from-the-future' } });
    pinSkin('limelight');
    render(<App />);

    expect(banner()).toBe(copy('nav.targets'));
  });
});

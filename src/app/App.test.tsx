import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../ui/styles/crt.css';
import { App } from './App';
import { syncSchedule } from '../domain/reminders/client';
import legacyV2 from '../domain/migrations/fixtures/v2-sample.json';
import { defaultState, useAppStore } from '../store';
import { LEGACY_V2_KEY, STORAGE_KEY } from '../store/persistence';
import { makeBlankState } from '../test/migrationFactories';
import { installFakeStorage } from '../store/testStorage';
import { downloadText } from './download';
import { FORMAT, copy } from '../content/copy';
import { WARMUP_NOTICE } from '../content/formCues';
import { unlockAudio } from '../ui/audio/chime';
import type { LocalDate, Profile, WeeklyReview } from '../domain/types';
import { addDays, todayLocal } from '../domain/dates';
import { probeBundledVideo, resolveVideoSrc } from '../domain/motivation/assets';
import { EMPTY_SESSION } from '../store/sessionMirror';
import { MONDAY, NOW_MS, PROFILE_ID, TZ_ATHENS, seedState } from '../test/scheduleFixtures';
import { VIEWS } from '../ui/nav/views';
import type { ViewId } from '../ui/nav/views';
import { resetPlanBrowse } from '../ui/planBrowse';

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
 * table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them.
 *
 * A seed that REPLACES `ui` puts the shipped skin back, so it is a named function rather than
 * an inline hook body: a test that reseeds calls it again, after the seed.
 */
function pinClinicalSkin(): void {
  useAppStore.setState((state) => ({ ui: { ...state.ui, skin: 'clinical' } }));
}

beforeEach(() => {
  pinClinicalSkin();
});

describe('SaveErrorBanner', () => {
  it('says the change could not be saved and that the stored copy is unchanged', () => {
    installFakeStorage();
    seedSaveError();

    render(<App />);

    // Not "storage is full" and not "storage is unavailable": the store was
    // never touched, so advice about the store would send the user nowhere.
    expect(screen.getByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/stored copy is unchanged/i)).toBeInTheDocument();
    expect(screen.queryByText(/Storage is full/i)).toBeNull();
    expect(screen.queryByText(/Storage is unavailable/i)).toBeNull();
  });

  it('offers the last stored document, not the in-memory one, and does not throw', async () => {
    installFakeStorage({ [STORAGE_KEY]: '{"stored":"document"}' });
    seedSaveError();

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Export stored copy' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));

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
    expect(screen.getByText(/Storage is full/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));

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
    expect(screen.getByText(/did not validate/i)).toBeInTheDocument();

    // Another tab, or this app's own wipeAll(), removes the key. The snapshot
    // taken at hydrate time is now the user's only copy.
    data.delete(STORAGE_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Export stored data' }));

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
 * The pre-participation screening gate (P2 Task 9, master plan section 10.4).
 *
 * A profile whose `readiness.screenedAt` is null has NOT been screened: it was created before
 * the screen existed, or imported by P7. Master plan section 10.4 says such a profile is shown
 * the screen on its next app open rather than being treated as clear, so the gate lives here,
 * between the wizard branch and the view shell, and clears itself as soon as the result is
 * recorded. It is gated on `hydrated` as well: before the stored document has been read there
 * is no profile to judge, and an unscreened-looking empty store would flash the screen.
 */
describe('readiness gate', () => {
  const PROFILE: Profile = {
    id: 'p1',
    displayName: 'Test subject',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: 1_756_684_800_000, // [ms] epoch
    body: {
      sex: 'male',
      birthYear: 1996,
      heightCm: 180, // [cm]
      baselineMassKg: 80, // [kg]
      baselineAt: '2026-09-01',
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'intermediate',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
      hasMicroPlates: false,
      microPlateKg: 0.5, // [kg] total on the bar
    },
    goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: null, flagged: false },
  };

  beforeEach(() => {
    // Writes stay in an in-memory map: a document left in jsdom storage would be hydrated by
    // the next test in this file.
    installFakeStorage();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z')); // 2026-09-01 in Europe/Athens
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function seed(readiness: Profile['readiness']): void {
    useAppStore.getState().createProfile({ ...PROFILE, readiness });
  }

  it('shows the screening to a profile that has never been screened', () => {
    seed({ screenedAt: null, flagged: false });
    render(<App />);
    expect(screen.getByTestId('readiness-screen')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: copy('nav.label') })).toBeNull();
  });

  it('opens the app for a profile that has been screened', () => {
    seed({ screenedAt: '2026-08-01', flagged: false });
    render(<App />);
    expect(screen.queryByTestId('readiness-screen')).toBeNull();
    expect(screen.getByRole('navigation', { name: copy('nav.label') })).toBeInTheDocument();
  });

  it('records the answers and opens the app on the same interaction', () => {
    seed({ screenedAt: null, flagged: false });
    render(<App />);
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const answer = id === 2 ? copy('label.yes') : copy('label.no');
      fireEvent.click(within(screen.getByTestId(`readiness-q${id}`)).getByLabelText(answer));
    }
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));

    expect(useAppStore.getState().profiles['p1']?.readiness).toEqual({
      screenedAt: '2026-09-01',
      flagged: true,
    });
    expect(screen.queryByTestId('readiness-screen')).toBeNull();
    expect(screen.getByRole('navigation', { name: copy('nav.label') })).toBeInTheDocument();
  });
});

/**
 * The top bar's plan position (P3 Task 7, wiring deferred to Task 6).
 *
 * The indicator itself is covered by SessionIndicator.test.tsx; what is asserted here is that
 * it is MOUNTED in the header, because a component nobody renders reports nothing.
 */
describe('top bar', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

  beforeEach(() => {
    // Writes stay in an in-memory map, and the empty store makes hydrate() take its "absent"
    // branch, which keeps the seeded document in memory instead of replacing it.
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('reports the cursor position in the header once a plan exists', () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);

    const indicator = within(screen.getByRole('banner')).getByTestId('session-indicator');
    // Session 1 of 6, from the cursor: never a calendar day (code review A11).
    expect(indicator.textContent).toBe(FORMAT.planPosition(1, LABELS.length, ''));
  });

  it('shows no position before a plan exists', () => {
    render(<App />);

    expect(screen.queryByTestId('session-indicator')).toBeNull();
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
 * The legacy-import offer (P7 Task 6, wiring deferred here).
 *
 * MigrationGate is self-gating and covered in full by MigrationGate.test.tsx. What is asserted
 * here is that the shell mounts it where the offer can appear ABOVE the app rather than in
 * place of it: inside <main>, beside the view switch, so nothing about it blocks. Both halves
 * are asserted, because a gate mounted at the wrong condition is as broken as one not mounted:
 * the wizard on a device carrying the old document, and nothing on a device without it.
 */
describe('legacy migration offer', () => {
  const LEGACY_JSON = JSON.stringify(legacyV2);

  /** Storage with or without the legacy key, plus the profile and plan the gate requires. */
  function seedLegacy(legacy: string | null): void {
    installFakeStorage(legacy === null ? {} : { [LEGACY_V2_KEY]: legacy });
    useAppStore.getState().replaceState(makeBlankState());
  }

  it('offers the import when the old document is on the device', () => {
    seedLegacy(LEGACY_JSON);

    render(<App />);

    expect(screen.getByRole('heading', { name: copy('hero.legacyImport') })).toBeInTheDocument();
  });

  it('offers nothing when the old document is not on the device', () => {
    seedLegacy(null);

    render(<App />);

    expect(screen.queryByRole('heading', { name: copy('hero.legacyImport') })).toBeNull();
  });
});

/**
 * The weekly-miss popup (P6 Task 5, wiring deferred here).
 *
 * MotivationGate is self-gating and covered in full by MotivationGate.test.tsx. What is
 * asserted here is that the shell mounts it, and mounts it OUTSIDE <main>, as the last child
 * of the CRT root: it is a modal over the whole app, not a panel inside the view area.
 *
 * The real clock is used, not a fake one. `pendingMotivation` measures its 14 day window
 * through `useMinuteClock`, and the fixtures are anchored to the profile's civil today and
 * offset by 1 and 20 days, so a run that straddles midnight moves both anchors together and
 * neither crosses the threshold. The plan fixture starts on a day still ahead of that clock,
 * so `useWeeklyClose` has no finished week to close and cannot rewrite what is seeded here.
 */
describe('weekly-miss popup', () => {
  const TODAY: LocalDate = todayLocal(TZ_ATHENS);

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
      ...seedState({ labels: ['Push'], weekdays: [1] }),
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
     * This suite pins the skin to clinical so its assertions quote the default copy table.
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

// src/ui/views/TrainView.test.tsx
//
// The Train view and its components (P4 Task 10).
//
// Deviations from the P4 plan's Task 10 Step 1 literal (recorded here; the plan is not edited):
//  - The store keeps AppState at its TOP LEVEL (src/store/index.ts: `AppStore = AppState & ...`),
//    so every assertion reads `useAppStore.getState().sets`, never `.state.sets`.
//  - `makeState` does not exist in src/test/fixtures.ts. The seed is `defaultState()` from the
//    schema with the four records this view reads overridden, which cannot drift from the
//    shipped document shape.
//  - The two modals are provided by the single `TrainingModalsProvider`, not by two providers
//    (P4 Task 8 shipped one).
//  - Only `Date` is faked. Faking the whole timer set would also fake the interval React's
//    scheduler and Testing Library's waitFor run on; the timer branches are driven instead by
//    moving the mocked clock and dispatching `visibilitychange`, which is the recomputation
//    path master plan section 6.5 actually specifies.
//  - The audio module is mocked at the module boundary: jsdom has no Web Audio, so the real
//    playChime would return false without telling this suite whether it was reached.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, copy } from '../../content/copy';
import { WARMUP_NOTICE } from '../../content/formCues';
import { EXERCISE_BY_ID, EXERCISES } from '../../domain/plan/library';
import { defaultState } from '../../domain/schema';
import { suggestedProgression } from '../../domain/training/progression';
import { toStoredLoad } from '../../domain/units';
import type {
  AppState,
  Exercise,
  LoggedSet,
  PlanTemplate,
  PlannedExercise,
  Profile,
  UnitSystem,
} from '../../domain/types';
import { useAppStore } from '../../store';
import { EMPTY_SESSION } from '../../store/sessionMirror';
import { installFakeStorage } from '../../store/testStorage';
import { makeBlock, makePlannedExercise, makeProfile, makeSet } from '../../test/fixtures';
import { playChime, vibrate } from '../audio/chime';
import { TrainingModalsProvider } from '../components/TrainingModalsProvider';
import { TrainView } from './TrainView';

// vi.mock is hoisted above the imports by vitest, so the module below is already the double
// when TrainView imports it.
vi.mock('../audio/chime', () => ({
  playChime: vi.fn(() => true),
  unlockAudio: vi.fn(() => Promise.resolve(true)),
  releaseAudio: vi.fn(),
  vibrate: vi.fn(() => true),
}));

const TODAY = '2026-03-02';
const YESTERDAY = '2026-02-27';
/** [ms] epoch UTC. 12:00 on 2026-03-02 in Europe/Athens, the fixture profile's zone. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
const MINUTE_MS = 60_000; // [ms]

/**
 * A real loaded upper-body compound from the shipped library, so the suggestion gate is
 * asserted against the data the app ships rather than a hand-written id.
 */
const UPPER: Exercise = (() => {
  const ex = EXERCISES.find((e) => e.loadClass === 'upper-compound' && !e.isBodyweight);
  if (ex === undefined) throw new Error('the exercise library has no loaded upper compound');
  return ex;
})();

const CURL: Exercise = (() => {
  const ex = EXERCISE_BY_ID['barbell-curl'];
  if (ex === undefined) throw new Error('library.ts no longer defines barbell-curl');
  return ex;
})();

interface SeedOptions {
  units?: UnitSystem;
  exercise?: Exercise;
  planned?: Partial<PlannedExercise>;
  sets?: LoggedSet[];
  weighInOptIn?: boolean;
  flagged?: boolean;
  startedAt?: number; // [ms] epoch UTC
  deload?: boolean;
}

function seed(opts: SeedOptions = {}): AppState {
  const units = opts.units ?? 'metric';
  const exercise = opts.exercise ?? UPPER;
  // Equipment steps in the profile's own unit, converted exactly: an imperial gym's smallest
  // barbell step is 5 lb, not 2.5 kg (master plan section 3 plate table).
  const equipmentSteps: Profile['equipmentSteps'] =
    units === 'imperial'
      ? {
          barbellKg: toStoredLoad(5, 'imperial'), // [kg]
          dumbbellPairKg: toStoredLoad(10, 'imperial'), // [kg]
          stackKg: toStoredLoad(10, 'imperial'), // [kg]
          hasMicroPlates: false,
          microPlateKg: toStoredLoad(1, 'imperial'), // [kg]
        }
      : {
          barbellKg: 2.5, // [kg]
          dumbbellPairKg: 5, // [kg]
          stackKg: 5, // [kg]
          hasMicroPlates: false,
          microPlateKg: 0.5, // [kg]
        };
  const profile = makeProfile({
    units,
    equipmentSteps,
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: opts.weighInOptIn ?? false },
    readiness: { screenedAt: '2026-01-01', flagged: opts.flagged ?? false },
  });
  const plan: PlanTemplate = {
    id: 'plan-1',
    version: 1,
    name: 'Upper/Lower',
    sessionsPerWeek: 4,
    weeks: 12,
    sessions: [
      {
        id: 'session-1',
        ordinal: 1,
        name: 'Upper A',
        kind: 'lift',
        label: 'Upper',
        exercises: [makePlannedExercise({ exerciseId: exercise.id, ...opts.planned })],
      },
    ],
    blocks: [makeBlock(opts.deload === true ? { setModifier: 0.5, isDeload: true } : {})],
  };
  const sets: Record<string, LoggedSet> = {};
  for (const s of opts.sets ?? []) sets[s.id] = s;
  return {
    ...defaultState(),
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    plans: { 'plan-1': plan },
    cursors: {
      [profile.id]: {
        planId: 'plan-1',
        nextSessionIndex: 0,
        startedOn: TODAY,
        completedOn: null,
      },
    },
    assignments: {
      [profile.id]: [
        {
          date: TODAY,
          sessionId: 'session-1',
          sourceIndex: 0,
          status: 'in-progress',
          startedAt: opts.startedAt ?? NOW, // [ms] epoch UTC
          completedAt: null,
          skipReason: null,
        },
      ],
    },
    sets,
  };
}

function seedStore(state: AppState): void {
  useAppStore.setState({ session: { ...EMPTY_SESSION } });
  useAppStore.getState().replaceState(state);
}

function renderTrain(): ReturnType<typeof render> {
  return render(
    <TrainingModalsProvider>
      <TrainView />
    </TrainingModalsProvider>,
  );
}

/** Enters a load and a rep count into set row `n` and submits with Enter. */
function logRow(n: number, load: string, reps: string, unit = 'kg'): void {
  const loadField = screen.getByLabelText(`${FORMAT.setLoadQuantity(n)} (${unit})`);
  fireEvent.change(loadField, { target: { value: load } });
  fireEvent.keyDown(loadField, { key: 'Enter' });
  const repsField = screen.getByLabelText(FORMAT.setRepsQuantity(n));
  fireEvent.change(repsField, { target: { value: reps } });
  fireEvent.keyDown(repsField, { key: 'Enter' });
}

/** Three prescribed sets at 60 kg x 8 on the previous session: the top of the range, met. */
function metTopHistory(exerciseId: string, loadKg: number): LoggedSet[] {
  return [1, 2, 3].map((n) =>
    makeSet({
      id: `prev-${String(n)}`,
      assignmentDate: YESTERDAY,
      exerciseId,
      setNumber: n,
      loadKg, // [kg]
      reps: 8, // [repetitions]
      loggedAt: NOW - 3 * 24 * 3_600_000, // [ms] epoch UTC
    }),
  );
}

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(playChime).mockClear();
  vi.mocked(vibrate).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TrainView unit handling (master plan section 7, P4 units gate)', () => {
  it('stores an imperial entry canonically and renders it in pounds', () => {
    seedStore(seed({ units: 'imperial' }));
    renderTrain();

    logRow(1, '135', '5', 'lb');

    const stored = Object.values(useAppStore.getState().sets);
    expect(stored).toHaveLength(1);
    // 135 lb x 0.45359237 kg/lb, exact at the storage boundary.
    expect(stored[0]?.loadKg).toBe(61.23496995); // [kg]
    expect(stored[0]?.enteredUnit).toBe('imperial');
    expect(screen.getByText('135 lb × 5')).toBeInTheDocument();
  });

  it('renders the same stored set as 61.2 kg for a metric viewer', () => {
    const set = makeSet({
      id: 'set-1',
      exerciseId: UPPER.id,
      loadKg: 61.23496995, // [kg] the imperial entry above
      enteredUnit: 'imperial',
      reps: 5,
    });
    seedStore(seed({ units: 'metric', sets: [set] }));
    renderTrain();

    expect(screen.getByText('61.2 kg × 5')).toBeInTheDocument();
  });

  it('advances focus from the load field to the reps field on Enter', () => {
    seedStore(seed());
    renderTrain();

    const load = screen.getByLabelText(`${FORMAT.setLoadQuantity(1)} (kg)`);
    fireEvent.change(load, { target: { value: '60' } });
    fireEvent.keyDown(load, { key: 'Enter' });

    expect(document.activeElement).toBe(screen.getByLabelText(FORMAT.setRepsQuantity(1)));
  });

  it('stores 0 kg, never null, when the bodyweight toggle is set', () => {
    seedStore(seed());
    renderTrain();

    fireEvent.click(screen.getByLabelText(FORMAT.setBodyweightQuantity(1)));
    fireEvent.change(screen.getByLabelText(FORMAT.setRepsQuantity(1)), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: FORMAT.logSetLabel(1) }));

    const stored = Object.values(useAppStore.getState().sets);
    expect(stored[0]?.loadKg).toBe(0); // [kg] bodyweight, code review A60
  });
});

describe('TrainView progression surface (master plan section 7, P4 units gate)', () => {
  it('suggests 62.5 kg after a 60 kg upper compound met the top of the range', () => {
    const history = metTopHistory(UPPER.id, 60);
    const state = seed({ sets: history });
    seedStore(state);
    renderTrain();

    const advice = suggestedProgression(
      history,
      makePlannedExercise({ exerciseId: UPPER.id }),
      UPPER,
      makeProfile({}),
      makeBlock(),
    );
    expect(advice.kind).toBe('add-load');
    expect(advice.loadKg).toBe(62.5); // [kg] 60 + max(2.5 % of 60, 2.5 kg step)
    expect(
      screen.getByText(FORMAT.suggestedLoad('62.5 kg', copy('status.adviceAddLoad'))),
    ).toBeInTheDocument();
  });

  it('advises extending reps rather than a 12.5 % jump on a 20 kg curl', () => {
    const history = metTopHistory(CURL.id, 20);
    seedStore(seed({ exercise: CURL, sets: history }));
    renderTrain();

    const advice = suggestedProgression(
      history,
      makePlannedExercise({ exerciseId: CURL.id }),
      CURL,
      makeProfile({}),
      makeBlock(),
    );
    expect(advice.kind).toBe('extend-reps');
    expect(
      screen.getByText(FORMAT.suggestedLoad('20 kg', copy('status.adviceExtendReps'))),
    ).toBeInTheDocument();
  });

  it('keeps the arithmetic behind a why? disclosure (copy contract R9)', () => {
    const history = metTopHistory(UPPER.id, 60);
    seedStore(seed({ sets: history }));
    renderTrain();

    const advice = suggestedProgression(
      history,
      makePlannedExercise({ exerciseId: UPPER.id }),
      UPPER,
      makeProfile({}),
      makeBlock(),
    );
    expect(screen.getAllByText(copy('disclosure.why')).length).toBeGreaterThan(0);
    expect(screen.getByText(advice.why)).toBeInTheDocument();
    expect(screen.getByText(advice.reason)).toBeInTheDocument();
  });

  it('names the last session rather than deriving it from the clock', () => {
    seedStore(seed({ sets: metTopHistory(UPPER.id, 60) }));
    renderTrain();

    expect(
      screen.getByText(FORMAT.lastSessionSets(YESTERDAY, '60 kg', '8, 8, 8')),
    ).toBeInTheDocument();
  });

  it('applies the deload block set modifier to the row count', () => {
    seedStore(seed({ deload: true }));
    renderTrain();

    // setsLo 3 x setModifier 0.5, rounded = 2 rows, load held (master plan section 5).
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`)).toBeInTheDocument();
    expect(screen.queryByLabelText(`${FORMAT.setLoadQuantity(3)} (kg)`)).toBeNull();
    expect(screen.getByText(copy('advice.deloadBlock'))).toBeInTheDocument();
  });
});

describe('TrainView set logging feedback', () => {
  it('shows a coach line after a logged set', () => {
    seedStore(seed());
    renderTrain();

    logRow(1, '60', '8');

    expect(screen.getByText('Top of range at 60 kg × 8.')).toBeInTheDocument();
  });

  it('offers an undo after deleting a set and restores it', () => {
    const set = makeSet({ id: 'set-1', exerciseId: UPPER.id, loadKg: 60, reps: 8 });
    seedStore(seed({ sets: [set] }));
    renderTrain();

    fireEvent.click(screen.getByRole('button', { name: FORMAT.deleteSetLabel(1) }));
    expect(useAppStore.getState().sets['set-1']).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: copy('button.undo') }));
    expect(useAppStore.getState().sets['set-1']?.loadKg).toBe(60); // [kg]
  });

  it('adds a bonus row beyond the prescribed set count', () => {
    seedStore(seed());
    renderTrain();

    expect(screen.queryByLabelText(`${FORMAT.setLoadQuantity(4)} (kg)`)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy('button.addSet') }));
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(4)} (kg)`)).toBeInTheDocument();
  });

  it('marks a set logged beyond the prescribed count as a bonus set', () => {
    seedStore(seed());
    renderTrain();

    fireEvent.click(screen.getByRole('button', { name: copy('button.addSet') }));
    logRow(4, '60', '8');

    const stored = Object.values(useAppStore.getState().sets);
    expect(stored[0]?.isBonus).toBe(true);
  });
});

describe('TrainView rest timer', () => {
  it('starts a rest timer from the prescription after a logged set', () => {
    seedStore(seed());
    renderTrain();

    logRow(1, '60', '8');

    const timer = useAppStore.getState().session.restTimer;
    expect(timer).not.toBeNull();
    expect(timer?.durationS).toBe(120); // [s] the fixture's planned.restS
    expect(screen.getByText(FORMAT.restRemaining(2, 0))).toBeInTheDocument();
  });

  it('renders a restored rest timer from the session slice', () => {
    seedStore(seed());
    useAppStore
      .getState()
      .setRestTimer({ startedAt: NOW - 30_000, endsAt: NOW + 60_000, durationS: 90 });
    renderTrain();

    expect(screen.getByText(FORMAT.restRemaining(1, 0))).toBeInTheDocument();
  });

  it('extends the interval by 30 s without changing the recorded duration', () => {
    seedStore(seed());
    useAppStore
      .getState()
      .setRestTimer({ startedAt: NOW, endsAt: NOW + 60_000, durationS: 60 });
    renderTrain();

    fireEvent.click(screen.getByRole('button', { name: copy('button.extendRest') }));

    const timer = useAppStore.getState().session.restTimer;
    expect(timer?.endsAt).toBe(NOW + 90_000); // [ms]
    expect(timer?.durationS).toBe(60); // [s] as originally prescribed
    expect(screen.getByText(FORMAT.restRemaining(1, 30))).toBeInTheDocument();
  });

  it('clears the timer when the rest is skipped', () => {
    seedStore(seed());
    useAppStore
      .getState()
      .setRestTimer({ startedAt: NOW, endsAt: NOW + 60_000, durationS: 60 });
    renderTrain();

    fireEvent.click(screen.getByRole('button', { name: copy('button.skipRest') }));
    expect(useAppStore.getState().session.restTimer).toBeNull();
  });

  it('recomputes on visibilitychange after a background jump and chimes exactly once', () => {
    seedStore(seed());
    useAppStore
      .getState()
      .setRestTimer({ startedAt: NOW, endsAt: NOW + 90_000, durationS: 90 });
    renderTrain();
    expect(playChime).not.toHaveBeenCalled();

    // Ten minutes backgrounded. remainingS is a function of endsAt, so it reads 0 rather than
    // a frozen count (master plan section 7, P4 timer gate).
    vi.setSystemTime(NOW + 10 * MINUTE_MS);
    fireEvent(document, new Event('visibilitychange'));

    expect(screen.getByText(FORMAT.restRemaining(0, 0))).toBeInTheDocument();
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);

    fireEvent(document, new Event('visibilitychange'));
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it('posts a service-worker notification when the page is hidden at zero', async () => {
    const showNotification = vi.fn<(title: string, options?: NotificationOptions) => Promise<void>>(
      () => Promise.resolve(),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ showNotification }) },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
      writable: true,
    });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    seedStore(seed());
    useAppStore
      .getState()
      .setRestTimer({ startedAt: NOW, endsAt: NOW + 90_000, durationS: 90 });
    renderTrain();

    vi.setSystemTime(NOW + 10 * MINUTE_MS);
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith(copy('notification.restOver'), { tag: 'rest' });
    });

    hidden.mockRestore();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(globalThis, 'Notification');
  });
});

describe('TrainView hydration and body mass', () => {
  it('shows the drink-to-thirst cue once the in-session cadence has elapsed', () => {
    seedStore(seed({ startedAt: NOW - 25 * MINUTE_MS }));
    renderTrain();

    expect(screen.getByText(copy('advice.drinkToThirst'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: FORMAT.logVolume('250 mL') }));

    const entry = useAppStore.getState().hydration['profile-1']?.[0];
    expect(entry?.volumeML).toBe(250); // [mL]
  });

  it('logs a body mass entry from the quick log', () => {
    seedStore(seed());
    renderTrain();

    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyMass')} (kg)`), {
      target: { value: '94.4' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyMass') }));

    expect(useAppStore.getState().bodyMass['profile-1']?.[0]?.massKg).toBe(94.4); // [kg]
  });

  it('flags a post-session loss above 2 % of the reference mass', () => {
    seedStore(seed({ weighInOptIn: true }));
    renderTrain();
    fireEvent.click(screen.getByRole('button', { name: copy('button.finishSession') }));

    // Baseline 95 kg; 92 kg is a 3.2 % loss, above the ACSM 2007 threshold.
    fireEvent.change(screen.getByLabelText(`${copy('quantity.postSessionBodyMass')} (kg)`), {
      target: { value: '92' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyMass') }));

    expect(screen.getByText(copy('advice.fluidLoss'))).toBeInTheDocument();
    expect(screen.getByText(FORMAT.fluidLossWhy('3.2', 2))).toBeInTheDocument();
  });
});

describe('TrainView custom and bonus exercises', () => {
  it('adds a custom exercise with a generated id and shows it as a bonus card', () => {
    seedStore(seed());
    renderTrain();

    fireEvent.click(screen.getByRole('button', { name: copy('button.addExercise') }));
    fireEvent.change(screen.getByLabelText(copy('quantity.exerciseName')), {
      target: { value: 'Cable crunch' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy('button.saveExercise') }));

    const custom = useAppStore.getState().customExercises['profile-1'] ?? [];
    expect(custom).toHaveLength(1);
    expect(custom[0]?.name).toBe('Cable crunch');
    // A stable generated id, never the legacy positional 1000 + i (code review A26).
    expect(custom[0]?.id).not.toBe('1000');
    expect(
      screen.getByText(FORMAT.bonusExerciseName('Cable crunch'), { exact: false }),
    ).toBeInTheDocument();
  });
});

describe('TrainView session frame', () => {
  it('renders the warm-up notice on every session', () => {
    seedStore(seed());
    renderTrain();
    expect(screen.getByText(WARMUP_NOTICE)).toBeInTheDocument();
  });

  it('shows the physician-consult notice for a flagged profile', () => {
    seedStore(seed({ flagged: true }));
    renderTrain();
    expect(screen.getByText(copy('advice.readinessConsult'))).toBeInTheDocument();
  });

  it('says so when no session is assigned to today', () => {
    const state = seed();
    seedStore({ ...state, assignments: { 'profile-1': [] } });
    renderTrain();
    expect(screen.getByText(copy('advice.noSessionToday'))).toBeInTheDocument();
  });

  it('opens the form-cue modal from the card', () => {
    seedStore(seed());
    renderTrain();
    fireEvent.click(screen.getByRole('button', { name: copy('button.formCues') }));
    expect(screen.getByTestId('form-cues-backdrop')).toBeInTheDocument();
  });

  it('opens the video modal from the card', () => {
    seedStore(seed());
    renderTrain();
    fireEvent.click(screen.getByRole('button', { name: copy('button.formReference') }));
    expect(screen.getByTestId('video-modal-backdrop')).toBeInTheDocument();
  });
});

describe('TrainView finish', () => {
  it('completes the session, clears the session slice and returns to Today', () => {
    seedStore(seed());
    useAppStore.getState().setActiveAssignmentDate(TODAY);
    useAppStore.getState().addBonusExercise('some-exercise');
    useAppStore
      .getState()
      .setRestTimer({ startedAt: NOW, endsAt: NOW + 60_000, durationS: 60 });
    renderTrain();

    fireEvent.click(screen.getByRole('button', { name: copy('button.finishSession') }));

    const after = useAppStore.getState();
    expect(after.assignments['profile-1']?.[0]?.status).toBe('completed');
    expect(after.session.restTimer).toBeNull();
    expect(after.session.activeAssignmentDate).toBeNull();
    expect(after.session.bonusExerciseIds).toEqual([]);
    expect(after.ui.lastView).toBe('today');
  });

  it('prompts for the post-session mass only when the profile opted in', () => {
    seedStore(seed({ weighInOptIn: false }));
    renderTrain();
    fireEvent.click(screen.getByRole('button', { name: copy('button.finishSession') }));
    expect(screen.queryByLabelText(`${copy('quantity.postSessionBodyMass')} (kg)`)).toBeNull();
  });
});

describe('TrainView wake lock', () => {
  it('requests a screen wake lock on mount and releases it on unmount', async () => {
    const release = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    // The sentinel is an EventTarget: useWakeLock listens for the platform's own "release"
    // event on it, so a bare { release } object would make the hook's acquire() throw and
    // report "denied" instead of holding the lock.
    const sentinel = {
      release,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const request = vi
      .fn<(t: 'screen') => Promise<typeof sentinel>>()
      .mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    seedStore(seed());
    const { unmount } = renderTrain();
    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen');
    });
    unmount();
    await waitFor(() => {
      expect(release).toHaveBeenCalled();
    });

    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('renders without a wake lock API present', () => {
    expect('wakeLock' in navigator).toBe(false);
    seedStore(seed());
    expect(() => renderTrain()).not.toThrow();
  });
});

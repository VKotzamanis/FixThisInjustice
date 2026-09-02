// src/ui/views/TrainView.tsx
//
// The session under way: what is prescribed, what has been logged, what to rest for, and the
// two things a session has to collect beyond sets (fluid and body mass).
//
// Units and instants: loads are canonical kg and are formatted only at the display boundary
// (src/domain/units.ts); rest is seconds; every instant is epoch ms UTC and is read from
// Date.now() at the call site rather than held in state.
//
// Three master-plan section 6.5 obligations are discharged here rather than in a component:
// the screen wake lock is held for as long as this view is mounted; the audio context is
// unlocked on the first pointer event that reaches this view, because a user who navigated
// straight to Train never passed through Today's Start tap (code review A29); and the session
// slice is cleared when the session ends, so a reload cannot revive a finished session.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FORMAT, copy } from '../../content/copy';
import { WARMUP_NOTICE } from '../../content/formCues';
import { todayLocal } from '../../domain/dates';
import { newId } from '../../domain/ids';
import { EXERCISES } from '../../domain/plan/library';
import type { CoachLine } from '../../domain/training/coach';
import { IDENTITY_BLOCK, blockFor } from '../../domain/training/progression';
import type { Exercise, PlannedExercise } from '../../domain/types';
import { useAppStore } from '../../store';
import { useActiveProfile, useTodaysSets } from '../../store/selectors';
import { UNDO_WINDOW_MS } from '../../store/training';
import { releaseAudio, unlockAudio } from '../audio/chime';
import { ReadinessNotice } from '../components/ReadinessNotice';
import { useWakeLock } from '../hooks/useWakeLock';
import { AddCustomExercise } from './train/AddCustomExercise';
import { BodyMassQuickLog } from './train/BodyMassQuickLog';
import { ExerciseCard } from './train/ExerciseCard';
import { HydrationBanner } from './train/HydrationBanner';
import { RestTimerPanel } from './train/RestTimerPanel';
import { SessionToast, type ToastItem } from './train/SessionToast';
import '../styles/train.css';
import './views.css';

/** [ms] How long a coach line stays on screen. Long enough to read, short enough to ignore. */
const COACH_TOAST_MS = 5_000;
/** [ms] How often expired toasts are swept. Half a second is below the shortest toast. */
const TOAST_SWEEP_MS = 500;
/** The most toasts on screen at once; older ones are dropped rather than stacked. */
const MAX_TOASTS = 3;

/**
 * A planned slot synthesised for an exercise the plan does not contain.
 *
 * The numbers are a default, not a prescription derived from anything: a bonus exercise was
 * never programmed, so nothing about it is known. `restS: 0` means "use defaultRestS", which
 * routes the interval through the cited stratification rather than inventing one here.
 */
function bonusSlot(exerciseId: string): PlannedExercise {
  return {
    exerciseId,
    setsLo: 3, // [sets]
    setsHi: 3, // [sets]
    prescription: { kind: 'reps', lo: 8, hi: 12 }, // [repetitions]
    restS: 0, // [s] 0 means "use defaultRestS"
  };
}

export function TrainView(): ReactElement {
  const profile = useActiveProfile();
  const plans = useAppStore((s) => s.plans);
  const cursors = useAppStore((s) => s.cursors);
  const assignments = useAppStore((s) => s.assignments);
  const customExercises = useAppStore((s) => s.customExercises);
  const bonusExerciseIds = useAppStore((s) => s.session.bonusExerciseIds);
  const todaysSets = useTodaysSets();

  const [openId, setOpenId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Held for as long as this view is mounted; released on unmount by the hook. Absence and
  // refusal are ordinary states (jsdom, Safari < 16.4, a battery saver) and are not surfaced:
  // a session that cannot dim-lock the screen still has a working timer.
  useWakeLock(true);

  useEffect(() => {
    const handler = (): void => {
      void unlockAudio();
    };
    window.addEventListener('pointerdown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setToasts((items) => items.filter((t) => t.expiresAt > Date.now()));
    }, TOAST_SWEEP_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const pushToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    setToasts((items) => [...items.slice(-(MAX_TOASTS - 1)), { ...item, id: newId() }]);
  }, []);

  const onCoach = useCallback(
    (line: CoachLine) => {
      pushToast({
        text: line.text,
        tone: line.tone,
        expiresAt: Date.now() + COACH_TOAST_MS, // [ms] epoch UTC
        actionLabel: null,
        onAction: null,
      });
    },
    [pushToast],
  );

  const onDeleted = useCallback(() => {
    pushToast({
      text: copy('coach.setDeleted'),
      tone: 'undo',
      // The offer expires with the store's buffer, not before or after it: an Undo control the
      // store would refuse is worse than no control at all.
      expiresAt: Date.now() + UNDO_WINDOW_MS, // [ms] epoch UTC
      actionLabel: copy('button.undo'),
      onAction: () => {
        // Through getState(), like every other action call in this codebase: the store's
        // actions are created once and never replace themselves, so subscribing to one buys
        // nothing and hands the component an unbound method.
        useAppStore.getState().undoDelete();
      },
    });
  }, [pushToast]);

  const profileId = profile?.id ?? null;
  const library = useMemo<Record<string, Exercise>>(() => {
    const map: Record<string, Exercise> = {};
    for (const e of EXERCISES) map[e.id] = e;
    // The profile's own exercises win over the library, so a custom entry that later collides
    // with a shipped id still renders the record the user's sets were logged against.
    for (const e of profileId === null ? [] : (customExercises[profileId] ?? [])) map[e.id] = e;
    return map;
  }, [customExercises, profileId]);

  if (profile === null || profileId === null) {
    return <p className="view">{copy('advice.noProfileTrain')}</p>;
  }

  const today = todayLocal(profile.timezone);
  const assignment = (assignments[profileId] ?? []).find((a) => a.date === today) ?? null;
  const cursor = cursors[profileId] ?? null;
  const plan = cursor === null ? null : (plans[cursor.planId] ?? null);
  const session =
    plan === null || assignment === null
      ? null
      : (plan.sessions.find((s) => s.id === assignment.sessionId) ?? null);
  const block =
    plan === null || assignment === null ? IDENTITY_BLOCK : blockFor(plan, assignment.sourceIndex);
  const sessionActive = assignment !== null && assignment.status === 'in-progress';

  if (session === null || assignment === null) {
    return (
      <div className="view train">
        <h2>{copy('hero.train')}</h2>
        <p>{copy('advice.noSessionToday')}</p>
        <HydrationBanner profile={profile} date={today} sessionActive={false} />
      </div>
    );
  }

  /*
   * Bonus cards come from the session slice AND from any set already logged today against an
   * exercise the plan does not contain, so the cards survive a lost sessionStorage mirror.
   * Filtered against the library, because an id with no Exercise behind it can render nothing.
   */
  const plannedIds = new Set(session.exercises.map((e) => e.exerciseId));
  const bonusIds = Array.from(
    new Set([...bonusExerciseIds, ...todaysSets.map((s) => s.exerciseId)]),
  ).filter((id) => !plannedIds.has(id) && library[id] !== undefined);

  const firstPlannedId = session.exercises[0]?.exerciseId ?? null;
  const isCardOpen = (id: string): boolean => (openId === null ? id === firstPlannedId : openId === id);
  // Toggling the open card to '' rather than to null CLOSES it: null means "nothing has been
  // chosen yet", which is what opens the first card.
  const toggleCard = (id: string): void => {
    setOpenId((cur) => (cur === id ? '' : id));
  };

  const onFinish = (): void => {
    const now = Date.now(); // [ms] epoch UTC
    useAppStore.getState().completeSession(profileId, today, now);
    useAppStore.getState().setRestTimer(null);
    useAppStore.getState().setActiveAssignmentDate(null);
    // Subsumes the two calls above and drops the bonus ids and the undo buffer with them; both
    // are made explicitly first because master plan section 6.7 names them individually.
    useAppStore.getState().clearSessionSlice();
    releaseAudio();
    // A profile that opted in to pre/post weigh-ins stays here for the post-session mass; the
    // control below returns to Today once it is entered. Everyone else leaves at once.
    if (!profile.hydration.weighInOptIn) {
      useAppStore.getState().setUi({ lastView: 'today' });
    }
  };

  const completed = assignment.status === 'completed';

  return (
    <div className="view train">
      <div className="train-header">
        <div>
          <div className="train-eyebrow">{FORMAT.sessionEyebrow(session.ordinal, session.label)}</div>
          <h2>{session.name}</h2>
          {block.isDeload && <div className="train-deload">{copy('advice.deloadBlock')}</div>}
        </div>
        <RestTimerPanel />
      </div>

      {/* Master plan section 10.4: a flagged screening shows the notice at every session. */}
      <ReadinessNotice flagged={profile.readiness.flagged} />
      <p className="train-warmup">{WARMUP_NOTICE}</p>
      <HydrationBanner profile={profile} date={today} sessionActive={sessionActive} />

      <div className="ex-stack">
        {session.exercises.map((planned) => {
          const exercise = library[planned.exerciseId];
          if (exercise === undefined) return null;
          return (
            <ExerciseCard
              key={planned.exerciseId}
              profile={profile}
              exercise={exercise}
              planned={planned}
              block={block}
              library={library}
              assignmentDate={today}
              sessionId={session.id}
              isBonusExercise={false}
              isOpen={isCardOpen(planned.exerciseId)}
              onToggle={() => {
                toggleCard(planned.exerciseId);
              }}
              onCoach={onCoach}
              onDeleted={onDeleted}
            />
          );
        })}
        {bonusIds.map((id) => {
          const exercise = library[id];
          if (exercise === undefined) return null;
          return (
            <ExerciseCard
              key={id}
              profile={profile}
              exercise={exercise}
              planned={bonusSlot(id)}
              block={block}
              library={library}
              assignmentDate={today}
              sessionId={session.id}
              isBonusExercise
              isOpen={openId === id}
              onToggle={() => {
                toggleCard(id);
              }}
              onCoach={onCoach}
              onDeleted={onDeleted}
            />
          );
        })}
      </div>

      <AddCustomExercise profile={profile} />

      {!completed && (
        <BodyMassQuickLog
          profile={profile}
          date={today}
          // No same-day pre-session mass is collected (see BodyMassQuickLog's header), so the
          // in-session entry raises no flag: null disables the comparison rather than making
          // one against the wrong reference twice.
          preSessionMassKg={null}
          id="body-mass-quick"
          quantity={copy('quantity.bodyMass')}
        />
      )}

      {!completed && (
        <button type="button" onClick={onFinish}>
          {copy('button.finishSession')}
        </button>
      )}

      {completed && profile.hydration.weighInOptIn && (
        <div className="post-session">
          <BodyMassQuickLog
            profile={profile}
            date={today}
            preSessionMassKg={profile.body.baselineMassKg} // [kg] the profile baseline, not a pre-session pair
            id="body-mass-post-session"
            quantity={copy('quantity.postSessionBodyMass')}
          />
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().setUi({ lastView: 'today' });
            }}
          >
            {copy('button.backToToday')}
          </button>
        </div>
      )}

      <SessionToast items={toasts} />
    </div>
  );
}

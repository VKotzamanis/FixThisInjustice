// src/ui/views/TrainView.tsx
//
// The session under way: what is prescribed, what has been logged, what to rest for, and the
// two things a session has to collect beyond sets (fluid and body mass).
//
// Units and instants: loads are canonical kg and are formatted only at the display boundary
// (src/domain/units.ts); rest is seconds; every instant is epoch ms UTC and is read from
// Date.now() at the call site rather than held in state.
//
// Every toast this view raises - the coach line, the undo offer, a milestone and a specimen -
// goes through the ONE global queue (src/ui/components/ToastQueue.tsx). That is master plan
// amendment 13 (P4 item 13) discharged: the local toast list this file used to keep was a fifth
// independent toast slot, with its own sweep timer, its own stacking rule and no priority
// between classes, and it is retired with this task along with the component that rendered it.
//
// Three master-plan section 6.5 obligations are discharged here rather than in a component:
// the screen wake lock is held for as long as this view is mounted; the audio context is
// unlocked on the first pointer event that reaches this view, because a user who navigated
// straight to Train never passed through Today's Start tap (code review A29); and the session
// slice is cleared when the session ends, so a reload cannot revive a finished session.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { WARMUP_NOTICE } from '../../content/formCues';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { todayLocal } from '../../domain/dates';
import { crossedMilestones } from '../../domain/fun/blocks';
import { EXERCISES } from '../../domain/plan/library';
import type { CoachLine } from '../../domain/training/coach';
import { preSessionMass } from '../../domain/training/hydration';
import { IDENTITY_BLOCK, blockFor } from '../../domain/training/progression';
import type { Exercise, PlannedExercise } from '../../domain/types';
import { playSfx } from '../../skins/sfx';
import { useAppStore } from '../../store';
import { useActiveProfile, useTodaysSets } from '../../store/selectors';
import { releaseAudio, unlockAudio } from '../audio/chime';
import { useToasts } from '../components/ToastQueue';
import { useWakeLock } from '../hooks/useWakeLock';
import { AddCustomExercise } from './train/AddCustomExercise';
import { BodyMassQuickLog } from './train/BodyMassQuickLog';
import { ExerciseCard } from './train/ExerciseCard';
import { HydrationBanner } from './train/HydrationBanner';
import { RestTimerPanel } from './train/RestTimerPanel';
import '../styles/train.css';
import './views.css';

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
  const bodyMass = useAppStore((s) => s.bodyMass);
  const bonusExerciseIds = useAppStore((s) => s.session.bonusExerciseIds);
  const todaysSets = useTodaysSets();
  const profileId = profile?.id ?? null;
  const { push } = useToasts();
  /*
   * The skin's words, read ONCE for the whole screen and threaded down.
   *
   * `useCopy()` and `useCopyOverrides()` both subscribe to `ui.skin`. This view renders up to
   * eight exercise cards of up to six set rows each, so a hook call at the leaf would put ~48
   * subscriptions behind one field that changes at most once a session. `c` is passed to
   * ExerciseCard as `t` and forwarded to SetRow from there, and `overrides` rides beside it for
   * the frames that carry a value (P8 close-out D); the singleton children (RestTimerPanel,
   * HydrationBanner, AddCustomExercise, BodyMassQuickLog) read both hooks themselves, because
   * one subscription each is not worth a prop.
   */
  const c = useCopy();
  const overrides = useCopyOverrides();

  const [openId, setOpenId] = useState<string | null>(null);


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

  const onSetLogged = useCallback(
    (line: CoachLine, specimen: string | null) => {
      /*
       * P4 review item 2: the coach line arrives as a copy KEY and its values, and is resolved
       * here, at the boundary. The domain names which sentence to say; this file says it in the
       * words src/content/copy.ts holds, so P8's skin overlay reaches it.
       */
      push({ kind: line.tone, message: FORMAT.withSlots(line.key, line.params, overrides) });
      if (profileId === null) return;

      /*
       * ExerciseCard calls this handler synchronously, in the same click handler and on the
       * line after `logSet` returns, which is what makes the read below belong to the set that
       * was just stored (master plan section 10.8).
       */
      const after = useAppStore.getState().specimens[profileId]?.totalSetsLogged ?? 0; // [sets]
      /*
       * The highest set count a milestone has already been announced for. [sets]
       *
       * A high-water MARK, not the store's live count. Deleting a set decrements
       * `totalSetsLogged` (src/store/training.ts applyDeleteSet), so a check against the live
       * count would announce the same milestone again the moment the set was relogged. The
       * floor never goes down, so a delete and relog crosses nothing.
       *
       * Read from and written to `UiPrefs.milestoneFloorByProfile`, NOT a `useRef`. A ref is
       * per mount: leaving Train and coming back - or reloading - reset it to null, the
       * baseline fell back to `after - 1`, and the fiftieth set announced itself a second time
       * (code review). The fact belongs to the profile, so it belongs in the document.
       *
       * An absent key means "nothing announced yet", and the baseline is then `after - 1`:
       * applyLogSet increments by exactly one and this handler runs once for that increment.
       */
      const floors = useAppStore.getState().ui.milestoneFloorByProfile;
      const before = floors[profileId] ?? after - 1; // [sets]
      const reached = Math.max(before, after); // [sets]
      // Written only when it actually moves: setUi patches a persisted slice, so an unchanged
      // write costs a save and a re-render of every subscriber for nothing.
      if (reached !== floors[profileId]) {
        useAppStore.getState().setUi({ milestoneFloorByProfile: { ...floors, [profileId]: reached } });
      }
      // The half-open interval, never `MILESTONES.includes(count)`: a counter that advanced by
      // more than one between two reads must not step over a milestone (code review A46).
      for (const m of crossedMilestones(before, after)) push({ kind: 'milestone', count: m });

      /*
       * The specimen card, reported BY the store rather than asked of it again.
       *
       * This handler used to call attemptSpecimenDraw for the set logSet had already rolled
       * for, on the argument that a second call is idempotent. It is - nothing is written - but
       * it is not silent: for an ordinal already in the ledger the draw returns the RECORDED
       * card, which is the mechanism that stops a delete and relog rerolling a drop (master
       * plan section 10.8, rule 3). So a delete and relog handed this handler the same card
       * again and it raised a second toast for an acquisition that never happened.
       *
       * `logSet` compares the inventory across its own write and reports only what it acquired,
       * so the toast and the collection cannot disagree (src/store/index.ts, LogSetResult).
       */
      if (specimen !== null) push({ kind: 'specimen', cardId: specimen });
    },
    [push, profileId, overrides],
  );

  const onDeleted = useCallback(() => {
    // The offer expires with the store's buffer, READ FROM IT rather than recomputed from a
    // second clock read: an Undo control the store would refuse is worse than no control at
    // all, and two Date.now() calls a millisecond apart were enough to produce one. A delete
    // that buffered nothing (an unknown id) makes no offer.
    const pending = useAppStore.getState().session.undo;
    if (pending === null) return;
    push({
      kind: 'undo',
      message: c('coach.setDeleted'),
      // [ms] epoch UTC. The buffer's own deadline, which is deletedAt + UNDO_WINDOW_MS.
      deadlineAt: pending.expiresAt,
      onUndo: () => {
        // Through getState(), like every other action call in this codebase: the store's
        // actions are created once and never replace themselves, so subscribing to one buys
        // nothing and hands the component an unbound method.
        if (!useAppStore.getState().undoAvailable(Date.now())) return;
        useAppStore.getState().undoDelete();
      },
    });
  }, [push, c]);

  const library = useMemo<Record<string, Exercise>>(() => {
    const map: Record<string, Exercise> = {};
    for (const e of EXERCISES) map[e.id] = e;
    // The profile's own exercises win over the library, so a custom entry that later collides
    // with a shipped id still renders the record the user's sets were logged against.
    for (const e of profileId === null ? [] : (customExercises[profileId] ?? [])) map[e.id] = e;
    return map;
  }, [customExercises, profileId]);

  if (profile === null || profileId === null) {
    return <p className="view">{c('advice.noProfileTrain')}</p>;
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
  /*
   * The mass this session started from, by the hydration module's own rule (the latest entry
   * within 6 h before startedAt). It is the ONLY reference the > 2 % comparison can use: the
   * profile baseline is a mass from whenever the profile was set up, so comparing against it
   * reports the programme's mass change and raises the dehydration flag on every session of a
   * subject who has since lost weight (P4 polish item 2).
   */
  const preSessionMassKg =
    assignment === null || assignment.startedAt === null
      ? null
      : (preSessionMass(bodyMass[profileId] ?? [], assignment.startedAt)?.massKg ?? null); // [kg]

  if (session === null || assignment === null) {
    return (
      <div className="view train">
        <h2>{c('hero.train')}</h2>
        <p>{c('advice.noSessionToday')}</p>
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
    // The store resets the session slice and its mirror itself, and only when the transition
    // actually ended the session (P4 polish item 3). Clearing it here instead threw the
    // running timer and the training day away even when the completion was REFUSED, and left
    // the same reset missing from every other way a session ends - Today's Skip above all.
    useAppStore.getState().completeSession(profileId, today, now);
    /*
     * The session-done sound (P8 Task 15), fired from the DOCUMENT rather than from the tap.
     *
     * completeSession refuses a day that is already terminal - skipped from Today, or completed
     * in another tab while this render went stale - and returns silently when it does, so the
     * status is read back rather than assumed. A sound for a completion that did not happen is
     * the audible version of a success banner over a refused write.
     *
     * BEFORE releaseAudio(), and it should stay there even now that releaseAudio() only suspends
     * the context while sounds are on (P8 close-out defect, src/ui/audio/chime.ts): called here,
     * this sound is scheduled on a context that is still RUNNING, so it starts at once. Called
     * after, it would land on a context releaseAudio() had just suspended, and the sfx player's
     * play() would have to resume() and wait a round trip before scheduling it (src/skins/sfx.ts)
     * - correct, but a needless detour for the one sound in the set that always fires from a
     * still-open session rather than after one has ended.
     *
     * ui.sounds is read fresh here, not cached from a render prop, so a session finished with
     * sounds toggled mid-run tells releaseAudio() the setting that is actually in effect.
     */
    const ended = (useAppStore.getState().assignments[profileId] ?? []).find(
      (a) => a.date === today,
    );
    if (ended?.status === 'completed') playSfx('session_done');
    releaseAudio({ sounds: useAppStore.getState().ui.sounds });
    // A profile that opted in to pre/post weigh-ins stays here for the post-session mass; the
    // control below returns to Today once it is entered. Everyone else leaves at once.
    if (!profile.hydration.weighInOptIn) {
      useAppStore.getState().setUi({ lastView: 'today' });
    }
  };

  const completed = assignment.status === 'completed';
  // The pre-session half of the pair is asked for once, before the first set, and only from a
  // profile that opted in. After a set is logged the moment has passed: a mass taken 40 minutes
  // into a session is not the mass the session started from, and offering it then would produce
  // a pair whose difference is not the session's fluid loss.
  const asksPreSessionMass =
    !completed &&
    profile.hydration.weighInOptIn &&
    preSessionMassKg === null &&
    todaysSets.length === 0;

  return (
    <div className="view train">
      <div className="train-header">
        <div>
          <div className="train-eyebrow">
            {FORMAT.sessionEyebrow(session.ordinal, session.label, overrides)}
          </div>
          <h2>{session.name}</h2>
          {block.isDeload && <div className="train-deload">{c('advice.deloadBlock')}</div>}
        </div>
        <RestTimerPanel />
      </div>

      <p className="train-warmup">{WARMUP_NOTICE}</p>
      <HydrationBanner profile={profile} date={today} sessionActive={sessionActive} />

      <div className="ex-stack">
        {session.exercises.map((planned) => {
          const exercise = library[planned.exerciseId];
          if (exercise === undefined) return null;
          return (
            <ExerciseCard
              key={planned.exerciseId}
              t={c}
              overrides={overrides}
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
              onCoach={onSetLogged}
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
              t={c}
              overrides={overrides}
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
              onCoach={onSetLogged}
              onDeleted={onDeleted}
            />
          );
        })}
      </div>

      <AddCustomExercise profile={profile} />

      {asksPreSessionMass && (
        <BodyMassQuickLog
          profile={profile}
          date={today}
          // The reference itself: there is nothing to compare it against, so no flag.
          preSessionMassKg={null}
          id="body-mass-pre-session"
          quantity={c('quantity.preSessionBodyMass')}
        />
      )}

      {!completed && !asksPreSessionMass && (
        <BodyMassQuickLog
          profile={profile}
          date={today}
          // A weigh-in taken mid-session is neither half of the pair, so it raises no flag:
          // null disables the comparison rather than making one against the wrong reference.
          preSessionMassKg={null}
          id="body-mass-quick"
          quantity={c('quantity.bodyMass')}
        />
      )}

      {!completed && (
        <button type="button" onClick={onFinish}>
          {c('button.finishSession')}
        </button>
      )}

      {completed && profile.hydration.weighInOptIn && (
        <div className="post-session">
          <BodyMassQuickLog
            profile={profile}
            date={today}
            preSessionMassKg={preSessionMassKg} // [kg] this session's own starting mass, or null
            id="body-mass-post-session"
            quantity={c('quantity.postSessionBodyMass')}
          />
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().setUi({ lastView: 'today' });
            }}
          >
            {c('button.backToToday')}
          </button>
        </div>
      )}
    </div>
  );
}

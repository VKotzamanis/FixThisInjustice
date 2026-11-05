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
// re-unlocked on every Log and Extend tap (C07); and the session
// slice is cleared when the session ends, so a reload cannot revive a finished session.
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { displayClass } from '../format/display';
import { FORMAT } from '../../content/copy';
import { WARMUP_NOTICE } from '../../content/formCues';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { todayLocal } from '../../domain/dates';
import { crossedMilestones } from '../../domain/fun/blocks';
import { inventoryOf } from '../../domain/plan/inventory';
import { EXERCISES } from '../../domain/plan/library';
import { sessionTitle } from '../../domain/schedule/rotation';
import type { CoachLine } from '../../domain/training/coach';
import { latestTrendEntry } from '../../domain/measurements';
import {
  DEHYDRATION_LOSS_FRACTION,
  bodyMassLossFraction,
  exceedsDehydrationThreshold,
  preSessionMass,
} from '../../domain/training/hydration';
import { IDENTITY_BLOCK, blockFor } from '../../domain/training/progression';
import {
  addBlockedIds,
  isBonusEntry,
  isEditable,
  replaceChoices,
  sessionLineup,
  type LineupEntry,
  type SessionEditOp,
} from '../../domain/training/sessionEdits';
import type { BodyMassRole, Exercise, Kg } from '../../domain/types';
import { playSfx } from '../../skins/sfx';
import { useAppStore, type FinishSnapshot } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { BodyMassForm } from '../measurements/BodyMassForm';
import { useActiveProfile, useOpenAssignment, useTodaysSets } from '../../store/selectors';
import { releaseAudio } from '../audio/chime';
import { useToastActions } from '../components/ToastQueue';
import { useWakeLock } from '../hooks/useWakeLock';
import { useViewActive } from '../nav/viewActive';
import { AddCustomExercise } from './train/AddCustomExercise';
import { AddLibraryExercise } from './train/AddLibraryExercise';
import { ExerciseCard, targetSetsFor } from './train/ExerciseCard';
import { HydrationBanner } from './train/HydrationBanner';
import { ReplaceSheet } from './train/ReplaceSheet';
import { RestTimerPanel } from './train/RestTimerPanel';
import { SessionEditBar } from './train/SessionEditBar';
import { SessionNumber } from '../components/SessionNumber';
import '../styles/train.css';
import './views.css';

const PERCENT = 100; // [%] per unit fraction

export function TrainView(): ReactElement {
  const profile = useActiveProfile();
  const plans = useAppStore((s) => s.plans);
  const cursors = useAppStore((s) => s.cursors);
  const assignments = useAppStore((s) => s.assignments);
  const customExercises = useAppStore((s) => s.customExercises);
  const bodyMass = useAppStore((s) => s.bodyMass);
  const bonusExerciseIds = useAppStore((s) => s.session.bonusExerciseIds);
  const warmupDismissed = useAppStore((s) => s.ui.warmupNoticeDismissedByProfile);
  const todaysSets = useTodaysSets();
  const profileId = profile?.id ?? null;
  const { push, dismiss } = useToastActions();
  // Spec R1: the open session, whatever its date.
  const open = useOpenAssignment();
  /*
   * The skin's words, read ONCE for the whole screen and threaded down.
   *
   * `useCopy()` and `useCopyOverrides()` both subscribe to `ui.skin`. This view renders up to
   * eight exercise cards of up to six set rows each, so a hook call at the leaf would put ~48
   * subscriptions behind one field that changes at most once a session. `c` is passed to
   * ExerciseCard as `t` and forwarded to SetRow from there, and `overrides` rides beside it for
   * the frames that carry a value (P8 close-out D); the singleton children (RestTimerPanel,
   * HydrationBanner, AddCustomExercise, BodyMassForm) read both hooks themselves, because
   * one subscription each is not worth a prop.
   */
  const c = useCopy();
  const overrides = useCopyOverrides();

  const [openId, setOpenId] = useState<string | null>(null);
  /** [%] The session's fluid loss to one decimal when it exceeded the threshold, else null (G01). */
  const [fluidLossPct, setFluidLossPct] = useState<string | null>(null);
  /** Audit C12: true while Finish is asking about missing sets. */
  const [finishQuestion, setFinishQuestion] = useState(false);
  // Audit C10: a finished session is read-only until the user opens it for a forgotten set.
  const [amending, setAmending] = useState(false);
  // Audit C03: the undo offer on screen, withdrawn once its slot is logged again.
  const undoToastId = useRef<string | null>(null);
  /** The slot key whose Replace sheet is open, or null. */
  const [replacingKey, setReplacingKey] = useState<string | null>(null);
  // Stable for ModalShell (its onClose re-runs the overlay effect when it changes).
  const closeReplace = useCallback(() => {
    setReplacingKey(null);
  }, []);
  // The "Replaced with" Undo offer on screen, withdrawn once a set is logged (Replace is over then).
  const replaceToastId = useRef<string | null>(null);


  // Held while a session is open and this view is on screen (C17: a visited Train view stays
  // mounted, F02, so "mounted" no longer means "on screen"); released on unmount by the hook.
  // Absence and refusal are ordinary states (jsdom, Safari < 16.4, a battery saver) and are not
  // surfaced: a session that cannot dim-lock the screen still has a working timer.
  const viewActive = useViewActive();
  useWakeLock(open !== null && viewActive);

  const onSetLogged = useCallback(
    // `_line`: the coach line itself is ExerciseCard's to show (C08); this handler reads the specimen.
    (_line: CoachLine, specimen: string | null) => {
      // C03: re-filling the deleted set's slot spent the store's undo buffer; withdraw the offer.
      if (undoToastId.current !== null && useAppStore.getState().session.undo === null) {
        dismiss(undoToastId.current);
        undoToastId.current = null;
      }
      // A logged set ends the moment Replace is for; its Undo goes with it.
      if (replaceToastId.current !== null) {
        dismiss(replaceToastId.current);
        replaceToastId.current = null;
      }
      // C08: the coach line is rendered inline by ExerciseCard under the set it is about.
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
    [push, dismiss, profileId],
  );

  const onDeleted = useCallback(() => {
    // The offer expires with the store's buffer, READ FROM IT rather than recomputed from a
    // second clock read: an Undo control the store would refuse is worse than no control at
    // all, and two Date.now() calls a millisecond apart were enough to produce one. A delete
    // that buffered nothing (an unknown id) makes no offer.
    const pending = useAppStore.getState().session.undo;
    if (pending === null) return;
    undoToastId.current = push({
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

  // Audit D07: the swap and add pickers suggest only what the profile's inventory allows.
  const inventory = useMemo(() => (profile === null ? null : inventoryOf(profile)), [profile]);

  if (profile === null || profileId === null) {
    return <p className="view">{c('advice.noProfileTrain')}</p>;
  }

  const today = todayLocal(profile.timezone);
  // Spec R1 (C01/D01): the open session wins over the clock, whatever its date; else today's row.
  const assignment = open ?? (assignments[profileId] ?? []).find((a) => a.date === today) ?? null;
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
   * The warm-up notice, ONCE (owner 2026-10-18: "Gyms already make you sign a waiver. Showing it
   * once is ok"). Shown while a session is in progress until this profile taps its one control.
   * The dismissal is stored per profile in the document (UiPrefs.warmupNoticeDismissedByProfile),
   * not in component state, so leaving Train, a reload or a new session does not bring it back.
   */
  const showWarmup = sessionActive && warmupDismissed?.[profileId] !== true;
  const dismissWarmup = (): void => {
    // Read at the tap, not from the render, so an entry another profile wrote since is kept.
    const dismissed = useAppStore.getState().ui.warmupNoticeDismissedByProfile ?? {};
    useAppStore.getState().setUi({ warmupNoticeDismissedByProfile: { ...dismissed, [profileId]: true } });
  };
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
      : (preSessionMass(bodyMass[profileId] ?? [], assignment.startedAt, assignment.completedAt)?.massKg ?? null); // [kg]
  // [kg] Spec R4: a weigh-in is compared with the newest trend mass, else the setup baseline.
  const latestMassKg: Kg = latestTrendEntry(bodyMass[profileId] ?? [])?.massKg ?? profile.body.baselineMassKg;

  if (session === null || assignment === null) {
    return (
      <div className="view train">
        <h2 className={displayClass(c('hero.train'))}>{c('hero.train')}</h2>
        <p>{c('advice.noSessionToday')}</p>
        <HydrationBanner profile={profile} date={today} sessionActive={false} />
      </div>
    );
  }

  /*
   * Today's cards: the plan's slots with the user's session edits applied (ROADMAP L2-L4,
   * src/domain/training/sessionEdits.ts), plus a card for every exercise with sets logged today
   * that the edited session no longer holds, so an edit never hides a logged set and the cards
   * survive a lost sessionStorage mirror. `bonusExerciseIds` is the session slice an older
   * build wrote custom exercises to; it is read here so such a session keeps its cards, and has
   * no writer from this build (custom exercises now land in `edits.added`).
   */
  const lineup = sessionLineup({
    session,
    edits: assignment.edits,
    library,
    loggedExerciseIds: [...bonusExerciseIds, ...todaysSets.map((s) => s.exerciseId)],
  });
  const editable = lineup.filter(isEditable);
  const inUse = new Set(editable.map((e) => e.exerciseId));
  // Reordering moves slots among themselves; the read-only cards (a swapped-out original, a
  // logged-only exercise) follow their slot or sit at the end and are not positions.
  const slotKeys = editable.map((e) => e.key);
  const libraryList = Object.values(library);
  const finished = assignment.status === 'completed' || assignment.status === 'skipped';
  const editsOpen = !finished;
  const editSession = (op: SessionEditOp): boolean => {
    /*
     * A click handler: React does not catch a throw from one, so the store's refusal (a
     * session finished in another tab, a slot that is gone) becomes the bar's own message.
     * The store writes the document only; the rest timer keeps running.
     */
    try {
      useAppStore.getState().editSession(profileId, assignment.date, op);
    } catch {
      return false;
    }
    // The card the user is working on stays open through a move, a swap or a restore, and an
    // added one opens. A skip or a removal means "done with this one", so the first card still
    // to do opens instead (null).
    setOpenId(
      op.kind === 'add' ? op.exerciseId : op.kind === 'skip' || op.kind === 'remove' ? null : op.key,
    );
    return true;
  };
  const addExercise = (exerciseId: string): boolean => editSession({ kind: 'add', exerciseId });
  const loggedIds = new Set(todaysSets.map((s) => s.exerciseId));
  /*
   * Replace in the card header (owner request: "when you start the exercise"): a planned slot
   * (its planned exercise resolves), not skipped, no set logged on the card today, session open.
   * Once a set is logged the header button goes and the edit bar's Swap stays, as before.
   */
  const canReplace = (entry: LineupEntry): boolean =>
    editsOpen &&
    (entry.kind === 'planned' || entry.kind === 'swapped') &&
    !entry.skipped &&
    !loggedIds.has(entry.exerciseId) &&
    library[entry.key] !== undefined;
  const replacing = replacingKey === null ? undefined : editable.find((e) => e.key === replacingKey);
  const replacingOriginal = replacing === undefined ? undefined : library[replacing.key];
  const replacingCurrent = replacing === undefined ? undefined : library[replacing.exerciseId];
  /** One tap on a sheet row: the same swap op as the edit bar, so R4 progression holds unchanged. */
  const replaceWith = (entry: LineupEntry, exerciseId: string): boolean => {
    const previousId = entry.exerciseId;
    if (!editSession({ kind: 'swap', key: entry.key, exerciseId })) return false;
    closeReplace();
    const name = library[exerciseId]?.name ?? exerciseId;
    if (replaceToastId.current !== null) dismiss(replaceToastId.current);
    replaceToastId.current = push({
      kind: 'undo',
      message: FORMAT.withSlots('status.replacedWith', { name }, overrides),
      deadlineAt: Date.now() + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        replaceToastId.current = null;
        // Read at the tap: once a set is logged on the replacement, Replace (and its Undo) is over.
        const atTap = useAppStore.getState();
        const logged = Object.values(atTap.sets).some(
          (s) => s.profileId === profileId && s.assignmentDate === assignment.date && s.exerciseId === exerciseId,
        );
        if (logged) return;
        // The previous exercise: the planned one (swap to the key clears the swap) or a substitute.
        editSession({ kind: 'swap', key: entry.key, exerciseId: previousId });
      },
    });
    return true;
  };

  // The first card the user still has to do opens by itself; a skipped one does not.
  const firstKey = lineup.find((e) => !e.skipped)?.key ?? null;
  const isCardOpen = (key: string): boolean => (openId === null ? key === firstKey : openId === key);
  // Toggling the open card to '' rather than to null CLOSES it: null means "nothing has been
  // chosen yet", which is what opens the first card.
  const toggleCard = (id: string): void => {
    setOpenId((cur) => (cur === id ? '' : id));
  };

  const finishNow = (): void => {
    // Audit C12: the records an Undo would put back, read at the tap (not from the render).
    const atTap = useAppStore.getState();
    const rowBefore = (atTap.assignments[profileId] ?? []).find((a) => a.date === assignment.date) ?? null;
    const cursorBefore = atTap.cursors[profileId] ?? null;
    const now = Date.now(); // [ms] epoch UTC
    // The store resets the session slice and its mirror itself, and only when the transition
    // actually ended the session (P4 polish item 3). Clearing it here instead threw the
    // running timer and the training day away even when the completion was REFUSED, and left
    // the same reset missing from every other way a session ends - Today's Skip above all.
    useAppStore.getState().completeSession(profileId, assignment.date, now);
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
      (a) => a.date === assignment.date,
    );
    if (ended?.status === 'completed') playSfx('session_done');
    releaseAudio({ sounds: useAppStore.getState().ui.sounds });
    // A profile that opted in to pre/post weigh-ins stays here for the post-session mass; the
    // control below returns to Today once it is entered. Everyone else leaves at once.
    if (!profile.hydration.weighInOptIn) {
      useAppStore.getState().setUi({ lastView: 'today' });
    }
    const after = useAppStore.getState();
    const rowAfter = (after.assignments[profileId] ?? []).find((a) => a.date === assignment.date) ?? null;
    const cursorAfter = after.cursors[profileId] ?? null;
    if (rowBefore !== null && cursorBefore !== null && rowAfter?.status === 'completed' && cursorAfter !== null) {
      const snap: FinishSnapshot = {
        profileId,
        before: { assignment: rowBefore, cursor: cursorBefore },
        after: { assignment: rowAfter, cursor: cursorAfter, reviews: after.weeklyReviews[profileId] },
      };
      push({
        kind: 'undo',
        message: c('status.sessionFinished'),
        deadlineAt: Date.now() + UNDO_WINDOW_MS, // [ms] epoch UTC
        onUndo: () => {
          if (useAppStore.getState().undoFinish(snap)) useAppStore.getState().setUi({ lastView: 'train' });
        },
      });
    }
  };

  // Audit C12: the prescribed sets of the slots still in play (planned or swapped, not skipped).
  const prescribedSets = lineup
    .filter((e) => (e.kind === 'planned' || e.kind === 'swapped') && !e.skipped)
    .reduce((sum, e) => sum + targetSetsFor(e.planned, block), 0); // [sets]
  const onFinish = (): void => {
    if (todaysSets.length < prescribedSets) {
      setFinishQuestion(true);
      return;
    }
    finishNow();
  };

  /** Logs one weigh-in of this session, on the session's own date (spec R1). False when refused. */
  const logWeighIn = (massKg: Kg, role: BodyMassRole): boolean => {
    try {
      useAppStore.getState().logBodyMass(
        { profileId, date: assignment.date, massKg, enteredUnit: profile.units, bodyFatPct: null, role }, // [kg]
        Date.now(), // [ms] epoch UTC
      );
      return true;
    } catch {
      return false;
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

  // D09: the programme week comes from the session's position, never from its baked name.
  const title = plan === null ? session.label : sessionTitle(plan, session);


  /*
   * Owner review item 10: the eyebrow's number is the session counter (SessionNumber: burn face,
   * named "Session n"). It burns only through claimSessionAdvance's once-per-advance rule, so
   * Train adds no burn of its own. A frame without `{ordinal}` falls back to the plain text.
   */
  const eyebrowParts = FORMAT.sessionEyebrowParts(session.label, overrides);
  const eyebrow =
    eyebrowParts === null || cursor === null ? (
      FORMAT.sessionEyebrow(session.ordinal, session.label, overrides)
    ) : (
      <>
        {eyebrowParts[0]}
        <SessionNumber planId={cursor.planId} shown={session.ordinal} />
        {eyebrowParts[1]}
      </>
    );

  return (
    <div className="view train">
      {/*
        * Brief 4.2: nothing above set 1 but this row. The position sits to the RIGHT of the name
        * (craft floor: no label above a heading); the rest bar is docked (RestTimerPanel, below).
        */}
      <div className="train-title-row">
        <h2 className={displayClass(title)}>{title}</h2>
        <span className="train-position">{eyebrow}</span>
      </div>
      {block.isDeload && <p className="train-deload">{c('advice.deloadBlock')}</p>}

      {showWarmup && (
        <div className="train-warmup" role="note">
          <p className="train-warmup-text">{WARMUP_NOTICE}</p>
          <button type="button" className="train-warmup-ok" onClick={dismissWarmup}>
            {c('button.gotIt')}
          </button>
        </div>
      )}

      <div className="ex-stack">
        {lineup.map((entry) => {
          const exercise = library[entry.exerciseId];
          if (exercise === undefined) return null;
          const replaced = entry.replaces === null ? undefined : library[entry.replaces];
          const tag = entry.skipped
            ? c('label.skipped')
            : replaced !== undefined
              ? FORMAT.swappedFrom(replaced.name, overrides)
              : entry.kind === 'swapped-out'
                ? c('label.swappedOut')
                : null;
          const slotIndex = slotKeys.indexOf(entry.key);
          const bonus = isBonusEntry(entry);
          return (
            <ExerciseCard
              // Slot AND exercise: a swap remounts the card, so a half-typed row of the
              // exercise that left cannot be submitted against the one that arrived.
              key={`${entry.key}:${entry.exerciseId}`}
              t={c}
              overrides={overrides}
              profile={profile}
              exercise={exercise}
              planned={entry.planned}
              block={block}
              library={library}
              assignmentDate={assignment.date}
              readOnly={finished && !amending}
              amending={finished && amending}
              sessionId={session.id}
              isBonusExercise={bonus}
              isOpen={isCardOpen(entry.key)}
              onToggle={() => {
                toggleCard(entry.key);
              }}
              onCoach={onSetLogged}
              onDeleted={onDeleted}
              tag={tag}
              onReplace={
                canReplace(entry)
                  ? () => {
                      setReplacingKey(entry.key);
                    }
                  : undefined
              }
            >
              {editsOpen && isEditable(entry) && (
                <SessionEditBar
                  t={c}
                  entry={entry}
                  name={bonus ? FORMAT.bonusExerciseName(exercise.name) : exercise.name}
                  original={entry.kind === 'added' ? null : (library[entry.key] ?? null)}
                  access={profile.equipment}
                  inventory={inventory}
                  library={libraryList}
                  inUse={inUse}
                  canMoveUp={slotIndex > 0}
                  canMoveDown={slotIndex >= 0 && slotIndex < slotKeys.length - 1}
                  hasLoggedSets={loggedIds.has(entry.exerciseId)}
                  onEdit={editSession}
                />
              )}
            </ExerciseCard>
          );
        })}
      </div>

      <HydrationBanner profile={profile} date={today} sessionActive={sessionActive} />

      {finished && !amending && (
        <button
          type="button"
          onClick={() => {
            setAmending(true);
          }}
        >
          {c('button.addForgottenSet')}
        </button>
      )}

      {/*
        * ROADMAP L4: the library picker first, the free-text form as the fallback. Both put the
        * exercise on the day's persisted edits; neither is offered once the session is over.
        */}
      {editsOpen && (
        <div className="ex-add">
          <AddLibraryExercise
            access={profile.equipment}
            inventory={inventory}
            library={libraryList}
            // The store's own 'add' refusal set (review R3): it also holds a planned exercise
            // whose slot was swapped away, which the cards on screen (`inUse`) no longer show.
            inUse={addBlockedIds(session, assignment.edits)}
            onAdd={addExercise}
          />
          <AddCustomExercise profile={profile} onAdd={addExercise} />
        </div>
      )}

      {asksPreSessionMass && (
        <BodyMassForm
          profile={profile}
          idPrefix="body-mass-pre-session"
          quantity={c('quantity.preSessionBodyMass')}
          role="pre"
          referenceKg={latestMassKg}
          submitLabel={c('button.logBodyMass')}
          onSubmit={(massKg) => logWeighIn(massKg, 'pre')}
        />
      )}

      {!completed && (
        <button type="button" onClick={onFinish}>
          {c('button.finishSession')}
        </button>
      )}
      {finishQuestion && !completed && (
        <div className="finish-question">
          <p role="alert">
            {FORMAT.withSlots(
              'advice.finishShort',
              { logged: todaysSets.length, prescribed: prescribedSets }, // [sets]
              overrides,
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setFinishQuestion(false);
              finishNow();
            }}
          >
            {c('button.finishAnyway')}
          </button>
          <button
            type="button"
            onClick={() => {
              setFinishQuestion(false);
            }}
          >
            {c('button.cancel')}
          </button>
        </div>
      )}

      {completed && profile.hydration.weighInOptIn && (
        <div className="post-session">
          <BodyMassForm
            profile={profile}
            idPrefix="body-mass-post-session"
            quantity={c('quantity.postSessionBodyMass')}
            role="post"
            referenceKg={preSessionMassKg} // [kg] this session's own starting mass, or null
            submitLabel={c('button.logBodyMass')}
            onSubmit={(massKg) => {
              if (!logWeighIn(massKg, 'post')) return false;
              // Sign convention: bodyMassLossFraction is POSITIVE for a loss (Sawka 2007, > 2 %).
              setFluidLossPct(
                preSessionMassKg !== null && exceedsDehydrationThreshold(preSessionMassKg, massKg)
                  ? (bodyMassLossFraction(preSessionMassKg, massKg) * PERCENT).toFixed(1) // [%]
                  : null,
              );
              return true;
            }}
          />
          {fluidLossPct !== null && (
            <>
              <p className="fcm-caution" role="alert">
                {c('advice.fluidLoss')}
              </p>
              <details className="fcm-why">
                <summary>{c('disclosure.why')}</summary>
                <p>{FORMAT.fluidLossWhy(fluidLossPct, DEHYDRATION_LOSS_FRACTION * PERCENT, overrides)}</p>
              </details>
            </>
          )}
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
      {replacing !== undefined &&
        canReplace(replacing) &&
        replacingOriginal !== undefined &&
        replacingCurrent !== undefined && (
          <ReplaceSheet
            t={c}
            overrides={overrides}
            name={replacingCurrent.name}
            choices={replaceChoices({
              original: replacingOriginal,
              current: replacingCurrent,
              access: profile.equipment,
              inventory,
              library: libraryList,
              inUse,
            })}
            onPick={(exerciseId) => replaceWith(replacing, exerciseId)}
            onClose={closeReplace}
          />
        )}
      {/* C05: docked above the tab bar (train.css); last in reading order. */}
      <RestTimerPanel />
    </div>
  );
}

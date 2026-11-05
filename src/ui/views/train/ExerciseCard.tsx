// src/ui/views/train/ExerciseCard.tsx
//
// One exercise of the open session: its prescription, the load the engine suggests, the
// arithmetic behind that suggestion (behind a why? disclosure, copy contract R9), the rows the
// user logs into, and the two reference controls.
//
// Units: every load is canonical kg here and is formatted for display only at the boundary,
// by src/domain/units.ts. Rest is seconds. Instants are epoch ms UTC.
import { Fragment, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { copy, FORMAT, type CopyKey } from '../../../content/copy';
import { FORM_CUES } from '../../../content/formCues';
import { coachLine, type CoachLine } from '../../../domain/training/coach';
import { progressionHistory, suggestedProgression, type ProgressionAdvice } from '../../../domain/training/progression';
import { defaultRestS, startRest } from '../../../domain/training/restTimer';
import type {
  Exercise,
  Kg,
  LocalDate,
  LoggedSet,
  PlanBlock,
  PlannedExercise,
  Profile,
} from '../../../domain/types';
import { formatLoad } from '../../../domain/units';
import { useAppStore, type LogSetResult } from '../../../store';
import { useExerciseHistory, useProgressionContext } from '../../../store/selectors';
import { unlockAudio } from '../../audio/chime';
import { useFormCuesModal } from '../../components/FormCuesModal';
import { useVideoModal } from '../../components/VideoModal';
import { formatPrescription } from '../../format/plan';
import { BurnWord } from '../../effects/BurnWord';
import { coachBurns, praiseWordOf, splitAround } from '../../effects/burnMoments';
import { SetRow, type SetEntry } from './SetRow';
import '../../styles/train.css';

/** One label per ProgressionAdvice.kind. Exhaustive by type, so a fifth kind fails to compile. */
const ADVICE_KEY: Record<ProgressionAdvice['kind'], CopyKey> = {
  hold: 'status.adviceHold',
  'add-load': 'status.adviceAddLoad',
  'extend-reps': 'status.adviceExtendReps',
  deload: 'status.adviceDeload',
};

export interface ExerciseCardProps {
  /**
   * The active skin's copy lookup, read once by TrainView and forwarded to every SetRow below.
   *
   * A card is mounted once per planned and bonus exercise, and each card mounts one row per
   * prescribed set, so the hook is read at the view and threaded rather than called at each of
   * the ~48 leaves (see SetRowProps.t).
   */
  t: (key: CopyKey) => string;
  /**
   * The active skin's override table, read once by the view beside `t` and threaded the same
   * way. Three of this card's frames read a copy key since P8 close-out B (`setsBy`,
   * `lastSessionSets`, `suggestedLoad`) and the rows below read a fourth (`setCounter`), so a
   * card that took only the lookup would render four clinical strings inside a skinned screen.
   */
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
  profile: Profile;
  exercise: Exercise;
  planned: PlannedExercise;
  block: PlanBlock;
  library: Record<string, Exercise>;
  assignmentDate: LocalDate;
  sessionId: string;
  isBonusExercise: boolean;
  isOpen: boolean;
  onToggle: () => void;
  /**
   * Reports one logged set to the view that owns the toast queue.
   *
   * `specimen` is the `SpecimenCard.id` the store ACQUIRED on this log, or null. It is carried
   * here rather than looked up by the view because only `logSet` can answer it: asking the draw
   * again returns the card an already-spent ordinal recorded, so a delete and relog announced a
   * drop that never happened (code review).
   */
  onCoach: (line: CoachLine, specimen: string | null) => void;
  onDeleted: () => void;
  /** Audit C10: the session is finished; only logged rows show and nothing new can be logged. */
  readOnly?: boolean;
  /** Audit C10: a finished session opened for a forgotten set: logs are allowed and start no rest. */
  amending?: boolean;
  /**
   * One line under the name saying what the session did to this card (ROADMAP L2): the planned
   * exercise a swap replaced, or that this card was swapped out. Null when nothing was.
   */
  tag?: string | null;
  /** The session-edit controls (SessionEditBar), rendered at the bottom of the open card. */
  children?: ReactNode;
  /**
   * Opens the Replace sheet (owner request: replace when you start the exercise). TrainView
   * passes it only for a planned slot, not skipped, with no set logged on it today; absent, the
   * header carries no Replace button. Beside the toggle, never inside it: a button in a button is
   * invalid and would toggle the card on the same tap.
   */
  onReplace?: (() => void) | undefined;
}

/**
 * [sets] The sets a card prescribes: the plan's floor scaled by the block's set modifier (a
 * deload cuts volume, master plan section 6.5), floored at 1 so a block never prescribes no work.
 * Shared with TrainView's Finish question (audit C12, rule 2).
 */
export function targetSetsFor(planned: PlannedExercise, block: PlanBlock): number {
  return Math.max(1, Math.round(planned.setsLo * block.setModifier));
}

export function ExerciseCard(props: ExerciseCardProps): ReactElement {
  const {
    t,
    overrides,
    profile,
    exercise,
    planned,
    block,
    library,
    assignmentDate,
    sessionId,
    isBonusExercise,
    isOpen,
    onToggle,
    onCoach,
    onDeleted,
    readOnly = false,
    amending = false,
    tag = null,
    children,
    onReplace,
  } = props;

  const history = useExerciseHistory(exercise.id);
  const video = useVideoModal();
  const cues = useFormCuesModal();
  const hasCues = exercise.formCueId !== null && FORM_CUES[exercise.formCueId] !== undefined;
  const [bonusRows, setBonusRows] = useState(0);
  /** Brief 4.2: the set the user tapped to make active; null = the first unlogged set. */
  const [chosenN, setChosenN] = useState<number | null>(null);
  /** C08: the coach line for the set just logged on this card, shown under that set. */
  // `burns` (AM-4a-9): a PR or a set finished well; `at` keys the burn to this log, once.
  const [coach, setCoach] = useState<{ n: number; line: CoachLine; burns: boolean; at: number } | null>(null);

  // Today's own sets never feed the suggestion: the rule advances only after a COMPLETED
  // session (code review A22), so a set logged an hour ago must not move the suggestion the
  // next row is prefilled with.
  const priorHistory = useMemo(
    () => history.filter((s) => s.assignmentDate !== assignmentDate),
    [history, assignmentDate],
  );
  const todaysSets = useMemo(
    () => history.filter((s) => s.assignmentDate === assignmentDate),
    [history, assignmentDate],
  );

  // ROADMAP R4: a swap day logged at another slot's range stays in the history above (and in
  // records and the Log) but does not decide this exercise's own-slot progression.
  const { assignments, plans, currentPlan } = useProgressionContext();
  const progressionSets = useMemo(
    () => progressionHistory(priorHistory, planned, exercise.id, assignments, plans, currentPlan, library),
    [priorHistory, planned, exercise.id, assignments, plans, currentPlan, library],
  );
  const advice = useMemo(
    () => suggestedProgression(progressionSets, planned, exercise, profile, block),
    [progressionSets, planned, exercise, profile, block],
  );

  // Audit C13: the engine quantises its suggestion once, onto the equipment grid, and its reason
  // line quotes the same number; quantising again here could only make the two disagree.
  const suggestedKg: Kg | null = advice.loadKg; // [kg] on the grid, or null

  const lastDate = priorHistory.at(-1)?.assignmentDate ?? null;
  const lastSession = useMemo(
    () => (lastDate === null ? [] : priorHistory.filter((s) => s.assignmentDate === lastDate)),
    [priorHistory, lastDate],
  );

  // The deload block's volume cut is applied HERE, by the caller of the engine, exactly as
  // master plan section 6.5 specifies: the engine reports "deload" and holds the load, and the
  // set count is what the block modifies. Floored at 1, so a block can never prescribe no work.
  const targetSets = targetSetsFor(planned, block); // [sets]
  // Spec R4: what a new set's load is compared against. The latest loaded set of this exercise
  // today, else the suggestion; null when there is neither. [kg]
  const latestToday = todaysSets.reduce<LoggedSet | null>(
    (best, s) =>
      s.loadKg !== null && s.loadKg > 0 && (best === null || s.setNumber > best.setNumber) ? s : best,
    null,
  );
  const referenceKg: Kg | null = latestToday?.loadKg ?? suggestedKg;
  // Audit C09: the next row opens with the count of the latest set today, else the top of the rep
  // range (or the target seconds); nothing for AMRAP or no prescription. [repetitions] or [s]
  const latestSetToday = todaysSets.reduce<LoggedSet | null>(
    (best, s) => (best === null || s.setNumber > best.setNumber ? s : best),
    null,
  );
  const prefillCount: number | null =
    latestSetToday !== null
      ? (latestSetToday.durationS ?? latestSetToday.reps)
      : planned.prescription.kind === 'reps'
        ? planned.prescription.hi
        : planned.prescription.kind === 'time' || planned.prescription.kind === 'duration'
          ? planned.prescription.targetS
          : null;
  const maxLoggedNumber = todaysSets.reduce((m, s) => Math.max(m, s.setNumber), 0);
  const rowCount = Math.max(targetSets, maxLoggedNumber) + bonusRows;
  // Brief 4.2: ONE active row per card: the tapped set if it is still unlogged, else the first
  // unlogged one. [sets], 1-based.
  const isLogged = (n: number): boolean => todaysSets.some((s) => s.setNumber === n);
  const firstOpen = Array.from({ length: rowCount }, (_, i) => i + 1).find((n) => !isLogged(n)) ?? null;
  const activeN = chosenN !== null && chosenN <= rowCount && !isLogged(chosenN) ? chosenN : firstOpen;
  // The most recently logged set of this card: the only one that offers the effort taps.
  const latestId =
    todaysSets.reduce<LoggedSet | null>((a, s) => (a === null || s.loggedAt > a.loggedAt ? s : a), null)?.id ??
    null;

  // restS 0 in the plan means "use the cited default for this exercise and rep range".
  const restS = planned.restS > 0 ? planned.restS : defaultRestS(planned, library); // [s]

  /** Returns false when the store refused the set (AM-12); the row then shows the refusal. */
  const handleLog = (n: number, loadKg: Kg, entry: SetEntry): boolean => {
    // C07: every Log tap is a gesture; it wakes an iOS context a lock or an app switch
    // interrupted, so the rest this log starts can chime at its end. Sounds off: left alone.
    if (useAppStore.getState().ui.sounds) void unlockAudio();
    const set: Omit<LoggedSet, 'id' | 'loggedAt'> = {
      profileId: profile.id,
      assignmentDate,
      sessionId,
      exerciseId: exercise.id,
      setNumber: n,
      // A set beyond the prescribed count, or against an exercise added to the session, is
      // extra work by definition and must not decide whether the prescription was met.
      isBonus: isBonusExercise || n > targetSets,
      loadKg, // [kg] canonical
      enteredUnit: profile.units,
      // Exactly one of these carries the measurement, decided by the prescription in SetRow:
      // repetitions for a rep or AMRAP prescription, seconds for a time or duration one.
      reps: entry.reps, // [repetitions] or null
      durationS: entry.durationS, // [s] or null
      // [RPE] Recorded after the log by one optional tap on the row (ROADMAP L8, onEffort below),
      // so the rest timer starts here at once and never waits for an effort answer.
      rpe: null,
    };
    const now = Date.now(); // [ms] epoch UTC
    // Through getState(): the store's actions are created once and never replace themselves,
    // so subscribing to one buys nothing and hands the component an unbound method.
    let result: LogSetResult;
    try {
      result = useAppStore.getState().logSet(set, now, { allowFinished: amending });
    } catch {
      /*
       * C03/C10, AM-12: the store refused (that slot is already logged, or the session was
       * closed in another window) and wrote nothing. A click handler: a throw would escape every
       * boundary, so the refusal goes to the row's own error line instead.
       */
      return false;
    }
    const { id, specimen } = result;
    // The coach line is computed against the history BEFORE this set, which is what makes a
    // personal best a comparison rather than a tautology.
    const line = coachLine({ ...set, id, loggedAt: now }, history, advice, profile.units);
    // C08: inline under this set; the view still hears it for milestones and specimens.
    // AM-4a-9: a personal record, or the prescribed reps at the prescribed load, burns its word.
    setCoach({ n, line, burns: coachBurns(line, { loadKg: set.loadKg, prescribedKg: advice.loadKg }), at: now });
    onCoach(line, specimen);
    // C10: a forgotten set added after Finish starts no rest.
    if (!amending) {
      // [sets] This set's place in the lifting day, read after logSet so it counts itself. It
      // seeds the rest game (ROADMAP F1), which rides on the timer and never changes `restS`.
      const sessionSetOrdinal = Object.values(useAppStore.getState().sets).filter(
        (s) => s.profileId === profile.id && s.assignmentDate === assignmentDate,
      ).length;
      useAppStore.getState().setRestTimer(
        startRest(restS, now, {
          exerciseId: exercise.id,
          sessionId,
          assignmentDate,
          setNumber: n, // [sets]
          sessionSetOrdinal,
        }),
      );
    }
    return true;
  };

  const domIdPrefix = `ex-${exercise.id}`;
  const title = isBonusExercise ? FORMAT.bonusExerciseName(exercise.name) : exercise.name;

  return (
    <div className={isOpen ? 'ex-card open' : 'ex-card'}>
      <div className={onReplace === undefined ? 'ex-head-row' : 'ex-head-row has-action'}>
        <button type="button" className="ex-head" onClick={onToggle} aria-expanded={isOpen}>
          <span className="ex-title">
            {title}
            {tag !== null && <span className="ex-tag">{tag}</span>}
          </span>
          <span className="ex-sub">
            {FORMAT.setsBy(
              String(targetSets),
              formatPrescription(planned.prescription),
              overrides,
            )}
          </span>
          <span className="ex-prog">{FORMAT.exerciseProgress(todaysSets.length, targetSets)}</span>
        </button>
        {onReplace !== undefined && (
          <button
            type="button"
            className="ex-replace"
            // "Replace Cable triceps pushdown": the visible word starts the name (WCAG 2.5.3), and
            // several cards' Replace buttons stay distinguishable to a screen reader.
            aria-label={FORMAT.withSlots('label.replaceTitle', { name: exercise.name }, overrides)}
            onClick={onReplace}
          >
            {t('button.replaceExercise')}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="ex-body">
          <div className="ex-prev">
            {lastSession.length > 0 && (
              <span>
                {FORMAT.lastSessionSets(
                  lastDate ?? '',
                  formatLoad(lastSession[0]?.loadKg ?? null, profile.units),
                  lastSession.map((s) => String(s.reps ?? 0)).join(', '),
                  overrides,
                )}
              </span>
            )}
            {/*
              * Two lines, not one frame with an empty slot. `suggestedKg` is null wherever the
              * engine can suggest no load: a bodyweight exercise, a prescription with no rep
              * range and nothing logged, a deload block with nothing logged, and any exercise
              * with no history. `formatLoad(null, units)` is the em dash NO_VALUE, and copy
              * contract R5 retains that dash as a WHOLE CELL ("a placeholder, not a
              * connector"), which "Suggested —: Hold load" is not. The absence therefore reads
              * its own key, which carries no slot for a dash to sit in.
              *
              * The advice KIND is dropped with the frame rather than moved: `advice.reason`,
              * rendered immediately below, is the engine's own sentence for the same fact
              * ("Bodyweight lift: add repetitions, not load."), and the arithmetic behind it is
              * in the why? disclosure beside it. In the one branch where that line is
              * suppressed — a deload block, where TrainView's header has already said it once —
              * the disclosure still carries it.
              */}
            <span className="ex-suggested">
              {suggestedKg === null
                ? t('label.noSuggestedLoad')
                : FORMAT.suggestedLoad(
                    formatLoad(suggestedKg, profile.units),
                    t(ADVICE_KEY[advice.kind]),
                    overrides,
                  )}
            </span>
          </div>

          <div className="set-list">
            {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => {
              const logged = todaysSets.find((s) => s.setNumber === n) ?? null;
              if (readOnly && logged === null) return null; // C10: a finished day shows what was done
              return (
                <Fragment key={n}>
                <SetRow
                  mode={n === activeN ? 'active' : 'pending'}
                  onActivate={() => {
                    setChosenN(n);
                  }}
                  showEffort={logged !== null && logged.id === latestId}
                  t={t}
                  overrides={overrides}
                  domIdPrefix={domIdPrefix}
                  n={n}
                  targetSets={targetSets}
                  isBonus={n > targetSets}
                  units={profile.units}
                  prescription={planned.prescription}
                  suggestedKg={suggestedKg}
                  logged={logged}
                  isBodyweightExercise={exercise.isBodyweight}
                  referenceKg={referenceKg}
                  prefillKg={referenceKg} // [kg] C09: the latest load today, else the suggestion
                  prefillCount={prefillCount}
                  onLog={(loadKg, entry) => handleLog(n, loadKg, entry)}
                  onEdit={(loadKg, entry, rpe) => {
                    if (logged === null) return false;
                    /*
                     * ROADMAP L1. A click handler: React does not catch a throw from one, so
                     * the store's refusal (a set deleted in another tab, a value the schema
                     * refuses) is turned into the row's own message rather than escaping to
                     * the window. No rest timer, no coach line: an edit is not a new set.
                     */
                    try {
                      useAppStore.getState().updateSet(logged.id, {
                        loadKg, // [kg] canonical
                        reps: entry.reps, // [repetitions] or null
                        durationS: entry.durationS, // [s] or null
                        enteredUnit: profile.units,
                        rpe, // [RPE] or null (L8)
                      });
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                  onEffort={(rpe) => {
                    if (logged === null) return false;
                    /*
                     * ROADMAP L8, the one tap. The same store action as an edit, carrying the
                     * record's own measurement back unchanged, so only the effort moves. A
                     * document write only: the rest timer the log started keeps running.
                     */
                    try {
                      useAppStore.getState().updateSet(logged.id, {
                        loadKg: logged.loadKg, // [kg] as stored
                        reps: logged.reps, // [repetitions] as stored
                        durationS: logged.durationS, // [s] as stored
                        enteredUnit: logged.enteredUnit,
                        rpe, // [RPE]
                      });
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                  onDelete={() => {
                    if (logged === null) return;
                    useAppStore.getState().deleteSet(logged.id);
                    onDeleted();
                  }}
                />
                  {coach !== null && coach.n === n && logged !== null && (
                    <p className="set-coach" role="status">
                      <CoachSentence key={coach.at} line={coach.line} burns={coach.burns} overrides={overrides} />
                    </p>
                  )}
                </Fragment>
              );
            })}
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                // The user asked for this row: it becomes the active one.
                setChosenN(rowCount + 1);
                setBonusRows((b) => b + 1);
              }}
            >
              {t('button.addSet')}
            </button>
          )}
          {/*
            * The advice line, except in a deload block, where the engine returns the same
            * sentence for every exercise and TrainView's header has already stated it once.
            * The same sentence twice on one screen is noise; the block's arithmetic is still
            * in the disclosure below.
            */}
          {advice.kind !== 'deload' && <p className="ex-reason">{advice.reason}</p>}
          {/* R9: the percentage, the plate rounding and the set tally live behind here. */}
          <details className="ex-why">
            <summary>{t('disclosure.why')}</summary>
            <p>{advice.why}</p>
          </details>

          <div className="ex-links">
            {/*
              * L9: shown when there is a clip, or cues the modal can show in its place with an
              * honest "no clip" line. A custom exercise has neither and gets no dead control.
              */}
            {(exercise.videoId !== null || hasCues) && (
              <button
                type="button"
                onClick={() => {
                  video.open({ videoId: exercise.videoId, cueId: exercise.formCueId, title: exercise.name });
                }}
              >
                {t('button.formReference')}
              </button>
            )}
            {hasCues && (
              <button
                type="button"
                onClick={() => {
                  cues.open({ exerciseId: exercise.formCueId ?? '', title: exercise.name });
                }}
              >
                {t('button.formCues')}
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The coach line, with its praise word burning once when the set earned it (AM-4a-9). The word
 * is cut out of the line's own template (burnMoments.praiseWordOf), so no wording is added and
 * a numeral never burns; a template without one renders the plain sentence.
 */
function CoachSentence(props: {
  line: CoachLine;
  burns: boolean;
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
}): ReactElement {
  const { line, burns, overrides } = props;
  const text = FORMAT.withSlots(line.key, line.params, overrides);
  const word = burns ? praiseWordOf(copy(line.key, overrides)) : null;
  const parts = word === null ? null : splitAround(text, word);
  if (parts === null) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <BurnWord text={parts[1]} />
      {parts[2]}
    </>
  );
}

// src/ui/views/train/ExerciseCard.tsx
//
// One exercise of the open session: its prescription, the load the engine suggests, the
// arithmetic behind that suggestion (behind a why? disclosure, copy contract R9), the rows the
// user logs into, and the two reference controls.
//
// Units: every load is canonical kg here and is formatted for display only at the boundary,
// by src/domain/units.ts. Rest is seconds. Instants are epoch ms UTC.
import { useMemo, useState, type ReactElement } from 'react';
import { FORMAT, copy, type CopyKey } from '../../../content/copy';
import { FORM_CUES } from '../../../content/formCues';
import { coachLine, type CoachLine } from '../../../domain/training/coach';
import { suggestedProgression, type ProgressionAdvice } from '../../../domain/training/progression';
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
import { achievableLoad, formatLoad, stepFor } from '../../../domain/units';
import { useAppStore } from '../../../store';
import { useExerciseHistory } from '../../../store/selectors';
import { useFormCuesModal } from '../../components/FormCuesModal';
import { useVideoModal } from '../../components/VideoModal';
import { formatPrescription } from '../../format/plan';
import { SetRow } from './SetRow';
import '../../styles/train.css';

/** One label per ProgressionAdvice.kind. Exhaustive by type, so a fifth kind fails to compile. */
const ADVICE_KEY: Record<ProgressionAdvice['kind'], CopyKey> = {
  hold: 'status.adviceHold',
  'add-load': 'status.adviceAddLoad',
  'extend-reps': 'status.adviceExtendReps',
  deload: 'status.adviceDeload',
};

export interface ExerciseCardProps {
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
  onCoach: (line: CoachLine) => void;
  onDeleted: () => void;
}

export function ExerciseCard(props: ExerciseCardProps): ReactElement {
  const {
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
  } = props;

  const history = useExerciseHistory(exercise.id);
  const video = useVideoModal();
  const cues = useFormCuesModal();
  const [bonusRows, setBonusRows] = useState(0);

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

  const advice = useMemo(
    () => suggestedProgression(priorHistory, planned, exercise, profile, block),
    [priorHistory, planned, exercise, profile, block],
  );

  const stepKg = stepFor(exercise, profile.equipmentSteps); // [kg]
  // Only a SUGGESTED load is quantised, and it rounds down (master plan section 3): a
  // suggestion the user cannot assemble is worse than one slightly under.
  const suggestedKg: Kg | null =
    advice.loadKg === null
      ? null
      : stepKg > 0
        ? achievableLoad(advice.loadKg, stepKg)
        : advice.loadKg; // [kg]

  const lastDate = priorHistory.at(-1)?.assignmentDate ?? null;
  const lastSession = useMemo(
    () => (lastDate === null ? [] : priorHistory.filter((s) => s.assignmentDate === lastDate)),
    [priorHistory, lastDate],
  );

  // The deload block's volume cut is applied HERE, by the caller of the engine, exactly as
  // master plan section 6.5 specifies: the engine reports "deload" and holds the load, and the
  // set count is what the block modifies. Floored at 1, so a block can never prescribe no work.
  const targetSets = Math.max(1, Math.round(planned.setsLo * block.setModifier)); // [sets]
  const maxLoggedNumber = todaysSets.reduce((m, s) => Math.max(m, s.setNumber), 0);
  const rowCount = Math.max(targetSets, maxLoggedNumber) + bonusRows;

  // restS 0 in the plan means "use the cited default for this exercise and rep range".
  const restS = planned.restS > 0 ? planned.restS : defaultRestS(planned, library); // [s]

  const handleLog = (n: number, loadKg: Kg, reps: number): void => {
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
      reps, // [repetitions]
      durationS: null, // [s] P4 offers no timed-set control; see the plan's omissions
      rpe: null, // P4 writes null; no RPE control is in scope
    };
    const now = Date.now(); // [ms] epoch UTC
    // Through getState(): the store's actions are created once and never replace themselves,
    // so subscribing to one buys nothing and hands the component an unbound method.
    const id = useAppStore.getState().logSet(set, now);
    // The coach line is computed against the history BEFORE this set, which is what makes a
    // personal best a comparison rather than a tautology.
    onCoach(coachLine({ ...set, id, loggedAt: now }, history, advice, profile.units));
    useAppStore.getState().setRestTimer(startRest(restS, now));
  };

  const domIdPrefix = `ex-${exercise.id}`;
  const title = isBonusExercise ? FORMAT.bonusExerciseName(exercise.name) : exercise.name;

  return (
    <div className={isOpen ? 'ex-card open' : 'ex-card'}>
      <button type="button" className="ex-head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="ex-title">{title}</span>
        <span className="ex-sub">
          {FORMAT.setsBy(String(targetSets), formatPrescription(planned.prescription))}
        </span>
        <span className="ex-prog">{FORMAT.exerciseProgress(todaysSets.length, targetSets)}</span>
      </button>

      {isOpen && (
        <div className="ex-body">
          <div className="ex-prev">
            {lastSession.length > 0 && (
              <span>
                {FORMAT.lastSessionSets(
                  lastDate ?? '',
                  formatLoad(lastSession[0]?.loadKg ?? null, profile.units),
                  lastSession.map((s) => String(s.reps ?? 0)).join(', '),
                )}
              </span>
            )}
            <span className="ex-suggested">
              {FORMAT.suggestedLoad(
                formatLoad(suggestedKg, profile.units),
                copy(ADVICE_KEY[advice.kind]),
              )}
            </span>
          </div>

          {/*
            * The advice line, except in a deload block, where the engine returns the same
            * sentence for every exercise and TrainView's header has already stated it once.
            * The same sentence twice on one screen is noise; the block's arithmetic is still
            * in the disclosure below.
            */}
          {advice.kind !== 'deload' && <p className="ex-reason">{advice.reason}</p>}
          {/* R9: the percentage, the plate rounding and the set tally live behind here. */}
          <details className="ex-why">
            <summary>{copy('disclosure.why')}</summary>
            <p>{advice.why}</p>
          </details>

          <div className="ex-links">
            {exercise.videoQuery !== null && (
              <button
                type="button"
                onClick={() => {
                  video.open({ query: exercise.videoQuery, title: exercise.name });
                }}
              >
                {copy('button.formReference')}
              </button>
            )}
            {exercise.formCueId !== null && FORM_CUES[exercise.formCueId] !== undefined && (
              <button
                type="button"
                onClick={() => {
                  cues.open({ exerciseId: exercise.formCueId ?? '', title: exercise.name });
                }}
              >
                {copy('button.formCues')}
              </button>
            )}
          </div>

          <div className="set-list">
            {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => {
              const logged = todaysSets.find((s) => s.setNumber === n) ?? null;
              return (
                <SetRow
                  key={n}
                  domIdPrefix={domIdPrefix}
                  n={n}
                  targetSets={targetSets}
                  isBonus={n > targetSets}
                  units={profile.units}
                  suggestedKg={suggestedKg}
                  logged={logged}
                  isBodyweightExercise={exercise.isBodyweight}
                  onLog={(loadKg, reps) => {
                    handleLog(n, loadKg, reps);
                  }}
                  onDelete={() => {
                    if (logged === null) return;
                    useAppStore.getState().deleteSet(logged.id);
                    onDeleted();
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setBonusRows((b) => b + 1);
            }}
          >
            {copy('button.addSet')}
          </button>
        </div>
      )}
    </div>
  );
}

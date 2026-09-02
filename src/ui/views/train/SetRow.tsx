// src/ui/views/train/SetRow.tsx
//
// One row of one exercise card: either the entry controls for a set not yet logged, or the
// readout of one that is.
//
// Units: `loadKg` is canonical kg everywhere in this file. The text field holds the value in
// the DISPLAY unit exactly as typed, and is converted once, at submit, by storedLoadKg. Holding
// a number instead would make "6." and "0.0" unenterable, and rounding on every keystroke would
// put a display-unit rounding between what the user typed and what is stored.
//
// What the row collects is decided by the PRESCRIPTION (P4 polish item 1). A `time` or
// `duration` prescription collects seconds and stores `durationS` with `reps` null; everything
// else collects repetitions and stores `reps` with `durationS` null. LoggedSet carries both
// fields precisely so the two are distinguishable, and a 45 s plank logged through the reps
// field is recorded as "45 repetitions": the coach's rep-range rungs and the progression
// engine's top-of-range test then judge a hold as if it were a set of 45.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { FORMAT, copy } from '../../../content/copy';
import type { Kg, LoggedSet, Prescription, Seconds, UnitSystem } from '../../../domain/types';
import { displayLoad, formatLoad } from '../../../domain/units';
import { UnitInput, loadUnit, storedLoadKg } from '../../components/UnitInput';
import { NO_VALUE, SECONDS_UNIT } from '../../format/plan';
import '../../styles/train.css';

/**
 * What one submitted row measured: repetitions or a held duration, never both and never
 * neither. A union rather than two nullable fields, so a caller cannot construct the two
 * states LoggedSet's schema would then have to refuse.
 */
export type SetEntry =
  | { reps: number; durationS: null } // [repetitions]
  | { reps: null; durationS: Seconds }; // [s]

/** True when this prescription is executed for time rather than for repetitions. */
export function isTimedPrescription(p: Prescription): boolean {
  return p.kind === 'time' || p.kind === 'duration';
}

/**
 * [s] Ceiling on a logged hold, matching the schema's own one-day sanity bound. Refused HERE
 * with a message rather than left to the store, whose refusal is a throw that would take the
 * session view to the error boundary over a mistyped field.
 */
const MAX_DURATION_S = 86_400;

export interface SetRowProps {
  /** Unique per exercise card, so two open cards cannot mint the same DOM id. */
  domIdPrefix: string;
  n: number;
  targetSets: number;
  isBonus: boolean;
  units: UnitSystem;
  /** What the exercise prescribes; decides whether this row collects reps or seconds. */
  prescription: Prescription;
  /** [kg] the load the engine suggests; prefills an empty row. null when it can suggest none. */
  suggestedKg: Kg | null;
  logged: LoggedSet | null;
  isBodyweightExercise: boolean;
  onLog: (loadKg: Kg, entry: SetEntry) => void;
  onDelete: () => void;
}

/** The suggested load as the user would type it, or '' when there is nothing to suggest. */
function prefill(suggestedKg: Kg | null, units: UnitSystem): string {
  if (suggestedKg === null) return '';
  return String(displayLoad(suggestedKg, units)); // [lb] or [kg]
}

export function SetRow(props: SetRowProps): ReactElement {
  const {
    domIdPrefix,
    n,
    targetSets,
    isBonus,
    units,
    prescription,
    suggestedKg,
    logged,
    isBodyweightExercise,
    onLog,
    onDelete,
  } = props;

  const timed = isTimedPrescription(prescription);
  const [loadText, setLoadText] = useState(() => prefill(suggestedKg, units));
  // One field holds whichever count this row collects; only one of the two is ever rendered,
  // so a single piece of state cannot leave a stale value behind the other.
  const [countText, setCountText] = useState('');
  const [countError, setCountError] = useState<string | null>(null);
  const [bodyweight, setBodyweight] = useState(isBodyweightExercise);
  const countRef = useRef<HTMLInputElement | null>(null);

  // The suggestion is a function of history, so it changes when a previous session is edited.
  // The prefill follows it only while the user has not typed: overwriting an entry in progress
  // would discard what they were in the middle of logging.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setLoadText(prefill(suggestedKg, units));
  }, [suggestedKg, units]);

  const submit = (): void => {
    // Whole units in both modes: repetitions are counted and the model stores seconds as a
    // whole number, so "45.7" is read as 45 exactly as "8.5" reps has always been read as 8.
    const count = Number.parseInt(countText, 10); // [repetitions] or [s]
    if (!Number.isFinite(count) || count <= 0 || (timed && count > MAX_DURATION_S)) {
      // The timed field says what it wants, wired to the control by UnitInput's own
      // aria-describedby / aria-invalid pair. The repetition field keeps its silent refusal:
      // changing it is outside this pass, and a message there would be a second contract.
      if (timed) setCountError(copy('advice.durationNeeded'));
      return;
    }
    // A bodyweight set stores 0, never null and never a dropped falsy value (master plan
    // section 8, code review A60): 0 kg is a real load, "not recorded" is a different fact.
    const loadKg = bodyweight ? 0 : storedLoadKg(loadText, units); // [kg]
    if (loadKg === null || loadKg < 0) return;
    onLog(loadKg, timed ? { reps: null, durationS: count } : { reps: count, durationS: null });
    setCountText('');
    setCountError(null);
    touched.current = false;
    countRef.current?.blur();
  };

  const marker = isBonus ? copy('label.bonusSet') : FORMAT.setCounter(n, targetSets);

  if (logged !== null) {
    return (
      <div className="set-row done">
        <span className="set-marker">{marker}</span>
        <span className="set-done-value">
          {logged.durationS === null
            ? FORMAT.loggedSet(
                formatLoad(logged.loadKg, units),
                logged.reps === null ? NO_VALUE : String(logged.reps),
              )
            : FORMAT.loggedTimedSet(formatLoad(logged.loadKg, units), logged.durationS)}
        </span>
        <button type="button" onClick={onDelete} aria-label={FORMAT.deleteSetLabel(n)}>
          {copy('button.deleteSet')}
        </button>
      </div>
    );
  }

  return (
    <div className={isBonus ? 'set-row bonus' : 'set-row'}>
      <span className="set-marker">{marker}</span>
      <div
        onKeyDown={(e) => {
          // Enter walks the row: load -> count -> submit, where the count is repetitions or
          // seconds depending on the prescription. The handler sits on the wrapper because
          // UnitInput owns its own input element and exposes no key handler.
          if (e.key !== 'Enter') return;
          e.preventDefault();
          countRef.current?.focus();
        }}
      >
        <UnitInput
          id={`${domIdPrefix}-set-${n}-load`}
          quantity={FORMAT.setLoadQuantity(n)}
          unit={loadUnit(units)}
          value={bodyweight ? '0' : loadText}
          onChange={(next) => {
            touched.current = true;
            setLoadText(next);
          }}
          error={null}
          disabled={bodyweight}
        />
      </div>
      {timed ? (
        <div
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
        >
          <UnitInput
            id={`${domIdPrefix}-set-${n}-duration`}
            quantity={FORMAT.setDurationQuantity(n)}
            unit={SECONDS_UNIT}
            inputMode="numeric"
            step="1"
            value={countText}
            onChange={(next) => {
              setCountText(next);
              setCountError(null);
            }}
            error={countError}
            inputRef={countRef}
          />
        </div>
      ) : (
        <div className="unit-input">
          <label htmlFor={`${domIdPrefix}-set-${n}-reps`}>{FORMAT.setRepsQuantity(n)}</label>
          <input
            id={`${domIdPrefix}-set-${n}-reps`}
            ref={countRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={countText}
            onChange={(e) => {
              setCountText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              submit();
            }}
          />
        </div>
      )}
      <div className="set-actions">
        <div className="unit-input">
          <label htmlFor={`${domIdPrefix}-set-${n}-bw`}>{FORMAT.setBodyweightQuantity(n)}</label>
          <input
            id={`${domIdPrefix}-set-${n}-bw`}
            type="checkbox"
            checked={bodyweight}
            onChange={(e) => {
              setBodyweight(e.target.checked);
            }}
          />
        </div>
        <button type="button" onClick={submit} aria-label={FORMAT.logSetLabel(n)}>
          {copy('button.logSet')}
        </button>
      </div>
    </div>
  );
}

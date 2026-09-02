// src/ui/views/train/SetRow.tsx
//
// One row of one exercise card: either the entry controls for a set not yet logged, or the
// readout of one that is.
//
// Units: `loadKg` is canonical kg everywhere in this file. The text field holds the value in
// the DISPLAY unit exactly as typed, and is converted once, at submit, by storedLoadKg. Holding
// a number instead would make "6." and "0.0" unenterable, and rounding on every keystroke would
// put a display-unit rounding between what the user typed and what is stored.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { FORMAT, copy } from '../../../content/copy';
import type { Kg, LoggedSet, UnitSystem } from '../../../domain/types';
import { displayLoad, formatLoad } from '../../../domain/units';
import { UnitInput, loadUnit, storedLoadKg } from '../../components/UnitInput';
import { NO_VALUE } from '../../format/plan';
import '../../styles/train.css';

export interface SetRowProps {
  /** Unique per exercise card, so two open cards cannot mint the same DOM id. */
  domIdPrefix: string;
  n: number;
  targetSets: number;
  isBonus: boolean;
  units: UnitSystem;
  /** [kg] the load the engine suggests; prefills an empty row. null when it can suggest none. */
  suggestedKg: Kg | null;
  logged: LoggedSet | null;
  isBodyweightExercise: boolean;
  onLog: (loadKg: Kg, reps: number) => void;
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
    suggestedKg,
    logged,
    isBodyweightExercise,
    onLog,
    onDelete,
  } = props;

  const [loadText, setLoadText] = useState(() => prefill(suggestedKg, units));
  const [repsText, setRepsText] = useState('');
  const [bodyweight, setBodyweight] = useState(isBodyweightExercise);
  const repsRef = useRef<HTMLInputElement | null>(null);

  // The suggestion is a function of history, so it changes when a previous session is edited.
  // The prefill follows it only while the user has not typed: overwriting an entry in progress
  // would discard what they were in the middle of logging.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setLoadText(prefill(suggestedKg, units));
  }, [suggestedKg, units]);

  const submit = (): void => {
    const reps = Number.parseInt(repsText, 10); // [repetitions]
    if (!Number.isFinite(reps) || reps <= 0) return;
    // A bodyweight set stores 0, never null and never a dropped falsy value (master plan
    // section 8, code review A60): 0 kg is a real load, "not recorded" is a different fact.
    const loadKg = bodyweight ? 0 : storedLoadKg(loadText, units); // [kg]
    if (loadKg === null || loadKg < 0) return;
    onLog(loadKg, reps);
    setRepsText('');
    touched.current = false;
    repsRef.current?.blur();
  };

  const marker = isBonus ? copy('label.bonusSet') : FORMAT.setCounter(n, targetSets);

  if (logged !== null) {
    return (
      <div className="set-row done">
        <span className="set-marker">{marker}</span>
        <span className="set-done-value">
          {FORMAT.loggedSet(
            formatLoad(logged.loadKg, units),
            logged.reps === null ? NO_VALUE : String(logged.reps),
          )}
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
          // Enter walks the row: load -> reps -> submit. The handler sits on the wrapper
          // because UnitInput owns its own input element and exposes no key handler.
          if (e.key !== 'Enter') return;
          e.preventDefault();
          repsRef.current?.focus();
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
      <div className="unit-input">
        <label htmlFor={`${domIdPrefix}-set-${n}-reps`}>{FORMAT.setRepsQuantity(n)}</label>
        <input
          id={`${domIdPrefix}-set-${n}-reps`}
          ref={repsRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={repsText}
          onChange={(e) => {
            setRepsText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
        />
      </div>
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

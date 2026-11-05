// src/ui/measurements/FluidQuickAdd.tsx
//
// Spec R9 / audit G07: a drink can be logged at any time of any day, not only while a nag is on
// screen. One cup (the profile's editable cup size), or a custom volume in the display unit, each
// with a 6 s Undo; the day's progress is drawn against the ONE stored target (G14). The Train
// banner stays a reminder. No volume is prescribed here (src/domain/training/hydration.ts header).
import { useId, useState, type ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { HydrationEntry, LocalDate, ML, Profile } from '../../domain/types';
import { UNIT_LABEL, formatVolume, toStoredVolume } from '../../domain/units';
import { useAppStore } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { AsciiBar } from '../components/AsciiBar';
import { useToasts } from '../components/ToastQueue';
import { UnitInput, parseDecimal } from '../components/UnitInput';
import './measurements.css';

export function FluidQuickAdd(props: { profile: Profile; today: LocalDate }): ReactElement {
  const { profile, today } = props;
  const c = useCopy();
  const overrides = useCopyOverrides();
  const { push } = useToasts();
  const headingId = useId();
  const errorId = useId();
  // The stored entry for the day (stable identity), or null.
  const entry = useAppStore(
    (s): HydrationEntry | null => (s.hydration[profile.id] ?? []).find((e) => e.date === today) ?? null,
  );
  const [text, setText] = useState(''); // as typed, display unit
  const [error, setError] = useState<string | null>(null);
  const loggedML = entry?.volumeML ?? 0; // [mL] today
  const targetML = profile.hydration.dailyTargetML; // [mL/day] the one target (G14)
  const cupML = profile.hydration.cupSizeML; // [mL]

  /** Adds one drink and offers its Undo. False when the store refused it (schema bound). */
  const drink = (volumeML: ML): boolean => {
    const at = Date.now(); // [ms] epoch UTC, the drink's own instant (the Undo removes this mark)
    try {
      useAppStore.getState().addHydration(profile.id, today, volumeML, at);
    } catch {
      return false;
    }
    push({
      kind: 'undo',
      message: c('status.drinkLogged'),
      deadlineAt: at + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        useAppStore.getState().removeDrink(profile.id, today, volumeML, at);
      },
    });
    return true;
  };

  const logCustom = (): void => {
    const entered = parseDecimal(text); // [mL] or [fl oz]
    if (entered === null) {
      setError(c('error.valueRequired'));
      return;
    }
    const volumeML = toStoredVolume(entered, profile.units); // [mL]
    if (!(volumeML > 0)) {
      setError(c('error.positive'));
      return;
    }
    if (!drink(volumeML)) {
      setError(c('error.outsideAccepted'));
      return;
    }
    setError(null);
    setText('');
  };

  return (
    <section className="measurements" aria-labelledby={headingId}>
      <h3 id={headingId}>{c('label.fluid')}</h3>
      <p className="view-progress">
        <AsciiBar value={loggedML} target={targetML} label={c('label.fluidProgress')} testId="fluid-bar" />{' '}
        <span data-testid="fluid-progress">
          {FORMAT.valueOfTarget(formatVolume(loggedML, profile.units), formatVolume(targetML, profile.units))}
        </span>
      </p>
      <div className="mass-form">
        <button
          type="button"
          onClick={() => {
            drink(cupML);
          }}
        >
          {FORMAT.logVolume(formatVolume(cupML, profile.units), overrides)}
        </button>
        <div
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            logCustom();
          }}
        >
          <UnitInput
            id="fluid-custom"
            quantity={c('quantity.drinkVolume')}
            unit={UNIT_LABEL[profile.units].volume}
            value={text}
            error={null}
            sharedErrorId={error === null ? null : errorId}
            onChange={(next) => {
              setText(next);
              setError(null);
            }}
          />
        </div>
        <button type="button" onClick={logCustom}>
          {c('button.logDrink')}
        </button>
        {error !== null && (
          <p className="view-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

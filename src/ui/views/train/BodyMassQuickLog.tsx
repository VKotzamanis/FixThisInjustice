// src/ui/views/train/BodyMassQuickLog.tsx
//
// One body-mass entry, logged from inside a session.
//
// `preSessionMassKg` is now the mass THIS session started from, supplied by the Train view
// from the hydration module's own rule (the latest entry within 6 h before the assignment's
// startedAt), and null when there is none. The view collects it before the first set from a
// profile that opted in to weigh-ins. It used to be Profile.body.baselineMassKg, which is a
// mass from whenever the profile was set up: comparing against it reported the programme's
// mass change rather than the session's fluid loss.
//
// Residual limitation, stated because silence about it reads as completeness: within the 6 h
// window the app still cannot tell a mass taken at the gym door from one taken 5 h earlier,
// and it cannot tell a weigh-in taken clothed from one taken stripped.
import { useState, type ReactElement } from 'react';
import { FORMAT, copy } from '../../../content/copy';
import {
  DEHYDRATION_LOSS_FRACTION,
  bodyMassLossFraction,
  exceedsDehydrationThreshold,
} from '../../../domain/training/hydration';
import type { Kg, LocalDate, Profile } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { UnitInput, massUnit, storedMassKg } from '../../components/UnitInput';
import '../../styles/train.css';

const PERCENT = 100; // [%] per unit fraction

export function BodyMassQuickLog(props: {
  profile: Profile;
  date: LocalDate;
  /** [kg] the mass this session is compared against; null disables the loss check. */
  preSessionMassKg: Kg | null;
  /** DOM id of the field; distinct per instance so two quick logs can be on screen at once. */
  id: string;
  /** The quantity this instance collects: `quantity.bodyMass` or the post-session one. */
  quantity: string;
}): ReactElement {
  const { profile, date, preSessionMassKg, id, quantity } = props;
  const [text, setText] = useState(''); // as typed, in the display unit
  const [flag, setFlag] = useState<string | null>(null);
  const [flagWhy, setFlagWhy] = useState<string | null>(null);

  const submit = (): void => {
    const massKg = storedMassKg(text, profile.units); // [kg] exact at the boundary
    if (massKg === null || massKg <= 0) return;
    // Through getState(): the store's actions are created once and never replace themselves,
    // so subscribing to one buys nothing and hands the component an unbound method.
    useAppStore.getState().logBodyMass(
      { profileId: profile.id, date, massKg, enteredUnit: profile.units, bodyFatPct: null },
      Date.now(), // [ms] epoch UTC
    );
    if (preSessionMassKg !== null && exceedsDehydrationThreshold(preSessionMassKg, massKg)) {
      // Sign convention: bodyMassLossFraction is POSITIVE for a loss.
      const lossPct = (bodyMassLossFraction(preSessionMassKg, massKg) * PERCENT).toFixed(1); // [%]
      setFlag(copy('advice.fluidLoss'));
      setFlagWhy(FORMAT.fluidLossWhy(lossPct, DEHYDRATION_LOSS_FRACTION * PERCENT));
    } else {
      setFlag(null);
      setFlagWhy(null);
    }
    setText('');
  };

  return (
    <div className="mass-quick-log">
      <div
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          submit();
        }}
      >
        <UnitInput
          id={id}
          quantity={quantity}
          unit={massUnit(profile.units)}
          value={text}
          onChange={setText}
          error={null}
        />
      </div>
      <button type="button" onClick={submit}>
        {copy('button.logBodyMass')}
      </button>
      {flag !== null && (
        <p className="fcm-caution" role="alert">
          {flag}
        </p>
      )}
      {flagWhy !== null && (
        <details className="fcm-why">
          <summary>{copy('disclosure.why')}</summary>
          <p>{flagWhy}</p>
        </details>
      )}
    </div>
  );
}

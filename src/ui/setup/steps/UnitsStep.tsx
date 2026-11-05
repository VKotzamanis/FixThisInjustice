// src/ui/setup/steps/UnitsStep.tsx
//
// Step 1. The unit system is chosen FIRST because every later field is labelled in it (master
// plan section 3).
import type { JSX } from 'react';
import { useCopy } from '../../../content/useCopy';
import {
  DEFAULT_BARBELL_STEP,
  DEFAULT_DUMBBELL_STEP,
  DEFAULT_STACK_STEP,
  type SetupAnswers,
  type UnitSystem,
} from '../../../domain/types';
import { convertBodyAnswers } from '../unitSwitch';
import { STEP_TITLE_KEY, StepHeading, type StepProps } from './shared';

/**
 * Audit A04 (plan ruling PR-8): switching unit CONVERTS what was typed (body mass, target mass,
 * girths, stature) into the new unit. The equipment steps are re-seeded in the new unit instead:
 * a converted 2.5 kg step is 5.51 lb, a plate nobody owns. Null when the unit is unchanged.
 */
export function unitSwitchPatch(a: SetupAnswers, units: UnitSystem): Partial<SetupAnswers> | null {
  if (units === a.units) return null;
  return {
    ...convertBodyAnswers(a, units),
    units,
    barbellStep: String(DEFAULT_BARBELL_STEP[units]),
    dumbbellStep: String(DEFAULT_DUMBBELL_STEP[units]),
    stackStep: String(DEFAULT_STACK_STEP[units]),
  };
}

export function UnitsStep({ answers, patch, headingRef }: StepProps): JSX.Element {
  const t = useCopy();
  const setUnits = (units: UnitSystem): void => {
    const next = unitSwitchPatch(answers, units);
    if (next !== null) patch(next);
  };
  return (
    <fieldset>
      <StepHeading title={t(STEP_TITLE_KEY.units)} headingRef={headingRef} />
      <p className="wiz-label">{t('label.units')}</p>
      <label className="wiz-inline">
        <input
          type="radio"
          name="units"
          checked={answers.units === 'metric'}
          onChange={() => {
            setUnits('metric');
          }}
        />
        {t('label.unitsMetric')}
      </label>
      <label className="wiz-inline">
        <input
          type="radio"
          name="units"
          checked={answers.units === 'imperial'}
          onChange={() => {
            setUnits('imperial');
          }}
        />
        {t('label.unitsImperial')}
      </label>
      {/* Below the control, not above it: round 1 claim C1.08.1, stated as a principle. */}
      <p className="wiz-note">{t('advice.unitsOnce')}</p>
    </fieldset>
  );
}

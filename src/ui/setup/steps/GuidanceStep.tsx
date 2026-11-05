// src/ui/setup/steps/GuidanceStep.tsx
//
// Step 6: the guidance screen renders its own sections, so the step heading stands above them
// and takes focus on a step change like every other step's.
import type { JSX } from 'react';
import { useCopy } from '../../../content/useCopy';
import { deriveAnswers } from '../model/answers';
import { GuidanceScreen } from '../GuidanceScreen';
import { LoneStepHeading, STEP_TITLE_KEY, type StepProps } from './shared';

/** [kg] Shown only while no body mass is known; the body step blocks until one is. */
const GUIDANCE_FALLBACK_MASS_KG = 70;

export function GuidanceStep({ answers, headingRef }: Omit<StepProps, 'patch'>): JSX.Element {
  const t = useCopy();
  const { massKg } = deriveAnswers(answers);
  return (
    <div>
      <LoneStepHeading title={t(STEP_TITLE_KEY.guidance)} headingRef={headingRef} />
      <GuidanceScreen massKg={massKg ?? GUIDANCE_FALLBACK_MASS_KG} />
    </div>
  );
}

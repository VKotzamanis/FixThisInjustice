// src/ui/setup/steps/shared.tsx
//
// What every step component shares: its props, the step titles, the focusable heading and the
// ids of messages that belong to more than one control. Moved out of SetupWizard.tsx (A16).
import type { JSX, Ref } from 'react';
import type { CopyKey } from '../../../content/copy';
import type { SetupAnswers } from '../../../domain/types';
import type { StepId } from '../model/answers';
import type { StepValidation } from '../model/fields';

/** Every step receives the merged answers and writes into the uncommitted tier through `patch`. */
export interface StepProps {
  answers: SetupAnswers;
  patch: (next: Partial<SetupAnswers>) => void;
  headingRef: Ref<HTMLHeadingElement>;
}

/** A step whose fields are validated also receives its own row of `validateStep`. */
export interface ValidatedStepProps extends StepProps {
  validation: StepValidation;
}

/*
 * The step titles as KEYS, not resolved strings: a module constant is evaluated once at import,
 * so a baked title would never follow a skin change. Resolved per render through `useCopy()`.
 */
export const STEP_TITLE_KEY: Record<StepId, CopyKey> = {
  units: 'step.units',
  timezone: 'step.timezone',
  body: 'step.body',
  training: 'step.training',
  goal: 'step.goal',
  guidance: 'step.guidance',
  review: 'step.review',
};

/*
 * DOM ids for messages that belong to more than one control, or to a control rendered here
 * rather than through UnitInput. Each is referenced from an aria-describedby on the control(s)
 * that produced it while, and only while, it is on screen.
 */
export const STEP_HEADING_ID = 'wiz-step-heading';

/** The ids of the messages currently on screen, for aria-describedby, or undefined when none is. */
export function describedBy(...ids: (string | null)[]): string | undefined {
  const shown = ids.filter((id): id is string => id !== null);
  return shown.length === 0 ? undefined : shown.join(' ');
}

/**
 * The step heading, inside the fieldset's legend (HTML allows heading content there). One string
 * names the group and heads the document, and it takes focus on a step change: tabIndex -1 makes
 * it programmatically focusable without adding it to the tab order.
 */
export function StepHeading(props: { title: string; headingRef: Ref<HTMLHeadingElement> }): JSX.Element {
  return (
    <legend>
      <h2 className="wiz-heading" id={STEP_HEADING_ID} ref={props.headingRef} tabIndex={-1}>
        {props.title}
      </h2>
    </legend>
  );
}

/** The heading of a step that renders its own sections (Guidance, Review), outside a legend. */
export function LoneStepHeading(props: { title: string; headingRef: Ref<HTMLHeadingElement> }): JSX.Element {
  return (
    <h2 className="wiz-heading wiz-heading-alone" id={STEP_HEADING_ID} ref={props.headingRef} tabIndex={-1}>
      {props.title}
    </h2>
  );
}

/**
 * A `<input type="range">`'s position: the index of `value` in `options`, or 0. A slider's value
 * is always an index into a closed list (Brief F Part 1); this and `sliderValueAt` are the only
 * two places an index and its domain value meet.
 */
export function sliderIndexOf<T extends string | number>(options: readonly { value: T }[], value: T): number {
  const i = options.findIndex((o) => o.value === value);
  return i === -1 ? 0 : i;
}

/** The domain value at a `<input type="range">`'s raw string index, or `fallback` off the list. */
export function sliderValueAt<T extends string | number>(
  options: readonly { value: T }[],
  raw: string,
  fallback: T,
): T {
  const i = Number(raw);
  return options[i]?.value ?? fallback;
}

/** Adds `item` to `list` if absent, removes it if present. Order of the rest is preserved. */
export function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

import { useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react';
import './setup.css';
import { FORMAT, type CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { todayLocal } from '../../domain/dates';
import { newId } from '../../domain/ids';
import { EXERCISES } from '../../domain/plan/library';
import { generatePlan } from '../../domain/plan/generator';
import type { IsoWeekday, SetupAnswers, SetupDraft } from '../../domain/types';
import { useAppStore, whenPersisted } from '../../store';
import { vibrate } from '../audio/chime';
import { STEPS, zoneOf, type DaySlot, type StepId } from './model/answers';
import { validateStep } from './model/fields';
import { buildSetupResult, planInputOf } from './model/result';
import { answersOf, restoreWizardState, wizardReducer } from './model/wizardState';
import { usePublishSetupBanner } from './setupBanner';
import { BodyStep, type BodyModal } from './steps/BodyStep';
import { GoalStep } from './steps/GoalStep';
import { GuidanceStep } from './steps/GuidanceStep';
import { ReviewStep } from './steps/ReviewStep';
import { STEP_TITLE_KEY } from './steps/shared';
import { TimezoneStep, useTimeZoneCatalogue } from './steps/TimezoneStep';
import { TrainingStep } from './steps/TrainingStep';
import { UnitsStep } from './steps/UnitsStep';

// Moved to ./model and ./steps (audit A16); re-exported for existing importers.
export { STEPS, WEEKDAYS, restoreStepIndex, type StepId } from './model/answers';
export { EQUIPMENT_ACCESS_OPTIONS } from './steps/TrainingStep';

/**
 * Setup wizard: the shell. It owns the two-tier draft (./model/wizardState), its persistence by
 * step id, navigation, focus, the modals' open state and Confirm; each step's fields are one
 * component under ./steps receiving `answers` and `patch`, and every validation rule lives in
 * the field table (./model/fields), so the Next gate and the visible messages are one
 * computation (audit A09/A16).
 *
 * Two rules this wizard exists to enforce, both structural:
 *   - NO medication, condition, biometric-identifier or location field. The only free-text inputs
 *     are the display name and the IANA time-zone id (SetupWizard.test.tsx asserts it).
 *   - No value reaches `computeTargets` before the form has checked it against NUTRITION_DOMAIN
 *     (master plan section 6.3); the engine throws outside its validated adult domain.
 */

/**
 * The three groups the steps fall into (round 1 C1.02.5/C1.02.6). Total over StepId, so a step
 * added without a group is a compile error. Review is null: it reviews all three.
 */
export type SetupGroup = 'settings' | 'personal' | 'goal';

const GROUP_TITLE_KEY: Record<SetupGroup, CopyKey> = {
  settings: 'group.settings',
  personal: 'group.personal',
  goal: 'group.goal',
};

const STEP_GROUP: Record<StepId, SetupGroup | null> = {
  units: 'settings',
  timezone: 'settings',
  body: 'personal',
  training: 'goal',
  goal: 'goal',
  guidance: 'personal',
  review: null,
};

const SHAKE_DURATION_MS = 400; // [ms], matches the .wiz-shake keyframe duration in setup.css
// [ms] one short haptic pulse on a failed Next (C1.08.12). Additive only: a no-op on iOS.
const FAILED_NEXT_VIBRATE_MS = 120;
/*
 * [ms] C1.G.1: how long after the last keystroke the draft is handed to the store. The store has
 * no write debounce since P2 (B08); this keeps typing from re-rendering every store subscriber,
 * and committing, on every character.
 */
const SETUP_DRAFT_SAVE_DEBOUNCE_MS = 400;

type WizardModal = BodyModal | 'activityLevels';

export function SetupWizard(): JSX.Element {
  const t = useCopy();
  const overrides = useCopyOverrides();
  /*
   * C1.G.1: the stored draft is restored once, both tiers (A2). A corrupt stored draft is
   * already null here: SetupDraftSchema is `.catch(null)`.
   */
  const [state, dispatch] = useReducer(wizardReducer, null, () =>
    restoreWizardState(useAppStore.getState().setupDraft),
  );
  const { stepIndex, committed, buffer } = state;
  /** What the screen renders and every validator reads: committed answers with the step in progress over them. */
  const draft: SetupAnswers = answersOf(state);
  /** Latched by the first successful confirm; the profile is created exactly once. */
  const [submitted, setSubmitted] = useState(false);
  /** Spec R5: the store refused the confirm (it wrote nothing); the user is told so. */
  const [confirmRefused, setConfirmRefused] = useState(false);
  /** Brief M, r2.19: Review's "Looks Good". A gesture, never written to the store or the draft. */
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [modal, setModal] = useState<WizardModal>(null);
  /** C1.08.14 (B33): "enter a number" stays hidden on the body step until Next was pressed there. */
  const [bodyNextAttempted, setBodyNextAttempted] = useState(false);
  /* Views of a list and a calendar, not answers: neither tier of the draft, not persisted (r2.09, Brief I). */
  const [zoneQuery, setZoneQuery] = useState('');
  const [monthOffset, setMonthOffset] = useState<number | null>(null); // [month] null = auto (P9)

  /*
   * Persists the draft on change, debounced (C1.G.1). `draftSaveTimer` is also cleared by
   * confirm(), so a pending keystroke write cannot land after Confirm has cleared the draft.
   * The first run is the restore just performed and is skipped.
   */
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveMounted = useRef(false);
  /** Audit A07: the draft the timer will hand the store, so backgrounding can hand it now. */
  const pendingDraft = useRef<SetupDraft | null>(null);
  useEffect(() => {
    if (!draftSaveMounted.current) {
      draftSaveMounted.current = true;
      return;
    }
    if (submitted) {
      pendingDraft.current = null; // setup is done: nothing may resurrect the draft
      return;
    }
    // BOTH tiers, separately (A2); the step id rides beside the index (A06).
    const next: SetupDraft = { ...committed, stepIndex, stepId: STEPS[stepIndex] ?? STEPS[0], buffer };
    pendingDraft.current = next;
    draftSaveTimer.current = setTimeout(() => {
      pendingDraft.current = null;
      try {
        useAppStore.getState().saveSetupDraft(next);
      } catch {
        // Spec R5 (review N4): the store refused a draft the loader could not reload and wrote
        // nothing, so the last valid draft stays stored. A throw in a timer escapes every boundary.
      }
    }, SETUP_DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimer.current !== null) clearTimeout(draftSaveTimer.current);
    };
  }, [committed, buffer, stepIndex, submitted]);

  /*
   * Audit A07: the last keystrokes reach storage when the app is backgrounded. iOS may kill a
   * suspended PWA without another event, so the pending draft is handed over and the IndexedDB
   * commit started at once.
   */
  useEffect(() => {
    const flush = (): void => {
      const next = pendingDraft.current;
      if (next === null) return;
      if (draftSaveTimer.current !== null) {
        clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
      pendingDraft.current = null;
      try {
        useAppStore.getState().saveSetupDraft(next);
      } catch {
        // Spec R5 (review N4), as above: a refused draft writes nothing; a listener must not throw.
      }
      void whenPersisted();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const step: StepId = STEPS[stepIndex] ?? 'units';

  // The top bar's banner (r2-onboarding.general): the merged name, raw, so it never disagrees with the field.
  usePublishSetupBanner(draft.displayName, step === 'review');

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const shownStepIndex = useRef(stepIndex);
  /* Focus follows the step; the first render is skipped so arriving does not steal focus. */
  useEffect(() => {
    if (shownStepIndex.current === stepIndex) return;
    shownStepIndex.current = stepIndex;
    headingRef.current?.focus();
  }, [stepIndex]);

  const timeZoneCatalogue = useTimeZoneCatalogue(draft.timezone);

  const zone = zoneOf(draft);
  const today = todayLocal(zone);

  /*
   * Every step's field table, every render: Confirm writes every screen's answers, so it is
   * gated on every screen (a unit switch or a weekday unchecked on the way back can make an
   * earlier step stale).
   */
  const validations = useMemo(
    () => Object.fromEntries(STEPS.map((s) => [s, validateStep(s, draft, overrides)])) as Record<StepId, ReturnType<typeof validateStep>>,
    [draft, overrides],
  );
  /** Review's own gate is the acknowledgement (r2.19); every other step's is its field table. */
  const blocked = (s: StepId): boolean => validations[s].blocked || (s === 'review' && !reviewAcknowledged);
  const confirmBlocked = STEPS.some(blocked);

  /** The plan Review previews and Confirm stores: one build from planInputOf. */
  const plan = useMemo(
    () => generatePlan(planInputOf(draft), EXERCISES),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the answers the plan reads
    [draft.sessionsPerWeek, draft.goalKind, draft.experience, draft.equipment, draft.includeCardio, draft.homeEquipment, draft.bodyweightEquipment],
  );

  function patch(next: Partial<SetupAnswers>): void {
    dispatch({ type: 'patch', next });
  }
  function patchDay(weekday: IsoWeekday, next: Partial<DaySlot>): void {
    dispatch({ type: 'patchDay', weekday, next });
  }

  /**
   * Part 4, C1.08.12 / r2.16: a blocked Next on the body step reveals every outstanding message
   * at once, focuses, scrolls to and shakes the FIRST invalid control, and vibrates as an
   * additive cue. The marking follows from the revealed messages (setup.css keys on aria-invalid).
   */
  function handleFailedBodyNext(): void {
    setBodyNextAttempted(true);
    const targetId = validations.body.invalidFocusIds[0] ?? null;
    if (targetId !== null) {
      const el = document.getElementById(targetId);
      if (el !== null) {
        el.focus();
        // jsdom defines no scrollIntoView; the guard keeps focus and shake working under test.
        el.scrollIntoView?.({ block: 'center' });
        el.classList.add('wiz-shake');
        window.setTimeout(() => {
          el.classList.remove('wiz-shake');
        }, SHAKE_DURATION_MS);
      }
    }
    vibrate(FAILED_NEXT_VIBRATE_MS);
  }

  function confirm(): void {
    // Idempotent by latch: a double tap can deliver two clicks before React re-renders.
    if (submitted || confirmBlocked) return;
    const built = buildSetupResult(draft, { today, zone, profileId: newId(), now: Date.now(), overrides, plan });
    if (!built.ok) {
      // A loader schema refused the result: nothing is written, and the user is told.
      if (built.reason === 'schema') setConfirmRefused(true);
      return; // 'blocked' and 'incomplete' are unreachable past confirmBlocked
    }
    /*
     * Spec R5 / audit A14: ONE store write. completeSetup parses again and applies everything,
     * draft cleared, in a single set(); a refusal throws before anything is written.
     */
    try {
      useAppStore.getState().completeSetup(built.result);
    } catch {
      setConfirmRefused(true);
      return;
    }
    // C1.G.1: the pending draft timer must not resurrect the draft completeSetup just cleared.
    if (draftSaveTimer.current !== null) {
      clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
    setSubmitted(true);
  }

  const stepProps = { answers: draft, patch, headingRef };

  return (
    <div className="wiz">
      <h1>
        {FORMAT.setupGroup(
          t('setup.hero'),
          STEP_GROUP[step] === null ? null : t(GROUP_TITLE_KEY[STEP_GROUP[step]]),
        )}
      </h1>
      {/* The live region: the one line that changes on every step names position and screen. */}
      <p className="wiz-step" role="status" aria-live="polite" data-testid="wiz-step-status">
        {FORMAT.stepOf(stepIndex + 1, STEPS.length, t(STEP_TITLE_KEY[step]))}
      </p>

      {step === 'units' && <UnitsStep {...stepProps} />}
      {step === 'timezone' && (
        <TimezoneStep
          {...stepProps}
          validation={validations.timezone}
          catalogue={timeZoneCatalogue}
          zoneQuery={zoneQuery}
          setZoneQuery={setZoneQuery}
        />
      )}
      {step === 'body' && (
        <BodyStep
          {...stepProps}
          validation={validations.body}
          nextAttempted={bodyNextAttempted}
          modal={modal === 'activityLevels' ? null : modal}
          setModal={setModal}
        />
      )}
      {step === 'training' && (
        <TrainingStep
          {...stepProps}
          validation={validations.training}
          activityLevelsOpen={modal === 'activityLevels'}
          setActivityLevelsOpen={(open) => {
            setModal(open ? 'activityLevels' : null);
          }}
        />
      )}
      {step === 'goal' && (
        <GoalStep
          {...stepProps}
          patchDay={patchDay}
          validation={validations.goal}
          today={today}
          monthOffset={monthOffset}
          setMonthOffset={setMonthOffset}
        />
      )}
      {step === 'guidance' && <GuidanceStep answers={draft} headingRef={headingRef} />}
      {step === 'review' && (
        <ReviewStep
          {...stepProps}
          plan={plan}
          reviewAcknowledged={reviewAcknowledged}
          setReviewAcknowledged={setReviewAcknowledged}
        />
      )}

      <div className="wiz-nav">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => {
              // A05 (plan ruling PR-9): Back keeps the step in progress and commits nothing (A2).
              dispatch({ type: 'back' });
            }}
          >
            {t('button.back')}
          </button>
        )}
        {stepIndex < STEPS.length - 1 && (
          <button
            type="button"
            /*
             * Every step but body disables Next while blocked. Body uses aria-disabled instead
             * (C1.08.12): a natively disabled button dispatches no click, so the press that
             * reveals the messages could never fire.
             */
            disabled={step === 'body' ? false : blocked(step)}
            aria-disabled={step === 'body' ? blocked(step) : undefined}
            onClick={() => {
              if (blocked(step)) {
                if (step === 'body') handleFailedBodyNext();
                return;
              }
              // A2: this press, and only this press, replaces the stored answers.
              dispatch({ type: 'next' });
            }}
          >
            {t('button.continue')}
          </button>
        )}
        {stepIndex === STEPS.length - 1 && (
          <button type="button" disabled={confirmBlocked || submitted} onClick={confirm}>
            {t('button.confirmStart')}
          </button>
        )}
        {confirmRefused && (
          <p className="wiz-error" role="alert">
            {t('error.setupRefused')}
          </p>
        )}
      </div>
    </div>
  );
}

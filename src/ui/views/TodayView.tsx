import { useState, type JSX } from 'react';
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import type { CalendarDay } from '../../domain/schedule/calendar';
import type { PlanPause } from '../../domain/types';
import { useAppStore, type AppStore } from '../../store';
import {
  useActionError,
  useCursor,
  usePlan,
  useRemainingLabels,
  useTodayDate,
  useUpcoming,
} from '../../store/scheduleSelectors';
import { useActiveProfile } from '../../store/selectors';
import { unlockAudio } from '../audio/chime';
import { ReadinessNotice } from '../components/ReadinessNotice';
import {
  NO_VALUE,
  exerciseName,
  formatDayOfMonth,
  formatPrescription,
  formatRest,
  formatSets,
  formatWeekday,
} from '../format/plan';
import { refusalLine } from '../format/refusal';
import './views.css';

/**
 * The Today view.
 *
 * The hero reports one thing: what the PLAN CURSOR says about this civil day. It never derives
 * position from the calendar (code review A11: the legacy "D n/168" indicator counted days
 * since the start date and reported a position the user had not reached), never reads a UTC
 * date (A8: every date here is a LocalDate in the profile's own zone, formatted by
 * src/ui/format/plan.ts), and has exactly one definition of "done", which is
 * SessionAssignment.status (A63).
 *
 * Hero precedence, highest first, in the order the branches below actually test it:
 *
 *   no plan > in progress > paused > completed > skipped > a slot with a projected session >
 *   programme finished > no slot (rest, naming the next slot day)
 *
 * No plan is first, not last: it is the early return above every derivation, because with no
 * profile, plan, cursor or projected day there is nothing for the other branches to read.
 *
 * In progress outranks paused because master plan section 6.4 lets a session that was already
 * open when the pause began be completed or skipped: hiding it behind the pause hero would
 * strand it. Paused outranks the two terminal states because the pause is the standing fact
 * about the plan, and it is what the user has to lift before anything else can happen.
 *
 * "Programme finished" and "rest" are the two heroes for a day the projection serves nothing
 * on, and cursor.completedOn is what separates them. The finished branch is tested first, so
 * the rest hero — which names the next slot day — is reached only while the plan still has
 * sessions left to serve.
 */

/** [d] Whole calendar days in the strip below the hero. */
const STRIP_DAYS = 14;

type DayStatus = 'in-progress' | 'paused' | 'completed' | 'skipped' | 'planned' | 'rest';

/** The precedence above, applied to one projected day. */
function dayStatus(day: CalendarDay): DayStatus {
  const status = day.assignment?.status;
  if (status === 'in-progress') return 'in-progress';
  if (day.paused) return 'paused';
  if (status === 'completed') return 'completed';
  if (status === 'skipped') return 'skipped';
  if (day.projectedSession !== null) return 'planned';
  return 'rest';
}

/** The accessible name of each status glyph. The glyphs are drawn, so this is their only text. */
const STATUS_KEY: Record<DayStatus, CopyKey> = {
  'in-progress': 'status.dayInProgress',
  paused: 'status.dayPaused',
  completed: 'status.dayCompleted',
  skipped: 'status.daySkipped',
  planned: 'status.dayPlanned',
  rest: 'status.dayRest',
};

/**
 * The status marks, drawn rather than typed.
 *
 * Master plan section 3 bans emoji from the default skin, and a glyph taken from the text font
 * is at the mercy of whatever the platform substitutes for it (a check mark renders as an
 * emoji on some phones and as a dingbat on others). These are two-line SVG figures on a 12-unit
 * grid, so they scale with the row and inherit its colour.
 *
 * The name is carried by aria-label alone. A <title> child names the graphic too, and the two
 * were the same string: the accessible-name computation prefers aria-label, so the element was
 * shipping a second name nothing could ever read, and a reworded status would have had to be
 * changed in two places to stay consistent.
 */
function StatusGlyph(props: { status: DayStatus }): JSX.Element {
  const name = copy(STATUS_KEY[props.status]);
  return (
    <svg
      className="sd-glyph"
      viewBox="0 0 12 12"
      role="img"
      aria-label={name}
      focusable="false"
      data-glyph={props.status}
    >
      {props.status === 'completed' && <polyline points="2,6.4 4.8,9.2 10,3" />}
      {props.status === 'skipped' && <path d="M3 3 L9 9 M9 3 L3 9" />}
      {props.status === 'in-progress' && (
        <polygon points="3.5,2.5 9.5,6 3.5,9.5" className="sd-fill" />
      )}
      {props.status === 'paused' && <path d="M4.5 2.5 L4.5 9.5 M7.5 2.5 L7.5 9.5" />}
      {props.status === 'planned' && <circle cx="6" cy="6" r="1.7" className="sd-fill" />}
      {props.status === 'rest' && <path d="M3 6 L9 6" />}
    </svg>
  );
}

/**
 * The open pause, read as a stable snapshot.
 *
 * `find` hands back an element of the STORED array, so the result keeps its identity between
 * renders and zustand's Object.is comparison sees no change. Building an object here would
 * re-render forever (see the memoisation note in scheduleSelectors.ts).
 */
function selectOpenPause(s: AppStore): PlanPause | null {
  const id = s.activeProfileId;
  if (id === null) return null;
  return (s.pauses[id] ?? []).find((p) => p.to === null) ?? null;
}

/** The first later day the projection actually serves: what a rest day names. */
function nextServedDay(days: readonly CalendarDay[]): CalendarDay | null {
  return (
    days.slice(1).find((d) => d.slot !== null && !d.paused && d.projectedSession !== null) ?? null
  );
}

export function TodayView(): JSX.Element {
  // One clock read per render, passed to every selector that needs a civil date, so the
  // projection and the date it is indexed by cannot straddle a midnight and disagree about
  // which day this is.
  const now = Date.now(); // [ms] epoch, UTC
  const profile = useActiveProfile();
  const today = useTodayDate(now);
  const plan = usePlan();
  const cursor = useCursor();
  const upcoming = useUpcoming(STRIP_DAYS, now);
  // Today is the first day of the strip, not a second projection of it. useTodayPlan(now) is
  // useUpcoming(1, now)[0]: the same civil day from the same document, but a second store
  // subscription under a second memo key. One subscription, and the hero and the first strip
  // row are now literally the same CalendarDay.
  const day = upcoming[0] ?? null;
  const labels = useRemainingLabels(today);
  const openPause = useAppStore(selectOpenPause);
  // Through the store's own selector (master plan section 10, P3 close-out), so Today and any
  // later refusal-reading view bind to one definition of "the last attempt was refused".
  const actionError = useActionError();

  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  if (profile === null || plan === null || cursor === null || day === null) {
    return (
      <div className="view today">
        <div className="today-hero">
          <h1 className="hero-name">{copy('hero.noPlan')}</h1>
          <p className="today-sub">{copy('advice.completeSetup')}</p>
        </div>
      </div>
    );
  }

  const profileId = profile.id;
  const status = dayStatus(day);
  const session = day.projectedSession;
  const total = plan.sessions.length; // [sessions]
  const finished = cursor.completedOn !== null;
  // [sessions] 1-based, clamped: the cursor stops AT the plan length, so the last session must
  // not be reported as "S 7/6" once it is closed.
  const shown = Math.min(cursor.nextSessionIndex + 1, total);
  const position = FORMAT.planPosition(shown, total, '');
  const canRun = status === 'planned' || status === 'in-progress';

  const goTrain = (): void => {
    useAppStore.getState().setUi({ lastView: 'train' });
  };
  const onStart = (): void => {
    /*
     * First, and unconditionally: every browser refuses AudioContext.resume() outside a user
     * gesture, and iOS refuses it again after the app has been backgrounded (code review A29).
     * This handler is the gesture, so the unlock has to be attempted here rather than from the
     * Train view's mount. It is fire-and-forget: a refusal costs the rest chime and nothing
     * else, and the start must not wait on an audio permission.
     */
    void unlockAudio();
    useAppStore.getState().startSession(profileId, today, Date.now()); // [ms] epoch, UTC
    /*
     * Navigate only on a start that actually happened. startSession has two outcomes that
     * leave the day closed: a REFUSAL (another day still open, the plan paused — the document
     * is untouched and the domain's wording is in status.lastActionError) and a documented
     * no-op (a finished plan returns its argument and raises nothing). Switching to Train on
     * either one put the user in front of a session that was never opened and left the refusal
     * banner on a view they were no longer looking at.
     *
     * The post-state is read back rather than inferred: both conditions are required, because
     * a cleared error alone does not mean this call is what cleared it, and an assignment
     * alone does not distinguish the day this call opened from one that was already open.
     */
    const after = useAppStore.getState();
    const opened = (after.assignments[profileId] ?? []).find((a) => a.date === today);
    if (after.status.lastActionError === null && opened?.status === 'in-progress') {
      // The day the session was opened on, recorded in the non-persisted session slice so a
      // reload mid-session logs the next set against THAT day rather than re-deriving one from
      // the clock. Set only on a start that actually happened, for the same reason the
      // navigation is.
      useAppStore.getState().setActiveAssignmentDate(today);
      goTrain();
    }
  };
  const onComplete = (): void => {
    useAppStore.getState().completeSession(profileId, today, Date.now()); // [ms] epoch, UTC
  };
  const onConfirmSkip = (): void => {
    // An untyped reason is null, never "": the field is optional, and an empty string would
    // record that the user gave a reason and it was nothing.
    const reason = skipReason.trim();
    useAppStore.getState().skipSession(profileId, today, reason === '' ? null : reason);
    setSkipOpen(false);
    setSkipReason('');
  };
  const onPick = (label: string): void => {
    useAppStore.getState().assignToday(profileId, today, label);
    setPickerOpen(false);
  };

  let hero: JSX.Element;
  if (status === 'in-progress') {
    hero = (
      <div className="today-hero">
        <p className="today-eyebrow">{position}</p>
        <h1 className="hero-name">{copy('hero.sessionInProgress')}</h1>
        {session !== null && <p className="today-sub">{session.name}</p>}
      </div>
    );
  } else if (status === 'paused') {
    hero = (
      <div className="today-hero">
        <p className="today-eyebrow">{position}</p>
        <h1 className="hero-name">{FORMAT.pausedSince(openPause === null ? today : openPause.from)}</h1>
        <p className="today-sub">{copy('advice.pauseHoldsCursor')}</p>
      </div>
    );
  } else if (status === 'completed' || status === 'skipped') {
    const reason = day.assignment?.skipReason ?? null;
    hero = (
      <div className="today-hero">
        <p className="today-eyebrow">{position}</p>
        <h1 className="hero-name">
          {copy(status === 'completed' ? 'hero.sessionCompleted' : 'hero.sessionSkipped')}
        </h1>
        {session !== null && <p className="today-sub">{session.name}</p>}
        {reason !== null && <p className="today-sub">{FORMAT.skipReason(reason)}</p>}
      </div>
    );
  } else if (session !== null) {
    hero = (
      <div className="today-hero">
        <p className="today-eyebrow">{position}</p>
        <h1 className="hero-name">{session.name}</h1>
        <p className="today-sub">
          {FORMAT.sessionSummary(
            session.label,
            day.slot === null ? NO_VALUE : day.slot.startTime, // "HH:mm", profile's zone
            session.exercises.length,
          )}
        </p>
        <ul className="session-list">
          {session.exercises.map((ex) => (
            <li key={ex.exerciseId} className="sess-row">
              <span className="sess-name">{exerciseName(ex.exerciseId)}</span>
              <span className="sess-rep">
                {FORMAT.setsBy(
                  formatSets(ex.setsLo, ex.setsHi), // [sets]
                  formatPrescription(ex.prescription),
                )}
              </span>
              <span className="sess-rest">{formatRest(ex.restS)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (finished) {
    hero = (
      <div className="today-hero">
        <p className="today-eyebrow">
          {FORMAT.planPosition(shown, total, copy('status.planComplete'))}
        </p>
        <h1 className="hero-name">{copy('hero.programmeComplete')}</h1>
        <p className="today-sub">
          {FORMAT.programmeClosed(total, cursor.completedOn ?? today)}
        </p>
      </div>
    );
  } else {
    const next = nextServedDay(upcoming);
    hero = (
      <div className="today-hero">
        <p className="today-eyebrow">{position}</p>
        <h1 className="hero-name">{copy('hero.noSessionToday')}</h1>
        <p className="today-sub">
          {next === null || next.slot === null || next.projectedSession === null
            ? copy('advice.noSessionIn14Days')
            : FORMAT.nextSession(
                formatWeekday(next.date),
                next.slot.startTime,
                next.projectedSession.label,
              )}
        </p>
      </div>
    );
  }

  return (
    <div className="view today">
      {actionError !== null && (
        /*
         * A refusal, not a failure: the document was left exactly as it was (see the
         * refusal/defect split in src/store/scheduleActions.ts). role="alert" because it
         * answers a control the user just pressed.
         *
         * P4 review item 4: the domain's own wording is what the STORE holds, and what the
         * classifier in scheduleActions.ts sorts on, but it is not what the user reads. It
         * opens with the name of the function the store called ("startSession: the plan is
         * paused on 2026-03-02"), which names nothing the user did and nothing they can act
         * on, and it is assembled outside src/content/copy.ts and so outside the skin system.
         * src/ui/format/refusal.ts maps it onto a copy key with the date as a slot.
         */
        <div className="today-banner" role="alert">
          <span className="banner-tag">{copy('banner.actionRefused.tag')}</span>
          <span>{refusalLine(actionError)}</span>
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().clearActionError();
            }}
          >
            {copy('button.dismiss')}
          </button>
        </div>
      )}

      {/*
       * Master plan section 10.4: a flagged screening shows the physician-consult notice at
       * every session start. It is rendered on the days a session can be started or is under
       * way, and not on a rest day: the notice is dismissable for the browser session, so
       * showing it where there is nothing to start would let a rest-day dismissal silence it
       * on the day it is actually owed.
       */}
      {canRun && <ReadinessNotice flagged={profile.readiness.flagged} />}

      {hero}

      <div className="today-controls">
        {status === 'planned' && (
          <button type="button" onClick={onStart}>
            {copy('button.startSession')}
          </button>
        )}
        {status === 'in-progress' && (
          <button type="button" onClick={goTrain}>
            {copy('button.returnToSession')}
          </button>
        )}
        {canRun && (
          <>
            <button type="button" onClick={onComplete}>
              {copy('button.markCompleted')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSkipOpen(true);
              }}
            >
              {copy('button.skipToday')}
            </button>
          </>
        )}
        {/*
         * Offered only while the week still has a label this day can take. The list is
         * remainingLabelsThisWeek, which master plan section 6.4 defines as exactly the labels
         * assignToday will honour, so a control shown here can never be refused. It empties
         * itself once the session starts, which is the section 6.4 rule that the pick comes
         * before Start and never after.
         */}
        {labels.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPickerOpen((open) => !open);
            }}
          >
            {copy('button.trainSomethingElse')}
          </button>
        )}
        {/*
         * Gated on the open pause, not on the day's display status. The two disagree in both
         * directions: an assignment already in progress when the pause began shows the
         * in-progress hero (the precedence above) while the plan is paused, which offered Pause
         * for a plan already paused and withheld the Resume that lifts it; and a CLOSED pause
         * whose half-open [from, to) still covers today shows the paused hero with nothing for
         * resumePlan to close. openPause is the fact both controls act on, so it is the fact
         * they are offered on.
         */}
        {openPause === null && !finished && (
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().pausePlan(profileId, today, null);
            }}
          >
            {copy('button.pausePlan')}
          </button>
        )}
        {openPause !== null && (
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().resumePlan(profileId, today);
            }}
          >
            {copy('button.resumePlan')}
          </button>
        )}
      </div>

      {skipOpen && (
        <div className="today-skip view-field">
          {/*
           * Free text, stored verbatim in SessionAssignment.skipReason and never interpreted.
           * It is deliberately NOT a medical field: it offers no categories, prompts for no
           * condition, and nothing downstream reads it (master plan section 3 keeps medical
           * strings out of this app entirely).
           */}
          <label htmlFor="skip-reason">{copy('label.skipReason')}</label>
          <input
            id="skip-reason"
            type="text"
            /*
             * [characters] The bound on a short free-text reason ("shoulder still sore", "away
             * for work"). It is a UI bound only: the field is stored verbatim and nothing
             * downstream parses it, so the limit exists to keep an accidental paste out of the
             * document, not to make the value mean anything.
             */
            maxLength={120}
            value={skipReason}
            onChange={(e) => {
              setSkipReason(e.target.value);
            }}
          />
          <button type="button" onClick={onConfirmSkip}>
            {copy('button.confirmSkip')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSkipOpen(false);
              setSkipReason('');
            }}
          >
            {copy('button.cancel')}
          </button>
        </div>
      )}

      {pickerOpen && labels.length > 0 && (
        <div className="today-picker" data-testid="label-picker">
          <p className="today-eyebrow">{copy('status.remainingThisWeek')}</p>
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                onPick(label);
              }}
            >
              {FORMAT.trainLabelToday(label)}
            </button>
          ))}
        </div>
      )}

      {/*
       * The list is named by the heading it sits under (aria-labelledby), not by a second copy
       * of the same string in an aria-label: one string in the DOM, and a reworded heading
       * cannot leave the list announcing the old wording.
       */}
      <h2 id="today-strip-heading">{copy('hero.nextFourteenDays')}</h2>
      <ol className="today-strip" aria-labelledby="today-strip-heading">
        {upcoming.map((d) => {
          const s = dayStatus(d);
          return (
            <li key={d.date} className="strip-day" data-testid="strip-day" data-status={s}>
              <span className="sd-weekday">{formatWeekday(d.date)}</span>
              <span className="sd-date">{formatDayOfMonth(d.date)}</span>
              <span className="sd-time">{d.slot === null ? NO_VALUE : d.slot.startTime}</span>
              <span className="sd-label">
                {d.projectedSession === null ? copy('status.dayRest') : d.projectedSession.label}
              </span>
              <StatusGlyph status={s} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

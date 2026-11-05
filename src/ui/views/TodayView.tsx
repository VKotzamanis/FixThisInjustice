import { useEffect, useRef, useState, type JSX } from 'react';
import { FORMAT, type CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { CalendarDay } from '../../domain/schedule/calendar';
import { sessionTitle } from '../../domain/schedule/rotation';
import { isInProgramme, reviewVerdict } from '../../domain/schedule/weekly';
import { nextProgrammeGoal } from '../../domain/plan/lifecycle';
import type { GoalKind, PlanPause, WeeklyReview } from '../../domain/types';
import { SkinLabel } from '../../skins/limelight/Icon';
import { useAppStore, type AppStore } from '../../store';
import {
  useActionError,
  useCursor,
  usePlan,
  useRemainingLabels,
  useTodayDate,
  useUpcoming,
  useWeeklyReviews,
} from '../../store/scheduleSelectors';
import { latestBodyMassEntry, useActiveProfile, useMinuteClock, useOpenAssignment } from '../../store/selectors';
import { unlockAudio } from '../audio/chime';
import { Intervention, missedWeek } from '../components/Intervention';
import { GOAL_OPTIONS, RestartProgramme } from '../components/RestartProgramme';
import { HER_PLAY_CYCLES, HER_SHEETS } from '../components/herSheets';
import { Marquee, type MarqueeItem } from '../components/Marquee';
import { SpriteSheet } from '../components/SpriteSheet';
import { StatusMark } from '../components/StatusMark';
import { TimeCapsule } from '../components/TimeCapsule';
import { WeekStamp } from '../components/WeekStamp';
import {
  NO_VALUE,
  exerciseName,
  formatDayOfMonth,
  formatPrescription,
  formatRest,
  formatSets,
  formatWeekday,
} from '../format/plan';
import { displayClass } from '../format/display';
import { refusalLine } from '../format/refusal';
import { weekDeltaKey } from '../format/weekDelta';
import { HERO_SCALE, heroPose, heroStateOf, type DayStatus } from './todayHero';
import './views.css';
import { MeasurementsPanel } from '../measurements/MeasurementsPanel';
import { FluidQuickAdd } from '../measurements/FluidQuickAdd';

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
 * emoji on some phones and as a dingbat on others). The marks are StatusMark's pixel grids
 * (stylize survey 2026-10-18, item 6), the same set the Log compliance grid draws, so a status
 * looks the same on both screens and differs from its neighbours by shape, not only by shade.
 *
 * The name is carried by aria-label alone. A <title> child names the graphic too, and the two
 * were the same string: the accessible-name computation prefers aria-label, so the element was
 * shipping a second name nothing could ever read, and a reworded status would have had to be
 * changed in two places to stay consistent.
 */
function StatusGlyph(props: { status: DayStatus }): JSX.Element {
  const c = useCopy();
  return <StatusMark kind={props.status} label={c(STATUS_KEY[props.status])} />;
}

/**
 * The hero's heading. It takes the brat display cut (stylize survey 2026-10-18, item 1) unless
 * the text carries a numeral, which a session name ("Push 1") or the pause date does:
 * displayClass decides that for every heading in the app, so this view does not.
 */
function HeroName(props: { text: string }): JSX.Element {
  return <h1 className={displayClass(props.text, 'hero-name')}>{props.text}</h1>;
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
  // Audit G20: the minute clock (every minute, and on return to the tab), not a render-time read,
  // so a resumed app moves to the new day and the capsule opens on its day without a tap.
  const now = useMinuteClock(); // [ms] epoch, UTC
  // The skin's words, and the same skin's override table for the frames that carry a value.
  // Both are hooks, so they are read here with the rest and above every early return.
  const c = useCopy();
  const overrides = useCopyOverrides();
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
  // Oldest first, as closeWeeks() sorts and merges them, so the last element is the week that
  // closed most recently. Empty until a week has ended.
  const reviews = useWeeklyReviews();
  // Through the store's own selector (master plan section 10, P3 close-out), so Today and any
  // later refusal-reading view bind to one definition of "the last attempt was refused".
  const actionError = useActionError();

  const [skipOpen, setSkipOpen] = useState(false);
  // Spec R1: the session the user opened and has not finished, on whatever date it was opened.
  const open = useOpenAssignment();
  // D01: the refusal banner sits below the controls; bring it into view when one appears.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionError === null) return;
    const banner = bannerRef.current;
    if (banner !== null && typeof banner.scrollIntoView === 'function') {
      banner.scrollIntoView({ block: 'nearest' });
    }
  }, [actionError]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // ROADMAP B1b/L7: the goal chosen for the next programme while its panel is open, else null.
  const [nextGoal, setNextGoal] = useState<GoalKind | null>(null);
  // The stored entry itself (stable identity), so the selector cannot loop the subscription.
  const latestWeighIn = useAppStore((s) =>
    s.activeProfileId === null ? null : latestBodyMassEntry(s, s.activeProfileId),
  );

  if (profile === null || plan === null || cursor === null || day === null) {
    return (
      <div className="view today">
        <div className="today-hero">
          <HeroName text={c('hero.noPlan')} />
          <p className="today-sub">{c('advice.completeSetup')}</p>
        </div>
      </div>
    );
  }

  const profileId = profile.id;
  /*
   * Spec R1 (C01/D01): an open session is shown, finished and returned to on its own date,
   * whatever the clock says, so a session left open overnight is never stranded.
   */
  const status: DayStatus = open !== null ? 'in-progress' : dayStatus(day);
  const session =
    open !== null ? (plan.sessions.find((s) => s.id === open.sessionId) ?? null) : day.projectedSession;
  const sessionDate = open !== null ? open.date : today;
  const total = plan.sessions.length; // [sessions] materialised so far: a clamp, never an "of N"
  const finished = cursor.completedOn !== null;
  // [sessions] 1-based, clamped: the cursor stops AT the plan length, so the last session must
  // not be reported as "S 7/6" once it is closed.
  const shown = Math.min(cursor.nextSessionIndex + 1, total);
  const position = FORMAT.planPosition(shown, '');
  const canRun = status === 'planned' || status === 'in-progress';
  /*
   * Spec R3 (D02): any day without a session of its own can train the cursor's next one. The
   * forecast places sessions on preferred days; it never forbids the others.
   */
  const canStartAnyway =
    status === 'rest' &&
    !finished &&
    openPause === null &&
    plan.sessions[cursor.nextSessionIndex] !== undefined;
  // The week that closed most recently, or null while the plan is in its first week. The array
  // is the store's own, sorted oldest first by closeWeeks(). A stored week after the one the
  // programme completed in is skipped: builds before ROADMAP B1's fix graded those as misses,
  // and documents saved then still hold them.
  // D11: only this programme's weeks; a review of the plan Start Next Programme replaced is history.
  const graded = reviews.filter((r) => isInProgramme(r.weekStart, cursor));
  const lastReview: WeeklyReview | null =
    graded.length === 0 ? null : (graded[graded.length - 1] ?? null);
  /*
   * The mascot beside the hero (stylize survey item 5), from one map in todayHero.ts. A missed
   * week on screen outranks every pose: the popup while it is owed, then the intervention block,
   * neither of which is shown once the programme is finished.
   */
  const pose = heroPose(heroStateOf(status, finished), !finished && missedWeek(lastReview));
  // Her sheet, decorative (aria-hidden): every hero's heading says what the picture shows. Two
  // cycles, then frame 0: the marquee stays the one thing that keeps moving on Today. Keyed by
  // the sheet, so a new pose (lifting to resting on completion) plays rather than cuts.
  const mascot =
    pose === null ? null : (
      <SpriteSheet key={pose} sheet={HER_SHEETS[pose]} scale={HERO_SCALE} iterations={HER_PLAY_CYCLES} />
    );
  /*
   * ROADMAP L7: the goal Start Next Programme preselects, maintenance once the body-mass target
   * was reached (src/domain/plan/lifecycle.ts states the rule). Read only by the finished hero.
   */
  const suggestion = nextProgrammeGoal(
    profile.goal,
    latestWeighIn?.massKg ?? null, // [kg]
    profile.body.baselineMassKg, // [kg] the mass the target was set against
  );

  /*
   * The ticker's lines (P8 Task 14, round-three plan section 2.4). Every line is a string a
   * FORMAT frame produced from the domain's own counts: the marquee places text and formats
   * nothing, so no number can be restated on its way to the strip.
   *
   * ORDER IS THE SPECIFICATION. Under prefers-reduced-motion the strip stops and shows the FIRST
   * line alone, so the first line is the cursor position: where the plan stands is the fact that
   * has to survive every other line being scrolled away.
   */
  const marqueeItems: MarqueeItem[] = [
    { icon: 'barbellPanel', text: FORMAT.planPositionLabel(shown, '', overrides) },
  ];
  /*
   * THE POPUP OWNS AN UNACKNOWLEDGED MISS, so the ticker stays off it.
   *
   * `missHandled` is false on exactly one kind of week: a miss P6's modal has not yet been
   * answered for. src/domain/schedule/weekly.ts writes it as `delta >= 0` at close, so every met
   * or beaten week arrives with it already true, and src/store/motivationActions.ts sets it true
   * on dismissal. Testing it here therefore costs a met week nothing and keeps the verdict on a
   * pending miss in one place: scrolling "1 of 4. flop era." past the user while the modal is
   * still asking about that same week is the duplication code review A59 recorded, and it is the
   * same rule Intervention.tsx already applies to the block further down the screen.
   *
   * reviewVerdict (weekly.ts) drops a week that asked for nothing, and a legacy paused review.
   */
  if (lastReview !== null && reviewVerdict(lastReview) !== 'none' && lastReview.missHandled) {
    marqueeItems.push({
      icon: lastReview.delta < 0 ? 'skull' : 'crownPanel',
      text: FORMAT.withSlots(
        weekDeltaKey(lastReview),
        // [sessions] and [sessions/week], both the review's own.
        { completed: lastReview.completed, target: lastReview.target },
        overrides,
      ),
    });
  }

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
    const startedAt = Date.now(); // [ms] epoch, UTC
    // Spec R1: anything left open on an earlier day is closed first, so it can never refuse this.
    useAppStore.getState().closeStaleSessions(profileId, startedAt);
    useAppStore.getState().startSession(profileId, today, startedAt);
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
    // The open session closes on ITS date (spec R1); otherwise today's.
    useAppStore.getState().completeSession(profileId, sessionDate, Date.now()); // [ms] epoch, UTC
  };
  const onConfirmSkip = (): void => {
    // Spec R2: Skip Today postpones. The cursor holds, so the same session is next on any later day.
    useAppStore.getState().postponeSession(profileId, today);
    setSkipOpen(false);
  };
  const onPick = (label: string): void => {
    useAppStore.getState().assignToday(profileId, today, label);
    setPickerOpen(false);
  };

  /*
   * Brief 4.1: Start is the hero's own control, the screen's one sticker, directly under the
   * session name, so it is above the fold and above the tab bar on a 320 x 640 phone.
   */
  const startButton =
    status === 'planned' || canStartAnyway ? (
      <button type="button" className="is-primary today-start" onClick={onStart}>
        {/*
         * P8 Task 13 step 7: the labelled form puts the `nails` icon in front of the string; the
         * icon carries alt="", so the accessible name is the string alone.
         */}
        <SkinLabel copyKey="button.startSession" />
      </button>
    ) : null;

  let hero: JSX.Element;
  if (status === 'in-progress') {
    hero = (
      <div className="today-hero">
        {mascot}
        <HeroName text={c('hero.sessionInProgress')} />
        {session !== null && <p className="today-sub">{sessionTitle(plan, session)}</p>}
        <p className="today-position">{position}</p>
      </div>
    );
  } else if (status === 'paused') {
    hero = (
      <div className="today-hero">
        {mascot}
        <HeroName text={FORMAT.pausedSince(openPause === null ? today : openPause.from, overrides)} />
        <p className="today-sub">{c('advice.pauseHoldsCursor')}</p>
        <p className="today-position">{position}</p>
      </div>
    );
  } else if (status === 'completed' || status === 'skipped') {
    const reason = day.assignment?.skipReason ?? null;
    hero = (
      <div className="today-hero">
        {mascot}
        <HeroName
          text={c(status === 'completed' ? 'hero.sessionCompleted' : 'hero.sessionSkipped')}
        />
        {session !== null && <p className="today-sub">{sessionTitle(plan, session)}</p>}
        {reason !== null && <p className="today-sub">{FORMAT.skipReason(reason, overrides)}</p>}
        <p className="today-position">{position}</p>
      </div>
    );
  } else if (session !== null) {
    hero = (
      <div className="today-hero">
        {mascot}
        <HeroName text={sessionTitle(plan, session)} />
        {startButton}
        <p className="today-sub">
          {FORMAT.sessionSummary(
            session.label,
            day.slot === null ? NO_VALUE : day.slot.startTime, // "HH:mm", profile's zone
            session.exercises.length,
          )}
        </p>
        <p className="today-position">{position}</p>
        <ul className="session-list">
          {session.exercises.map((ex) => (
            <li key={ex.exerciseId} className="sess-row">
              <span className="sess-name">{exerciseName(ex.exerciseId)}</span>
              <span className="sess-rep">
                {FORMAT.setsBy(
                  formatSets(ex.setsLo, ex.setsHi), // [sets]
                  formatPrescription(ex.prescription),
                  overrides,
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
        {mascot}
        <HeroName text={c('hero.programmeComplete')} />
        <p className="today-sub">
          {FORMAT.programmeClosed(total, cursor.completedOn ?? today)}
        </p>
        <p className="today-position">
          {FORMAT.planPosition(shown, c('status.planComplete'))}
        </p>
      </div>
    );
  } else {
    const next = nextServedDay(upcoming);
    hero = (
      <div className="today-hero">
        {mascot}
        <HeroName text={c('hero.noSessionToday')} />
        {startButton}
        <p className="today-sub">
          {next === null || next.slot === null || next.projectedSession === null
            ? c('advice.noSessionIn14Days')
            : FORMAT.nextSession(
                formatWeekday(next.date),
                next.slot.startTime,
                next.projectedSession.label,
                overrides,
              )}
        </p>
        <p className="today-position">{position}</p>
      </div>
    );
  }

  return (
    <div className="view today">
      {/*
       * The one strip that moves, above everything, as the design places it. Marquee renders
       * nothing for an empty item list, so this call site asks no further question.
       */}
      <Marquee items={marqueeItems} label={c('button.pauseTicker')} />

      {hero}

      <div className="today-controls">
        {status === 'in-progress' && (
          <button type="button" className="is-primary" onClick={goTrain}>
            {c('button.returnToSession')}
          </button>
        )}
        {canRun && (
          <button type="button" onClick={onComplete}>
            {c('button.markCompleted')}
          </button>
        )}
        {status === 'planned' && (
          <button
            type="button"
            onClick={() => {
              setSkipOpen(true);
            }}
          >
            <SkinLabel copyKey="button.skipToday" />
          </button>
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
            <SkinLabel copyKey="button.trainSomethingElse" />
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
            <SkinLabel copyKey="button.pausePlan" />
          </button>
        )}
        {openPause !== null && (
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().resumePlan(profileId, today);
            }}
          >
            {c('button.resumePlan')}
          </button>
        )}
        {/* ROADMAP B1b: a finished programme offers the next one, from today. */}
        {finished && nextGoal === null && (
          <button
            type="button"
            onClick={() => {
              setNextGoal(suggestion.goal);
            }}
          >
            {c('button.startNextProgramme')}
          </button>
        )}
      </div>

      {actionError !== null && (
        /*
         * A refusal, not a failure, rendered below the control that raised it (D01). The
         * document was left exactly as it was (see the refusal/defect split in
         * src/store/scheduleActions.ts). role="alert" because it answers a control the user
         * just pressed.
         *
         * P4 review item 4: the domain's own wording is what the STORE holds, and what the
         * classifier in scheduleActions.ts sorts on, but it is not what the user reads. It
         * opens with the name of the function the store called ("startSession: the plan is
         * paused on 2026-03-02"), which names nothing the user did and nothing they can act
         * on, and it is assembled outside src/content/copy.ts and so outside the skin system.
         * src/ui/format/refusal.ts maps it onto a copy key with the date as a slot.
         *
         * THE OVERLAY IS PASSED (P8 close-out B). The mapper has accepted one since it was
         * written and this call site did not supply it, so the one sentence on this screen that
         * reports a refusal rendered the clinical words while every control beside it followed
         * the skin. The date inside it is the domain's either way: the mapper substitutes into a
         * slot and no skin can reach the value.
         */
        <div className="today-banner" role="alert" ref={bannerRef}>
          <span className="banner-tag">{c('banner.actionRefused.tag')}</span>
          <span>{refusalLine(actionError, overrides)}</span>
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().clearActionError();
            }}
          >
            {c('button.dismiss')}
          </button>
        </div>
      )}

      {finished && nextGoal !== null && (
        <RestartProgramme
          titleKey="button.startNextProgramme"
          profileId={profileId}
          today={today}
          choice={{ goal: nextGoal }}
          onClose={() => {
            setNextGoal(null);
          }}
        >
          <div className="view-field">
            <label htmlFor="next-programme-goal">{c('label.goal')}</label>
            <select
              id="next-programme-goal"
              value={nextGoal}
              onChange={(e) => {
                const next = GOAL_OPTIONS.find((o) => o.value === e.target.value);
                if (next !== undefined) setNextGoal(next.value);
              }}
            >
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {c(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
          {/* L7: one sentence, only when the default was moved to maintenance. */}
          {suggestion.targetReached && (
            <p className="view-note">{c('advice.targetReachedMaintenance')}</p>
          )}
        </RestartProgramme>
      )}

      {skipOpen && (
        <div className="today-skip view-field">
          {/* Spec R2: postpones; nothing is recorded but the date, so no reason is asked. */}
          <button type="button" onClick={onConfirmSkip}>
            {c('button.confirmSkip')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSkipOpen(false);
            }}
          >
            {c('button.cancel')}
          </button>
        </div>
      )}

      {pickerOpen && labels.length > 0 && (
        <div className="today-picker" data-testid="label-picker">
          <p className="today-eyebrow">{c('status.remainingThisWeek')}</p>
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                onPick(label);
              }}
            >
              {FORMAT.trainLabelToday(label, overrides)}
            </button>
          ))}
        </div>
      )}

      {/*
       * The week that has just closed, in exactly one of its two forms: the stamp when its
       * target was met, the intervention when it was missed AND the popup has already been
       * answered. The two predicates are disjoint on the stored delta, so "one of them, never
       * both" is a property of the components rather than a branch here that could drift from
       * them. Both render nothing while the week is still owed its popup, which P6's modal owns.
       *
       * Not after Programme Complete (ROADMAP B1b): the last review stood there until a new plan
       * started, which nothing on screen offered; Start Next Programme above takes its place.
       */}
      {/* Spec R9 / audit G02: a weigh-in any day, not only inside a session. */}
      <MeasurementsPanel profile={profile} today={today} />
      {/* Spec R9 / audit G07: a drink can be logged at any time, not only when a cue is up. */}
      <FluidQuickAdd profile={profile} today={today} />
      {!finished && <WeekStamp review={lastReview} />}
      {!finished && <Intervention review={lastReview} />}

      {/*
       * P8 Task 7's capsule, on the screen the user opens daily. `now` is this render's single
       * clock reading, so the capsule's civil date cannot straddle a midnight the strip above it
       * has already crossed.
       */}
      <TimeCapsule now={now} />

      {/*
       * The list is named by the heading it sits under (aria-labelledby), not by a second copy
       * of the same string in an aria-label: one string in the DOM, and a reworded heading
       * cannot leave the list announcing the old wording.
       */}
      <h2 id="today-strip-heading" className={displayClass(c('hero.nextFourteenDays'))}>
        {c('hero.nextFourteenDays')}
      </h2>
      <ol className="today-strip" aria-labelledby="today-strip-heading">
        {upcoming.map((d) => {
          const s = dayStatus(d);
          return (
            <li key={d.date} className="strip-day" data-testid="strip-day" data-status={s}>
              <span className="sd-weekday">{formatWeekday(d.date)}</span>
              <span className="sd-date">{formatDayOfMonth(d.date)}</span>
              <span className="sd-time">{d.slot === null ? NO_VALUE : d.slot.startTime}</span>
              <span className="sd-label">
                {d.projectedSession === null ? c('status.dayRest') : d.projectedSession.label}
              </span>
              <StatusGlyph status={s} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

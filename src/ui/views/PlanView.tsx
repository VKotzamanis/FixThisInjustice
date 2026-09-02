import { useEffect, type JSX } from 'react';
import { FORMAT, copy } from '../../content/copy';
import type { PlanBlock, PlannedSession } from '../../domain/types';
import { useActiveCursor } from '../../store/scheduleSelectors';
import { useActivePlan } from '../../store/selectors';
import {
  exerciseName,
  formatPrescription,
  formatRest,
  formatSets,
  planRowDomId,
} from '../format/plan';
import {
  browseWeek,
  resetPlanBrowse,
  sessionsPerWeekOf,
  usePlanBrowseWeek,
  weekCountOf,
  weekOfIndex,
} from '../planBrowse';
import { requestPlanFocus, usePlanRowFocus } from '../planFocus';
import './views.css';

/**
 * The Plan view.
 *
 * The plan is calendar-free: blocks and sessions in the order the programme runs them, with
 * the cursor marking the one that comes next. Nothing here reads a date, and nothing here
 * writes: the week scrubber is a VIEW of the session list, not a position in it, so scrubbing
 * cannot desynchronise the programme (code review A14, where moving the week silently changed
 * the session shown under "today is ...").
 *
 * A deload block cuts VOLUME and leaves the load alone (master plan section 5, content review
 * section 2.2, Bosquet 2007: `setModifier` 0.4-0.6, `loadModifier` fixed at 1). Both the note
 * on the chip and the set counts in a deload week are computed from the block's OWN
 * `setModifier`, so neither can overstate a cut the plan does not make.
 */

/**
 * The note on a deload chip, from the block's own set modifier.
 *
 * @param setModifier dimensionless multiplier on the planned set count, 1 = unchanged
 */
export function deloadNote(setModifier: number): string {
  const cutPct = Math.round((1 - setModifier) * 100); // [%] of planned sets removed
  return FORMAT.deloadNote(cutPct);
}

/**
 * The set count a block actually prescribes.
 *
 * @param sets [sets] the planned count
 * @param setModifier dimensionless block multiplier
 * @returns [sets] whole sets, never fewer than one
 *
 * Rounded rather than truncated, so a 3-set lift in a 0.5 deload is 2 sets and not 1, and
 * floored at one set, because a count that rounds to nothing would print a session with no
 * work in it. The LOAD is never touched here: a deload block carries `loadModifier === 1`.
 */
export function modifiedSets(sets: number, setModifier: number): number {
  return Math.max(1, Math.round(sets * setModifier));
}

/** The block a session position falls in, or null past the end of the last block. */
export function blockOfSession(
  blocks: readonly PlanBlock[],
  sessionIndex: number,
): PlanBlock | null {
  return (
    blocks.find(
      (b) =>
        sessionIndex >= b.firstSessionIndex &&
        sessionIndex < b.firstSessionIndex + b.sessionCount,
    ) ?? null
  );
}

/** One session and its exercises, as the block it sits in prescribes them. */
function SessionCard(props: {
  session: PlannedSession;
  block: PlanBlock | null;
  isNext: boolean;
}): JSX.Element {
  const { session, block, isNext } = props;
  const setModifier = block?.setModifier ?? 1; // dimensionless, 1 = as planned
  return (
    <li
      className={'plan-session' + (isNext ? ' is-next' : '')}
      data-testid="plan-session"
      data-cursor={isNext ? 'true' : 'false'}
    >
      <div className="ps-head">
        {/* The plan position of this session. PlannedSession.ordinal is 1-based and the
            invariant sessions[i].ordinal === i + 1 is maintained by the domain, including
            across assignToday's swap, so it is read rather than recomputed from the index. */}
        <span className="ps-ordinal">{String(session.ordinal).padStart(2, '0')}</span>
        <h3 className="ps-name">{session.name}</h3>
        <span className="ps-label">{session.label}</span>
        {isNext && <span className="ps-cursor">{copy('status.nextSession')}</span>}
      </div>
      <div className="ps-list">
        {session.exercises.map((ex) => (
          <div
            key={ex.exerciseId}
            /* P8 Task 8 deep-links to this row by id; the shape lives in format/plan.ts so the
               link and the row cannot drift apart. */
            id={planRowDomId(session.id, ex.exerciseId)}
            /* -1, not 0: the deep link focuses the row programmatically so a screen reader is
               moved to it, but a plan of thirty rows must not add thirty stops to the tab
               order the user walks to reach the week scrubber. */
            tabIndex={-1}
            className="ps-row"
            data-testid="plan-row"
          >
            <span className="ps-ex">{exerciseName(ex.exerciseId)}</span>
            <span className="ps-sets">
              {FORMAT.setsBy(
                formatSets(
                  modifiedSets(ex.setsLo, setModifier), // [sets]
                  modifiedSets(ex.setsHi, setModifier), // [sets]
                ),
                formatPrescription(ex.prescription),
              )}
            </span>
            <span className="ps-rest">{formatRest(ex.restS)}</span>
          </div>
        ))}
      </div>
    </li>
  );
}

export function PlanView(): JSX.Element {
  const plan = useActivePlan();
  const cursor = useActiveCursor();
  /*
   * null means "follow the cursor". Seeding the state with the cursor's week instead would
   * capture the FIRST render only, and the first render happens before hydrate() has put the
   * stored plan in place, so a reload would open the Plan view on week 1 of whatever the
   * cursor said at boot. Deriving the shown week and letting a scrub override it keeps the
   * default correct without a synchronising effect.
   *
   * The scrub position lives in src/ui/planBrowse.tsx rather than in a useState here (P8 Task
   * 9): the keys that move it are bound one level up, in the shell that owns the app's single
   * keydown listener, and a local setter is unreachable from there. It is still a VIEW of the
   * plan and never a position in it - nothing on this screen writes to the store (A14).
   */
  const browsedWeek = usePlanBrowseWeek();

  /*
   * The shown week is derived ABOVE the early return, not after it, because the deep-link
   * effect below needs it and a hook cannot sit after a conditional return. Each fallback is
   * the value the corresponding branch of that return renders under: no plan means one week,
   * showing week 0, which is what the "no plan" message occupies.
   */
  // [sessions/week] A plan that claims none would divide the scrubber by zero.
  const spw = sessionsPerWeekOf(plan);
  // [weeks] Derived from the sessions actually held, not from PlanTemplate.weeks: the
  // scrubber must not offer a week the session list cannot fill.
  const weekCount = weekCountOf(plan);
  const cursorWeek = cursor === null ? 0 : weekOfIndex(cursor.nextSessionIndex, spw);
  const week = Math.min(Math.max(browsedWeek ?? cursorWeek, 0), weekCount - 1); // 0-based

  /*
   * The browse position is module state, so it outlives this component unless something clears
   * it. Cleared on unmount, which keeps the behaviour the local useState had: leaving the view
   * and coming back shows the cursor's week, not the week that was being read ten minutes ago.
   */
  useEffect(() => resetPlanBrowse, []);

  /*
   * Delivers a deep link from the spotlight palette to one row (P8 Task 8). Called here,
   * unconditionally and above the early return below, because it is a hook: putting it after
   * the `plan === null` exit would change the hook order between renders.
   */
  const focusTarget = usePlanRowFocus();

  /*
   * PHASE ONE of the deep link: put the target's week on screen. The hook above can only focus
   * a row that EXISTS, and this view renders one week at a time, so a link into another week
   * would otherwise be consumed against an empty document - the user asks for a session in
   * week 3 and the screen does not move. Which week holds a session is a fact about the plan,
   * so it is resolved here and not in planFocus.tsx.
   *
   * The scrub is skipped when the target is already on screen, so an ordinary deep link does
   * not silently pin a view that was following the cursor.
   */
  useEffect(() => {
    if (focusTarget === null || plan === null) return;
    const index = plan.sessions.findIndex(
      (session) =>
        session.id === focusTarget.sessionId &&
        session.exercises.some((ex) => ex.exerciseId === focusTarget.exerciseId),
    );
    if (index === -1) {
      // No week of this plan holds the row, so no scrub can reveal it and phase two will never
      // fire. Withdraw, or the request waits for a later plan that never asked for it.
      requestPlanFocus(null);
      return;
    }
    const targetWeek = weekOfIndex(index, spw);
    if (targetWeek !== week) browseWeek(targetWeek);
  }, [focusTarget, plan, spw, week]);

  // Every hook runs before this return, so the early exit does not change the hook order.
  if (plan === null || cursor === null) {
    return (
      <div className="view plan">
        <h2>{copy('nav.plan')}</h2>
        <p className="view-note">{copy('hero.noPlan')}</p>
      </div>
    );
  }

  const firstIndex = week * spw;
  const sessions = plan.sessions.slice(firstIndex, firstIndex + spw);
  const cursorBlock = blockOfSession(plan.blocks, cursor.nextSessionIndex);
  // The set modifier applies per BLOCK, and a week can straddle two of them, so the deload
  // line is shown when any session in the shown week sits in a deload block.
  const deloadBlock =
    sessions
      .map((_, i) => blockOfSession(plan.blocks, firstIndex + i))
      .find((b) => b !== null && b.isDeload) ?? null;

  return (
    <div className="view plan">
      <h2>{copy('nav.plan')}</h2>

      <div className="plan-blocks" role="group" aria-label={copy('label.blockStrip')}>
        {plan.blocks.map((block) => {
          const from = block.firstSessionIndex + 1; // 1-based plan position
          const to = block.firstSessionIndex + block.sessionCount; // inclusive
          const isCurrent = cursorBlock !== null && cursorBlock.index === block.index;
          return (
            <button
              key={block.index}
              type="button"
              className={'plan-chip' + (block.isDeload ? ' is-deload' : '')}
              /* The cursor's block, which is a fact about the programme, is separate from the
                 block the scrubber is showing, which is a fact about this screen. */
              data-current={isCurrent ? 'true' : 'false'}
              aria-pressed={weekOfIndex(block.firstSessionIndex, spw) === week}
              onClick={() => {
                browseWeek(weekOfIndex(block.firstSessionIndex, spw));
              }}
            >
              <span className="pc-id">{FORMAT.blockLabel(block.index + 1)}</span>{' '}
              <span className="pc-range">{FORMAT.blockSessions(from, to)}</span>
              {block.isDeload && (
                <>
                  {' '}
                  <span className="pc-flag">{copy('status.deloadTag')}</span>{' '}
                  <span className="pc-note">{deloadNote(block.setModifier)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="plan-scrub">
        <label htmlFor="plan-week">{copy('label.week')}</label>
        <input
          id="plan-week"
          type="range"
          min={1}
          max={weekCount}
          step={1}
          value={week + 1}
          onChange={(e) => {
            browseWeek(Number(e.target.value) - 1);
          }}
        />
        <span className="plan-week-label" data-testid="week-label">
          {FORMAT.weekOfCount(week + 1, weekCount)}
        </span>
      </div>

      {deloadBlock !== null && (
        <>
          <p className="view-note">{copy('advice.deloadBlock')}</p>
          {/* R9: the set counts beside this are what the user acts on; the multiplication
              that produced them is not, so it sits behind the disclosure. */}
          <details data-testid="deload-basis">
            <summary>{copy('disclosure.why')}</summary>
            <p className="view-note">{FORMAT.deloadSetsBasis(deloadBlock.setModifier)}</p>
          </details>
        </>
      )}

      <ol className="plan-sessions">
        {sessions.map((session, i) => {
          const index = firstIndex + i; // 0-based plan position
          return (
            <SessionCard
              key={session.id}
              session={session}
              block={blockOfSession(plan.blocks, index)}
              isNext={index === cursor.nextSessionIndex}
            />
          );
        })}
      </ol>
    </div>
  );
}

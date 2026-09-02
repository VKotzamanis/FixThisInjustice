// src/ui/format/refusal.ts
//
// One schedule refusal, in the words the user reads.
//
// P4 REVIEW ITEM 4. `status.lastActionError` holds the message the DOMAIN threw, and the Today
// banner rendered it verbatim: "startSession: the plan is paused on 2026-03-02". The prefix is
// a function name the user never called and cannot act on, and the sentence around it is
// English assembled in src/domain/schedule/, outside the copy table and therefore outside the
// skin system. This module maps the messages those modules mint onto `status.refusal*` keys.
//
// Why the domain keeps throwing strings. src/store/scheduleActions.ts classifies a throw as a
// refusal on TWO independent agreements, and one of them is the SHAPE of the message ("<fn>: "
// for cursor.ts, RangeError for calendar.ts). That classifier is the load-bearing safety
// mechanism - it is what keeps a TypeError from being reported to the user as a schedule
// problem - so the message shape is left exactly as it is and the mapping happens here, at the
// display boundary, where getting it wrong costs a generic sentence rather than a swallowed
// defect.
//
// Why matching on text is acceptable HERE and would not be in the store. A miss costs one
// generic line; the document is untouched either way, because the refusal already happened
// before this file is reached. The patterns are pinned to the domain modules by
// refusal.test.ts, so a reworded throw fails that suite rather than reaching the banner as an
// unrecognised string.

import { FORMAT, copy, type CopyKey } from '../../content/copy';

/**
 * The seven schedule entry points whose names cursor.ts stamps on a message.
 *
 * Kept in step with DOMAIN_FUNCTIONS in src/store/scheduleActions.ts, which is the list the
 * classifier admits: a name that file does not accept never reaches this one.
 */
const DOMAIN_FUNCTIONS = [
  'startSession',
  'completeSession',
  'skipSession',
  'pausePlan',
  'resumePlan',
  'assignToday',
  'closeWeeks',
] as const;

/** A LocalDate as the domain writes it into a message. */
const DATE = String.raw`\d{4}-\d{2}-\d{2}`;

/**
 * The refusals the schedule domain mints, in the order they are tried.
 *
 * Each entry is the message body EXACTLY as its module writes it, with the values captured.
 * Anchored at both ends: a partial match would let an unrelated message borrow a sentence.
 *
 *   1-2. src/domain/schedule/cursor.ts, assignmentFor()'s two gates.
 *   3-5. src/domain/schedule/calendar.ts, gateReason()'s remaining three branches (its first
 *        is the same paused-day sentence as 1).
 *   6.   src/domain/schedule/calendar.ts, notOffered(). The label arrives JSON-quoted and the
 *        quotes are stripped: the rendered sentence sets the label off already, and the list
 *        of what IS offered is dropped because those labels are on screen as the controls the
 *        user is looking at.
 */
const PATTERNS: readonly {
  readonly match: RegExp;
  readonly key: CopyKey;
  readonly params: (m: RegExpExecArray) => Record<string, string>;
}[] = [
  {
    match: new RegExp(String.raw`^the plan is paused on (${DATE})$`),
    key: 'status.refusalPaused',
    params: (m) => ({ date: m[1] ?? '' }),
  },
  {
    match: new RegExp(String.raw`^a session is already in progress on (${DATE})$`),
    key: 'status.refusalSessionOpen',
    params: (m) => ({ date: m[1] ?? '' }),
  },
  {
    // calendar.ts says "open" where cursor.ts says "in progress"; the state is the same one
    // (a non-terminal assignment on another day), so it gets the same sentence.
    match: new RegExp(String.raw`^a session is already open on (${DATE})$`),
    key: 'status.refusalSessionOpen',
    params: (m) => ({ date: m[1] ?? '' }),
  },
  {
    match: new RegExp(String.raw`^session already started on (${DATE})$`),
    key: 'status.refusalAlreadyStarted',
    params: (m) => ({ date: m[1] ?? '' }),
  },
  {
    match: new RegExp(String.raw`^(${DATE}) is not the next session day$`),
    key: 'status.refusalNotNextDay',
    params: (m) => ({ date: m[1] ?? '' }),
  },
  {
    match: new RegExp(
      String.raw`^"(.*)" is not among the sessions remaining on (${DATE}) \(.*\)$`,
    ),
    key: 'status.refusalLabelNotOffered',
    params: (m) => ({ label: m[1] ?? '', date: m[2] ?? '' }),
  },
];

/** The message with its `"<fn>: "` prefix removed, when it carries one of the seven names. */
function withoutFunctionName(message: string): string {
  for (const fn of DOMAIN_FUNCTIONS) {
    const prefix = `${fn}: `;
    if (message.startsWith(prefix)) return message.slice(prefix.length);
  }
  return message;
}

/**
 * The user-facing line for one refusal message from `status.lastActionError`.
 *
 * Unrecognised input - a window invariant, a guard that names a profile id, anything a later
 * change adds without a pattern here - falls back to `status.refusalUnrecognised`. The
 * fallback states the outcome and no cause: naming one this build cannot identify would be a
 * guess presented as a fact, and the function name is never shown under any branch.
 *
 * @param message the domain's own thrown text, as the store recorded it.
 * @param overrides the skin overlay, passed straight through to `copy`.
 */
export function refusalLine(
  message: string,
  overrides?: Partial<Record<CopyKey, string>>,
): string {
  const body = withoutFunctionName(message);
  for (const pattern of PATTERNS) {
    const m = pattern.match.exec(body);
    if (m !== null) return FORMAT.withSlots(pattern.key, pattern.params(m), overrides);
  }
  return copy('status.refusalUnrecognised', overrides);
}

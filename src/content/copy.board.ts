import type { CopyKey } from './copy';

/**
 * The departures-board copy table, merged over the clinical default per key.
 *
 * Source: docs/design/round2/2026-09-01-design-H-departures-board.html, the copy table near the
 * end. Register: upper case throughout, because a split-flap board has no lower case, and every
 * term is an airport term used in its real sense. Unlike limelight this column carries no slang
 * and no joke; the humour, such as it is, comes from the discipline.
 *
 * COVERAGE IS DELIBERATELY THINNER THAN LIMELIGHT'S. Round two's table is sixteen rows, which is
 * the round-three set minus its five additions, and the board is a second skin rather than the
 * one the brief was written about. What is here is that table mapped onto CopyKeys, the three
 * week-delta rows and the personal-record stamp it implies, and the nav, without which a board
 * whose title bar says DEPARTURES and whose tab says "Train" reads as two designs. Everything
 * else falls through to the clinical string, which is the point of a partial table.
 *
 * The same four rules bind this file as bind copy.limelight.ts: slots and numbers are the
 * default's, no emoji, and no camp on a control whose misreading costs data.
 *
 * ONE DEPARTURE FROM THE DESIGN DOCUMENT. Its hydration row read `REFRESHMENT - DRINK TO THIRST`
 * with an em-dash. Contract R5 forbids an em-dash as a connector in every skin and prescribes a
 * colon, which is what this table uses.
 */
export const BOARD_COPY: Readonly<Partial<Record<CopyKey, string>>> = {
  // --- round two's sixteen rows, mapped onto CopyKeys ---
  'button.startSession': 'BOARD',
  'status.rest': 'GATE HOLD',
  'button.skipToday': 'CANCEL SERVICE',
  'button.pausePlan': 'HOLD SCHEDULE',
  'button.trainSomethingElse': 'REBOOK',
  // Two counts, as slots, exactly as in the clinical and limelight tables: a board changes the
  // word beside a number and never the number.
  'status.weekDeltaNegative': '{completed} OF {target} DEPARTED. SERVICE DISRUPTED.',
  'status.weekDeltaZero': '{completed} OF {target} DEPARTED. ALL ON TIME.',
  'status.weekDeltaPositive': '{completed} OF {target} DEPARTED. EXTRA SERVICE.',
  'advice.drinkToThirst': 'REFRESHMENT: DRINK TO THIRST',
  'status.prReached': 'NEW RECORD TIME',
  'hero.weeklyTargetMissed': 'IRREGULAR OPERATIONS',
  'status.sessionCursor': 'SERVICE {shown} OF {total}',
  'status.planProgress': '{completed} DEPARTED. {skipped} CANCELLED. {remaining} SCHEDULED.',
  'button.extendRest': '+30 S DELAY',
  'button.skipRest': 'EARLY DEPARTURE',
  'hero.weekReview': 'ARRIVALS',

  // --- the rows round three added, in the board's own vocabulary ---
  'hero.sessionCompleted': 'DEPARTED',
  'status.prStamp': 'NEW RECORD',
  // The met-week stamp (P8 close-out B), taken from round two section 5's copy table, whose
  // `week_delta_zero` column reads ALL DEPARTED. The board's own `status.weekDeltaZero` row
  // carries the two counts and ends ALL ON TIME, so the design's phrase was free for the stamp
  // and no board string now says the same thing twice.
  'status.weekMetStamp': 'ALL DEPARTED',
  'label.settingsSkin': 'DISPLAY',
  'button.markCompleted': 'MARK DEPARTED',
  'button.finishSession': 'CLOSE SERVICE',

  // The ticker's control (P8 Task 14). A board announces, so it carries the marquee; the strip
  // is a button whose only effect is to stop the line, and its name says so in the board's case.
  'button.pauseTicker': 'PAUSE TICKER',

  // --- the nav, so the tabs and the board speak one language ---
  'nav.today': 'TODAY',
  'nav.plan': 'SCHEDULE',
  'nav.train': 'DEPARTURES',
  'nav.log': 'ARCHIVE',
  'nav.atlas': 'CATALOGUE',
  'nav.settings': 'CONTROLS',
};

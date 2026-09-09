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
 * THE RULE THIS TABLE ADOPTS, AND THE ONE IT REJECTS (P9 Task 14).
 *
 * The rule: a row exists only where a real airport term already names the thing the key names.
 * Round two's section 5 supplies that vocabulary and states the test itself: "every one of these
 * is a real airport term used in its real sense".
 *
 * The alternative, rejected: mirror limelight's coverage, which is 120 rows against this table's
 * 37. Matching it would mean minting airport words for a hydration shortfall, a body-mass
 * check-in and a creatine dose. A board that says REFRESHMENT SERVICE IRREGULAR about a glass of
 * water is a joke wearing a uniform, and discipline is the only thing this skin has: the moment
 * it invents a term, the term stops being one.
 *
 * WHAT FALLS THROUGH TO THE CLINICAL STRING, ON PURPOSE. Distinct default keys each area
 * renders, counted against the tree on 2026-09-02:
 *
 *   the setup wizard       104 keys, 1 row (button.continue)
 *   the readiness screen     9 keys, 1 row (button.continue)
 *   the nutrition targets   20 keys, no row
 *   the migration wizard    34 keys, 1 row (button.cancel)
 *   the export view         18 keys, no row
 *   the data section         9 keys, no row
 *
 * Those two rows are the controls every flow shares, not a foothold. A board names a gate
 * control. It does not name a protein target.
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
  'hero.weeklyTargetMissed': 'IRREGULAR OPERATIONS',
  'status.sessionCursor': 'SERVICE {shown} OF {total}',
  // The one position where the board's upper case STOPS. `S` is the siemens and `s` is the
  // second (SI brochure table 4), so shouting the symbol with the sentence renames the quantity
  // the control changes; the words beside it still shout (P8 review).
  'button.extendRest': '+30 s DELAY',
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

  // --- P9 Task 14: the status vocabulary round two's section 5 already names ---
  // "each status also prints its word (ON TIME, DEPARTED, CANCELLED, HELD)", and the design's
  // Today screen is "a departures list, one row per upcoming session, with today's service
  // highlighted amber and marked BOARDING". The fourteen-day strip is that list, so its six
  // states take the six words rather than any this table would have to invent. `DEPARTED` also
  // stands at `hero.sessionCompleted`, which is the same fact stated on the session screen: a
  // real board prints one status word wherever it reports that status.
  'status.dayPlanned': 'SCHEDULED',
  'status.dayInProgress': 'BOARDING',
  'status.dayCompleted': 'DEPARTED',
  'status.daySkipped': 'CANCELLED',
  'status.dayPaused': 'HELD',
  'status.dayRest': 'NO SERVICE',
  // The screen heading, so it agrees with the tab `nav.train` already renames.
  'hero.train': 'DEPARTURES',
  // The empty day. The design's word is the first sentence; the second is the default's own
  // instruction and stays, because a board that reports no service still says where to book one.
  'advice.noSessionToday': 'NO SERVICE TODAY. PICK ONE ON TODAY.',
  // Two controls a concourse names in its own words. PROCEED is the sign at every gate, and
  // CANCEL is the term the design already uses for a service that will not run
  // (`button.skipToday` reads CANCEL SERVICE). The abort stays an abort: the copy suite checks
  // that no override puts a commit word on `button.cancel`.
  'button.continue': 'PROCEED',
  'button.introContinue': 'PROCEED', // mirrors button.continue: same control, separate key
  'button.cancel': 'CANCEL',

  // --- the nav, so the tabs and the board speak one language ---
  'nav.today': 'TODAY',
  'nav.plan': 'SCHEDULE',
  'nav.train': 'DEPARTURES',
  'nav.log': 'ARCHIVE',
  'nav.atlas': 'CATALOGUE',
  'nav.settings': 'CONTROLS',
};

import { copy } from './copy';

/**
 * Pre-participation readiness screening, modelled on the PAR-Q+.
 *
 * WHOSE WORDS THESE ARE. The seven questions are THIS PROJECT'S wording of the seven screening
 * domains the PAR-Q+ covers, not the PAR-Q+ text (master plan section 10.4, decision
 * `readiness-screen-own-wording`). The official PAR-Q+ 2025 form is published as "Copyright
 * PAR-Q+ Collaboration 2007-2026. All rights reserved." with no reproduction, embedding or
 * translation licence, and no written permission has been obtained. Reproducing the form
 * verbatim was rejected for that reason; `ReadinessScreen.test.tsx` asserts inequality against
 * the form's own sentences so a later edit cannot quietly paste them back in.
 *
 * WHAT THAT COSTS, STATED PLAINLY. The PAR-Q+ is a validated instrument and its validation
 * attaches to its wording. Re-worded questions carry no such validation, so this screen is a
 * safety prompt modelled on a validated instrument, NOT the instrument. The app says so in the
 * why? disclosure and takes the conservative branch: any yes advises a physician consult.
 *
 * THE SEVEN DOMAINS, in the order asked: diagnosed heart condition; chest pain at rest or on
 * exertion; dizziness or loss of consciousness in the last 12 months; another diagnosed chronic
 * condition; medication for a chronic condition; a bone, joint or soft tissue problem that
 * activity could worsen; a physician's instruction to exercise only under supervision.
 *
 * CITATION. The instrument being modelled is cited in READINESS_SOURCE below. It carries no
 * DOI, and none could be verified: the DOI usually quoted for the paper (10.14288/hfjc.v4i2.103)
 * returns "Resource not found" from Crossref, and Crossref holds no records at all for the
 * journal, so no article in it can carry a Crossref DOI. The string therefore says "DOI not
 * verified" in as many words, and a test asserts that it matches no DOI pattern, so it cannot be
 * quietly upgraded later without that test changing.
 *
 * TWO DELIBERATE DEVIATIONS FROM THE INSTRUMENT, both surfaced in the UI:
 *  1. No free text. The PAR-Q+ asks respondents to list conditions and medications. This app
 *     collects no medication or condition string (global constraint: Personal data) and
 *     `Profile.readiness` stores only `screenedAt` and `flagged`, so those prompts are absent
 *     and the screen renders no text input at all.
 *  2. Any yes routes to a physician. The PAR-Q+ routes a yes to its own follow-up pages and the
 *     ePARmed-X+. This app implements neither, so it takes the more conservative branch.
 *
 * The strings live in `copy.ts` with every other user-facing string, marked there as safety text
 * a skin may not reword.
 */

/** One screening question. `note` is the clarification that keeps a false positive out. */
export interface ReadinessQuestion {
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  text: string;
  /** null where the question needs no clarification. */
  note: string | null;
}

/**
 * The citation for the instrument this screen is modelled on.
 *
 * Reproduced from page 4 of the official PAR-Q+ 2025 form, which prints it with no DOI. Title,
 * journal, volume, pages and year only; "DOI not verified" is part of the string rather than a
 * comment beside it, so the claim travels with the citation wherever it is rendered.
 */
export const READINESS_SOURCE =
  'Warburton DER, Jamnik VK, Bredin SSD, Gledhill N, on behalf of the PAR-Q+ Collaboration. ' +
  'The Physical Activity Readiness Questionnaire for Everyone (PAR-Q+) and Electronic Physical ' +
  'Activity Readiness Medical Examination (ePARmed-X+). ' +
  'Health & Fitness Journal of Canada 4(2):3-23, 2011. DOI not verified. ' +
  'The questions on this screen are modelled on that instrument, not quoted from it.';

/** The seven questions, in the order they are asked. Ids are stable and are not display order. */
export const READINESS_QUESTIONS: readonly ReadinessQuestion[] = [
  { id: 1, text: copy('readiness.q1'), note: null },
  { id: 2, text: copy('readiness.q2'), note: null },
  { id: 3, text: copy('readiness.q3'), note: copy('readiness.q3Note') },
  { id: 4, text: copy('readiness.q4'), note: null },
  { id: 5, text: copy('readiness.q5'), note: null },
  { id: 6, text: copy('readiness.q6'), note: copy('readiness.q6Note') },
  { id: 7, text: copy('readiness.q7'), note: null },
] as const;

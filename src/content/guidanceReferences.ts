// src/content/guidanceReferences.ts
//
// The reference list for the guidance step, and the record of which claims have no reference at
// all.
//
// Round 2 claim r2.18. The step became eight collapsible topic boxes; this module is the single
// numbered list they all point into, matching the one brief K built at the foot of the body step
// (`src/content/bodyEquations.ts`, rendered by `SetupWizard.tsx` as `.wiz-refs`).
//
// WHY THIS IS NOT A COPY TABLE. Copy contract R10: reference text a user chooses to open is
// exempt from the length rules R1 to R4 and from R9, and lives in its own module rather than in a
// copy table. It is NOT exempt from R5 (no em dash, no connector en dash), R6 (no emoji) or R11
// (name the defined quantity), and `guidanceReferences.test.ts` asserts all three.
//
// <!-- decision: guidance-unsourced-ships-as-placeholder | status: adopted | supersedes: none -->
//
// THE PART THAT MATTERS MOST. Four of this step's claims have NO adequate source. Brief L section
// 3b closed the sourcing on 2026-09-09 (searched by a Codex researcher with live web access, then
// every DOI verified against CrossRef by the orchestrator; both fetches are logged in
// REFERENCES.md), and two of its four new topics came back empty. That is the finding, not a gap
// to fill. Each one ships as a `kind: 'unsourced'` entry that NAMES the claim, so the owner can
// drop his own recommendation into a row that already exists. A weak source substituted to fill a
// row would be a defect, not a citation.
//
// SPECIFICALLY REJECTED, and recorded so nobody re-adds it: Convertino et al. 1996, the ACSM
// position stand *Exercise and Fluid Replacement*, DOI 10.1097/00005768-199610000-00045, for the
// electrolyte threshold. It resolves and it is real, and it is the 1996 stand SUPERSEDED by the
// 2007 one this project already cites (entry 10 below). Citing a superseded guideline when its
// replacement is already in the tree is a defect. Its "greater than 1 hour" figure was NOT
// carried across to the 2007 citation either: that would attach a number to a paper which was not
// checked for it. Entry 16 is therefore unsourced rather than cheaply sourced.
//
// ALSO REJECTED: Peacock et al. 2012, DOI 10.1016/j.appet.2011.08.023, for the in-session water
// volume. A 100-minute gym session containing only 20 minutes of resistance exercise, ad libitum
// water, no prescribed schedule. Not adequate. The commonly quoted "1.5 L per kg lost" figure is
// marked PARAPHRASE in this project's content review and ships nowhere, here or anywhere else.
//
// EVERY DOI HERE IS COPIED FROM THE MODULE THAT ALREADY CARRIES IT, never retyped from memory.
// `recordedIn` names that file, and the suite asserts the DOI really appears in it, so a citation
// cannot drift from the engine it describes. The one entry with `recordedIn: null` is the tempo
// meta-analysis: no engine in this repository implements a repetition-duration prescription, so
// this module is its home, exactly as `sexRationale.ts` is the home of the hormone-therapy source
// for the same reason.
//
// ELSEVIER ORDER, as brief K settled it: author initials after the surname, article title where
// the source module records one, journal abbreviated, volume(issue):pages, then the year, then
// the DOI last. Every string below is an existing string with its elements REORDERED. Nothing was
// looked up to do it: no author was added to an "et al.", no article title was supplied, and no
// DOI, volume, issue, page range or year was retyped. A reformat that needed a new fact would not
// be a reformat.

/** A published source, or the explicit absence of one. */
export type GuidanceCitation =
  | {
      kind: 'published';
      /** The citation in Elsevier order, DOI last. */
      text: string;
      /** The DOI on its own, so the suite can check it against `recordedIn`. */
      doi: string;
      /**
       * The module in this repository whose header already carries this DOI with the content
       * review's verification, or `null` when no engine implements the claim and this module is
       * the citation's home.
       */
      recordedIn: string | null;
    }
  | {
      kind: 'unsourced';
      /**
       * The claim that has no source, named in full. This is the marked placeholder: it stands
       * where a citation would, says what is missing, and leaves the row for the owner's own
       * recommendation.
       */
      claim: string;
    };

/** One numbered entry. `marker` is the superscript printed on the topic heading. */
export interface GuidanceReference {
  /**
   * The entry's number. UNIQUE across the list, and the ONLY numbering scheme: the list renders
   * unordered so nothing enumerates it a second time, following r2.15 on the body step. One
   * marker may be cited by two topics, which is why the mapping lives on the section.
   */
  marker: number;
  /** The bold line above the citation, saying what the reference is for. */
  lead: string;
  cite: GuidanceCitation;
}

/** The lead-in above the list. */
export const GUIDANCE_REFERENCES_LEAD =
  'What each topic on this page rests on, and where it rests on nothing. An entry marked "no source found" is not an oversight: it is a claim this project could not evidence, left visible rather than dressed up.';

/** The words that mark an unsourced row on screen. */
export const GUIDANCE_UNSOURCED_LABEL = 'No source found';

export const GUIDANCE_REFERENCES: readonly GuidanceReference[] = [
  {
    marker: 1,
    lead: 'Creatine, the maintenance dose and the absence of a loading phase.',
    cite: {
      kind: 'published',
      text: 'Kreider RB, et al. J Int Soc Sports Nutr 14:18, 2017. DOI 10.1186/s12970-017-0173-z',
      doi: '10.1186/s12970-017-0173-z',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 2,
    lead: 'Creatine, safety in healthy adults and why monohydrate is the only form prescribed.',
    cite: {
      kind: 'published',
      text: 'Antonio J, et al. J Int Soc Sports Nutr 18:13, 2021. DOI 10.1186/s12970-021-00412-w',
      doi: '10.1186/s12970-021-00412-w',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 3,
    lead: 'Caffeine, the dose range that helps resistance training specifically.',
    cite: {
      kind: 'published',
      text: 'Grgic J. Nutrition 103-104:111604, 2022. DOI 10.1016/j.nut.2022.111604',
      doi: '10.1016/j.nut.2022.111604',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 4,
    lead: 'Caffeine, the wider position-stand range, which is evidenced mostly in endurance work.',
    cite: {
      kind: 'published',
      text: 'Guest NS, et al. J Int Soc Sports Nutr 18:1, 2021. DOI 10.1186/s12970-020-00383-4',
      doi: '10.1186/s12970-020-00383-4',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 5,
    lead: 'Caffeine, the safe single dose and the safe daily total for healthy adults.',
    cite: {
      kind: 'published',
      text: 'EFSA. EFSA Journal 13(5):4102, 2015. DOI 10.2903/j.efsa.2015.4102',
      doi: '10.2903/j.efsa.2015.4102',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 6,
    lead: 'Protein powder, that isolate, concentrate and hydrolysate do not differ in muscle gain.',
    cite: {
      kind: 'published',
      text: 'Castro LHA, et al. Nutrients 11(9):2047, 2019. DOI 10.3390/nu11092047',
      doi: '10.3390/nu11092047',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 7,
    lead: 'Protein, the per-meal dose and spreading the daily total across meals.',
    cite: {
      kind: 'published',
      text: 'Schoenfeld BJ, Aragon AA. J Int Soc Sports Nutr 15:10, 2018. DOI 10.1186/s12970-018-0215-1',
      doi: '10.1186/s12970-018-0215-1',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 8,
    lead: 'Protein, that the daily total is what drives muscle gain.',
    cite: {
      kind: 'published',
      text: 'Morton RW, et al. Br J Sports Med 52:376-384, 2018. DOI 10.1136/bjsports-2017-097608',
      doi: '10.1136/bjsports-2017-097608',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 9,
    lead: 'Supplement contamination, the sampling behind the third-party testing caution.',
    cite: {
      kind: 'published',
      text: 'Geyer H, et al. Int J Sports Med 25(2):124-129, 2004. DOI 10.1055/s-2004-819955',
      doi: '10.1055/s-2004-819955',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 10,
    lead: 'Fluid, the 2 per cent body-mass loss limit and estimating your own sweat rate by weighing before and after.',
    cite: {
      kind: 'published',
      text: 'Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS. Exercise and Fluid Replacement. Med Sci Sports Exerc 39(2):377-390, 2007. DOI 10.1249/mss.0b013e31802ca597',
      doi: '10.1249/mss.0b013e31802ca597',
      recordedIn: 'src/domain/nutrition.ts',
    },
  },
  {
    marker: 11,
    cite: {
      kind: 'unsourced',
      claim:
        'How much water to drink during a session, and when, for a named session length and intensity. No study was found that gives a resistance-training session duration, an intensity, an in-session volume and a schedule together.',
    },
    lead: 'Water, the in-session volume and the timing.',
  },
  {
    marker: 12,
    lead: 'Rest between sets, the 3 to 5 minute band at heavy loads.',
    cite: {
      kind: 'published',
      text: 'de Salles BF, et al. Rest Interval between Sets in Strength Training. Sports Med 39(9):765-777, 2009. DOI 10.2165/11315230-000000000-00000',
      doi: '10.2165/11315230-000000000-00000',
      recordedIn: 'src/domain/training/restTimer.ts',
    },
  },
  {
    marker: 13,
    lead: 'Rest between sets, more than 2 minutes to maximise strength in trained lifters.',
    cite: {
      kind: 'published',
      text: 'Grgic J, et al. Sports Med 48(1):137-151, 2018. DOI 10.1007/s40279-017-0788-x',
      doi: '10.1007/s40279-017-0788-x',
      recordedIn: 'src/domain/training/restTimer.ts',
    },
  },
  {
    marker: 14,
    lead: 'Rest between sets, 3 minutes beating 1 minute over 8 weeks in trained men.',
    cite: {
      kind: 'published',
      text: 'Schoenfeld BJ, et al. J Strength Cond Res 30(7):1805-1812, 2016. DOI 10.1519/JSC.0000000000001272',
      doi: '10.1519/JSC.0000000000001272',
      recordedIn: 'src/domain/training/restTimer.ts',
    },
  },
  {
    marker: 15,
    lead: 'Repetition speed, that hypertrophy was similar from roughly 0.5 to 8 seconds per repetition.',
    cite: {
      kind: 'published',
      text: 'Schoenfeld BJ, Ogborn DI, Krieger JW. Effect of Repetition Duration During Resistance Training on Muscle Hypertrophy: A Systematic Review and Meta-Analysis. Sports Med, 2015. DOI 10.1007/s40279-015-0304-0',
      doi: '10.1007/s40279-015-0304-0',
      recordedIn: null,
    },
  },
  {
    marker: 16,
    lead: 'Electrolytes, the session duration or sweat loss above which replacement starts to matter.',
    cite: {
      kind: 'unsourced',
      claim:
        'The threshold at which electrolyte replacement starts to matter. The 2007 fluid-replacement stand this project cites states a body-mass loss limit and a sweat-rate method, and states no duration or sweat-loss threshold for electrolytes, so no number is printed.',
    },
  },
  {
    marker: 17,
    lead: 'Shoes, that a firm sole improves a heavy lift or reduces injury.',
    cite: {
      kind: 'unsourced',
      claim:
        'That sole compressibility changes lifting performance or injury rate. Acute heel-height biomechanics studies exist; none isolates sole compressibility, and none measures injury outcomes.',
    },
  },
  {
    marker: 18,
    lead: 'Foot care, baby powder for foot odour.',
    cite: {
      kind: 'unsourced',
      claim:
        'That baby powder controls foot odour. A household remedy with no trial behind it, presented here as a household remedy and nothing more.',
    },
  },
  {
    marker: 19,
    lead: 'Kit, the shaker bottle and the scale.',
    cite: {
      kind: 'unsourced',
      claim:
        'That either item changes a training outcome. No such claim is made: they are recommended for convenience, and convenience is not a research finding.',
    },
  },
];

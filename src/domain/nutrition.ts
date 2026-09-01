import type { ActivityLevel, GoalKind, Kg, ML, Sex } from './types';

/**
 * Nutrition engine.
 *
 * Every coefficient in this file comes from docs/review/2026-09-01-content-peer-review.md
 * and carries the equation name and the DOI that report verified against Crossref. Values
 * the report marked PARAPHRASE, COULD NOT VERIFY or INSUFFICIENT EVIDENCE do not appear
 * here (master plan section 9). Where the report supplies a band and the code must pick one
 * number, the comment says HEURISTIC and the choice is exposed through NutritionTargets.basis
 * so the UI can show it.
 *
 * Units: energy kcal/day, body mass kg, stature cm, age years, protein g/day, fluid mL/day,
 * creatine g/day, rate kg/week. Rate is SIGNED with the master plan section 3 delta
 * convention (current - reference): negative = mass loss.
 */

export interface NutritionInput {
  sex: Sex;
  ageYears: number; // years, > 0
  heightCm: number; // cm, > 0
  massKg: Kg; // kg, > 0
  bodyFatPct: number | null; // percent of body mass in [0, 100); null = not measured
  activity: ActivityLevel;
  goal: GoalKind;
  sessionsPerWeek: number; // sessions/week; see NOTE-FREQ below
  creatine: boolean;
}

export interface NutritionTargets {
  rmrKcal: number; // kcal/day
  tdeeKcal: number; // kcal/day
  targetKcal: number; // kcal/day
  proteinG: { lo: number; hi: number }; // g/day
  fluidML: ML; // mL/day, beverages only (water in food is not counted)
  creatineG: number | null; // g/day; null when the supplement toggle is off
  expectedRateKgPerWeek: number | null; // kg/week, signed; null = the report gives no rate
  basis: {
    rmr: 'mifflin-st-jeor' | 'cunningham';
    activityFactor: number; // PAL, dimensionless
    proteinRule: string;
    deficitRule: string;
    rateRule: string;
  };
}

/* ------------------------------------------------------------------ *
 * Resting metabolic rate
 * ------------------------------------------------------------------ */

/**
 * Mifflin-St Jeor (1990). Am J Clin Nutr 51(2):241-247. DOI 10.1093/ajcn/51.2.241 (verified).
 *   Male:   RMR = 10*mass(kg) + 6.25*height(cm) - 5*age(y) + 5    [kcal/day]
 *   Female: RMR = 10*mass(kg) + 6.25*height(cm) - 5*age(y) - 161  [kcal/day]
 * Chosen over Harris-Benedict (1918) and the Roza & Shizgal (1984) revision because
 * Frankenfield 2013 (Clin Nutr 32(6):976-982, DOI 10.1016/j.clnu.2013.03.022, n=337) found
 * Mifflin-St Jeor accurate in 82 % overall and unbiased (95 % CI -26 to +8 kcal/day) where
 * the others overestimated; Mifflin's own data showed Harris-Benedict overestimating REE by
 * 5 % (p<0.01) and Roza's precision is only +/- 14 %.
 */
const MSJ_MASS_COEFF = 10; // kcal/day per kg body mass
const MSJ_HEIGHT_COEFF = 6.25; // kcal/day per cm stature
const MSJ_AGE_COEFF = -5; // kcal/day per year of age
const MSJ_CONSTANT: Record<Sex, number> = { male: 5, female: -161 }; // kcal/day

/**
 * Cunningham (1991). Am J Clin Nutr 54(6):963-969. DOI 10.1093/ajcn/54.6.963 (verified).
 *   RMR = 370 + 21.6 * FFM(kg)   [kcal/day]
 * Two traps the content review flags. PubMed renders this as "370 +/- 21.6 x FFM" - a
 * typesetting artifact; the operator is +. And it is widely mislabelled "Katch-McArdle";
 * Cunningham published it. It is NOT Cunningham (1980) `BMR = 500 + 22*LBM`
 * (DOI 10.1093/ajcn/33.11.2372), which is a different equation from a different reanalysis.
 * Preferred over Mifflin-St Jeor whenever fat-free mass is available because it explains
 * 65-90 % of REE variation (Thompson & Manore 1996, DOI 10.1016/S0002-8223(96)00010-7,
 * most accurate of four equations in 37 endurance athletes).
 */
const CUNNINGHAM_INTERCEPT = 370; // kcal/day
const CUNNINGHAM_FFM_COEFF = 21.6; // kcal/day per kg fat-free mass

/** Fat-free mass in kg from body mass (kg) and body-fat percentage (percent of body mass). */
export function fatFreeMassKg(massKg: Kg, bodyFatPct: number): Kg {
  if (!Number.isFinite(massKg) || massKg <= 0) {
    throw new RangeError('fatFreeMassKg: massKg must be a finite number > 0');
  }
  if (!Number.isFinite(bodyFatPct) || bodyFatPct < 0 || bodyFatPct >= 100) {
    throw new RangeError('fatFreeMassKg: bodyFatPct must be in [0, 100)');
  }
  return massKg * (1 - bodyFatPct / 100); // kg
}

function mifflinStJeorKcal(input: NutritionInput): number {
  return (
    MSJ_MASS_COEFF * input.massKg +
    MSJ_HEIGHT_COEFF * input.heightCm +
    MSJ_AGE_COEFF * input.ageYears +
    MSJ_CONSTANT[input.sex]
  ); // kcal/day
}

function cunninghamKcal(ffmKg: Kg): number {
  return CUNNINGHAM_INTERCEPT + CUNNINGHAM_FFM_COEFF * ffmKg; // kcal/day
}

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

/**
 * FAO/WHO/UNU (2004), Human Energy Requirements, FAO Food and Nutrition Technical Report
 * Series No. 1, Table 5.3 p.38. No DOI (UN technical report); the content review verified it
 * from the primary PDF and the HTML chapter, which agree verbatim.
 *   PAL = TEE / BMR   [dimensionless]
 *   Sedentary or light activity     1.40 - 1.69
 *   Active or moderately active     1.70 - 1.99
 *   Vigorous or vigorously active   2.00 - 2.40
 * The same bands apply to men and women. The report notes PAL > 2.40 is difficult to sustain.
 *
 * REJECTED: the gym ladder 1.2 / 1.375 / 1.55 / 1.725 / 1.9. No primary source exists; the
 * interior points are exact arithmetic interpolations (1.375 = (1.2+1.55)/2,
 * 1.725 = (1.55+1.9)/2); and the 1.2 anchor is Black et al.'s NON-AMBULANT limit, which FAO
 * excludes - FAO puts the free-living floor at 1.40, so the ladder under-feeds sedentary
 * users. REJECTED: the NASEM 2023 cut-points (DOI 10.17226/26818), whose boundaries are the
 * 25th/50th/75th percentiles of its own doubly-labelled-water sample, not physiological
 * thresholds, and which abandons the BMR x PAL form this engine uses.
 */
export const ACTIVITY_BAND: Record<ActivityLevel, readonly [number, number]> = {
  sedentary: [1.4, 1.69],
  moderate: [1.7, 1.99],
  vigorous: [2.0, 2.4],
};

/**
 * One PAL per band. Each value is the band's PRINTED floor, so no number here is invented:
 * every factor appears verbatim in Table 5.3. Taking the floor rather than a within-band
 * point is the deliberate conservative choice - it under-prescribes rather than over-
 * prescribes energy, and P7's re-measure loop corrects it against observed body mass.
 * Master plan section 10, amendment "activity-levels-three-bands" (adopted): the earlier
 * five-member ladder with midpoint placements at 1.55 and 1.85 does not ship.
 * The chosen value is surfaced through NutritionTargets.basis.activityFactor.
 */
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.4, // PAL, printed band floor (FAO free-living floor)
  moderate: 1.7, // PAL, printed band floor
  vigorous: 2.0, // PAL, printed band floor
};

/* ------------------------------------------------------------------ *
 * Energy target and rate of change
 * ------------------------------------------------------------------ */

/**
 * Fat loss. The content review supplies a RATE (Garthe 2011, DOI 10.1123/ijsnem.21.2.97: aim
 * for 0.7 %BW/week; bound 0.5-1.0 %BW/week, Helms 2014, DOI 10.1186/1550-2783-11-20) but NO
 * verified kcal-per-week conversion: 3500 kcal/lb is rejected outright (Hall 2011,
 * DOI 10.1016/S0140-6736(11)60812-X, because it "ignores dynamic physiological adaptations to
 * altered body weight") and Hall's replacement - 10 kcal/day per pound of eventual weight
 * change - is a STEADY-STATE relation that takes about a year to reach half its effect, not a
 * weekly rule. The code therefore never converts kcal to kg.
 *
 * The intake cut is taken from the content review's own intake-cut recommendation
 * (Deliverable 1 section 2.2, row "Plateau response": "cut 10-15% of current intake"),
 * applied to TDEE at the top of that band. HEURISTIC - a reviewer recommendation, not a
 * measured value, and it is the one coefficient here sourced from Deliverable 1 rather than
 * the Deliverable 2 engine sections. It is disclosed in basis.deficitRule.
 *
 * targetKcal and expectedRateKgPerWeek are computed INDEPENDENTLY and neither predicts the
 * other; basis.rateRule says so in words.
 */
const FAT_LOSS_INTAKE_CUT = 0.15; // fraction of TDEE, dimensionless

/**
 * Muscle gain. Garthe 2011 (Appl Physiol Nutr Metab 36(4):547-554, DOI 10.1139/h11-051)
 * counselled a surplus of 506 +/- 84 kcal/day with 4 strength sessions/week: body mass
 * +4.3 +/- 0.9 %, lean body mass +2.8 +/- 0.5 %, against ad-libitum controls at +1.0 +/- 0.6 %
 * body mass and no lean change. Slater 2019 (Front Nutr 6:131, DOI 10.3389/fnut.2019.00131)
 * states verbatim that the surplus required "is unknown" and such estimates "have never been
 * validated in a resistance training population" - basis.deficitRule says so.
 */
const MUSCLE_GAIN_SURPLUS_KCAL = 500; // kcal/day, inside Garthe's 506 +/- 84

/** Garthe 2011 target rate and the Helms 2014 bound, as fractions of body mass per week. */
const FAT_LOSS_RATE_FRACTION = 0.007; // 0.7 %BW/week, dimensionless
export const FAT_LOSS_RATE_BOUND = { loFraction: 0.005, hiFraction: 0.01 }; // 0.5-1.0 %BW/week

/* ------------------------------------------------------------------ *
 * Protein
 * ------------------------------------------------------------------ */

/**
 * Denominators are kept strictly separate. Applying the fat-free-mass range to body mass is a
 * ~33 % overfeed at 25 % body fat (content review Deliverable 2 section 4, "Unit trap - do not
 * propagate": Jaeger's abstract prints 2.3-3.1 as bare g/kg inside a document whose stated
 * convention is g/kg BODY WEIGHT, while both Helms sources state it per kg FFM).
 *
 *   maintenance / general training  1.4-2.0 g/kg BODY MASS      Jaeger 2017, DOI 10.1186/s12970-017-0177-8
 *   muscle gain                     1.6-2.2 g/kg BODY MASS      Morton 2018, DOI 10.1136/bjsports-2017-097608
 *   fat loss in a deficit           2.3-3.1 g/kg FAT-FREE MASS  Helms 2014, DOI 10.1123/ijsnem.2013-0054
 *
 * REJECTED: the 0.8 g/kg RDA - Jaeger verbatim, "multiple lines of evidence indicating this
 * value is not an appropriate amount for a training athlete".
 * Morton caution carried into the basis string: the 1.62 g/kg/day break point is reported as
 * a segmental regression that was NOT statistically significant (p=0.079), and 2.2 is the
 * confidence-interval upper bound, not a second measurement.
 */
const PROTEIN_BODY_MASS_MAINTENANCE = { lo: 1.4, hi: 2.0 }; // g/kg body mass per day
const PROTEIN_BODY_MASS_GAIN = { lo: 1.6, hi: 2.2 }; // g/kg body mass per day
const PROTEIN_FFM_DEFICIT = { lo: 2.3, hi: 3.1 }; // g/kg fat-free mass per day

/* ------------------------------------------------------------------ *
 * Fluid
 * ------------------------------------------------------------------ */

/**
 * IOM (2005) Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate,
 * DOI 10.17226/10925 (verified), verbatim: the AI for TOTAL water for adults aged 19-30 is
 * 3.7 L men and 2.7 L women, of which BEVERAGES supply 3.0 L and 2.2 L, "approximately 81
 * percent of total water intake"; food supplies the remaining ~19 %. An app cannot measure
 * the water in food, so it prescribes the beverage figure and never 3.7 / 2.7 L.
 * REJECTED: the "8x8" rule - Valtin 2002, DOI 10.1152/ajpregu.00365.2002, verbatim: "No
 * scientific studies were found in support of 8 x 8." REJECTED: the legacy flat 3.5 L/day,
 * which overshoots the female total AI by ~30 %, undershoots the male, and is sex-invariant
 * where the DRI is not.
 * Training-day replacement is NOT part of this baseline: it is additive, mass-based
 * (Sawka 2007, DOI 10.1249/mss.0b013e31802ca597 - keep in-session loss under 2 % of body
 * mass), and lives in P4's hydration.ts. The commonly cited ~1.5 L per kg lost is marked
 * PARAPHRASE in the content review and therefore ships as no number anywhere.
 */
const BEVERAGE_TARGET_ML: Record<Sex, ML> = { male: 3000, female: 2200 }; // mL/day

export function dailyBeverageTargetML(sex: Sex): ML {
  return BEVERAGE_TARGET_ML[sex]; // mL/day
}

/* ------------------------------------------------------------------ *
 * Creatine
 * ------------------------------------------------------------------ */

/**
 * Content review Deliverable 2 section 11 engine rule, verbatim: "maintenance
 * max(3 g, 0.1 g/kg), capped near 10 g/d". Kreider 2017 (DOI 10.1186/s12970-017-0173-z):
 * maintenance "3-5 g/day, although some studies indicate that larger athletes may need to
 * ingest as much as 5-10 g/day". Antonio 2021 (DOI 10.1186/s12970-021-00412-w) gives the
 * body-mass form "3-5 g or 0.1 g/kg of body mass" and states "you do not have to 'load'
 * creatine". Dose by body mass, NOT sex: neither source gives a sex-specific dose.
 * Monohydrate only - Kreider Position #5 rejects ethyl ester and buffered forms on muscle
 * uptake, the exact outcome their marketing claims.
 */
const CREATINE_FLOOR_G = 3; // g/day
const CREATINE_PER_KG = 0.1; // g/day per kg body mass
const CREATINE_CAP_G = 10; // g/day, top of Kreider's 5-10 g/day for larger athletes

function creatineDoseG(massKg: Kg): number {
  const dose = Math.min(CREATINE_CAP_G, Math.max(CREATINE_FLOOR_G, CREATINE_PER_KG * massKg));
  return Math.round(dose * 10) / 10; // g/day at 0.1 g resolution
}

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

interface EnergyPlan {
  targetKcal: number; // kcal/day
  rateKgPerWeek: number | null; // kg/week, signed (negative = loss)
  deficitRule: string;
  rateRule: string;
}

function energyPlan(goal: GoalKind, tdeeKcal: number, massKg: Kg): EnergyPlan {
  switch (goal) {
    case 'fat-loss': {
      // Sign convention: negative = mass loss (master plan section 3, delta = current - reference).
      // The clamp is inert while the rate is fixed at 0.7 %BW/week; it is the enforcement
      // point for P7, where the rate becomes user-adjustable.
      const raw = -FAT_LOSS_RATE_FRACTION * massKg; // kg/week
      const mostNegative = -FAT_LOSS_RATE_BOUND.hiFraction * massKg; // kg/week, 1.0 %BW
      const leastNegative = -FAT_LOSS_RATE_BOUND.loFraction * massKg; // kg/week, 0.5 %BW
      return {
        targetKcal: tdeeKcal * (1 - FAT_LOSS_INTAKE_CUT), // kcal/day
        rateKgPerWeek: Math.min(leastNegative, Math.max(mostNegative, raw)), // kg/week
        deficitRule:
          '15 % cut from TDEE (content review Deliverable 1 section 2.2 recommends cutting 10-15 % of current intake; HEURISTIC - a recommendation, not a measured value). 3500 kcal/lb is rejected (Hall 2011, DOI 10.1016/S0140-6736(11)60812-X).',
        rateRule:
          'Target 0.7 %BW/week loss (Garthe 2011, DOI 10.1123/ijsnem.21.2.97: 0.7 %/wk preserved lean body mass at +2.1 +/- 0.4 % where 1.4 %/wk lost it), bounded 0.5-1.0 %BW/week (Helms 2014, DOI 10.1186/1550-2783-11-20). This is a prescribed rate, not a prediction from the energy target: the content review supplies no verified kcal-to-mass conversion, so the two numbers are computed independently and neither predicts the other.',
      };
    }
    case 'muscle-gain':
      return {
        targetKcal: tdeeKcal + MUSCLE_GAIN_SURPLUS_KCAL, // kcal/day
        rateKgPerWeek: null,
        deficitRule:
          '+500 kcal/day surplus (Garthe 2011, DOI 10.1139/h11-051, counselled 506 +/- 84 kcal/day; lean body mass +2.8 +/- 0.5 %). Slater 2019 (DOI 10.3389/fnut.2019.00131) states the required surplus is unknown and has never been validated in a resistance-training population - treat this as weakly evidenced.',
        rateRule:
          'No weekly rate is reported: Garthe 2011 gives the total gain (+4.3 +/- 0.9 % body mass) but the content review does not state the study duration, so no kg/week figure can be derived. Reporting null is the honest value.',
      };
    case 'maintenance':
      return {
        targetKcal: tdeeKcal, // kcal/day
        rateKgPerWeek: 0, // kg/week
        deficitRule: 'Energy held at TDEE.',
        rateRule: 'Zero by construction: maintenance targets a stable body mass.',
      };
    case 'recomposition':
      return {
        targetKcal: tdeeKcal, // kcal/day
        rateKgPerWeek: 0, // kg/week
        deficitRule:
          'Energy held at TDEE. The content review does not cover recomposition; holding maintenance energy introduces no coefficient the report does not supply.',
        rateRule: 'Zero by construction: recomposition targets a stable body mass.',
      };
  }
}

interface ProteinPlan {
  lo: number; // g/day
  hi: number; // g/day
  rule: string;
}

function proteinPlan(goal: GoalKind, massKg: Kg, ffmKg: Kg | null): ProteinPlan {
  const byBodyMass = (r: { lo: number; hi: number }, label: string): ProteinPlan => ({
    lo: Math.round(r.lo * massKg), // g/day
    hi: Math.round(r.hi * massKg), // g/day
    rule: label,
  });

  if (goal === 'fat-loss') {
    if (ffmKg === null) {
      return byBodyMass(
        PROTEIN_BODY_MASS_MAINTENANCE,
        '1.4-2.0 g/kg body mass (Jaeger 2017, DOI 10.1186/s12970-017-0177-8). Fallback: the deficit range 2.3-3.1 g/kg is per kg FAT-FREE MASS and there is no body-fat estimate, so it cannot be applied - applying it to body mass would be a ~33 % overfeed at 25 % body fat. Add a body-fat estimate to use the deficit range.',
      );
    }
    return {
      lo: Math.round(PROTEIN_FFM_DEFICIT.lo * ffmKg), // g/day
      hi: Math.round(PROTEIN_FFM_DEFICIT.hi * ffmKg), // g/day
      rule: '2.3-3.1 g/kg fat-free mass (Helms 2014, DOI 10.1123/ijsnem.2013-0054). Denominator is FFM, not body mass.',
    };
  }
  if (goal === 'muscle-gain') {
    return byBodyMass(
      PROTEIN_BODY_MASS_GAIN,
      '1.6-2.2 g/kg body mass (Morton 2018, DOI 10.1136/bjsports-2017-097608). The 1.62 g/kg/day break point was not statistically significant (p=0.079) and 2.2 is the confidence-interval upper bound, not a second measurement, so treat the range as soft.',
    );
  }
  if (goal === 'recomposition') {
    return byBodyMass(
      PROTEIN_BODY_MASS_GAIN,
      '1.6-2.2 g/kg body mass (Morton 2018, DOI 10.1136/bjsports-2017-097608), applied to recomposition. EXTRAPOLATION: the content review does not cover recomposition; the muscle-gain row is used because recomposition targets muscle gain at maintenance energy.',
    );
  }
  return byBodyMass(
    PROTEIN_BODY_MASS_MAINTENANCE,
    '1.4-2.0 g/kg body mass (Jaeger 2017, DOI 10.1186/s12970-017-0177-8), verbatim: sufficient for most exercising individuals.',
  );
}

export function computeTargets(input: NutritionInput): NutritionTargets {
  if (!Number.isFinite(input.massKg) || input.massKg <= 0) {
    throw new RangeError('computeTargets: massKg must be a finite number > 0');
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    throw new RangeError('computeTargets: heightCm must be a finite number > 0');
  }
  if (!Number.isFinite(input.ageYears) || input.ageYears <= 0) {
    throw new RangeError('computeTargets: ageYears must be a finite number > 0');
  }

  const ffmKg = input.bodyFatPct === null ? null : fatFreeMassKg(input.massKg, input.bodyFatPct); // kg
  const rmrKcal = ffmKg === null ? mifflinStJeorKcal(input) : cunninghamKcal(ffmKg); // kcal/day
  const activityFactor = ACTIVITY_FACTOR[input.activity]; // PAL, dimensionless
  const tdeeKcal = rmrKcal * activityFactor; // kcal/day, unrounded through the chain
  const energy = energyPlan(input.goal, tdeeKcal, input.massKg);
  const protein = proteinPlan(input.goal, input.massKg, ffmKg);

  // NOTE-FREQ: sessionsPerWeek is collected because the content review Deliverable 2 section 3
  // lists training frequency among the setup inputs, but the report supplies NO frequency
  // coefficient for energy. It is recorded in the basis string and changes no number.
  const deficitRule = `${energy.deficitRule} Training frequency ${input.sessionsPerWeek} session(s)/week is recorded but does not alter the energy target: the content review supplies no frequency coefficient.`;

  return {
    rmrKcal: Math.round(rmrKcal), // kcal/day
    tdeeKcal: Math.round(tdeeKcal), // kcal/day
    targetKcal: Math.round(energy.targetKcal), // kcal/day
    proteinG: { lo: protein.lo, hi: protein.hi }, // g/day
    fluidML: dailyBeverageTargetML(input.sex), // mL/day
    creatineG: input.creatine ? creatineDoseG(input.massKg) : null, // g/day
    expectedRateKgPerWeek: energy.rateKgPerWeek, // kg/week, signed
    basis: {
      rmr: ffmKg === null ? 'mifflin-st-jeor' : 'cunningham',
      activityFactor,
      proteinRule: protein.rule,
      deficitRule,
      rateRule: energy.rateRule,
    },
  };
}

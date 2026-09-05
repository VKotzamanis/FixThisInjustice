/*
 * this is reference text exempt from the copy contract length rules R1 to R4, but not from R5 (no em dash, no en dash as a connector), R6 (no emoji) or R11 (name the defined quantity); every DOI is copied from the nutrition engine rather than retyped from memory; braces in a body are slots filled at render with the reader's own numbers.
 */

export interface GuidanceSection {
  id: string;
  heading: string;
  body: string;
  caution: string | null;
  sources: readonly string[];
}

export const SUPPLEMENT_GUIDANCE: readonly GuidanceSection[] = [
  // Units: grams (g)
  {
    id: "creatine",
    heading: "Creatine",
    body: "Creatine monohydrate, {dose} g a day, from your body mass. There is no loading phase and no need for one. Mix it into a smoothie or coffee; it does not matter when you take it. It is among the most studied supplements in sport, and in healthy adults the trials have not found harm. Monohydrate only: ethyl ester and buffered forms are rejected on muscle uptake, which is the outcome their marketing claims.",
    caution: "If you have kidney disease, ask a doctor first. That is the one caution the evidence supports, and it is not a general one.",
    sources: [
      "Kreider RB et al. (2017), J Int Soc Sports Nutr 14:18. DOI 10.1186/s12970-017-0173-z",
      "Antonio J et al. (2021), J Int Soc Sports Nutr 18:13. DOI 10.1186/s12970-021-00412-w",
    ],
  },
  // Units: milligrams (mg)
  {
    id: "caffeine",
    heading: "Caffeine",
    body: "{lo} to {hi} mg, about an hour before you lift. That is the range shown to help strength and muscular endurance, and it is smaller than the dose usually quoted, which comes from endurance research. Coffee works as well as a capsule at a matched dose, so iced coffee before the gym is a fine way to take it. Whether milk and sugar change the effect has not been tested, so this app makes no claim either way.",
    caution: "EFSA puts a safe single dose for healthy adults at 200 mg and a safe daily total at 400 mg. Habitual coffee drinking may blunt the effect; the evidence is mixed. Not for pregnancy without medical advice, and not for adolescents.",
    sources: [
      "Grgic J (2022), Nutrition 103-104:111604. DOI 10.1016/j.nut.2022.111604",
      "Guest NS et al. (2021), J Int Soc Sports Nutr 18:1. DOI 10.1186/s12970-020-00383-4",
      "EFSA (2015), EFSA Journal 13(5):4102. DOI 10.2903/j.efsa.2015.4102",
    ],
  },
  // Units: grams per kilogram (g/kg), per cent (%)
  {
    id: "protein",
    heading: "Protein powder",
    body: "The form does not matter. Isolate, concentrate and hydrolysate produce no meaningful difference in muscle gain; what differs is lactose content and price. Buy on those. What does matter is the daily total, which this app computes for you, spread across at least four meals at roughly 0.4 g per kg of body mass each. Powder is convenience, not necessity: whole food meets the same target.",
    caution: "Buy a product carrying third-party testing. Of 634 supplements sampled across thirteen countries, 14.8 per cent held undeclared anabolic steroids, and a 2025 sample of 200 online products found 35 per cent carrying substances banned in sport.",
    sources: [
      "Castro LHA et al. (2019), Nutrients 11(9):2047. DOI 10.3390/nu11092047",
      "Schoenfeld BJ, Aragon AA (2018), J Int Soc Sports Nutr 15:10. DOI 10.1186/s12970-018-0215-1",
      "Morton RW et al. (2018), Br J Sports Med 52:376-384. DOI 10.1136/bjsports-2017-097608",
      "Geyer H et al. (2004), Int J Sports Med 25(2):124-129. DOI 10.1055/s-2004-819955",
    ],
  },
  // Units: kilograms (kg)
  {
    id: "kit",
    heading: "Kit",
    body: "A shaker bottle with a wire whisk ball, and a scale that reads to a tenth of a kilogram. Neither claim is a research finding; they are the two things that make logging and mixing less annoying.",
    caution: null,
    sources: [],
  },
];


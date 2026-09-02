/**
 * Specimen cards: collectible scientific facts drawn on logged sets.
 *
 * PROVENANCE. Every card below is derived from docs/review/2026-09-01-content-peer-review.md
 * section 5, which checked all 42 legacy cards (legacy/console-content.js:564-711) for (a) whether
 * the cited work exists and (b) whether it supports the card's specific claim. Verdicts were
 * 3 SUPPORTED, 17 PARTIALLY, 1 UNSUPPORTED, 21 WRONG. Rules applied here:
 *   SUPPORTED  -> ported, verified DOI attached.
 *   PARTIALLY  -> rewritten per the review's "Recommended change", corrected citation.
 *   WRONG / UNSUPPORTED / COULD NOT VERIFY -> dropped, unless the review supplied a verified
 *                 replacement claim, in which case the replacement is the card.
 *
 * A work's title appears in `citation` only where the review states it. No number appears in a
 * body unless the review's Evidence column states that number. Figures the review marked
 * COULD NOT VERIFY are deleted, not softened.
 *
 * DOI VERIFICATION. Every DOI below, and every DOI-bearing secondary work named inside a
 * citation, was fetched from https://api.crossref.org/works/<DOI> on 2026-09-01 (logged in
 * REFERENCES.md). All 36 resolved HTTP 200 and returned the title, journal, volume, issue and
 * pages the citation names; where a work was published online ahead of print, the year here is
 * the print year Crossref reports. No card was dropped for a citation failure.
 *
 * Do not add a card without a citation the review verified. Do not edit a body without editing
 * its citation. Text is ASCII only: the tone rule forbids emoji and the test enforces it.
 */

export type SpecimenRarity = 'common' | 'uncommon' | 'rare';

export type SpecimenCategory =
  | 'anatomy'
  | 'biology'
  | 'biomechanics'
  | 'history'
  | 'nutrition'
  | 'recovery'
  | 'supplements'
  | 'training';

export interface SpecimenSource {
  /** Author, year, journal, volume and pages as the review verified them. */
  citation: string;
  /** DOI when the work has one; null for books, classical texts and pre-DOI articles. */
  doi: string | null;
}

export interface SpecimenCard {
  id: string;
  rarity: SpecimenRarity;
  title: string;
  category: SpecimenCategory;
  body: string;
  source: SpecimenSource;
}

export const SPECIMEN_RARITIES: readonly SpecimenRarity[] = ['common', 'uncommon', 'rare'];

export const SPECIMEN_CATEGORIES: readonly SpecimenCategory[] = [
  'anatomy',
  'biology',
  'biomechanics',
  'history',
  'nutrition',
  'recovery',
  'supplements',
  'training',
];

/** Draw weights. Dimensionless; only their ratios matter. */
export const RARITY_WEIGHT: Readonly<Record<SpecimenRarity, number>> = {
  common: 6,
  uncommon: 3,
  rare: 1,
};

/** Cards whose cited work has no DOI. Any other null DOI is a mistake, and the test says so. */
export const CARDS_WITHOUT_DOI: readonly string[] = ['c003', 'u001', 'u003', 'u012', 'r006', 'r007'];

/** Legacy ids deliberately not rebuilt. Kept so a future edit cannot silently resurrect one. */
export const DROPPED_CARD_IDS: readonly string[] = ['c007', 'c012', 'c013', 'u008', 'u013'];

export const SPECIMEN_CARDS: readonly SpecimenCard[] = [
  // ---------------- common (12) ----------------
  {
    id: 'c001',
    rarity: 'common',
    title: 'The post-exercise anabolic window',
    category: 'nutrition',
    body:
      'The claim that protein must be eaten in a narrow window immediately after training is not supported. The review that examined it rejected the narrow window and recommends 0.4 to 0.5 g of protein per kg of lean body mass at each of several meals across the day.',
    source: {
      citation:
        'Aragon AA, Schoenfeld BJ (2013). Nutrient timing revisited: is there a post-exercise anabolic window? J Int Soc Sports Nutr 10(1):5.',
      doi: '10.1186/1550-2783-10-5',
    },
  },
  {
    id: 'c002',
    rarity: 'common',
    title: 'Muscle length, not just load',
    category: 'biology',
    body:
      'Training the hamstrings at long muscle lengths produced more growth than the same exercise performed at short lengths: about 14 percent versus 9 percent muscle volume. Where in the range of motion the load is applied is a programming variable in its own right.',
    source: {
      citation: 'Maeo S et al. (2021). Med Sci Sports Exerc 53(4):825-837.',
      doi: '10.1249/MSS.0000000000002523',
    },
  },
  {
    id: 'c003',
    rarity: 'common',
    title: 'A 1RM is an estimate, not a measurement',
    category: 'training',
    body:
      'A one-repetition maximum is normally estimated from a multi-repetition set using the Epley chart: 1RM is approximately load times (1 + reps/30). A set of 100 kg for 5 reps predicts 116.7 kg. The chart is a self-published table, not a peer-reviewed model, and measured estimation error at 5RM ran from 1.85 kg on the chest press to 14.05 kg on the leg press.',
    source: {
      citation:
        'Epley B (1985). Poundage chart. In: Boyd Epley Workout. Body Enterprises, p. 86 (self-published, not peer-reviewed). Error range: Reynolds JM, Gordon TJ, Robergs RA (2006). J Strength Cond Res 20(3):584-592.',
      doi: null,
    },
  },
  {
    id: 'c004',
    rarity: 'common',
    title: 'Caffeine and creatine',
    category: 'supplements',
    body:
      "The 1996 study behind the claim that caffeine cancels creatine gave caffeine at 5 mg/kg per day for six days alongside creatine loading, not a single dose before training. A 2015 review concluded caffeine may blunt creatine's ergogenic effect; a 2016 trial found no such interference. The interaction is not settled.",
    source: {
      citation:
        'Vandenberghe K et al. (1996). J Appl Physiol 80(2):452-457. Review: Trexler ET, Smith-Ryan AE (2015). Int J Sport Nutr Exerc Metab 25(6):607-623. Null finding: Trexler ET et al. (2016). J Strength Cond Res 30(5):1438-1446.',
      doi: '10.1152/jappl.1996.80.2.452',
    },
  },
  {
    id: 'c005',
    rarity: 'common',
    title: 'Volume and hypertrophy',
    category: 'training',
    body:
      'Each additional weekly set per muscle group is associated with a small increase in growth: 0.023 effect-size units per set, P = 0.002. That meta-regression is linear and detects no plateau. The widely quoted 10-set threshold comes from a categorical model in the same paper that was not statistically significant, P = 0.074.',
    source: {
      citation:
        'Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci 35(11):1073-1082.',
      doi: '10.1080/02640414.2016.1210197',
    },
  },
  {
    id: 'c006',
    rarity: 'common',
    title: 'Sleep restriction and testosterone',
    category: 'recovery',
    body:
      'Ten healthy young men slept 10 hours a night for three nights, then 5 hours a night for eight. Daytime testosterone fell under restriction, 16.5 against 18.4 nmol/L, P = 0.049. The comparison is against a 10-hour condition rather than an ordinary night, and the study measured neither growth hormone nor strength.',
    source: {
      citation: 'Leproult R, Van Cauter E (2011). JAMA 305(21):2173-2174 (research letter).',
      doi: '10.1001/jama.2011.710',
    },
  },
  {
    id: 'c008',
    rarity: 'common',
    title: 'Soreness is not damage, and it is not growth',
    category: 'training',
    body:
      'Across 110 men performing 12, 24 or 60 maximal eccentric actions, the larger doses produced larger muscle-damage markers, yet soreness did not differ between the doses and tracked damage only weakly, r below 0.32. Soreness reflects unaccustomed eccentric loading, not how much the session achieved.',
    source: {
      citation: 'Nosaka K, Newton M, Sacco P (2002). Scand J Med Sci Sports 12(6):337-346.',
      doi: '10.1034/j.1600-0838.2002.10178.x',
    },
  },
  {
    id: 'c009',
    rarity: 'common',
    title: 'The thermic effect of protein',
    category: 'nutrition',
    body:
      'Processing protein costs roughly 20 to 30 percent of the energy it supplies, against 5 to 10 percent for carbohydrate and 0 to 3 percent for fat. That cost belongs on the expenditure side of the energy balance: Atwater factors already report metabolisable energy, so subtracting it again from intake counts it twice.',
    source: {
      citation: 'Westerterp KR (2004). Diet induced thermogenesis. Nutr Metab (Lond) 1:5.',
      doi: '10.1186/1743-7075-1-5',
    },
  },
  {
    id: 'c010',
    rarity: 'common',
    title: 'Squat depth and the knee',
    category: 'training',
    body:
      'Squatting below parallel does not raise anterior (ACL) shear: that shear peaks around 30 to 60 degrees of knee flexion and falls as depth increases. Retropatellar compressive stress peaks near 90 degrees and falls beyond it. Posterior (PCL) shear behaves differently and is higher at parallel than at quarter depth.',
    source: {
      citation: 'Hartmann H, Wirth K, Klusemann M (2013). Sports Med 43(10):993-1008.',
      doi: '10.1007/s40279-013-0073-6',
    },
  },
  {
    id: 'c011',
    rarity: 'common',
    title: 'Tonnage is a weak proxy',
    category: 'training',
    body:
      'In a trained-lifter comparison the high-volume group moved roughly twice the squat tonnage of the high-intensity group, 8,753 plus or minus 1,033 kg against 4,528 plus or minus 889 kg, and gained less: lean arm mass rose 2.2 percent against 5.2 percent, bench 1RM 6.9 percent against 14.8 percent. Total load moved is easy to count and a poor guide to what the training produced.',
    source: {
      citation: 'Mangine GT et al. (2015). Physiol Rep 3(8):e12472.',
      doi: '10.14814/phy2.12472',
    },
  },
  {
    id: 'c014',
    rarity: 'common',
    title: 'What a push-up loads',
    category: 'biomechanics',
    body:
      'A standard push-up places about 64 percent of body mass on the upper limbs, measured on a force plate. With the hands raised on a 61.0 cm box the figure falls to about 41 percent; with the feet on the same box it rises to about 74 percent. The 30 degree incline and decline usually quoted alongside these numbers is a corruption of the 30.5 cm box the study used: the conditions were box heights, never angles.',
    source: {
      citation: 'Ebben WP et al. (2011). J Strength Cond Res 25(10):2891-2894.',
      doi: '10.1519/JSC.0b013e31820c8587',
    },
  },
  {
    id: 'c015',
    rarity: 'common',
    title: 'Whey and casein',
    category: 'nutrition',
    body:
      'Whey and casein both raise plasma amino acids to a peak at about 80 minutes after ingestion. The difference between them is duration, not the timing of the peak: casein was still elevated at 360 minutes. The familiar description of casein as slow to peak is a misreading of that plateau.',
    source: {
      citation: 'Boirie Y et al. (1997). PNAS 94(26):14930-14935.',
      doi: '10.1073/pnas.94.26.14930',
    },
  },

  // ---------------- uncommon (13) ----------------
  {
    id: 'u001',
    rarity: 'uncommon',
    title: 'The smallest skeletal muscle',
    category: 'anatomy',
    body:
      'The stapedius, attached to the stapes in the middle ear, is about 4 to 5 mm long and is the smallest skeletal muscle in the body. It contracts to damp loud sound and is innervated by the facial nerve.',
    source: {
      citation: "Standring S (ed.) (2020). Gray's Anatomy, 42nd edition. Elsevier. ISBN 9780702077050.",
      doi: null,
    },
  },
  {
    id: 'u002',
    rarity: 'uncommon',
    title: 'Fibre type varies by muscle',
    category: 'anatomy',
    body:
      'Fibre-type proportions differ markedly between muscles. They were first tabulated across 36 human muscles in six male autopsy subjects aged 17 to 30. The soleus is predominantly slow-twitch, reported between about 70 and 87 percent across sources.',
    source: {
      citation:
        'Johnson MA, Polgar J, Weightman D, Appleton D (1973). Data on the distribution of fibre types in thirty-six human muscles. An autopsy study. J Neurol Sci 18(1):111-129.',
      doi: '10.1016/0022-510X(73)90023-3',
    },
  },
  {
    id: 'u003',
    rarity: 'uncommon',
    title: 'Milo of Croton',
    category: 'training',
    body:
      'The oldest surviving reference to progressive overload is one line in Quintilian: Milo, who had been used to carrying a calf, carried a bull. It appears there as a chria, a rhetorical exercise example, not as a training account.',
    source: {
      citation: 'Quintilian, Institutio Oratoria I.9.5 (c. 95 CE), Latin text verified at LacusCurtius.',
      doi: null,
    },
  },
  {
    id: 'u004',
    rarity: 'uncommon',
    title: 'The discovery of creatine',
    category: 'supplements',
    body:
      'Creatine was isolated in 1832 by Michel Eugene Chevreul from an alkaline water extract of skeletal muscle, and named after the Greek kreas, flesh. It took 160 years for the first study to show that oral supplementation raises muscle stores: 5 g four to six times daily for at least two days raised quadriceps total creatine, by up to 50 percent in subjects with low initial stores.',
    source: {
      citation: 'Harris RC, Soderlund K, Hultman E (1992). Clin Sci 83(3):367-374.',
      doi: '10.1042/cs0830367',
    },
  },
  {
    id: 'u005',
    rarity: 'uncommon',
    title: 'Training frequency',
    category: 'training',
    body:
      'Splitting the same weekly volume over two sessions rather than one was associated with about 3.1 percent more growth, 95 percent CI 1.6 to 4.6, P = 0.003, in cohorts dominated by untrained subjects. Whether three sessions is better could not be estimated. A later analysis found that once weekly volume is equated, frequency does not meaningfully change hypertrophy.',
    source: {
      citation:
        'Schoenfeld BJ, Ogborn D, Krieger JW (2016). Sports Med 46(11):1689-1697. Volume-equated follow-up: Schoenfeld BJ, Grgic J, Krieger J (2019). How many times per week should a muscle be trained to maximize muscle hypertrophy? J Sports Sci 37(11):1286-1295.',
      doi: '10.1007/s40279-016-0543-8',
    },
  },
  {
    id: 'u006',
    rarity: 'uncommon',
    title: 'The trap bar',
    category: 'biomechanics',
    body:
      'The hex or trap bar deadlift produced lower peak lumbar moments than the straight-bar deadlift at the same load. It is also faster at the bar, not slower: 0.805 plus or minus 0.165 m/s against 0.725 plus or minus 0.138 m/s. Neither study measured lumbar shear force, which is often claimed for it.',
    source: {
      citation:
        'Swinton PA et al. (2011). J Strength Cond Res 25(7):2000-2009 (peak moments). Bar velocity: Camara KD et al. (2016). J Strength Cond Res 30(5):1183-1188.',
      doi: '10.1519/JSC.0b013e3181e73f87',
    },
  },
  {
    id: 'u007',
    rarity: 'uncommon',
    title: 'The case for face pulls',
    category: 'biomechanics',
    body:
      'External-rotation and scapular-retraction exercises are selected on measured activation ratios: the useful ones recruit the external rotators and lower trapezius without a large upper-trapezius contribution. That electromyographic evidence is the whole case for them. The repeated claim that lifters are several times stronger in horizontal push than in horizontal pull has no basis in this literature.',
    source: {
      citation:
        'Cools AM et al. (2007). Rehabilitation of Scapular Muscle Balance. Am J Sports Med 35(10):1744-1751.',
      doi: '10.1177/0363546507303560',
    },
  },
  {
    id: 'u009',
    rarity: 'uncommon',
    title: 'Caffeine and endurance',
    category: 'supplements',
    body:
      'An umbrella review of 21 meta-analyses found caffeine reduces rating of perceived exertion by about 5.6 percent and improves endurance performance by 12.3 percent, 95 percent CI 9.1 to 15.4. It reports no dose-specific effects, so a per-kilogram prescription does not follow from it.',
    source: {
      citation:
        'Grgic J et al. (2020). Wake up and smell the coffee: caffeine supplementation and exercise performance - an umbrella review of 21 published meta-analyses. Br J Sports Med 54(11):681-688.',
      doi: '10.1136/bjsports-2018-100278',
    },
  },
  {
    id: 'u010',
    rarity: 'uncommon',
    title: 'Heavy loading and bone',
    category: 'biology',
    body:
      'In 101 postmenopausal women aged 65 plus or minus 5 with a T-score below -1.0, eight months of twice-weekly high-intensity resistance and impact training above 85 percent of 1RM raised lumbar spine bone mineral density by 2.9 plus or minus 2.8 percent, against -1.2 plus or minus 2.8 percent in controls, p < 0.001. The result is for that population; it has not been shown to generalise.',
    source: {
      citation: 'Watson SL et al. (2018). J Bone Miner Res 33(2):211-220 (LIFTMOR trial).',
      doi: '10.1002/jbmr.3284',
    },
  },
  {
    id: 'u011',
    rarity: 'uncommon',
    title: 'Muscle loss with age',
    category: 'biology',
    body:
      "Muscle fibre loss begins around age 50, and by age 80 approximately 50 percent of fibres are gone. Selectivity for fast-twitch fibres is supported by the wider literature, but the commonly quoted split between fibre types is not established. The review's own conclusion is that this atrophy can be slowed, not halted.",
    source: {
      citation: 'Faulkner JA et al. (2007). Clin Exp Pharmacol Physiol 34(11):1091-1096.',
      doi: '10.1111/j.1440-1681.2007.04752.x',
    },
  },
  {
    id: 'u012',
    rarity: 'uncommon',
    title: 'The ox-eating athlete',
    category: 'history',
    body:
      'Athenaeus records the pankratiast Theagenes of Thasos eating a bull, citing Poseidippus, and separately records Milo of Croton carrying a four-year-old bull and eating it in a day. The story is usually attributed to Galen; there is no evidence it appears anywhere in his work.',
    source: { citation: 'Athenaeus, Deipnosophists 10.412-413.', doi: null },
  },
  {
    id: 'u014',
    rarity: 'uncommon',
    title: 'The maintenance dose',
    category: 'training',
    body:
      'In a detraining study the leanest maintenance dose was one set of three exercises once a week, three sets weekly, taken to volitional fatigue and held for 32 weeks. Both maintenance doses preserved hypertrophy in young subjects but not in older ones. In the same study, 32 weeks of complete detraining left strength only 7 percent below peak and still 23 percent above baseline.',
    source: {
      citation: 'Bickel CS, Cross JM, Bamman MM (2011). Med Sci Sports Exerc 43(7):1177-1187.',
      doi: '10.1249/MSS.0b013e318207c15d',
    },
  },
  {
    id: 'u015',
    rarity: 'uncommon',
    title: 'Lifting and running economy',
    category: 'training',
    body:
      'Eight weeks of heavy half-squat training in 17 well-trained runners improved running economy at 70 percent of VO2max by 5.0 percent, with 1RM up 33.2 percent and time to exhaustion up 21.3 percent, and no change in VO2max. The study measured neither tendon stiffness nor ground contact time, so no mechanism follows from it.',
    source: {
      citation: 'Storen O, Helgerud J, Stoa EM, Hoff J (2008). Med Sci Sports Exerc 40(6):1087-1092.',
      doi: '10.1249/MSS.0b013e318168da2f',
    },
  },

  // ---------------- rare (12) ----------------
  {
    id: 'r001',
    rarity: 'rare',
    title: 'The soleus push-up',
    category: 'anatomy',
    body:
      'Repeated low-effort soleus contractions performed seated, at roughly 2 METs and without fatigue, reduced the postprandial blood glucose excursion by 52 percent and hyperinsulinaemia by 60 percent. The soleus is about 88 percent type I fibre. The same paper cites evidence that standing instead of sitting did not reduce glucose at all.',
    source: {
      citation:
        'Hamilton MT, Hamilton DG, Zderic TW (2022). A potent physiological method to magnify and sustain soleus oxidative metabolism improves glucose and lipid regulation. iScience 25(9):104869.',
      doi: '10.1016/j.isci.2022.104869',
    },
  },
  {
    id: 'r002',
    rarity: 'rare',
    title: 'What Roman gladiators ate',
    category: 'history',
    body:
      'Stable-isotope analysis of 22 gladiator skeletons from Ephesus shows a diet dominated by C3 plants, principally wheat, barley and legumes, rather than the meat-heavy regimen of popular accounts.',
    source: { citation: 'Losch S et al. (2014). PLoS ONE 9(10):e110489.', doi: '10.1371/journal.pone.0110489' },
  },
  {
    id: 'r003',
    rarity: 'rare',
    title: 'Myostatin loss of function',
    category: 'biology',
    body:
      'A German child carrying a homozygous splice-donor mutation in the myostatin gene, g.IVS1+5G to A, showed gross muscle hypertrophy from birth and could hold 3 kg dumbbells with arms extended at four and a half years old. The Belgian Blue cattle comparison often attached to this case comes from elsewhere, not from this report.',
    source: {
      citation:
        'Schuelke M et al. (2004). Myostatin Mutation Associated with Gross Muscle Hypertrophy in a Child. N Engl J Med 350(26):2682-2688.',
      doi: '10.1056/NEJMoa040933',
    },
  },
  {
    id: 'r004',
    rarity: 'rare',
    title: 'Strength per unit muscle',
    category: 'biomechanics',
    body:
      'Women measured about 52 percent as strong as men in the upper body, and men were stronger even after adjusting for lean body mass. Only when strength was expressed per unit of muscle cross-sectional area did the sex difference disappear. The gap is in muscle quantity and distribution, not in contractile quality.',
    source: { citation: 'Miller AE et al. (1993). Eur J Appl Physiol 66(3):254-262.', doi: '10.1007/BF00235103' },
  },
  {
    id: 'r005',
    rarity: 'rare',
    title: 'Exercise and respiratory infection',
    category: 'biology',
    body:
      'Adults reporting aerobic exercise on five or more days a week had 43 percent fewer days with upper-respiratory infection. The finding is self-reported and concerns aerobic exercise; no comparable result exists for resistance training, and the acute open-window claim is questioned by the position statement usually cited for it.',
    source: {
      citation: 'Nieman DC et al. (2011). Br J Sports Med 45(12):987-992.',
      doi: '10.1136/bjsm.2010.077875',
    },
  },
  {
    id: 'r006',
    rarity: 'rare',
    title: "Thomas Topham's lift",
    category: 'history',
    body:
      'On 28 May 1741 the London strongman Thomas Topham raised three hogsheads of water, 1,836 lb or 833 kg, from the ground using a rope and tackle harness, a feat recorded in a contemporary etching. Harness lifts of this kind are not comparable to a modern barbell deadlift.',
    source: {
      citation:
        'Webster DP (1976). The Iron Game: An Illustrated History of Weight-Lifting. John Geddes. ISBN 0950682101. Contemporary etching: Wellcome Collection.',
      doi: null,
    },
  },
  {
    id: 'r007',
    rarity: 'rare',
    title: 'Why your nose runs in the cold',
    category: 'biology',
    body:
      'Cold-air rhinorrhoea is cholinergic: 96 percent of 90 patients reported it, and atropine blocked it in 92 percent of the 14 tested. Exercise itself normally produces sympathetic nasal decongestion, so the running nose belongs to the air rather than to the effort.',
    source: {
      citation:
        "Silvers WS (1991). The skier's nose: a model of cold-induced rhinorrhea. Annals of Allergy 67(1):32-36. PMID 1859038.",
      doi: null,
    },
  },
  {
    id: 'r008',
    rarity: 'rare',
    title: 'Partial sleep restriction and lifting',
    category: 'recovery',
    body:
      'Eight men slept 3 hours a night for three nights. Bench press, leg press and deadlift performance all declined significantly, p < 0.001; the biceps curl did not. The study had no total-deprivation arm, and the percentage losses usually quoted for it are not in the paper.',
    source: {
      citation:
        'Reilly T, Piercy M (1994). The effect of partial sleep deprivation on weight-lifting performance. Ergonomics 37(1):107-115.',
      doi: '10.1080/00140139408963628',
    },
  },
  {
    id: 'r009',
    rarity: 'rare',
    title: 'Early gains are mostly neural',
    category: 'biology',
    body:
      'Strength gained in the first weeks of training is predominantly neural, though the precise locus of the adaptation remains unresolved. Measurable hypertrophy starts earlier than usually claimed: vastus lateralis anatomical cross-sectional area rose 2.9 plus or minus 2.7 percent after two weeks in a downhill-running training study.',
    source: {
      citation:
        'Skarabot J et al. (2021). Eur J Appl Physiol 121(3):675-685. Early hypertrophy: Bontemps B et al. (2022). Eur J Appl Physiol 122(4):1071-1084.',
      doi: '10.1007/s00421-020-04567-3',
    },
  },
  {
    id: 'r010',
    rarity: 'rare',
    title: 'The milk-mucus belief',
    category: 'nutrition',
    body:
      "In a blinded sensory comparison of cow's milk against a soy placebo, 3 of 14 mucus-related indicators rose, and rose equally in both arms. The sensation tracks the texture of the drink rather than the dairy in it.",
    source: {
      citation:
        "Pinnock CB, Arney WK (1993). The milk-mucus belief: sensory analysis comparing cow's milk and a soy placebo. Appetite 20(1):61-70.",
      doi: '10.1006/appe.1993.1006',
    },
  },
  {
    id: 'r011',
    rarity: 'rare',
    title: 'Cold water immersion after lifting',
    category: 'recovery',
    body:
      'Ten minutes of immersion at 10.1 plus or minus 0.3 degrees C within five minutes of each session left quadriceps lean mass up 103 plus or minus 71 g, against 309 plus or minus 73 g for active recovery. Type II fibre cross-sectional area rose 17.1 plus or minus 5.1 percent with active recovery, p = 0.009, and not at all with immersion, p = 0.10.',
    source: {
      citation:
        'Roberts LA et al. (2015). Post-exercise cold water immersion attenuates acute anabolic signalling and long-term adaptations in muscle to strength training. J Physiol 593(18):4285-4301.',
      doi: '10.1113/JP270570',
    },
  },
  {
    id: 'r012',
    rarity: 'rare',
    title: 'Grip strength and mortality',
    category: 'biology',
    body:
      'In a cohort aged 35 to 70 at enrolment, each 5 kg decrement in grip strength was associated with a 16 percent higher hazard of death, HR 1.16, 95 percent CI 1.13 to 1.20, over a median 4.0 years of follow-up. Grip strength was a stronger predictor of mortality than systolic blood pressure.',
    source: {
      citation:
        'Leong DP et al. (2015). Prognostic value of grip strength: findings from the Prospective Urban Rural Epidemiology (PURE) study. Lancet 386(9990):266-273.',
      doi: '10.1016/S0140-6736(14)62000-6',
    },
  },
];

export const SPECIMEN_BY_ID: Readonly<Record<string, SpecimenCard>> = Object.fromEntries(
  SPECIMEN_CARDS.map((c): readonly [string, SpecimenCard] => [c.id, c]),
);

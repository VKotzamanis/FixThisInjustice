// src/content/supplementGuidance.ts
//
// The guidance step, rebuilt. Round 2 claim r2.18.
//
// WHAT CHANGED, AND WHY. It was four sections of running prose, and the owner read it as a wall.
// It is now eight topics, each a collapsible box that starts CLOSED, so the step opens as a short
// menu and the reader chooses what to read. `GuidanceScreen.test.tsx` asserts that nothing is
// open on first render, because "collapsed by default" is the whole point of the change and a
// stray `open` attribute would undo it silently.
//
// THE SHAPE INSIDE A BOX, and the reason it is a shape rather than a paragraph:
//   `answer` - one line, the whole point of the topic, readable on its own.
//   `points` - bullets. Every term defined in plain words on first use.
//   `caution` - bullets, and only where the evidence carries a safety statement.
//   `gap`    - the claim in this topic that HAS NO SOURCE, named on the face of the box.
//
// MAX_PARAGRAPH_CHARS is what stops the wall coming back. It is a hard cap asserted over every
// string in this file by `supplementGuidance.test.ts`, so the prose cannot silently grow back
// into the thing that was rejected. See that constant for how the number was chosen.
//
// WHY THIS IS NOT A COPY TABLE. Copy contract R10: reference text a user chooses to open is
// exempt from the length rules R1 to R4 and from R9, and lives in its own module. This file is
// already named in R10's module list. It is NOT exempt from R5 (no em dash, no connector en
// dash), R6 (no emoji) or R11 (name the defined quantity), and the suite asserts all three.
//
// R14 GOVERNS THE HEADINGS: Title Case, and a noun phrase rather than a sentence. They are NOT
// shouted here. The owner's sketch spelled them upper case; that is `text-transform: uppercase`
// in `setup.css`, applied at render, so the copy stays readable and a skin can drop the styling.
//
// NOTHING IS RE-DERIVED. Brief L section 2: the creatine, caffeine and protein sections keep
// their substance and their citations exactly. Every dose, percentage and sample size below is
// the round-1 string's own number, and the only edits made to those three topics were splitting
// sentences at full stops that were already there and defining the terms they used. No dose and
// no DOI was altered. The citations themselves moved to `guidanceReferences.ts`, which is the
// single numbered list every topic now points into.
//
// A DEFECT FIXED IN PASSING, reported rather than left: the old bodies carried literal `{dose}`,
// `{lo}` and `{hi}` brace slots and the screen rendered `section.body` raw, so the user actually
// read the words "Creatine monohydrate, {dose} g a day". Nothing ever substituted them. The
// personalised numbers now come only from `FORMAT.guidanceCreatine` and `FORMAT.guidanceCaffeine`,
// which always did the formatting, and no brace slot survives in this file.
//
// Units: creatine grams (g), caffeine milligrams (mg), protein grams per kilogram of body mass
// (g/kg), fluid loss as a fraction of body mass (per cent), rest intervals in minutes and
// seconds, repetition duration in seconds (s).

/**
 * The hard cap on any one paragraph in this file, in characters.
 *
 * Brief L: "no paragraph longer than three lines", which is the guard against the wall of prose
 * coming back. A character cap is the only version of that a test can enforce, because a rendered
 * line count depends on viewport width and font metrics that a unit test does not have.
 *
 * 60 characters is the middle of the 45 to 75 character measure typography treats as a readable
 * line, so three lines is 180. The cap is deliberately strict: a string at the limit is already
 * three full lines on a phone, and every string below sits under it with room to spare.
 */
export const MAX_PARAGRAPH_CHARS = 180;

/** One topic, rendered as one collapsible box. */
export interface GuidanceSection {
  id: string;
  /** Title Case noun phrase, R14. Upper-cased in CSS, never here. */
  heading: string;
  /**
   * The entries in `GUIDANCE_REFERENCES` this topic rests on, printed as superscripts beside the
   * heading. One marker may appear on two topics: the fluid source is cited by both Water and
   * Electrolytes, which is a citation being reused, not a second numbering scheme.
   */
  markers: readonly number[];
  /** The one-line answer, first, before anything else. */
  answer: string;
  /** The bullets under it. */
  points: readonly string[];
  /** Safety statements, where the evidence carries one. Empty where it does not. */
  caution: readonly string[];
  /**
   * The claim in this topic that has NO source, named on the face of the box, or `null` where
   * every claim in the topic is sourced. This is the marked placeholder brief L section 3b asks
   * for: the owner drops his own recommendation here, and until he does the absence is visible
   * to the reader rather than hidden behind a citation that does not support the sentence.
   */
  gap: string | null;
}

export const SUPPLEMENT_GUIDANCE: readonly GuidanceSection[] = [
  // Units: grams (g)
  {
    id: 'creatine',
    heading: 'Creatine',
    markers: [1, 2],
    answer: 'Take creatine monohydrate once a day, every day, at the dose below.',
    points: [
      'The dose is worked out from your body mass. There is no loading phase and no need for one.',
      'A loading phase means a large dose for the first week. You can skip it: you reach the same place, a little slower.',
      'Timing does not matter. Mix it into a smoothie or coffee, whenever suits you.',
      'It is among the most studied supplements in sport, and in healthy adults the trials have not found harm.',
      'Monohydrate only. Ethyl ester and buffered forms are rejected on muscle uptake, which is the outcome their marketing claims.',
      'Muscle uptake means how much of what you swallow actually reaches the muscle. That is the thing the pricier forms fail at.',
    ],
    caution: [
      'If you have kidney disease, ask a doctor first. That is the one caution the evidence supports, and it is not a general one.',
    ],
    gap: null,
  },
  // Units: milligrams (mg)
  {
    id: 'caffeine',
    heading: 'Caffeine',
    markers: [3, 4, 5],
    answer: 'A moderate dose about an hour before you lift, at the range below.',
    points: [
      'The range is worked out from your body mass, and it is smaller than the dose usually quoted.',
      'It is smaller because the usual figure comes from endurance research: running and cycling, not lifting.',
      'The range shown is the one that helps strength and muscular endurance.',
      'Muscular endurance means how many repetitions you can keep producing before the set fails.',
      'Coffee works as well as a capsule at a matched dose. Iced coffee before the gym is a fine way to take it.',
      'A matched dose means the same number of milligrams, however you get them.',
      'Whether milk and sugar change the effect has not been tested, so this app makes no claim either way.',
    ],
    caution: [
      'EFSA puts a safe single dose for healthy adults at 200 mg and a safe daily total at 400 mg.',
      'EFSA is the European Food Safety Authority, the body that sets those limits. This app caps the single dose at its 200 mg figure.',
      'Habitual coffee drinking may blunt the effect; the evidence is mixed.',
      'Not for pregnancy without medical advice, and not for adolescents.',
    ],
    gap: null,
  },
  // Units: grams per kilogram of body mass (g/kg), per cent (%)
  {
    id: 'protein',
    heading: 'Protein Powder',
    markers: [6, 7, 8, 9],
    answer: 'The form does not matter. The daily total does, and so does third-party testing.',
    points: [
      'Isolate, concentrate and hydrolysate produce no meaningful difference in muscle gain.',
      'Those three words only describe how much milk sugar and fat have been filtered out. More filtering means less lactose and a higher price, not more muscle.',
      'What differs is lactose content and price. Buy on those.',
      'What matters is the daily total, which this app computes for you.',
      'Spread that total across at least four meals, at roughly 0.4 g per kg of body mass each.',
      'Powder is convenience, not necessity. Whole food meets the same target.',
    ],
    caution: [
      'Buy a product carrying third-party testing: an independent laboratory, not the manufacturer, has tested the tub.',
      'Of 634 supplements sampled across thirteen countries, 14.8 per cent held undeclared anabolic steroids.',
      'A 2025 sample of 200 online products found 35 per cent carrying substances banned in sport.',
    ],
    gap: null,
  },
  // Units: body-mass loss as a fraction of body mass (per cent), body mass kg, time min
  {
    id: 'water',
    heading: 'Water',
    markers: [10, 11],
    answer: 'Drink to thirst. The number that matters is not what you drink, it is what you lose.',
    points: [
      'Weigh yourself before the session and after it. Keep the loss under 2 per cent of your body mass.',
      'Worked example, at 80 kg: 2 per cent is 1.6 kg. Finish more than 1.6 kg down and you drank too little.',
      'That is the whole method, and it is personal to you: it measures your own sweat rate instead of guessing it.',
      'Sweat rate means how fast you lose fluid while training. It differs enough between people that one shared number would be wrong for almost everyone.',
      'This app prompts you about every 20 minutes and names no volume on purpose. The prompt is a reminder to consult thirst, not a dose.',
      'The 20 minute cadence is a design choice, not a research finding. No source sets a prompt interval.',
    ],
    caution: [],
    gap: 'How much to drink during a session, and when, for a named session length and intensity. No adequate source was found, so no volume is printed. See reference 11.',
  },
  // Units: rest interval min and s, repetition duration s
  {
    id: 'cooldown',
    heading: 'Cool-Down',
    markers: [12, 13, 14, 15],
    answer:
      'Rest longer between heavy sets than feels necessary. How fast you move the bar, though, does not appear to matter.',
    points: [
      'The pause between two sets is called the rest interval. This app defaults to 3 minutes after a heavy compound set.',
      'Then 2 minutes after a moderate compound set, and 90 seconds after isolation work.',
      'A compound lift moves more than one joint: a squat, a deadlift, a press, a row. An isolation lift moves one: a curl, a lateral raise.',
      'Short rest is not dangerous, it is just less productive. You manage fewer repetitions and less load on the next set.',
      'That lost work is the whole mechanism: rest helps by protecting the volume you do, not by doing anything on its own.',
      'Honest limit: one large review found strength was not affected by short versus long rest, and had insufficient data on muscle growth.',
      'On repetition speed: a meta-analysis of eight trials found similar hypertrophy across repetition durations of roughly 0.5 to 8 seconds.',
      'A meta-analysis pools the results of several trials into one estimate. Hypertrophy means growth in muscle size.',
      'So the gym truism that fast repetitions do not build muscle is not supported by that evidence.',
      'Across the range people actually lift in, time under tension is not the lever it is popularly held to be.',
      'Time under tension means how long the muscle stays loaded during a set. Lift at the speed you can control.',
    ],
    caution: [],
    gap: null,
  },
  // Units: body-mass loss as a fraction of body mass (per cent)
  {
    id: 'electrolytes',
    heading: 'Electrolytes',
    markers: [10, 16],
    answer: 'For ordinary training, water is enough. A sports drink is not doing anything for you.',
    points: [
      'Electrolytes are the salts dissolved in your body fluid: mainly sodium, potassium, chloride and magnesium.',
      'You lose some of them in sweat, which is why the drinks exist and why they are sold for every session regardless.',
      'What is sourced here: keep in-session loss under 2 per cent of body mass, and estimate your own sweat rate by weighing before and after.',
      'That is the same measurement the Water topic asks for, and it is the only fluid number this app prints.',
      'What is not sourced is where the line sits, so this app gives you no session length and no sweat volume to judge it by.',
    ],
    caution: [],
    gap: 'The session duration or sweat loss above which electrolyte replacement starts to matter. No adequate source was found, so no threshold is printed. See reference 16.',
  },
  {
    id: 'shoes',
    heading: 'Shoes',
    markers: [17, 18],
    answer: 'Shoes are the one place worth spending. That is an opinion, and it is marked as one.',
    points: [
      'The reasoning: a soft sole squashes under a heavy lift, so some of the force you produce goes into the foam instead of the bar.',
      'A firm, flat sole does not squash, so the force goes where you sent it. Running shoes are built to squash on purpose.',
      'That is a mechanical argument, not a trial result. No study isolates sole firmness or measures injury outcomes.',
      'Baby powder in your shoes for foot odour is a household remedy. There is no trial behind that either.',
      'Both are here because the owner rates them, and both are labelled so you can tell them apart from the sourced topics.',
    ],
    caution: [],
    gap: 'That a firm sole improves a lift or reduces injury, and that baby powder controls foot odour. No adequate source was found for either. See references 17 and 18.',
  },
  // Units: kilograms (kg)
  {
    id: 'kit',
    heading: 'Kit',
    markers: [19],
    answer: 'Two things, and neither one is a research finding.',
    points: [
      'A shaker bottle with a wire whisk ball inside it.',
      'A scale that reads to a tenth of a kilogram, so a body-mass change smaller than 0.1 kg is not invented by rounding.',
      'They are the two things that make logging and mixing less annoying. That is the entire claim being made.',
    ],
    caution: [],
    gap: 'That either item changes a training outcome. No such claim is made and none is sourced. See reference 19.',
  },
];

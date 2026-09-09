// src/content/introSlides.ts
//
// The intro sequence's slide text, and the ASCII figure it draws. Round 1 claims C1.01.2 to
// C1.01.15: the owner asked for an intro ahead of "Setup, step 1 of 9" -- four slides of
// caveats, then a disclaimer, then a slide naming what setup collects.
//
// R10 REFERENCE TEXT (docs/design/2026-09-01-copy-contract.md), NOT A COPY TABLE. The app draws
// exactly one copy KEY around this content: `advice.clickToContinue`, in src/content/copy.ts.
// The five slides and acknowledgement are long-form prose a screen
// shows once, not a control label a skin retunes. They live here instead, exactly as the other
// five R10 modules do (src/content/formCues.ts, specimenCards.ts, bodyEquations.ts,
// sexRationale.ts, supplementGuidance.ts). This module is NOT exempt from R5 (no em dash, no
// connector en dash), R6 (no emoji) or R11 (name the quantity), and
// src/content/introSlides.test.ts asserts all three, plus the no-URL rule every module here
// carries.
//
// ROUND 2 RESTRUCTURED. The copied-verbatim rule is superseded for slide shape at the owner's
// instruction: the content remains his and must not be reworded, shortened or improved, but
// round 2 changes the former walls of prose into headings, lead lines and bullets.
//
// THE ASCII FIGURE IS ORIGINAL. The owner's note named a cartoon character for this spot; that is
// third-party IP, and README.md's "Licences" section already states that this project's mascot
// art originates with the project. INTRO_FIGURE below is a small stick figure flexing, authored
// for this file: four lines by seven columns, well inside the 8-line by 20-column ceiling the
// brief sets.
//
// A FEATURE SLIDE 4 PROMISES AND THE REPOSITORY DOES NOT YET BUILD. Its second sentence, "there
// are small games to play during the rest between hard sets", names a mechanic that does not
// exist anywhere in this tree today (grep src/domain and src/ui/views/train for "game" or "rest
// game" and nothing answers). The owner confirmed this is a decision already taken, not a defect
// in the copy: the sentence ships as written, and the games are in scope for a later task. THIS
// SLIDE MUST NOT REACH ANYONE BUT THE OWNER UNTIL THAT FEATURE SHIPS -- it is a promise the app
// does not yet keep, and showing it to another tester would be advertising a control that is not
// there to press.

/** One bullet: an emphasised lead phrase, then the rest of the sentence. */
export interface IntroBullet {
  /** Rendered with the lead-phrase class. Two to five words. */
  lead: string;
  /** The rest, rendered plain after a colon. `null` where the lead IS the whole bullet. */
  rest: string | null;
}

export interface IntroSlide {
  /** Rendered whole, before the body types. Title Case noun phrase, `null` on slide 1. */
  heading: string | null;
  /** A line above the bullets, or `null`. Types out with the body. */
  lead: string | null;
  bullets: readonly IntroBullet[];
}

/**
 * The five slides, in the order the sequence shows them. The acknowledgement is a modal over
 * slide 4, rather than a slide of its own.
 */
export const INTRO_SLIDES: readonly IntroSlide[] = [
  {
    heading: null,
    lead: 'Hi. You probably have this link because V sent you the app he has been working on. If not, here are some caveats.',
    bullets: [],
  },
  {
    heading: 'Who I Am',
    lead: 'The creator of this app:',
    bullets: [
      { lead: 'Not a medical professional', rest: 'and not someone who has actively pursued bodybuilding since 2020.' },
      { lead: 'Still the guy who shows up', rest: 'he will come to the gym with you, teach you how to lift, and build you a plan.' },
    ],
  },
  {
    heading: 'Purpose of the App',
    lead: 'This app, webpage really, exists to make going to the gym somewhat stress free.',
    bullets: [
      { lead: 'Simplify the fitness habit', rest: 'you get a day-to-day plan for what to lift, when, and how.' },
      { lead: 'A fitness diary', rest: 'logging a lift, cataloguing your progress and seeing whether you are drifting off your goal are all easy. That phrase is as unpleasant to write as it is to read.' },
      { lead: 'The parts I like', rest: 'a reminder on your gym day, an atlas of odd facts that unlocks as you go, and one that berates you when you slack off.' },
    ],
  },
  {
    heading: 'Motivation',
    lead: 'Two reasons.',
    bullets: [
      { lead: 'This should be open and free', rest: 'most people I know cannot spend 150 dollars a session on a personal trainer, and the fitness apps I have tried are generic and keep the useful part behind a paywall.' },
      { lead: 'Exercise should not feel like a chore', rest: 'so there are small games to play during the rest between hard sets.' },
      { lead: 'Where it came from', rest: 'a solo project to get myself back in shape. The code was written with Claude Code, and this repository is the only official one.' },
    ],
  },
  {
    heading: 'What Setup Collects',
    lead: 'You need to give me three things.',
    bullets: [
      { lead: 'Your preferred settings', rest: null },
      { lead: 'Your personal information', rest: null },
      { lead: 'Your fitness goal and schedule', rest: null },
    ],
  },
];

export const INTRO_DISCLAIMER: string = 'Tl;dr: do not be MJT attempting what looks like a pull-up. If you are unsure of an exercise, skip it and ask someone who works at your gym to show you. Consider yourself warned and me not liable.';

export const INTRO_DISCLAIMER_HEADING = 'Tl;dr';

export const INTRO_ACKNOWLEDGEMENT = 'I realise that asking for help from an actual human is necessary when I am unsure about my form. I agree to use common sense and stop being shy to the detriment of my own health.';

/**
 * A small original stick figure, flexing. Four lines by seven columns: well inside the brief's
 * ceiling of eight lines by twenty columns. See the file header for why this is drawn fresh
 * rather than reusing the cartoon character the owner's note named.
 */
export const INTRO_FIGURE: string = ['   _O_', '  d-|-b', '   /|\\', '   / \\'].join('\n');

// src/content/introSlides.ts
//
// The intro sequence's slide text, and the ASCII figure it draws. Round 1 claims C1.01.2 to
// C1.01.15: the owner asked for an intro ahead of "Setup, step 1 of 9" -- four slides of
// caveats, then a disclaimer, then a slide naming what setup collects.
//
// R10 REFERENCE TEXT (docs/design/2026-09-01-copy-contract.md), NOT A COPY TABLE. The app draws
// exactly two copy KEYS around this content -- `button.skipIntro` and `advice.clickToContinue`,
// both in src/content/copy.ts -- and the six slides themselves are long-form prose a screen
// shows once, not a control label a skin retunes. They live here instead, exactly as the other
// five R10 modules do (src/content/formCues.ts, specimenCards.ts, bodyEquations.ts,
// sexRationale.ts, supplementGuidance.ts). This module is NOT exempt from R5 (no em dash, no
// connector en dash), R6 (no emoji) or R11 (name the quantity), and
// src/content/introSlides.test.ts asserts all three, plus the no-URL rule every module here
// carries.
//
// COPIED VERBATIM. 00-CONTEXT rule 2: user-facing copy that carries the owner's own statement is
// supplied verbatim and copied character for character, never reworded, shortened or improved.
// Every `body` below is transcribed from the owner's brief with ONE mechanical change: the
// brief's own line wrapping (a fixed column width in a markdown fence) is collapsed to a single
// space, because that wrapping is an artifact of the editor and was never part of the sentence.
// A literal BLANK line inside a `body` (two consecutive `\n`) is different: it is a paragraph
// break the owner actually wrote (slide 4 is two paragraphs), and IntroSequence.tsx renders the
// string through `white-space: pre-wrap`, so that blank line reaches the screen as one.
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

/** One slide: the heading it shows, or none, and the body typed out beneath it. */
export interface IntroSlide {
  /** The heading rendered above the body, or `null` on the two slides the brief gives none. */
  heading: string | null;
  /**
   * The body text, typed out one character at a time by IntroSequence.tsx (roughly 18 ms per
   * character). Copied verbatim from the owner's brief; do not edit, shorten or reword it.
   */
  body: string;
}

/**
 * The six slides, in the order the sequence shows them. Slides 1 to 4 (indices 0 to 3) carry the
 * ASCII figure and the "Click to continue" line at their foot (IntroSequence.tsx reads that
 * split from the array position, per the brief's own "slides 1 to 4" wording); slide 5 (index 4)
 * is the disclaimer, emphasised by a slow pulse instead; slide 6 (index 5) is plain.
 */
export const INTRO_SLIDES: readonly IntroSlide[] = [
  {
    heading: null,
    body: 'Hi. You probably have this link because V sent you the app he has been working on. If not, here are some caveats.',
  },
  {
    heading: 'Who am I',
    body: 'The creator of this app is not a medical professional and has not actively pursued bodybuilding since 2020. That said, he is the guy who will come to the gym with you, teach you how to lift, and build you a plan.',
  },
  {
    heading: 'Purpose and functions',
    body: 'The purpose of this app, webpage really, is to make going to the gym somewhat stress free, by handing you a plan for what to lift, when, and how. It is also a fitness diary, and yes, that phrase is as unpleasant to write as it is to read. It is built so that logging an exercise, cataloguing your progress and seeing whether you are drifting off your goal are all easy. There are some things in it I like: a reminder on your gym day, an atlas of odd facts that unlocks as you go, and my own favourite, something that berates you when you slack off.',
  },
  {
    heading: 'Motivation',
    body: 'Two reasons. First, this should be open and free. Most people I know cannot spend 150 dollars a session on a personal trainer, and the fitness apps I have tried are generic and keep the useful part behind a paywall. Second, exercise should not feel like a chore to get through, so there are small games to play during the rest between hard sets.\n\nThe concept was a solo project to get myself back in shape. The code was written with Claude Code, and this repository is the only official one.',
  },
  {
    heading: null,
    body: 'Tl;dr: do not be MJT attempting what looks like a pull-up. If you are unsure of an exercise, skip it and ask someone who works at your gym to show you. Consider yourself warned and me not liable.',
  },
  {
    heading: 'Before we launch',
    body: 'You need to give me three things: your preferred settings, your personal information, and your fitness goal and schedule.',
  },
];

/**
 * A small original stick figure, flexing. Four lines by seven columns: well inside the brief's
 * ceiling of eight lines by twenty columns. See the file header for why this is drawn fresh
 * rather than reusing the cartoon character the owner's note named.
 */
export const INTRO_FIGURE: string = ['   _O_', '  d-|-b', '   /|\\', '   / \\'].join('\n');

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
// SUPERSEDED AGAIN, AND THIS TIME THE RULE ITSELF GOES, NOT ONLY ITS SCOPE. Design Mode now edits
// these five slides in place. The owner opens the deployed app with `?design=1`, taps a sentence,
// retypes it, and exports a patch that `scripts/design-patch.mjs` applies back to the literals
// below. "Copied verbatim from the brief, do not reword" was a rule for AGENTS and it still binds
// them: nobody but the owner rewrites his own words, and an agent asked to shorten, improve or
// tidy a slide should refuse and say so. What changed is that HE has a way to do it, so a
// disagreement between this file and what is on screen is now a patch he has not applied yet
// rather than a defect.
//
// <!-- decision: intro-slides-are-owner-editable-in-design-mode | status: adopted | supersedes: intro-slides-copied-verbatim-never-edited -->
//
// WHY THIS MODULE AND NOT ITS TEN SIBLINGS. It carries no citation, no DOI, no dose and no
// coefficient: measured on this tree it holds zero of each, where `guidanceReferences.ts` holds
// thirty DOIs and `specimenCards.ts` thirty-two. Design Mode's rule is "a module that CITES
// something is not editable", not "R10 is not editable", and the gate is DERIVED from the words
// rather than kept as a list: `src/content/r10Text.ts` re-reads these strings on every load and
// locks the module the moment one of them acquires a DOI, a URL, an author list, a decimal or a
// number with a unit. Adding a citation here tomorrow takes the editing away automatically, and
// `src/content/r10Text.test.ts` proves that rather than trusting it.
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
    lead: "Hey. You probably got access to this page & repo from V, after him talking to you about a fitness pal that he's been working on. If not, let's get some caveats out of the way:",
    bullets: [],
  },
  {
    heading: 'Humble Brag?',
    lead: 'Not really, here are my credentials:',
    bullets: [
      { lead: 'Is an academic, not a big tits bodybuilder influencer:', rest: 'That being said, I was actively doing body-building since I was 17 (i.e., gym everyday, track macros, journal plateaus and all that). I stopped at 27 to focus on my PhD and I am just getting back to it.' },
      { lead: 'The guy who shows up:', rest: "I introduced a lot of my friends to the 'going to the gym' concept and I enjoyed very much helping them with their fitness goals. My favorite thing was pinpointing which 'part'of their body should feel what during a lift." },
    ],
  },
  {
    heading: 'Goal of This Fitness Pal',
    lead: 'The fitness pal (i.e., current webpage), exists to make the *habit* of exercising: (a) stress-free, (b) ~fun~, and your fitness goals attainable.',
    bullets: [
      { lead: 'Week! Automate!', rest: 'you get a day-to-day plan of the combined exercises you complete, along with recommended reps and sets. This plan takes into account the availability of your equipment and your preferred split.' },
      { lead: 'Dear Diary:', rest: "The webpage saves the daily logged daily on your browser cache (i.e., completely private). Your data is then used to prepare the next week's plan with your previous lifting score, weighted differently for de-load periods etc." },
      { lead: 'No ADHD Allowed:', rest: 'You are able to make the webpage (optionally) send you notifs. in your gym days (e.g., pack your gym bag). When you successfully complete workout days, you will unlock facts and debunked fitness myths in your Atlas, and in the days where you flop, you will. be. dealt. with.' },
    ],
  },
  {
    heading: 'Why and How',
    lead: 'Two reasons.',
    bullets: [
      { lead: 'We Hate Cashgrabs', rest: "Most beginner gymrats don't have 150$/session for personal training. Fitness help is kind of gatekept and it's hard to distinguish what's true and what's bullshit. This webpage will always be free, open-source, and provide valid references for every claim that's made (i.e., 'broscience' isn't peer-reviewed -> classified as tiktok tarot readings). " },
      { lead: 'Coach, not Couch:', rest: "If you lift alone, you know it's hard to actually pace yourself and maintain proper rest times between sets. To that end, I included some small-form games to keep us company while we wait. Other examples of gamification include: (a) a gatcha game where your time spent in the gym functions as currency and (b) an Atlas with unlockable trivia." },
      { lead: 'Credits:', rest: 'So this is a solo project that I made for myself in order to get back to shape. I planned the webpage, its functionalities and used Agentic Coding to get it up and running. Everything produced was reviewed by me and two of my gymrat friends (if u see this i </3 u).' },
    ],
  },
  {
    heading: 'Almost There',
    lead: "To build a plan for you, we'll just need 3 things that stay between you and your browser. **Again, no data is collected at all, ever.**",
    bullets: [
      { lead: 'Measurement units & preferred settings.', rest: null },
      { lead: 'Your personal information (e.g., body mass).', rest: null },
      { lead: 'Your fitness goal, equipment, and availability.', rest: null },
    ],
  },
];

export const INTRO_DISCLAIMER: string = 'Do not trust yourself or a webpage to perfect your form. Ask the assholes that work there to help you if you are unsure. Be mindful and try to "map" the muscles you feel in each exercise. If you don\'t feel anything while lifting at your max, *you\'re doing something wrong*. **So, Basically.** You don\'t want to be doing MTG\'s version of a pull-up. Start slow and steady and take care of yourself luv (also go get some blood work done and an annual checkup).';

export const INTRO_DISCLAIMER_HEADING = 'IMPORTANT, PLS READ';

export const INTRO_ACKNOWLEDGEMENT = 'TL;DR: By using this webpage, you acknowledge and realize that asking for help from an actual human is good and necessary for your well-being and for those around you. You agree to use common sense and stop being shy to the detriment of your own health. ';

/**
 * A small original stick figure, flexing. Four lines by seven columns: well inside the brief's
 * ceiling of eight lines by twenty columns. See the file header for why this is drawn fresh
 * rather than reusing the cartoon character the owner's note named.
 */
export const INTRO_FIGURE: string = ['   _O_', '  d-|-b', '   /|\\', '   / \\'].join('\n');

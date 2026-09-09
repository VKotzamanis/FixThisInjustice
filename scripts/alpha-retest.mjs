// scripts/alpha-retest.mjs
//
// The round-2 retest page: the corrected parts, in the same instrument as the round-1 walk.
//
// WHY IT EXISTS. Round 1 was collected through walkthrough pages -- a step, a Do line, a You see
// line, one comment box, and an Assemble button that builds the block the owner pastes back.
// The fixes from round 1 need the same instrument, not a status report: a fix is not closed
// until the person who reported it has looked at it and said so.
//
// WHAT IT COVERS. Only what has actually changed in the tree, and the states the new fixture
// unlocks. It grows as more of plan 11 lands; it does not restate the round-1 walk.
//
// PART IDS ARE UNCHANGED, so a comment written here reaches the same task a round-1 comment
// would have. Keys are NOT exclusive to one step here, unlike the round-1 walk: this page
// revisits strings the walk already placed, which is the point of a retest.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { CSS, pageScript, stepSection } from './alpha-walk-pages.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}docs/feedback/walk/`;
const CATALOGUE = JSON.parse(readFileSync(`${ROOT}docs/feedback/catalogue.json`, 'utf8'));
const LIVE_PART = new Set(CATALOGUE.parts.filter((p) => p.status === 'live').map((p) => p.id));

const STAGE = {
  n: 2,
  id: 'r2-onboarding',
  file: 'r2-onboarding.html',
  title: 'Round 2: Onboarding',
  short: 'Onboarding, round 2',
};

/**
 * The steps, in the order they must be walked.
 *
 * ORDER IS LOAD-BEARING. Step 6 imports a document that REPLACES whatever is on the device, and
 * steps 3 to 5 need a setup that has not run yet. Walking these out of order costs a wipe.
 */
const STEPS = [
  {
    id: 'r2.01',
    title: 'The intro, slide one',
    do: 'Open the app in a private tab, or after wiping data, so the intro runs. Watch without touching the screen.',
    see: 'Text typing itself out a character at a time, an ASCII figure at the foot, and a hovering line saying to click.',
    keys: ['advice.clickToContinue'],
    parts: ['intro.sequence'],
    note: 'This did not exist in round 1: the app opened straight on Setup step 1. The words are yours, copied over verbatim. The figure is drawn here rather than the cartoon character your note named, which is third-party property and would have made the README licence claim false.',
  },
  {
    id: 'r2.02',
    title: 'Slides two, three and four',
    do: 'Click through Who am I, Purpose and functions, and Motivation. Read each one fully before advancing.',
    see: 'Each slide replaces the one before it. Each fades in, then types.',
    keys: [],
    parts: ['intro.sequence'],
    note: 'Read these as prose you are about to show other people. Tell me what is wrong in the wording, the order, the length and the tone. Slide four promises rest-period games, which do NOT exist yet; you confirmed they are in scope, so the copy stands, but that promise has to ship before anyone else sees this link.',
  },
  {
    id: 'r2.03',
    title: 'The tl;dr disclaimer',
    do: 'Advance to the disclaimer slide and watch it for about ten seconds.',
    see: 'The text pulses slowly, one cycle every three seconds.',
    keys: [],
    parts: ['intro.sequence'],
    note: 'Your note said flashing; you clarified you meant animation. One cycle per three seconds is 0.33 Hz, against the three-per-second threshold that carries a seizure risk. Tell me whether it reads as emphatic enough, or whether it is too slow to notice.',
  },
  {
    id: 'r2.04',
    title: 'The Final Slide and Acknowledgement',
    do: 'Read the final slide, acknowledge the warning, then reload.',
    see: 'The final slide names the three things setup will ask for. The acknowledgement requires its checkbox, and the intro does not return on a later reload.',
    parts: ['intro.sequence'],
    note: 'The intro shows once and records that it has been seen after its last slide.',
  },
  {
    id: 'r2.05',
    title: 'The top bar during setup',
    do: 'Look at the bar across the top of the setup screen. Then Settings, skin picker, and cycle all three skins if you can reach them.',
    see: 'The app name fixed on the left, and an instruction moving beside it.',
    keys: ['advice.setupInstruction'],
    parts: ['shell.topbar'],
    note: 'You reported this bar as invisible. Measured before: the app name sat at 1.19:1 against its own background, the status line at 1.84:1, where 4.5:1 is the readable floor. Both are 21:1 now. Judge whether it reads as a bar worth keeping, not merely whether you can see it.',
  },
  {
    id: 'r2.06',
    title: 'The footer',
    do: 'Scroll to the very bottom of any screen.',
    see: 'A quiet block: your name, the repository, the version and build commit, the date, a line about data staying on the device, the disclaimer, and the licence.',
    keys: [],
    parts: ['shell.footer'],
    note: 'You asked for this and asked me to think about what else belongs. What I added beyond your list: the build commit, because it is the first thing you will want from a bug report and the only thing a tester cannot tell you; and the disclaimer, so it is reachable after the intro has gone. Tell me what is missing or superfluous.',
  },
  {
    id: 'r2.07',
    title: 'Setup step 1, units',
    do: 'Read the heading, then the line above the choice, then the line below it.',
    see: 'The heading reads Setup: Preferred Settings. Above the choice, Units on the weight plates. Below it, a shorter line.',
    keys: ['label.units', 'advice.unitsOnce'],
    parts: ['setup.units', 'setup.progress'],
    note: 'Your sentence ran to fifteen words and the contract caps an advice line at twelve, so it split: a lead-in above the control and a note below it. The heading now names which of your three groups the step belongs to.',
  },
  {
    id: 'r2.08',
    title: 'The Previous and Next controls',
    do: 'Look at the foot of the step, then move forward and back.',
    see: 'Next on the right. Previous appears from step 2 onward.',
    keys: ['button.back', 'button.continue'],
    parts: ['setup.nav'],
    note: 'These read go on and Back before. The limelight override was dropped rather than lower-cased, so you see the words you asked for.',
  },
  {
    id: 'r2.09',
    title: 'Setup step 2, time zone',
    do: 'Read the line above the field, then open the dropdown and scroll it.',
    see: 'A note about the notification bot, a line telling you to select, and a list of zones each labelled with its offset and city.',
    keys: ['advice.timezoneDetected', 'advice.timezonePick', 'label.timezone'],
    parts: ['setup.timezone'],
    note: 'Your sketch said GMT+2 UTC+2 and the city; those are the same offset written twice, so it shows one. The offset is computed for today, never stored, because offsets move with daylight saving.',
  },
  {
    id: 'r2.10',
    title: 'Setup step 3, the shape of the page',
    do: 'Look at the whole step before typing anything. Try to reach the bottom without scrolling.',
    see: 'A name field, then two bordered boxes: age beside sex, and body mass beside stature.',
    keys: ['label.name'],
    parts: ['setup.body'],
    note: 'You said this page was too long and needed a scroll. Age sits with sex and mass with stature because each pair is read together by the same equation. Tell me whether it fits your phone now.',
  },
  {
    id: 'r2.11',
    title: 'Age, sex and stature',
    do: 'Enter your age. Tap each of the two sex options. Then enter your height in the two boxes, and try typing a decimal into them.',
    see: 'Age in years, not a birth year. Two selectable glyphs. Two whole-number boxes for stature, which refuse anything but integers.',
    keys: ['quantity.age', 'label.sex', 'label.metres', 'label.centimetres'],
    parts: ['setup.body'],
    note: 'The field asks for age; the profile still stores a birth year, because a stored age goes stale and every energy target drifts with it. The glyphs are drawn rather than typed: the male and female characters are read as emoji by two gates in this repository.',
  },
  {
    id: 'r2.12',
    title: 'The sex explainer',
    do: 'Tap the small link under the sex field. Read both halves of what opens, then close it.',
    see: 'A window with a close control at the upper left, two equations, a worked number, a coloured divider, and a section about hormone therapy.',
    keys: ['advice.sexWorkaround'],
    parts: ['setup.body'],
    note: 'The divider is PINK, not lime: lime is this skin background and a lime rule on it would be invisible. Segment two does NOT carry your six-month threshold. No study validates any of these equations for people on hormone therapy and none supports a time cut-off, so it says that plainly and points at the route that avoids the question. This is the most sensitive text in the app: tell me if the tone is wrong.',
  },
  {
    id: 'r2.13',
    title: 'The body-fat control',
    do: 'Look at the three options and their order. Pick Percentage, then tap Click here to estimate.',
    see: 'Percentage first and already selected, Body measurements second, Not measured last. Explanatory lines sit below the control now.',
    keys: ['advice.estimateBodyFat', 'label.bodyFatKnown', 'label.bodyFatTape', 'label.bodyFatNone'],
    parts: ['setup.body'],
    note: 'Not measured stayed as you asked, last in the list. It is a real option: it routes to a different validated equation rather than refusing you. The estimate window shows empty frames where the artwork will go; that artwork is specified in the icon register for you to generate.',
  },
  {
    id: 'r2.14',
    title: 'The tape measurement, in your units',
    do: 'Choose Body measurements. Read the field labels and the line above them.',
    see: 'Neck and abdomen labelled in your chosen unit. A diagram frame per site. No wall of prose.',
    keys: ['advice.tapeMethod'],
    parts: ['setup.body'],
    note: 'This is the defect you found: the fields were centimetres whatever you chose, so an imperial user typed inches and got a plausible wrong number with no error. The site description moved behind why? rather than being deleted, because measuring the wrong place silently biases the result.',
  },
  {
    id: 'r2.15',
    title: 'The methods, at the foot of the step',
    do: 'Scroll to the bottom of step 3.',
    see: 'A short lead-in and a numbered list of the published methods your numbers feed.',
    keys: [],
    parts: ['setup.body'],
    note: 'You asked for this to be transparent but not expansive. Every reference here is checked against the engine that uses it by a test, so a citation cannot drift from the code.',
  },
  {
    id: 'r2.16',
    title: 'Pressing Next with something missing',
    do: 'Leave a required field empty and press Next.',
    see: 'The page jumps to the field that is missing, and it shakes.',
    keys: ['error.valueRequired'],
    parts: ['setup.body'],
    note: 'You asked for a rumble. A phone vibration does nothing on iOS at any version, so the visible cue is the real one and the vibration is an extra on Android only. Enter a number was NOT deleted: it has ten call sites. What changed is that it appears when you press Next, not as standing text under an untouched field.',
  },
  {
    id: 'r2.17',
    title: 'Steps 4 to 7, unchanged so far',
    do: 'Walk through Equipment & Availability, the goal, availability and programme length.',
    see: 'Mostly what you saw in round 1, except step 4 has been renamed.',
    keys: ['step.training'],
    parts: ['setup.training', 'setup.goal', 'setup.availability', 'setup.programme'],
    note: 'These are the four steps whose rebuilds are NOT done: the sliders, the equipment tiers, the goal model, the feasibility calendar and the just-in-time programme all need decisions from you before code. Comment freely, but expect no change here yet.',
  },
  {
    id: 'r2.18',
    title: 'Step 8, where the questionnaire used to be',
    do: 'Read all four sections and open a why? disclosure.',
    see: 'Creatine, caffeine, protein and kit, each with a dose worked out from your own body mass, a caution, and its sources.',
    keys: [],
    parts: ['setup.guidance'],
    note: 'The medical questionnaire is gone completely. Three of your instructions ship corrected rather than as written: creatine is dosed in grams not milligrams; the milk-and-sugar advice has no evidence behind it and was dropped; and isolate against concentrate against hydrolysate makes no meaningful difference, so the protein advice is about daily total and third-party testing instead. Caffeine is the lifting dose, which is smaller than the number usually quoted.',
  },
  {
    id: 'r2.19',
    title: 'Step 9, the review',
    do: 'Read the whole review screen before confirming.',
    see: 'What you told me, read back, then the daily targets and the programme summary.',
    keys: ['hero.yourAnswers'],
    parts: ['setup.review'],
    note: 'The answers block is new: the rest of this screen was always derived, so it stayed current on its own, but nothing showed you your own entries before writing them. Check every value matches what you typed.',
  },
  {
    id: 'r2.20',
    title: 'Close the browser in the middle',
    do: 'Start setup again, fill in two or three steps, then close the tab completely. Reopen the app.',
    see: 'Your answers waiting, at the step you left.',
    keys: [],
    parts: ['setup.progress'],
    note: 'This is the item you called out on its own, and the most valuable thing in the round. It stores what you typed rather than what it parsed, so a half-finished number survives and is checked again on resume rather than trusted.',
  },
];

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A step, plus the note that says what changed and what to look for. */
function section(step, index) {
  const base = stepSection(step, index);
  const note = `<p class="only">Why it is here: ${esc(step.note)}</p>\n  `;
  return base.replace('<label class="box"', `${note}<label class="box"`);
}

function build() {
  const body = STEPS.map(section).join('\n');
  return `<title>${esc(STAGE.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style>
<header class="page">
  <p class="eyebrow">alpha round 2, onboarding and setup</p>
  <h1>Onboarding, round 2</h1>
  <p class="lede">Everything from your round-1 feedback that could be built is live. Walk these twenty steps with the app open beside this page and write in the box under each one, exactly as you did in round 1. Start in a private tab or wipe your data first, or the intro will not run. Each step says why it is here and what I want you to judge.</p>
</header>
<div class="tools">
  <span class="count" id="count">0 of 0 commented</span>
  <button type="button" id="assemble">Assemble</button>
  <button type="button" class="quiet" id="theme">Flip theme</button>
</div>
<main class="wrap">
${body}
<section class="step" id="${esc(STAGE.id)}.general">
  <p class="stepno"><code>${esc(STAGE.id)}.general</code> the whole retest</p>
  <h3>Anything else about onboarding</h3>
  <p class="do"><b>Do</b>Think back over the eleven steps.</p>
  <p class="see"><b>You see</b>Something belonging to the whole of onboarding rather than one step: an order that is wrong, a step that should not exist, something missing entirely.</p>
  <p class="pids">covers ${esc(STAGE.id)}</p>
  <label class="box" for="c-${esc(STAGE.id)}.general">What needs to change?</label>
  <textarea id="c-${esc(STAGE.id)}.general" data-step="${esc(STAGE.id)}.general" data-parts="${esc(STAGE.id)}" placeholder="What you saw. What you expected."></textarea>
</section>
<h2>your comments, ready to paste</h2>
<p class="small">One line per box you filled, each carrying its step id and the part ids that step covers. Press Assemble, then paste the block back into Claude. You can also leave a comment thread on this published page.</p>
<textarea class="assembled" id="assembled" readonly aria-label="Assembled comments" placeholder="Press Assemble."></textarea>
<p class="small" id="status" role="status" aria-live="polite"></p>
</main>
<script>${pageScript(STAGE.id)}</script>
`;
}

/** Gates. Part ids must be real, ids unique, order preserved, no emoji. */
function check(html) {
  const fail = [];
  const say = [];
  const ids = STEPS.map((s) => s.id);
  if (new Set(ids).size !== ids.length) fail.push('duplicate step id');
  for (const step of STEPS) {
    for (const part of step.parts) {
      if (!LIVE_PART.has(part)) fail.push(`${step.id} names a part the catalogue does not hold: ${part}`);
    }
    if (step.note === undefined || step.note.length < 20) fail.push(`${step.id} has no note`);
  }
  say.push(`ok   steps ${STEPS.length}, ids unique`);
  say.push(`ok   parts ${new Set(STEPS.flatMap((s) => s.parts)).size} named, all live in the catalogue`);
  const boxes = (html.match(/<textarea id="c-/g) ?? []).length;
  if (boxes !== STEPS.length + 1) fail.push(`boxes ${boxes}, expected ${STEPS.length + 1}`);
  say.push(`ok   comment boxes ${boxes}, one per step plus the stage box`);
  if (!html.includes('id="assemble"')) fail.push('no Assemble control');
  say.push('ok   Assemble control present');
  const introLast = STEPS.findIndex((s) => s.id === 'r2.04');
  const firstSetup = STEPS.findIndex((s) => s.id === 'r2.07');
  if (!(introLast < firstSetup)) fail.push('the intro steps must come before the setup steps');
  say.push('ok   the intro is walked before setup, which is the order a first run meets them');
  for (const line of say) console.log(`  ${line}`);
  if (fail.length > 0) {
    for (const f of fail) console.error(`  FAIL ${f}`);
    process.exit(1);
  }
  console.log('PASS alpha retest page');
}

const html = build();
if (process.argv.includes('--check')) {
  check(html);
} else {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${STAGE.file}`, html);
  check(html);
  console.log(`wrote docs/feedback/walk/${STAGE.file}`);
}

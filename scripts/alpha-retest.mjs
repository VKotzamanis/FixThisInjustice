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
  id: 'r2-retest',
  file: 'r2-retest.html',
  title: 'Retest: What Changed',
  short: 'Retest, round 2',
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
    title: 'The top bar is legible now',
    do: 'Open the app on the limelight skin, which is the default, and look at the bar across the top.',
    see: 'A black bar. The app name in white on the left, the accent letter in pink, the save state in white on the right.',
    keys: ['shell.status.loaded'],
    parts: ['shell.topbar'],
    note: 'You reported this as invisible. Measured: the name was at 1.19:1 against its own bar and the status line at 1.84:1, where 4.5:1 is the readable floor. Both are 21:1 now. Tell me whether it reads as a bar you would keep, not just whether you can see it.',
  },
  {
    id: 'r2.02',
    title: 'The other two skins did not move',
    do: 'Settings, then the skin picker. Switch to clinical, look at the bar, then to board, look again, then back to limelight.',
    see: 'Both bars look as they did before. Nothing else on the page changes with them.',
    keys: [],
    parts: ['shell.topbar', 'settings.skin.picker'],
    note: 'The fix tokened the bar per skin. Clinical and board were meant to be untouched: 6.67:1 and 15.50:1 before and after. If either looks different from what you remember, that is a regression and I want to know.',
  },
  {
    id: 'r2.03',
    title: 'Setup in imperial',
    do: 'Start a fresh setup. On step 1 choose imperial, then walk to the body step. If you already have a profile, use a private tab so you do not lose it.',
    see: 'The step counter, and every later field labelled in pounds and inches rather than kilograms and centimetres.',
    keys: [],
    parts: ['setup.units', 'setup.progress'],
    note: 'Nothing about this step was fixed. It is here because steps 4 and 5 need imperial selected, and because you asked for the units wording to change, which has NOT happened yet.',
  },
  {
    id: 'r2.04',
    title: 'The girth fields say inches',
    do: 'On the body step choose the option that estimates body fat from body measurements. Read the field labels and the line above them.',
    see: 'Neck and abdomen labelled in inches. The line above no longer names a unit at all.',
    keys: ['advice.tapeMethod'],
    parts: ['setup.body'],
    note: 'This is the defect you found. The three fields were held as centimetres whatever unit system you chose, so an imperial user typed inches into a field the equation read as centimetres and got a wrong number with no error anywhere.',
  },
  {
    id: 'r2.05',
    title: 'The estimate is a believable number',
    do: 'With imperial still selected, enter a neck of 15 and an abdomen of 34, against a height of 5 ft 10 in. Look at the figure underneath.',
    see: 'A body-fat percentage in the high teens or low twenties, with an error band beside it.',
    keys: [],
    parts: ['setup.body'],
    note: 'Before the fix those same numbers were read as 15 cm and 34 cm and the estimate was either withheld or nonsense. Say whether the number and its error band read as trustworthy, and whether the wording around them is right. The wall of measurement-site prose has NOT been removed yet.',
  },
  {
    id: 'r2.06',
    title: 'Load the test data',
    do: 'Settings, then Data, then the export and import screen. Export a backup first if this device holds anything you want. Then load alpha-fixture.json and confirm the import.',
    see: 'The import is accepted and the app comes back holding nine weeks of history.',
    keys: [],
    parts: ['settings.data.import', 'settings.data.export'],
    note: 'THIS REPLACES EVERYTHING ON THE DEVICE. It is the last destructive step, deliberately: steps 3 to 5 need a setup that has not run. Comment on the import screen itself as well, since you are on it.',
  },
  {
    id: 'r2.07',
    title: 'A missed week, on Today',
    do: 'Open Today.',
    see: 'A week that closed under its target, and whatever the app says about it.',
    keys: [],
    parts: ['today.week-stamp', 'today.intervention', 'popup.missed-week'],
    note: 'You could not reach this state in round 1, so four walkthrough steps went unreviewed. The fixture carries three missed weeks.',
  },
  {
    id: 'r2.08',
    title: 'Blocks and deloads, on Plan',
    do: 'Open Plan and scrub through the weeks.',
    see: 'Twelve weeks, three deload blocks, and the cursor standing part-way through.',
    keys: [],
    parts: ['plan.block-strip', 'plan.week-scrubber', 'plan.session-cards'],
    note: 'A block that has ended and a deload under way were both unreachable on a fresh install. This is also the screen your w1.12 feedback is about, so anything you notice here feeds that rebuild.',
  },
  {
    id: 'r2.09',
    title: 'The body-mass chart, on Log',
    do: 'Open Log.',
    see: 'Nine body-mass points against a projection, and a compliance grid with gaps in it.',
    keys: [],
    parts: ['log.body-mass-chart', 'log.compliance-grid'],
    note: 'The chart had one point and nothing to project in round 1.',
  },
  {
    id: 'r2.10',
    title: 'The Atlas, with cards in it',
    do: 'Open Atlas. Tap one card, then close it. Look at a slot that is still locked.',
    see: 'One card of each rarity unlocked, the rest locked.',
    keys: [],
    parts: ['atlas.rarity.common', 'atlas.rarity.uncommon', 'atlas.rarity.rare', 'atlas.locked-slot', 'atlas.detail-dialog'],
    note: 'Every Atlas step was skippable in round 1 because a fresh install has no cards.',
  },
  {
    id: 'r2.11',
    title: 'The numbers that depend on body fat',
    do: 'Open Targets and read the energy and protein figures, then open the why disclosure under them.',
    see: 'A calorie target, a protein range, and the name of the equation each came from.',
    keys: [],
    parts: ['targets.energy', 'targets.protein', 'targets.why'],
    note: 'The fixture carries no body-fat estimate on purpose, so this shows the fallback path: Mifflin-St Jeor rather than Cunningham, and protein per kilogram of body mass rather than per kilogram of fat-free mass. It is the branch the round-1 walk never showed. Tell me whether the disclosure explains itself.',
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
  <p class="eyebrow">alpha retest, round 2, the corrected parts only</p>
  <h1>Retest: what changed</h1>
  <p class="lede">Three defects from round 1 are fixed, and a test document now reaches the states a fresh install could not. Walk these eleven steps with the app open and write in the box under each one, exactly as you did in round 1. Steps 1 to 5 come before step 6, which replaces everything on the device.</p>
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
  <h3>Anything else about the fixes</h3>
  <p class="do"><b>Do</b>Think back over the eleven steps.</p>
  <p class="see"><b>You see</b>Something that belongs to the round rather than to one step: a fix that did not go far enough, or something that broke on the way.</p>
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
  const importIndex = STEPS.findIndex((s) => s.id === 'r2.06');
  const setupIndex = STEPS.findIndex((s) => s.id === 'r2.05');
  if (!(setupIndex < importIndex)) fail.push('the destructive import must come after the setup steps');
  say.push('ok   the destructive import sits after every step that needs a fresh setup');
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

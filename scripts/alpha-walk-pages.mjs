// scripts/alpha-walk-pages.mjs
//
// The guided alpha walkthrough pages: one page per stage of the tester's path through the app,
// generated from docs/feedback/catalogue.json and scripts/alpha-walk.mjs. P10 Task 17.
//
//   node scripts/alpha-walk-pages.mjs            round 1
//   node scripts/alpha-walk-pages.mjs --round 2  round 2, with its own storage keys
//   node scripts/alpha-walk-pages.mjs --check    the gates, no files written
//
// WHAT IS DIFFERENT FROM scripts/alpha-pages.mjs. That generator groups by code structure: one
// page per screen group, one section per catalogue part. This one groups by the tester's path:
// one page per stage, one section per STEP, and a popup or a toast sits in the step that opens
// it. The CSS, the four theme blocks, the reduced-motion rule, the 44 px targets, the storage
// script, the Assemble block and the pager are the same design, reused deliberately so the two
// sets of pages read as one tool. Decision `alpha-guided-walkthrough` records the change and
// supersedes `alpha-feedback-review-pages`.
//
// PART IDS ARE UNCHANGED. A step names the catalogue part ids it covers, and the assembled line
// carries them, so a comment written here reaches the same task a comment written on the old
// pages would have.
//
// The pages are static HTML under docs/. They are not application code, so the ESLint storage ban
// (eslint.config.js, "Storage is owned by src/store/persistence.ts") does not reach them and their
// localStorage use is correct there. This generator is linted as scripts/**/*.mjs and touches no
// storage itself.
//
// THE PAGES SHOW NO PIXELS OF THE APP. No screenshot exists and no agent has a browser. Each step
// names the action and the strings; the owner keeps the live app open beside the page, at
// https://vkotzamanis.github.io/FixThisInjustice/ , where limelight is the shipped default skin
// (src/domain/schema.ts, the `skin` default).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ALL_STEPS, STAGES } from './alpha-walk.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}docs/feedback/walk/`;

const CHECK = process.argv.includes('--check');
const roundFlag = process.argv.indexOf('--round');
const ROUND = roundFlag === -1 ? 1 : Number(process.argv[roundFlag + 1]);
if (!Number.isInteger(ROUND) || ROUND < 1) throw new Error('--round takes a positive integer');

const catalogue = JSON.parse(readFileSync(`${ROOT}docs/feedback/catalogue.json`, 'utf8'));
const LIVE = catalogue.parts.filter((p) => p.status === 'live');

/** Every copy key the catalogue places, mapped to its record. One part owns each key. */
const KEY_RECORD = new Map();
for (const part of LIVE) for (const k of part.keys) KEY_RECORD.set(k.key, k);

const LIVE_URL = 'https://vkotzamanis.github.io/FixThisInjustice/';

/**
 * The published Artifact URL of each stage page, filled in by the coordinator after the first
 * publish. A page cannot know its own URL at generation time, so the pager falls back to '#'.
 * Regenerate and republish after filling this in.
 */
let URLS = {};
try {
  URLS = JSON.parse(readFileSync(`${OUT}urls.json`, 'utf8'));
} catch {
  URLS = {};
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The stylesheet. One copy per page, because a page is published on its own origin and cannot
 * load a stylesheet from anywhere but the allowed font host.
 *
 * Every colour is quoted from :root[data-skin='limelight'] in src/ui/styles/tokens.css. Pink is
 * a fill, a border and a focus ring in the light theme and never type: #ff5fcb on #8ace00
 * measures 1.41:1. The four theme blocks and the reduced-motion rule are the same ones
 * scripts/alpha-pages.mjs carries, and P10 Task 6 checks both files the same way.
 */
const CSS = `
:root{
  --lime:#8ace00; --ink:#000000; --pink:#ff5fcb; --fine:#454545;
  --panel:#000000; --panel-text:#ffffff; --field:#ffffff;
  --bg:var(--lime); --text:var(--ink); --text-2:var(--fine);
  --line:rgba(0,0,0,.22); --line-2:var(--ink);
  --chip:var(--pink); --chip-text:var(--ink);
  --code:var(--fine);
  --sans:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:var(--panel); --text:var(--panel-text); --text-2:var(--panel-text);
    --line:rgba(255,255,255,.24); --line-2:var(--lime);
    --chip:var(--pink); --chip-text:var(--ink);
    --code:var(--lime); --field:var(--panel);
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --bg:var(--panel); --text:var(--panel-text); --text-2:var(--panel-text);
  --line:rgba(255,255,255,.24); --line-2:var(--lime);
  --chip:var(--pink); --chip-text:var(--ink);
  --code:var(--lime); --field:var(--panel);
  color-scheme:dark;
}
:root[data-theme="light"]{
  --bg:var(--lime); --text:var(--ink); --text-2:var(--fine);
  --line:rgba(0,0,0,.22); --line-2:var(--ink);
  --chip:var(--pink); --chip-text:var(--ink);
  --code:var(--fine); --field:#ffffff;
  color-scheme:light;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:16px;line-height:1.5;overflow-x:hidden}
.wrap{max-width:44rem;margin:0 auto;padding:16px}
header.page{padding:24px 16px 12px;border-bottom:2px solid var(--line-2)}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px}
h1{font-family:var(--sans);font-weight:800;font-size:clamp(28px,7vw,40px);line-height:1.05;margin:0 0 10px;text-transform:lowercase}
h2{font-family:var(--sans);font-weight:800;font-size:22px;margin:32px 0 4px;text-transform:lowercase;border-top:2px solid var(--line-2);padding-top:14px}
h3{font-family:var(--sans);font-weight:700;font-size:18px;margin:0 0 8px}
p{margin:0 0 10px}
.lede{max-width:60ch}
.small{font-size:13px;color:var(--text-2)}
code{font-family:var(--mono);font-size:12.5px;color:var(--code);word-break:break-all}
section.step{border:1px solid var(--line);border-radius:4px;padding:14px;margin:0 0 16px;background:transparent}
.stepno{display:inline-block;font-family:var(--mono);font-size:12px;border:1px solid var(--line-2);border-radius:3px;padding:2px 6px;margin:0 0 8px}
.do,.see{margin:0 0 8px;padding:0 0 0 10px;border-left:3px solid var(--line-2)}
.do b,.see b{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;display:block}
.only{font-size:13px;margin:0 0 10px;border:1px dashed var(--line-2);padding:4px 6px;border-radius:3px}
.pids{font-family:var(--mono);font-size:12px;color:var(--text-2);margin:0 0 10px;word-break:break-all}
ol.strings{list-style:none;margin:0 0 14px;padding:0}
ol.strings li{border-left:3px solid var(--chip);padding:0 0 0 10px;margin:0 0 12px}
.lime-str{font-size:17px;font-weight:700;margin:2px 0 4px}
.refusal{font-size:12px;margin:4px 0 0;border:1px dashed var(--line-2);padding:4px 6px;border-radius:3px}
label.box{display:block;font-weight:700;font-size:14px;margin:0 0 6px}
textarea{width:100%;min-height:88px;padding:10px;border:1px solid var(--line-2);border-radius:3px;background:var(--field);color:var(--ink);font:inherit;font-size:15px}
:root[data-theme="dark"] textarea,:root:not([data-theme="light"]) textarea{color:var(--text)}
textarea:focus-visible{outline:3px solid var(--chip);outline-offset:2px}
textarea.set{border-width:3px;border-color:var(--chip)}
button{min-height:44px;padding:0 16px;border:2px solid var(--line-2);border-radius:3px;background:var(--chip);color:var(--chip-text);font:inherit;font-weight:700;cursor:pointer}
button.quiet{background:transparent;color:var(--text)}
button:focus-visible{outline:3px solid var(--line-2);outline-offset:2px}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
.count{font-family:var(--mono);font-size:12px}
.assembled{width:100%;min-height:180px;font-family:var(--mono);font-size:12.5px}
nav.pager{display:flex;gap:10px;flex-wrap:wrap;padding:16px;border-top:2px solid var(--line-2)}
nav.pager a{font-family:var(--mono);font-size:13px;min-height:44px;display:inline-flex;align-items:center;padding:0 12px;border:1px solid var(--line-2);border-radius:3px;color:var(--text);text-decoration:none}
a{color:var(--text)}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

/** One string, as the Limelight app renders it: the override where one exists, else the default. */
function stringBlock(key) {
  const k = KEY_RECORD.get(key);
  if (k === undefined) throw new Error(`step names a key the catalogue does not place: ${key}`);
  const lines = [
    `<li>`,
    `<code>${esc(k.key)}</code>`,
    `<p class="lime-str">${esc(k.limelight === 'same' ? k.default : k.limelight)}</p>`,
  ];
  if (!k.limelightRowPermitted) {
    lines.push(
      `<p class="refusal">This string keeps its plain wording on every skin: ${esc(k.refusalGroup)}. A word change here is out of scope; a layout or behaviour change is not.</p>`,
    );
  }
  lines.push('</li>');
  return lines.join('\n');
}

/** One step: what to do, what appears, the strings in order, and the box the owner writes in. */
function stepSection(step, index) {
  const strings =
    step.keys.length === 0
      ? '<p class="small">No copy key. Review its layout and behaviour.</p>'
      : `<ol class="strings">\n${step.keys.map(stringBlock).join('\n')}\n</ol>`;
  const only =
    step.only === undefined
      ? ''
      : `<p class="only">Skippable: ${esc(step.only)}. If you cannot reach it, comment on the strings as written.</p>\n  `;
  return `
<section class="step" id="${esc(step.id)}">
  <p class="stepno"><code>${esc(step.id)}</code> step ${index + 1}</p>
  <h3>${esc(step.title)}</h3>
  <p class="do"><b>Do</b>${esc(step.do)}</p>
  <p class="see"><b>You see</b>${esc(step.see)}</p>
  ${only}<p class="pids">covers ${step.parts.map(esc).join(', ')}</p>
  ${strings}
  <label class="box" for="c-${esc(step.id)}">What needs to change here?</label>
  <textarea id="c-${esc(step.id)}" data-step="${esc(step.id)}" data-parts="${esc(step.parts.join(', '))}" placeholder="What you saw. What you expected."></textarea>
</section>`;
}

/** The per-page script: persistence, the counter and the Assemble block. */
function pageScript(stageId) {
  return `
(function(){
  var KEY='fti-walk-r${ROUND}-${stageId}';
  var store={};
  try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){store={};}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
  var boxes=Array.prototype.slice.call(document.querySelectorAll('textarea[data-step]'));
  var count=document.getElementById('count');
  function tally(){
    var n=0;
    boxes.forEach(function(b){if((store[b.getAttribute('data-step')]||{}).text)n++;});
    count.textContent=n+' of '+boxes.length+' commented';
  }
  boxes.forEach(function(b){
    var id=b.getAttribute('data-step');
    var rec=store[id]||{};
    if(rec.text){b.value=rec.text;b.classList.add('set');}
    b.addEventListener('input',function(){
      var t=b.value.trim();
      if(t){store[id]={text:b.value};b.classList.add('set');}
      else{delete store[id];b.classList.remove('set');}
      save();tally();
    });
  });
  var out=document.getElementById('assembled'),status=document.getElementById('status');
  document.getElementById('assemble').addEventListener('click',function(){
    var lines=[];
    boxes.forEach(function(b){
      var id=b.getAttribute('data-step');
      var rec=store[id];
      if(rec&&rec.text&&rec.text.trim()){
        lines.push('- ['+id+' | '+b.getAttribute('data-parts')+'] '+rec.text.trim().replace(/\\s+/g,' '));
      }
    });
    out.value=lines.length?lines.join('\\n'):'(nothing written yet)';
    status.textContent=lines.length+' comment'+(lines.length===1?'':'s')+'. Select the text and copy it.';
    out.focus();out.select();
    if(navigator.clipboard&&lines.length){
      navigator.clipboard.writeText(out.value).then(function(){status.textContent=lines.length+' comments copied to the clipboard.';},function(){});
    }
  });
  document.getElementById('theme').addEventListener('click',function(){
    var r=document.documentElement;
    r.setAttribute('data-theme',r.getAttribute('data-theme')==='dark'?'light':'dark');
  });
  tally();
})();`;
}

/** A whole page. `body` is the content between the tools bar and the assemble block. */
export function page(stage, body, index) {
  const next = STAGES[index + 1];
  const prev = STAGES[index - 1];
  const pager = [
    prev === undefined ? '' : `<a href="${esc(URLS[prev.id] || '#')}">back: ${esc(prev.short)}</a>`,
    next === undefined ? '' : `<a href="${esc(URLS[next.id] || '#')}">next: ${esc(next.short)}</a>`,
  ]
    .filter(Boolean)
    .join('');
  return `<title>${esc(stage.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style>
<header class="page">
  <p class="eyebrow">alpha walkthrough, round ${ROUND}, stage ${stage.n} of ${STAGES.length - 1}</p>
  <h1>${esc(stage.short)}</h1>
  <p class="lede">Open <a href="${LIVE_URL}">the live app</a> on your phone beside this page. The skin is limelight by default. Work the steps in order. Do what the step says, look at the app, then write in the box under that step.</p>
</header>
<div class="tools">
  <span class="count" id="count">0 of 0 commented</span>
  <button type="button" id="assemble">Assemble</button>
  <button type="button" class="quiet" id="theme">Flip theme</button>
</div>
<main class="wrap">
${body}
<section class="step" id="${esc(stage.id)}.general">
  <p class="stepno"><code>${esc(stage.id)}.general</code> the whole stage</p>
  <h3>Anything else in this stage</h3>
  <p class="do"><b>Do</b>Think back over the stage you just walked.</p>
  <p class="see"><b>You see</b>Something that belongs to the stage rather than to one step.</p>
  <p class="pids">covers ${esc(stage.id)}</p>
  <label class="box" for="c-${esc(stage.id)}.general">What needs to change?</label>
  <textarea id="c-${esc(stage.id)}.general" data-step="${esc(stage.id)}.general" data-parts="${esc(stage.id)}" placeholder="What you saw. What you expected."></textarea>
</section>
<h2>your comments, ready to paste</h2>
<p class="small">One line per box you filled, each carrying its step id and the part ids that step covers. Press Assemble, then paste the block back into Claude. You can also leave a comment thread on this published page, or say it in the session and name the step id.</p>
<textarea class="assembled" id="assembled" readonly aria-label="Assembled comments" placeholder="Press Assemble."></textarea>
<p class="small" id="status" role="status" aria-live="polite"></p>
</main>
<nav class="pager">${pager}</nav>
<script>${pageScript(stage.id)}</script>
`;
}

/** Page 0. Written for the guided flow, not for the per-screen pages it replaces. */
const HOW_TO_TEST = `
<h2>before you start</h2>
<p>Install the app on your phone first. Add it to the Home Screen and open it from the icon. A browser tab has different safe-area insets, and a tab pass does not substitute for an installed one. One of the steps asks you to open the site in a tab as well, and says so.</p>
<p>The skin is <strong>limelight</strong> when you arrive: it is the shipped default. Leave it there. This round reviews one design. Every string on these pages is the one the limelight app shows, and every comment is read as a comment on that app: its words, its layout, and what it does. The other skins are adapted from the finished app afterwards.</p>
<p>If you have used the app before, this walk still works. Where a step needs a state you do not have, it says so and you can skip it.</p>
<h2>how a stage works</h2>
<p>Six stages follow this page, in the order a first-time user meets the app. Each stage is one page and holds a numbered list of steps. A step is one thing you can see at once.</p>
<p>Every step carries two lines. <strong>Do</strong> is the action, naming the control by the words on it. <strong>You see</strong> is what should appear. Under them are the strings on that step, in the order the app paints them, each with its key above it. Under those is one box.</p>
<p>Work with the app open. Do the action, look at the screen, then come back and write.</p>
<p>A popup, a toast and a sub-state sit in the step that opens them. Form cues is a step inside the session, right after the exercise card that opens it. The undo toast follows the delete that raises it. Nothing has been moved to a page of popups at the far end.</p>
<h2>what a comment should say</h2>
<p>Two things, in any order. <strong>What you saw.</strong> <strong>What you expected instead.</strong></p>
<p class="small">Good: "the day rows on the strip are too small to tap and I could not tell served from no-show. I expected a colour difference." Weak: "strip is bad."</p>
<p>Comment on the words, on the layout, on the order, on the size and on what the control did. All of it counts, and layout and behaviour count as much as wording.</p>
<h2>steps you cannot reach</h2>
<p>Some steps need a state you may not have: a missed week, a block that has ended, data left by the old app. Those steps are marked skippable and say what they need. Read the strings and comment on them as written, or skip the step. Nothing is lost either way.</p>
<h2>the three ways to send comments back</h2>
<p><strong>The box.</strong> Type into the box under a step. It saves in this browser. Press <strong>Assemble</strong> at the top and the page builds a block of lines, one per box, and copies it. Paste that block back into Claude.</p>
<p><strong>The thread.</strong> These pages are published, so you can leave a comment thread on any part of one. Send the thread to Claude and it is read and answered in the thread.</p>
<p><strong>The session.</strong> Say it in the conversation and name the step id. That is the fastest channel for one comment and the worst for twenty.</p>
<h2>what cannot change</h2>
<p>A skin changes words. It never changes a number, a unit, a slot the app fills, or what a control does. A skin also never jokes on a control whose misreading costs data: the wipe, the import, the legacy delete, the export, the reminder states and the install steps carry the same plain sentence on every skin. Where that applies, the step says so under the string.</p>
<p>Ask for those changes anyway if you want them. They come back as a question rather than as a silent refusal.</p>
<h2>what to do when something is broken</h2>
<p>Say so in the box. A crash, a control that does nothing, a number that looks wrong: those are worth more than a wording note, and they get their own task with a test.</p>
`;

/** Build every page in memory. Pure: the same tree gives the same strings. */
function build() {
  const files = new Map();
  STAGES.forEach((stage, index) => {
    const body =
      stage.steps.length === 0
        ? HOW_TO_TEST
        : stage.steps.map((step, i) => stepSection(step, i)).join('\n');
    files.set(stage.file, page(stage, body, index));
  });
  return files;
}

/* ------------------------------------------------------------------ the gates */

/** Non-ASCII characters that the shipped strings themselves carry. Nothing else may appear. */
function shippedNonAscii() {
  const set = new Set();
  for (const part of LIVE) {
    for (const k of part.keys) {
      const shown = k.limelight === 'same' ? k.default : k.limelight;
      for (const ch of `${shown}${k.refusalGroup ?? ''}`) if (ch.charCodeAt(0) > 127) set.add(ch);
    }
  }
  return set;
}

/**
 * The data gates: the walk table alone, checked before a page is built.
 *
 * They run first because `stringBlock` throws on a key the catalogue does not hold, so a build
 * attempted over a broken table would report one key rather than the whole list.
 */
function checkTable(fail, say) {
  // 1. Every catalogue key in exactly one step.
  const placed = new Map();
  for (const step of ALL_STEPS) {
    for (const key of step.keys) {
      if (placed.has(key)) fail.push(`key placed twice: ${key} (${placed.get(key)}, ${step.id})`);
      placed.set(key, step.id);
    }
  }
  for (const key of KEY_RECORD.keys()) if (!placed.has(key)) fail.push(`key placed nowhere: ${key}`);
  say.push(`keys ${placed.size} placed of ${KEY_RECORD.size} in the catalogue, each in one step`);

  // 2. Every step's keys exist in the catalogue.
  for (const [key, stepId] of placed) {
    if (!KEY_RECORD.has(key)) fail.push(`step ${stepId} names a key the catalogue does not hold: ${key}`);
  }

  // 3. Every live part covered by at least one step.
  const covered = new Set(ALL_STEPS.flatMap((s) => s.parts));
  for (const part of LIVE) if (!covered.has(part.id)) fail.push(`part covered by no step: ${part.id}`);
  for (const id of covered) {
    if (!LIVE.some((p) => p.id === id)) fail.push(`step names a part that is not live: ${id}`);
  }
  say.push(`parts ${covered.size} covered of ${LIVE.length} live`);

  // 4. Step ids unique, well formed, and in order within their stage.
  const seen = new Set();
  for (const stage of STAGES) {
    stage.steps.forEach((step, i) => {
      const want = `w${stage.n}.${String(i + 1).padStart(2, '0')}`;
      if (step.id !== want) fail.push(`step id out of order: ${step.id} should be ${want}`);
      if (seen.has(step.id)) fail.push(`step id repeated: ${step.id}`);
      seen.add(step.id);
    });
  }
  say.push(`steps ${seen.size} in ${STAGES.length} stages`);
}

/** The page gates: the rendered HTML. */
function checkPages(files, fail, say) {
  // 5. No emoji on any page.
  const emoji = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\uFE0F/u;
  for (const [name, html] of files) {
    html.split('\n').forEach((line, i) => {
      if (emoji.test(line)) fail.push(`emoji in ${name}:${i + 1}`);
    });
  }
  say.push('no emoji on any page');

  // 6. Only the four allowed hosts.
  const allowed = new Set([
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://vkotzamanis.github.io',
    'https://claude.ai',
  ]);
  const hosts = new Set();
  for (const html of files.values()) {
    for (const m of html.matchAll(/https:\/\/[a-z0-9.-]+/g)) hosts.add(m[0]);
  }
  for (const h of hosts) if (!allowed.has(h)) fail.push(`host not allowed: ${h}`);
  say.push(`hosts ${[...hosts].sort().join(' ')}`);

  // 7. ASCII everywhere except the characters the shipped strings themselves carry.
  const shipped = shippedNonAscii();
  for (const [name, html] of files) {
    for (const ch of html) {
      if (ch.charCodeAt(0) > 127 && !shipped.has(ch)) {
        fail.push(`non-ASCII character not from a shipped string in ${name}: ${JSON.stringify(ch)}`);
        break;
      }
    }
  }
  say.push(`ascii except ${shipped.size} characters the shipped strings carry`);

  // 8. Two builds byte-identical.
  const again = build();
  for (const [name, html] of files) {
    if (again.get(name) !== html) fail.push(`not deterministic: ${name}`);
  }
  say.push('two builds byte-identical');

  // 9. The design rules P10 Task 6 states, checked on these pages too.
  for (const [name, html] of files) {
    /*
     * The four theme BLOCK openers, each alone on its line: the media query, the
     * :root:not([data-theme="light"]) selector inside it, and the two explicit-choice blocks.
     * Matched as whole lines so the `textarea` rule further down, which mentions two of the same
     * selectors on one line, is not counted as a fifth block.
     */
    const themes = (html.match(/^(@media \(prefers-color-scheme: dark\)\{|\s+:root:not\(\[data-theme="light"\]\)\{|:root\[data-theme="(dark|light)"\]\{)$/gm) ?? []).length;
    if (themes !== 4) fail.push(`${name} has ${themes} theme blocks, expected 4`);
    if (!html.includes('prefers-reduced-motion: reduce')) fail.push(`${name} has no reduced-motion rule`);
    if ((html.match(/min-height:44px/g) ?? []).length !== 2) fail.push(`${name} is missing a 44 px target`);
    if (!html.includes('overflow-x:hidden')) fail.push(`${name} may scroll sideways`);
    if (/color:var\(--pink\)|color:#ff5fcb/.test(html)) fail.push(`${name} uses pink as type`);
    if (html.includes('<table')) fail.push(`${name} has a table with no scroller`);
  }
  say.push('four theme blocks, reduced motion, two 44 px targets, no sideways scroll, pink is never type');
}

/** Both gate sets, in order, with the table checked before anything is rendered. */
function runChecks() {
  const fail = [];
  const say = [];
  checkTable(fail, say);
  if (fail.length === 0) checkPages(build(), fail, say);
  for (const line of say) process.stdout.write(`  ok   ${line}\n`);
  for (const line of fail) process.stdout.write(`  FAIL ${line}\n`);
  process.stdout.write(fail.length === 0 ? 'PASS alpha walk pages\n' : `FAIL ${fail.length}\n`);
  return fail.length;
}

/* ------------------------------------------------------------------ run */

if (CHECK) {
  process.exit(runChecks() === 0 ? 0 : 1);
} else {
  const files = build();
  mkdirSync(OUT, { recursive: true });
  for (const [name, html] of files) writeFileSync(OUT + name, html);
  const steps = ALL_STEPS.length;
  const parts = new Set(ALL_STEPS.flatMap((s) => s.parts)).size;
  process.stdout.write(
    `pages ${files.size} stages ${STAGES.length} steps ${steps} parts ${parts} keys ${ALL_STEPS.reduce((a, s) => a + s.keys.length, 0)} round ${ROUND}\n`,
  );
}

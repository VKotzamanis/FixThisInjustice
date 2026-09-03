// scripts/alpha-pages.mjs
//
// The alpha review pages: one HTML page per screen group, generated from docs/feedback/catalogue.json.
// P10 Tasks 4 and 5.
//
//   node scripts/alpha-pages.mjs            round 1
//   node scripts/alpha-pages.mjs --round 2  round 2, with its own storage keys
//
// The pages are static HTML under docs/. They are not application code, so the ESLint storage ban
// (eslint.config.js, "Storage is owned by src/store/persistence.ts") does not reach them and their
// localStorage use is correct there. This generator is linted as scripts/**/*.mjs and touches no
// storage itself.
//
// THE PAGES SHOW NO PIXELS OF THE APP. No screenshot exists and no agent has a browser. Each page
// mirrors a screen's structure and its strings; the owner keeps the live app open beside it, at
// https://vkotzamanis.github.io/FixThisInjustice/ , where limelight is the shipped default skin
// (src/domain/schema.ts, the `skin` default).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}docs/feedback/pages/`;

const roundFlag = process.argv.indexOf('--round');
const ROUND = roundFlag === -1 ? 1 : Number(process.argv[roundFlag + 1]);
if (!Number.isInteger(ROUND) || ROUND < 1) throw new Error('--round takes a positive integer');

const catalogue = JSON.parse(readFileSync(`${ROOT}docs/feedback/catalogue.json`, 'utf8'));
const LIVE = catalogue.parts.filter((p) => p.status === 'live');

const LIVE_URL = 'https://vkotzamanis.github.io/FixThisInjustice/';

/** The eight pages, in the order the owner walks them. */
export const PAGES = [
  { file: '00-how-to-test.html', id: '00-how-to-test', title: 'How To Test', short: 'How to test', screens: [] },
  { file: '01-boot-setup-readiness.html', id: '01-boot-setup-readiness', title: 'Boot And Setup Review', short: 'Boot and setup', screens: ['boot', 'shell', 'setup', 'readiness'] },
  { file: '02-today.html', id: '02-today', title: 'Today Review', short: 'Today', screens: ['today'] },
  { file: '03-train.html', id: '03-train', title: 'Train Review', short: 'Train', screens: ['train'] },
  { file: '04-plan-targets.html', id: '04-plan-targets', title: 'Plan And Targets Review', short: 'Plan and Targets', screens: ['plan', 'targets'] },
  { file: '05-log-atlas.html', id: '05-log-atlas', title: 'Log And Atlas Review', short: 'Log and Atlas', screens: ['log', 'atlas'] },
  { file: '06-settings.html', id: '06-settings', title: 'Settings Review', short: 'Settings', screens: ['settings', 'install'] },
  { file: '07-popups-toasts.html', id: '07-popups-toasts', title: 'Popups And Toasts Review', short: 'Popups and toasts', screens: ['popup', 'toast'] },
];

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
 * Every colour is quoted from :root[data-skin='limelight'] in src/ui/styles/tokens.css, and every
 * pair used for type has a measured ratio recorded in the comment block above that rule.
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
h3{font-family:var(--sans);font-weight:700;font-size:18px;margin:0 0 2px}
p{margin:0 0 10px}
.lede{max-width:60ch}
.small{font-size:13px;color:var(--text-2)}
code{font-family:var(--mono);font-size:12.5px;color:var(--code);word-break:break-all}
section.part{border:1px solid var(--line);border-radius:4px;padding:14px;margin:0 0 16px;background:transparent}
.pid{display:inline-block;font-family:var(--mono);font-size:12px;border:1px solid var(--line-2);border-radius:3px;padding:2px 6px;margin:0 0 8px}
.what{margin:0 0 10px;font-size:14px;color:var(--text-2)}
.states{font-family:var(--mono);font-size:12px;margin:0 0 12px;color:var(--text-2)}
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
function stringBlock(k) {
  const lines = [
    `<li>`,
    `<code>${esc(k.key)}</code>`,
    `<p class="lime-str">${esc(k.limelight === 'same' ? k.default : k.limelight)}</p>`,
  ];
  if (!k.limelightRowPermitted) {
    lines.push(`<p class="refusal">This string keeps its plain wording on every skin: ${esc(k.refusalGroup)}. A word change here is out of scope; a layout or behaviour change is not.</p>`);
  }
  lines.push('</li>');
  return lines.join('\n');
}

/** One part: what it is, what it says, and the box the owner writes in. */
function partSection(part) {
  const strings =
    part.keys.length === 0
      ? '<p class="small">No copy key. Review its layout and behaviour.</p>'
      : `<ol class="strings">\n${part.keys.map(stringBlock).join('\n')}\n</ol>`;
  return `
<section class="part" id="${esc(part.id)}">
  <p class="pid"><code>${esc(part.id)}</code></p>
  <h3>${esc(part.title)}</h3>
  <p class="what">${esc(part.what)}</p>
  <p class="states">states: ${part.states.length === 0 ? 'none' : part.states.map(esc).join(', ')}</p>
  ${strings}
  <label class="box" for="c-${esc(part.id)}">What needs to change here?</label>
  <textarea id="c-${esc(part.id)}" data-part="${esc(part.id)}" placeholder="What you saw. What you expected."></textarea>
</section>`;
}

/** The per-page script: persistence, the counter and the Assemble block. */
function pageScript(pageId) {
  return `
(function(){
  var KEY='fti-alpha-r${ROUND}-${pageId}';
  var store={};
  try{store=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){store={};}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
  var boxes=Array.prototype.slice.call(document.querySelectorAll('textarea[data-part]'));
  var count=document.getElementById('count');
  function tally(){
    var n=0;
    boxes.forEach(function(b){if((store[b.getAttribute('data-part')]||{}).text)n++;});
    count.textContent=n+' of '+boxes.length+' commented';
  }
  boxes.forEach(function(b){
    var id=b.getAttribute('data-part');
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
      var id=b.getAttribute('data-part');
      var rec=store[id];
      if(rec&&rec.text&&rec.text.trim()){
        lines.push('- ['+id+'] '+rec.text.trim().replace(/\\s+/g,' '));
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
export function page(def, body, index) {
  const next = PAGES[index + 1];
  const prev = PAGES[index - 1];
  const pager = [
    prev === undefined ? '' : `<a href="#">back: ${esc(prev.short)}</a>`,
    next === undefined ? '' : `<a href="#">next: ${esc(next.short)}</a>`,
  ]
    .filter(Boolean)
    .join('');
  return `<title>${esc(def.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style>
<header class="page">
  <p class="eyebrow">alpha round ${ROUND}</p>
  <h1>${esc(def.short)}</h1>
  <p class="lede">Open <a href="${LIVE_URL}">the live app</a> on your phone beside this page. The skin is limelight by default. Walk the screen, come back, write in the box under the part you mean.</p>
</header>
<div class="tools">
  <span class="count" id="count">0 of 0 commented</span>
  <button type="button" id="assemble">Assemble</button>
  <button type="button" class="quiet" id="theme">Flip theme</button>
</div>
<main class="wrap">
${body}
<section class="part" id="${esc(def.id)}.general">
  <p class="pid"><code>${esc(def.id)}.general</code></p>
  <h3>Anything else on this page</h3>
  <p class="what">A comment that belongs to the whole screen rather than to one part.</p>
  <p class="states">states: none</p>
  <label class="box" for="c-${esc(def.id)}.general">What needs to change?</label>
  <textarea id="c-${esc(def.id)}.general" data-part="${esc(def.id)}.general" placeholder="What you saw. What you expected."></textarea>
</section>
<h2>your comments, ready to paste</h2>
<p class="small">One line per box you filled, in the form the round document reads. Press Assemble, then paste the block back into Claude. You can also leave a comment thread on this published page, or say it in the session and name the part id.</p>
<textarea class="assembled" id="assembled" readonly aria-label="Assembled comments" placeholder="Press Assemble."></textarea>
<p class="small" id="status" role="status" aria-live="polite"></p>
</main>
<nav class="pager">${pager}</nav>
<script>${pageScript(def.id)}</script>
`;
}

/** The screen pages. Page 0 is written by Task 5 and joins this loop there. */
mkdirSync(OUT, { recursive: true });
let written = 0;
let sections = 0;
PAGES.forEach((def, index) => {
  if (def.screens.length === 0) return;
  const parts = def.screens.flatMap((screen) => LIVE.filter((p) => p.screen === screen));
  const body = def.screens
    .map((screen) => {
      const inScreen = LIVE.filter((p) => p.screen === screen);
      return `<h2>${esc(screen)} (${inScreen.length})</h2>\n${inScreen.map(partSection).join('\n')}`;
    })
    .join('\n');
  writeFileSync(OUT + def.file, page(def, body, index));
  written += 1;
  sections += parts.length;
});
process.stdout.write(`pages ${written} sections ${sections} round ${ROUND}\n`);

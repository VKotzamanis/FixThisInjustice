// scripts/alpha-catalogue.mjs
//
// The alpha-review catalogue: one record per reviewable part of the app, keyed by a stable part
// id. P10 Tasks 1 to 3.
//
//   node scripts/alpha-catalogue.mjs --probe          the structural counts, and nothing else
//   node scripts/alpha-catalogue.mjs --keys <screen>  every copy key a screen's files mention
//   node scripts/alpha-catalogue.mjs --unplaced       every copy key no screen's files mention
//   node scripts/alpha-catalogue.mjs --count          the number of live parts
//   node scripts/alpha-catalogue.mjs --check          the gate, exit 1 on any failure
//   node scripts/alpha-catalogue.mjs                  writes catalogue.json and catalogue.md
//
// DETERMINISM. The output is a function of the tree alone. Two runs on one tree agree byte for
// byte: every list is sorted or comes from a source-order read, and no clock and no random source
// is touched. Nothing is retyped: every string is read from src/content/copy.ts through the same
// module the app imports.
//
// Vite's Node API loads that module because it imports './copy.board' with no extension, which
// Node's own resolver rejects. scripts/copy-wordcount.mjs and scripts/limelight-side-by-side.mjs
// give the same reason, and all three load the table the same way.
//
// WHY REGEX FOR THE UNIONS. ToastKind, ReminderStatus and Phase are TYPE aliases: they are erased
// before anything can import them, so there is no runtime value to read. SETTINGS_ROWS is a
// runtime value but is not exported, and exporting it to satisfy a script would change app code
// for a documentation tool. Each reader below therefore matches a named block and THROWS when the
// block is absent, so a rename fails loudly here instead of silently shrinking a page.
//
// WHAT COUNTS AS A MENTION. Three exclusions, each of which was producing a wrong screen for a
// real key. A COMMENT that names a key discusses it rather than renders it, and AtlasView.tsx
// spends a paragraph explaining why 'advice.noCardsMatch' goes unrendered. A TEST file asserts on
// a key rather than showing it, and it also names storage keys ('fti.plan.v1') that no screen
// contains. A MISSING path used to return an empty set, so a renamed view quietly emptied its
// screen; it now throws. What is left is a key a reviewer can find on the screen.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { NOT_RENDERED, PARTS } from './alpha-parts.mjs';

// fileURLToPath, not URL.pathname: pathname is percent-encoded, so a checkout under a path with
// a space resolves to a directory that does not exist.
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The screens in app order, each with the paths that render its strings. */
export const SCREEN_FILES = [
  // P10 Brief C: the intro sequence, shown once ahead of the boot sequence below
  // (App.tsx mounts <BootGate /> only once `ui.introSeen` is true).
  ['intro', ['src/ui/intro/IntroSequence.tsx']],
  ['boot', ['src/ui/components/Boot.tsx']],
  [
    'shell',
    [
      'src/app/App.tsx',
      'src/app/UpdatePrompt.tsx',
      'src/ui/components/SessionIndicator.tsx',
      'src/ui/components/SpotlightButton.tsx',
      'src/ui/nav/views.ts',
    ],
  ],
  ['setup', ['src/ui/setup/SetupWizard.tsx', 'src/ui/setup/GuidanceScreen.tsx']],
  [
    'today',
    [
      'src/ui/views/TodayView.tsx',
      'src/ui/components/Marquee.tsx',
      'src/ui/components/WeekStamp.tsx',
      'src/ui/components/Intervention.tsx',
      'src/ui/format/refusal.ts',
      'src/ui/format/weekDelta.ts',
    ],
  ],
  ['train', ['src/ui/views/TrainView.tsx', 'src/ui/views/train', 'src/domain/training/hydration.ts']],
  ['plan', ['src/ui/views/PlanView.tsx']],
  ['targets', ['src/ui/views/TargetsView.tsx']],
  [
    'log',
    [
      'src/ui/views/LogView.tsx',
      'src/ui/components/BodyMassChart.tsx',
      'src/ui/components/ComplianceGrid.tsx',
      'src/ui/components/AmrapSpark.tsx',
      'src/ui/components/PRList.tsx',
    ],
  ],
  ['atlas', ['src/ui/views/AtlasView.tsx']],
  [
    'settings',
    [
      'src/ui/views/SettingsView.tsx',
      'src/ui/settings',
      'src/ui/components/ReminderSettingsPanel.tsx',
      'src/ui/motivation/MotivationSettings.tsx',
      'src/ui/views/ExportView.tsx',
      'src/domain/export/summary.ts',
    ],
  ],
  ['install', ['src/ui/components/InstallGuide.tsx']],
  [
    'popup',
    [
      'src/ui/components/Spotlight.tsx',
      'src/ui/components/KonamiOverlay.tsx',
      'src/ui/components/PhaseTransition.tsx',
      'src/ui/components/ConfirmDestructive.tsx',
      'src/ui/components/ModalShell.tsx',
      'src/ui/components/VideoModal.tsx',
      'src/ui/components/FormCuesModal.tsx',
      'src/ui/migration',
      'src/ui/motivation/MotivationModal.tsx',
      'src/ui/motivation/MotivationGate.tsx',
      'src/ui/components/TimeCapsule.tsx',
    ],
  ],
  ['toast', ['src/ui/components/ToastQueue.tsx', 'src/domain/training/coach.ts']],
];

export const SCREEN_IDS = SCREEN_FILES.map(([id]) => id);

/** A tracked file's text. Throws rather than returning an empty string on a bad path. */
export function sourceOf(rel) {
  const path = ROOT + rel;
  if (!existsSync(path)) throw new Error(`alpha-catalogue: no such file: ${rel}`);
  return readFileSync(path, 'utf8');
}

/** One literal, made safe to interpolate into a RegExp source. */
function literal(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `export const NAME = [ 'a', 'b' ] as const;` -> ['a','b'], in source order. */
export function readConstArray(rel, name) {
  const block = `export const \\b${literal(name)}\\b = \\[([\\s\\S]*?)\\] as const;`;
  const m = new RegExp(block).exec(sourceOf(rel));
  if (m === null) throw new Error(`${rel}: no "export const ${name} = [...] as const;" block`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** `type Name = 'a' | 'b';`, exported or not -> ['a','b'], in source order. */
export function readUnion(rel, name) {
  const block = `(?:export )?type \\b${literal(name)}\\b =([\\s\\S]*?);`;
  const m = new RegExp(block).exec(sourceOf(rel));
  if (m === null) throw new Error(`${rel}: no "type ${name} = ...;" alias`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The SETTINGS_ROWS ids, in the order the screen renders them. */
export function readSettingsRowIds() {
  const src = sourceOf('src/ui/views/SettingsView.tsx');
  const m = /const SETTINGS_ROWS: readonly SettingsRow\[\] = \[([\s\S]*?)\n\];/.exec(src);
  if (m === null) throw new Error('SettingsView.tsx: no SETTINGS_ROWS array literal');
  return [...m[1].matchAll(/\{\s*id: '([^']+)'/g)].map((x) => x[1]);
}

/**
 * The verdict groups at the foot of src/content/copy.limelight.ts.
 *
 * That block is the record of which keys may NEVER take a limelight row, and why. It is prose
 * with a strict shape: a header line ending "(<n>)." states the count, and the key lines under it
 * begin with an asterisk and THREE spaces, which is what separates them from the reason's own
 * continuation lines. The declared count is checked against the parsed count per group, so a hand
 * edit that adds a key without moving the number fails here.
 */
export function readLimelightRefusals() {
  const src = sourceOf('src/content/copy.limelight.ts');
  const block = /WHAT STAYS CLINICAL ON THE FOUR MAIN SCREENS([\s\S]*?)\n\s*\*\/\s*\n\};/.exec(src);
  if (block === null) throw new Error('copy.limelight.ts: no verdict block');
  const out = new Map();
  const groups = [];
  let current = null;
  for (const line of block[1].split('\n')) {
    const head = /^\s*\*\s(\S.*?)\s\((\d+)\)\.\s/.exec(line);
    if (head !== null) {
      current = { group: head[1], declared: Number(head[2]), reason: head[0].trim(), keys: [] };
      groups.push(current);
      continue;
    }
    const keyLine = /^\s*\*\s{3}(\S.*)$/.exec(line);
    if (keyLine !== null && current !== null) {
      for (const k of keyLine[1].split(',')) {
        const key = k.trim();
        if (key !== '') current.keys.push(key);
      }
    }
  }
  for (const g of groups) {
    if (g.keys.length !== g.declared) {
      throw new Error(`copy.limelight.ts: group "${g.group}" declares ${g.declared}, parsed ${g.keys.length}`);
    }
    for (const key of g.keys) out.set(key, { group: g.group, reason: g.reason });
  }
  const total = /The other (\d+) are named below/.exec(block[1]);
  if (total === null) throw new Error('copy.limelight.ts: the verdict block states no total');
  if (out.size !== Number(total[1])) {
    throw new Error(`copy.limelight.ts: block states ${total[1]} refusals, parsed ${out.size}`);
  }
  return { refusals: out, groupCount: groups.length };
}

/** A test file asserts on a key; it never renders one. Excluded from every key grep. */
const TEST_EXCLUDES = [':!*.test.ts', ':!*.test.tsx'];

/**
 * One quoted copy key.
 *
 * BOTH QUOTE STYLES. A view that calls the hook writes `c('button.skipToday')` and a view that
 * hands the key to a component writes `copyKey="button.skipToday"`, so a single-quote grep files
 * half of Today's controls nowhere. execFileSync passes the pattern as one argument, which keeps
 * the two quote characters out of a shell.
 */
const KEY_PATTERN = `['"][a-z][a-zA-Z0-9_.]*\\.[a-zA-Z0-9_.]*['"]`;
const KEY_RE = /['"]([a-z][a-zA-Z0-9_.]*\.[a-zA-Z0-9_.]*)['"]/g;

/** A line whose body opens or continues a comment: `//`, a JSDoc `*`, or `/*`. */
const COMMENT_RE = /^(?:\/\/|\*|\/\*)/;

/**
 * `git grep` for quoted keys over one path set, as raw output lines.
 *
 * Every path is checked against the disk FIRST. git grep treats a path it cannot find as a fatal
 * pathspec error, which the catch below used to turn into an empty set, so a renamed view emptied
 * its screen in silence. Only exit status 1 -- the pattern matched nothing -- is swallowed here;
 * a fatal pathspec, a killed process or a missing git all rethrow.
 */
function grepKeyLines(flags, paths) {
  for (const rel of paths) {
    if (!existsSync(ROOT + rel)) throw new Error(`alpha-catalogue: no such file: ${rel}`);
  }
  try {
    return execFileSync('git', ['grep', flags, '-E', KEY_PATTERN, '--', ...paths, ...TEST_EXCLUDES], {
      encoding: 'utf8',
      cwd: ROOT,
    });
  } catch (err) {
    if (err.status !== 1) throw err;
    return '';
  }
}

/**
 * The copy keys one source line names, and none at all when the line is a comment.
 *
 * A key named in a comment is a key the file DISCUSSES. AtlasView.tsx:28 explains why
 * 'advice.noCardsMatch' is never rendered, and a catalogue that files it under the atlas sends a
 * reviewer hunting for a string that is not on the screen.
 */
export function keysOnLine(body) {
  if (COMMENT_RE.test(body.trim())) return [];
  return [...body.matchAll(KEY_RE)].map((m) => m[1]);
}

/** The copy keys one path set mentions. */
export function keysIn(paths) {
  const out = new Set();
  for (const line of grepKeyLines('-h', paths).split('\n')) {
    for (const key of keysOnLine(line)) out.add(key);
  }
  return out;
}

/** The same, as `<line>:<body>` in file order. For --keys. */
export function keyLinesIn(paths) {
  return grepKeyLines('-nh', paths).split('\n').filter(Boolean);
}

/** Every DEFAULT_COPY key that no screen's files mention, in table order. */
export function unplacedKeys(DEFAULT_COPY) {
  const placed = new Set();
  for (const [, paths] of SCREEN_FILES) {
    for (const key of keysIn(paths)) placed.add(key);
  }
  return Object.keys(DEFAULT_COPY).filter((key) => !placed.has(key));
}

/**
 * The first tracked file under src/ that names one key, or null when nothing does.
 *
 * A fixed-string search on both quoted forms, so a key's dots stay dots. Comments count here:
 * this answers "where does this string live at all", which is what a reviewer needs when the
 * screen table reaches it nowhere.
 */
export function firstSourceFile(key) {
  const quoted = ['-e', `'${key}'`, '-e', `"${key}"`];
  try {
    const out = execFileSync('git', ['grep', '-lF', ...quoted, '--', 'src', ...TEST_EXCLUDES], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    return out.split('\n').find(Boolean) ?? null;
  } catch (err) {
    if (err.status !== 1) throw err;
    return null;
  }
}

/** The three copy tables, loaded through Vite exactly as the app imports them. */
export async function loadCopy() {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  const copy = await server.ssrLoadModule('/src/content/copy.ts');
  const views = await server.ssrLoadModule('/src/ui/nav/views.ts');
  await server.close();
  return {
    DEFAULT_COPY: copy.DEFAULT_COPY,
    LIMELIGHT_COPY: copy.LIMELIGHT_COPY,
    BOARD_COPY: copy.BOARD_COPY,
    VIEWS: views.VIEWS,
  };
}

/** The eight structural counts, for --probe. */
export function probe() {
  const { refusals, groupCount } = readLimelightRefusals();
  return {
    setupSteps: readConstArray('src/ui/setup/SetupWizard.tsx', 'STEPS').length,
    settingsRows: readSettingsRowIds().length,
    toastKinds: readUnion('src/ui/components/ToastQueue.tsx', 'ToastKind').length,
    reminderStates: readUnion('src/ui/components/ReminderSettingsPanel.tsx', 'ReminderStatus').length,
    migrationPhases: readUnion('src/ui/migration/MigrationWizard.tsx', 'Phase').length,
    atlasRarities: (sourceOf('src/ui/views/AtlasView.tsx').match(/'label\.rarity[A-Za-z]+'/g) ?? []).length,
    limelightRefusals: refusals.size,
    limelightRefusalGroups: groupCount,
  };
}

/** The part id grammar: two or three hyphen-lower-case segments. */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,2}$/;

/** One key, resolved on all three skins, with its limelight verdict. */
function keyRecord(key, tables, refusals) {
  const refusal = refusals.get(key) ?? null;
  return {
    key,
    default: tables.DEFAULT_COPY[key],
    limelight: tables.LIMELIGHT_COPY[key] ?? 'same',
    board: tables.BOARD_COPY[key] ?? 'same',
    isControl: key.startsWith('button.'),
    limelightRowPermitted: refusal === null,
    refusalGroup: refusal === null ? null : refusal.group,
  };
}

/**
 * The catalogue, and every problem found while building it.
 *
 * A part with an explicit `keys` array takes exactly those keys. A part without one takes every
 * key its own files mention that no earlier part has claimed, which is how a part that owns a
 * whole component file fills itself. Whatever a screen mentions and no part claims lands in
 * `<screen>.unassigned`, and whatever the table holds and no part claims must be excused by name
 * in NOT_RENDERED, so a key can never fall out of the catalogue silently.
 */
export async function buildCatalogue() {
  const tables = await loadCopy();
  const { refusals } = readLimelightRefusals();
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
    cwd: ROOT,
  }).trim();

  const problems = [];
  const parts = [];
  const seen = new Set();

  /*
   * ONE CLAIM MAP FOR THE WHOLE TREE, key to part id. A key is filed once, under the first screen
   * in app order that claims or mentions it, the way scripts/limelight-side-by-side.mjs files a
   * key once through one `placed` Map. A set per screen would let today and shell both demand
   * hero.programmeComplete and leave it unassigned on whichever screen has no part for it.
   */
  const claimed = new Map();

  for (const [screen, files] of SCREEN_FILES) {
    const inScreen = PARTS.filter((p) => p.screen === screen);
    const assigned = new Map();

    /*
     * TWO PASSES, and the order matters. Every explicit `keys` array claims first, across the
     * whole screen. Only then does a part without one sweep up what its own files still mention.
     * One pass in authored order would let boot.sequence, which owns Boot.tsx and declares no
     * keys, swallow button.skipBoot before boot.skip could claim it.
     */
    for (const part of inScreen) {
      if (part.keys === undefined) continue;
      const keys = [...part.keys].sort();
      for (const k of keys) {
        if (!(k in tables.DEFAULT_COPY)) problems.push(`${part.id}: key not in DEFAULT_COPY: ${k}`);
        if (claimed.has(k)) problems.push(`${part.id}: key already claimed by ${claimed.get(k)}: ${k}`);
        claimed.set(k, part.id);
      }
      assigned.set(part.id, keys);
    }
    for (const part of inScreen) {
      if (part.keys !== undefined) continue;
      const keys = [...keysIn(part.components)]
        .filter((k) => k in tables.DEFAULT_COPY && !claimed.has(k))
        .sort();
      for (const k of keys) claimed.set(k, part.id);
      assigned.set(part.id, keys);
    }

    let order = 0;
    for (const part of inScreen) {
      if (!ID_RE.test(part.id)) problems.push(`bad id: ${part.id}`);
      if (!part.id.startsWith(`${screen}.`)) problems.push(`id does not start with its screen: ${part.id}`);
      if (seen.has(part.id)) problems.push(`duplicate id: ${part.id}`);
      seen.add(part.id);
      for (const rel of part.components) {
        if (!existsSync(ROOT + rel)) problems.push(`${part.id}: no such component: ${rel}`);
      }
      order += 1;
      parts.push({
        id: part.id,
        screen,
        order,
        title: part.title,
        what: part.what,
        components: part.components,
        states: part.states,
        keys: (assigned.get(part.id) ?? []).map((k) => keyRecord(k, tables, refusals)),
        status: part.status ?? 'live',
      });
    }
    const left = [...keysIn(files)]
      .filter((k) => k in tables.DEFAULT_COPY && !claimed.has(k))
      .sort();
    if (left.length > 0) problems.push(`${screen}.unassigned holds ${left.length} keys: ${left.join(', ')}`);
    parts.push({
      id: `${screen}.unassigned`,
      screen,
      order: order + 1,
      title: 'Unassigned',
      what: 'Keys this screen renders that no part claims. Must be empty.',
      components: files,
      states: [],
      keys: left.map((k) => keyRecord(k, tables, refusals)),
      status: 'synthetic',
    });
  }

  /*
   * THE STATES THE TREE ENUMERATES, checked against the tree rather than trusted.
   *
   * Three parts take their states from a union type, two screens take their sections from a
   * runtime list, and each is compared here. A member added to any of them without a matching
   * part fails --check, which is the whole reason the catalogue is generated instead of written.
   */
  const secondSegments = (screen) =>
    new Set(PARTS.filter((p) => p.screen === screen).map((p) => p.id.split('.')[1]));
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  const reminders = PARTS.find((p) => p.id === 'settings.reminders');
  const reminderStates = readUnion('src/ui/components/ReminderSettingsPanel.tsx', 'ReminderStatus');
  if (!sameSet(reminders.states, reminderStates)) {
    problems.push(`settings.reminders states differ from ReminderStatus: ${reminders.states.join(', ')} vs ${reminderStates.join(', ')}`);
  }

  const toastIds = PARTS.filter((p) => p.screen === 'toast').map((p) => p.id.split('.')[1]);
  const toastKinds = readUnion('src/ui/components/ToastQueue.tsx', 'ToastKind');
  if (!sameSet(toastIds, toastKinds)) {
    problems.push(`toast parts differ from ToastKind: ${toastIds.join(', ')} vs ${toastKinds.join(', ')}`);
  }

  const migrationIds = PARTS.filter((p) => p.id.startsWith('popup.migration.')).map((p) => p.id.split('.')[2]);
  const phases = readUnion('src/ui/migration/MigrationWizard.tsx', 'Phase');
  if (!sameSet(migrationIds, phases)) {
    problems.push(`popup.migration parts differ from Phase: ${migrationIds.join(', ')} vs ${phases.join(', ')}`);
  }

  const setupSections = secondSegments('setup');
  for (const step of readConstArray('src/ui/setup/SetupWizard.tsx', 'STEPS')) {
    if (!setupSections.has(step)) problems.push(`no setup part for wizard step: ${step}`);
  }

  const settingsSections = secondSegments('settings');
  for (const row of readSettingsRowIds()) {
    if (!settingsSections.has(row)) problems.push(`no settings part for SETTINGS_ROWS id: ${row}`);
  }

  for (const view of tables.VIEWS) {
    if (!SCREEN_IDS.includes(view.id)) problems.push(`no screen for view: ${view.id}`);
  }

  /*
   * EVERY KEY IN THE TABLE, placed once or excused by name. A key the app can show and no part
   * claims is a part of the app the owner cannot comment on, which is the one failure this
   * catalogue exists to prevent. NOT_RENDERED is checked both ways, so an excuse cannot outlive
   * the surface it excuses.
   */
  const allKeys = Object.keys(tables.DEFAULT_COPY).sort();
  for (const key of allKeys) {
    if (claimed.has(key) && key in NOT_RENDERED) {
      problems.push(`${claimed.get(key)} claims a key NOT_RENDERED excuses: ${key}`);
    }
    if (!claimed.has(key) && !(key in NOT_RENDERED)) {
      problems.push(`no part claims and NOT_RENDERED does not excuse: ${key}`);
    }
  }
  for (const key of Object.keys(NOT_RENDERED)) {
    if (!(key in tables.DEFAULT_COPY)) problems.push(`NOT_RENDERED names a key not in DEFAULT_COPY: ${key}`);
  }
  const notRendered = Object.keys(NOT_RENDERED)
    .sort()
    .map((key) => ({ key, reason: NOT_RENDERED[key] }));

  const live = parts.filter((p) => p.status === 'live');
  return {
    catalogue: {
      generatedFrom: head,
      counts: {
        screens: SCREEN_IDS.length,
        parts: live.length,
        keys: live.reduce((n, p) => n + p.keys.length, 0),
        notRendered: notRendered.length,
        table: allKeys.length,
      },
      parts,
      notRendered,
    },
    problems,
  };
}

/** The same catalogue as a page a person can read. */
function toMarkdown(cat) {
  const out = [];
  out.push('# Alpha review catalogue');
  out.push('');
  out.push('Generated by `scripts/alpha-catalogue.mjs` from the tree. Nothing here is retyped.');
  out.push('Regenerate after any change to a copy table or a component:');
  out.push('');
  out.push('```bash');
  out.push('node scripts/alpha-catalogue.mjs');
  out.push('```');
  out.push('');
  out.push(`Built from \`${cat.generatedFrom}\`. ${cat.counts.parts} parts across ${cat.counts.screens} screens, holding ${cat.counts.keys} of the table's ${cat.counts.table} copy keys; ${cat.counts.notRendered} have no surface and are excused by name at the foot.`);
  out.push('');
  for (const screen of SCREEN_IDS) {
    const inScreen = cat.parts.filter((p) => p.screen === screen && p.status === 'live');
    out.push(`## ${screen} (${inScreen.length})`);
    out.push('');
    for (const part of inScreen) {
      out.push(`### \`${part.id}\``);
      out.push('');
      out.push(`${part.title}. ${part.what}`);
      out.push('');
      out.push(`Renders: ${part.components.map((c) => `\`${c}\``).join(', ')}`);
      out.push('');
      out.push(`States: ${part.states.map((s) => `\`${s}\``).join(', ')}`);
      out.push('');
      if (part.keys.length === 0) {
        out.push('No copy key. Review its layout and behaviour only.');
        out.push('');
        continue;
      }
      out.push('| Key | Clinical | Limelight | Board | Limelight row allowed |');
      out.push('| --- | --- | --- | --- | --- |');
      for (const k of part.keys) {
        const allowed = k.limelightRowPermitted ? 'yes' : `no: ${k.refusalGroup}`;
        const cell = (v) => v.replace(/\|/g, '\\|');
        out.push(`| \`${k.key}\` | ${cell(k.default)} | ${cell(k.limelight)} | ${cell(k.board)} | ${cell(allowed)} |`);
      }
      out.push('');
    }
  }
  out.push('## not rendered');
  out.push('');
  out.push('| Key | Why it has no surface |');
  out.push('| --- | --- |');
  for (const n of cat.notRendered) out.push(`| \`${n.key}\` | ${n.reason.replace(/\|/g, '\\|')} |`);
  out.push('');
  return out.join('\n');
}

const argv = process.argv.slice(2);

if (argv[0] === '--probe') {
  const p = probe();
  const { VIEWS, DEFAULT_COPY } = await loadCopy();
  process.stdout.write(
    [
      `views            ${VIEWS.length}`,
      `setupSteps       ${p.setupSteps}`,
      `settingsRows     ${p.settingsRows}`,
      `toastKinds       ${p.toastKinds}`,
      `reminderStates   ${p.reminderStates}`,
      `migrationPhases  ${p.migrationPhases}`,
      `atlasRarities    ${p.atlasRarities}`,
      `refusals         ${p.limelightRefusals} in ${p.limelightRefusalGroups} groups`,
      `unplaced         ${unplacedKeys(DEFAULT_COPY).length}`,
      '',
    ].join('\n'),
  );
} else if (argv[0] === '--keys') {
  const screen = SCREEN_FILES.find(([id]) => id === argv[1]);
  if (screen === undefined) {
    process.stderr.write(`--keys: unknown screen "${argv[1]}". One of: ${SCREEN_IDS.join(', ')}\n`);
    process.exit(1);
  }
  const { DEFAULT_COPY } = await loadCopy();
  for (const line of keyLinesIn(screen[1])) {
    const m = /^(\d+):(.*)$/.exec(line);
    if (m === null) continue;
    for (const key of keysOnLine(m[2])) {
      const value = DEFAULT_COPY[key];
      if (value === undefined) continue;
      process.stdout.write(`${m[1]}\t${key}\t${value}\n`);
    }
  }
} else if (argv[0] === '--unplaced') {
  const { DEFAULT_COPY } = await loadCopy();
  for (const key of unplacedKeys(DEFAULT_COPY)) {
    process.stdout.write(`${key}\t${firstSourceFile(key) ?? '-'}\n`);
  }
} else if (argv[0] === '--count') {
  const { catalogue } = await buildCatalogue();
  process.stdout.write(`${catalogue.counts.parts}\n`);
} else if (argv[0] === '--check') {
  const { problems } = await buildCatalogue();
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`FAIL ${p}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('PASS alpha catalogue\n');
  }
} else {
  const { catalogue, problems } = await buildCatalogue();
  mkdirSync(`${ROOT}docs/feedback`, { recursive: true });
  writeFileSync(`${ROOT}docs/feedback/catalogue.json`, `${JSON.stringify(catalogue, null, 2)}\n`);
  writeFileSync(`${ROOT}docs/feedback/catalogue.md`, `${toMarkdown(catalogue)}\n`);
  process.stdout.write(`parts ${catalogue.counts.parts} keys ${catalogue.counts.keys} problems ${problems.length}\n`);
}

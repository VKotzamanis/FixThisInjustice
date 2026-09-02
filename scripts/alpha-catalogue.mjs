// scripts/alpha-catalogue.mjs
//
// The alpha-review catalogue: one record per reviewable part of the app, keyed by a stable part
// id. P10 Tasks 1 to 3.
//
//   node scripts/alpha-catalogue.mjs --probe          the structural counts, and nothing else
//   node scripts/alpha-catalogue.mjs --keys <screen>  every copy key a screen's files mention
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
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

export const ROOT = new URL('..', import.meta.url).pathname;

/** The screens in app order, each with the paths that render its strings. */
export const SCREEN_FILES = [
  ['boot', ['src/ui/components/Boot.tsx']],
  [
    'shell',
    [
      'src/app/App.tsx',
      'src/app/UpdatePrompt.tsx',
      'src/ui/components/SessionIndicator.tsx',
      'src/ui/components/SpotlightButton.tsx',
    ],
  ],
  ['setup', ['src/ui/setup/SetupWizard.tsx']],
  ['readiness', ['src/ui/setup/ReadinessScreen.tsx', 'src/ui/components/ReadinessNotice.tsx']],
  [
    'today',
    [
      'src/ui/views/TodayView.tsx',
      'src/ui/components/Marquee.tsx',
      'src/ui/components/WeekStamp.tsx',
      'src/ui/components/Intervention.tsx',
      'src/ui/components/TimeCapsule.tsx',
    ],
  ],
  ['train', ['src/ui/views/TrainView.tsx', 'src/ui/views/train']],
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
    ],
  ],
  ['toast', ['src/ui/components/ToastQueue.tsx']],
];

export const SCREEN_IDS = SCREEN_FILES.map(([id]) => id);

/** A tracked file's text. Throws rather than returning an empty string on a bad path. */
export function sourceOf(rel) {
  const path = ROOT + rel;
  if (!existsSync(path)) throw new Error(`alpha-catalogue: no such file: ${rel}`);
  return readFileSync(path, 'utf8');
}

/** `export const NAME = [ 'a', 'b' ] as const;` -> ['a','b'], in source order. */
export function readConstArray(rel, name) {
  const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(sourceOf(rel));
  if (m === null) throw new Error(`${rel}: no "export const ${name} = [...] as const;" block`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** `type Name = 'a' | 'b';`, exported or not -> ['a','b'], in source order. */
export function readUnion(rel, name) {
  const m = new RegExp(`(?:export )?type ${name} =([\\s\\S]*?);`).exec(sourceOf(rel));
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

/**
 * The copy keys one path set mentions.
 *
 * BOTH QUOTE STYLES. A view that calls the hook writes `c('button.skipToday')` and a view that
 * hands the key to a component writes `copyKey="button.skipToday"`, so a single-quote grep files
 * half of Today's controls nowhere. execFileSync passes the pattern as one argument, which keeps
 * the two quote characters out of a shell.
 */
export function keysIn(paths) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['grep', '-ohE', `['"][a-z][a-zA-Z0-9_.]*\\.[a-zA-Z0-9_.]*['"]`, '--', ...paths],
      { encoding: 'utf8', cwd: ROOT },
    );
  } catch {
    // git grep exits 1 when a path set mentions no key at all. That is an empty set, not an error.
    out = '';
  }
  return new Set(
    out
      .split('\n')
      .map((line) => line.replace(/['"]/g, '').trim())
      .filter(Boolean),
  );
}

/** The same, with the file and the line, in file order. For --keys. */
export function keyLinesIn(paths) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['grep', '-nohE', `['"][a-z][a-zA-Z0-9_.]*\\.[a-zA-Z0-9_.]*['"]`, '--', ...paths],
      { encoding: 'utf8', cwd: ROOT },
    );
  } catch {
    out = '';
  }
  return out.split('\n').filter(Boolean);
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

const argv = process.argv.slice(2);

if (argv[0] === '--probe') {
  const p = probe();
  const { VIEWS } = await loadCopy();
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
      '',
    ].join('\n'),
  );
} else if (argv[0] === '--keys') {
  const screen = SCREEN_FILES.find(([id]) => id === argv[1]);
  if (screen === undefined) throw new Error(`--keys: unknown screen "${argv[1]}"`);
  const { DEFAULT_COPY } = await loadCopy();
  for (const line of keyLinesIn(screen[1])) {
    const m = /^(\d+):['"]([a-z][a-zA-Z0-9_.]*\.[a-zA-Z0-9_.]*)['"]$/.exec(line);
    if (m === null) continue;
    const value = DEFAULT_COPY[m[2]];
    if (value === undefined) continue;
    process.stdout.write(`${m[1]}\t${m[2]}\t${value}\n`);
  }
}

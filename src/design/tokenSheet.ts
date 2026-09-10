/**
 * `src/ui/styles/tokens.css`, read as text and turned into the panel's control list.
 *
 * WHY ?raw AND NOT A SECOND SOURCE OF TRUTH. The sheet is the only place a token value is
 * written. Anything that restated the list here would be a value transcribed into a second
 * place, which is the failure this project has been burned by repeatedly: the copy would be
 * stale the moment either side changed, and the panel would then be editing a token the app no
 * longer has.
 *
 * The parse is `src/skins/tokens.test.ts`'s `tokensIn()` approach, widened from names to
 * name-and-value and given the `var()` resolution `src/app/topbar.test.ts` already carries.
 * Both of those live in `.test.ts` files that ship in no bundle, so the running app could not
 * import either; this module is the one copy the app itself can reach, and `tokenSheet.test.ts`
 * pins its counts against the same numbers `tokens.test.ts` asserts.
 *
 * `?raw` rather than `node:fs` because tsconfig.app.json pins `types` to the vite client, which
 * is the convention every other source-reading module here follows. vitest.config.ts already
 * processes `tokens.css(\?|$)` rather than stubbing it, for exactly this import shape.
 */
import tokens from '../ui/styles/tokens.css?raw';
import { SKIN_IDS } from '../skins/skinContext';
import type { SkinId } from '../domain/types';
import { parseColour } from './colour';

export type { SkinId } from '../domain/types';

/** The three shipped skins, by the selector that opens their token block in the sheet. */
export const SKIN_SELECTOR: Readonly<Record<SkinId, string>> = {
  clinical: ':root {',
  limelight: ":root[data-skin='limelight'] {",
  board: ":root[data-skin='board'] {",
};

/**
 * The panel's groups, in the order it renders them.
 *
 * Taken from the sheet's OWN section comments rather than invented: the top bar is a group
 * because w1.03 made it one, the feasibility bands because Brief I's measurement did, the
 * invalid field and highlight because r2.16 did, and the display geometry because limelight's
 * marquee and stamp do. `Palette` holds the raw named colours a skin block opens with, which is
 * where a colour change usually starts: change `--lime` and the whole skin follows it.
 */
export const GROUP_ORDER = [
  'Palette',
  'Ground',
  'Text',
  'Lines',
  'Accent',
  'State',
  'Top Bar',
  'Feasibility Bands',
  'Fields and Highlight',
  'Chart',
  'Type',
  'Display Geometry',
  'Other',
] as const;

export type TokenGroup = (typeof GROUP_ORDER)[number];

/** The raw named colours each skin block opens with, before anything is mapped onto a role. */
const PALETTE = new Set([
  '--lime',
  '--ink',
  '--pink',
  '--fine',
  '--panel',
  '--panel-text',
  '--board',
  '--flap',
  '--amber',
  '--paper',
  '--mute',
  '--alert',
  '--rule',
]);

/**
 * Which group a token belongs to.
 *
 * `Other` is the fallback and `tokenSheet.test.ts` asserts it stays EMPTY. A token added to the
 * sheet without a home here still renders a control, so the panel never breaks; the suite is
 * what tells the next author to put it somewhere. Add the name to a set above, or a prefix
 * below, rather than widening `Other`.
 */
export function groupOf(name: string): TokenGroup {
  if (PALETTE.has(name)) return 'Palette';
  if (name.startsWith('--bg')) return 'Ground';
  if (name.startsWith('--text')) return 'Text';
  if (name.startsWith('--line')) return 'Lines';
  if (name.startsWith('--accent')) return 'Accent';
  if (name === '--warn' || name === '--danger' || name === '--info') return 'State';
  if (name.startsWith('--topbar-')) return 'Top Bar';
  if (name.startsWith('--band-')) return 'Feasibility Bands';
  if (name.startsWith('--field-invalid') || name === '--highlight-bg') return 'Fields and Highlight';
  if (name.startsWith('--chart-')) return 'Chart';
  if (name === '--mono' || name === '--sans' || name === '--disp' || name === '--chrome') {
    return 'Type';
  }
  if (name.startsWith('--display-') || name === '--shadow-offset') return 'Display Geometry';
  return 'Other';
}

/** One declaration, as the sheet writes it. */
export interface TokenDecl {
  /** The custom property, e.g. `--bg`. */
  readonly name: string;
  /** The value as written in the sheet, e.g. `#0a0b0c` or `var(--lime)`. Never resolved here. */
  readonly value: string;
  readonly group: TokenGroup;
}

/** The declarations inside one top-level block, in source order. Nested rules are not read. */
function declarationsIn(selector: string): readonly TokenDecl[] {
  const start = tokens.indexOf(selector);
  if (start === -1) throw new Error(`tokens.css: no block for selector ${selector}`);
  // `\n}` rather than `}` so a value carrying a brace could not end the block early.
  const end = tokens.indexOf('\n}', start);
  const body = tokens.slice(start + selector.length, end === -1 ? undefined : end);
  const out: TokenDecl[] = [];
  for (const line of body.split('\n')) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i.exec(line);
    const name = match?.[1];
    const value = match?.[2];
    if (name === undefined || value === undefined) continue;
    out.push({ name, value: value.trim(), group: groupOf(name) });
  }
  return out;
}

/** Every declaration the sheet makes, per skin, in source order. */
export const SHEET: Readonly<Record<SkinId, readonly TokenDecl[]>> = {
  clinical: declarationsIn(SKIN_SELECTOR.clinical),
  limelight: declarationsIn(SKIN_SELECTOR.limelight),
  board: declarationsIn(SKIN_SELECTOR.board),
};

/** The shipped value of every token in one skin, as a map. */
export function shippedValues(skin: SkinId): ReadonlyMap<string, string> {
  return new Map(SHEET[skin].map((decl) => [decl.name, decl.value]));
}

/** `SHEET[skin]`, bucketed into the panel's groups and dropping the groups that are empty. */
export function groupedTokens(skin: SkinId): readonly (readonly [TokenGroup, readonly TokenDecl[]])[] {
  return GROUP_ORDER.map(
    (group) => [group, SHEET[skin].filter((decl) => decl.group === group)] as const,
  ).filter(([, decls]) => decls.length > 0);
}

/**
 * Follows `var(--x)` through the skin's own map and then the clinical root, to a literal.
 *
 * Eight hops, which is the same ceiling `topbar.test.ts` uses: the sheet's deepest chain today
 * is two (`--band-surface: var(--panel)`), and a bound is what stops a cycle introduced by an
 * edit from hanging the panel. Returns the last thing it reached, resolved or not, so the
 * caller can show it verbatim rather than being handed an exception mid-keystroke.
 */
export function resolveValue(
  name: string,
  values: ReadonlyMap<string, string>,
  root: ReadonlyMap<string, string>,
): string | undefined {
  let value = values.get(name) ?? root.get(name);
  for (let hop = 0; hop < 8; hop += 1) {
    if (value === undefined || !value.startsWith('var(')) break;
    const inner = /var\((--[a-z0-9-]+)\)/i.exec(value)?.[1];
    if (inner === undefined) break;
    value = values.get(inner) ?? root.get(inner);
  }
  return value;
}

/**
 * True when this token's SHIPPED value resolves to a colour literal, which is what decides
 * whether the panel offers a colour input beside the text input.
 *
 * Decided from the shipped value, not the live one: a token stays the kind of control it was
 * while the owner is halfway through typing `rgba(2` into it. `--accent-rgb` is `163, 230, 53`
 * and is correctly NOT a colour by this rule, because `rgb()` is what a colour input emits and
 * a bare triple is not one.
 */
export function isColourToken(name: string, skin: SkinId): boolean {
  const resolved = resolveValue(name, shippedValues(skin), shippedValues('clinical'));
  return resolved !== undefined && parseColour(resolved) !== null;
}

/** Every token name the sheet declares anywhere, sorted, for the applier's allow-list. */
export function allTokenNames(): readonly string[] {
  const names = new Set<string>();
  for (const skin of SKIN_IDS) {
    for (const decl of SHEET[skin]) names.add(decl.name);
  }
  return [...names].sort();
}

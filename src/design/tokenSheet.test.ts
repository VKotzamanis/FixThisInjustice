/**
 * The panel's view of src/ui/styles/tokens.css.
 *
 * The counts here are the SAME facts src/skins/tokens.test.ts already asserts, read through the
 * app's own parser rather than the test's. If the two ever disagree, one of the parsers is
 * wrong and the panel is editing a token the app does not have.
 */
import { describe, expect, it } from 'vitest';
import { SKIN_IDS } from '../skins/skinContext';
import {
  GROUP_ORDER,
  SHEET,
  allTokenNames,
  groupOf,
  groupedTokens,
  isColourToken,
  resolveValue,
  shippedValues,
} from './tokenSheet';

describe('the parse agrees with src/skins/tokens.test.ts', () => {
  it('reads 34 declarations on the bare :root, which is the clinical set', () => {
    // tokens.test.ts asserts this same 34 and records why each bump happened. Bump both.
    expect(SHEET.clinical.length).toBe(34);
  });

  it('reads 121 declarations in total, across the three blocks', () => {
    const total = SKIN_IDS.reduce((sum, skin) => sum + SHEET[skin].length, 0);
    expect(total).toBe(121);
    expect(SHEET.limelight.length).toBe(44);
    expect(SHEET.board.length).toBe(43);
  });

  it('gives every clinical token a value in both attribute-scoped blocks', () => {
    for (const decl of SHEET.clinical) {
      expect({ token: decl.name, limelight: shippedValues('limelight').has(decl.name) }).toEqual({
        token: decl.name,
        limelight: true,
      });
      expect({ token: decl.name, board: shippedValues('board').has(decl.name) }).toEqual({
        token: decl.name,
        board: true,
      });
    }
  });

  it('reads the values, not only the names', () => {
    expect(shippedValues('clinical').get('--accent')).toBe('#a3e635');
    expect(shippedValues('limelight').get('--accent')).toBe('var(--pink)');
    expect(shippedValues('board').get('--accent')).toBe('var(--amber)');
    expect(shippedValues('limelight').get('--lime')).toBe('#8ace00');
  });

  it('stops at the block, so a nested rule is never read as a token', () => {
    // `:root[data-skin='limelight'] .ll-panel { color: ... }` sits after the block's closing
    // brace. A parser that ran past it would report `color` or a second `--pink`.
    const names = SHEET.limelight.map((decl) => decl.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('grouping, so 121 controls are navigable on a phone', () => {
  it('puts every declaration in a named group and leaves Other empty', () => {
    /*
     * A NEW TOKEN FAILS HERE, on purpose, and the fix is one line: add its name to a set or a
     * prefix in groupOf(). The panel itself does not break - an ungrouped token still renders a
     * control under `Other` - so this suite is the only thing that asks for the decision.
     */
    for (const skin of SKIN_IDS) {
      const ungrouped = SHEET[skin].filter((decl) => decl.group === 'Other').map((d) => d.name);
      expect({ skin, ungrouped }).toEqual({ skin, ungrouped: [] });
    }
  });

  it('drops empty groups rather than rendering an empty section', () => {
    for (const skin of SKIN_IDS) {
      for (const [, decls] of groupedTokens(skin)) expect(decls.length).toBeGreaterThan(0);
    }
    // Display Geometry is limelight only; Palette is empty on clinical.
    const clinicalGroups = groupedTokens('clinical').map(([group]) => group);
    expect(clinicalGroups).not.toContain('Display Geometry');
    expect(clinicalGroups).not.toContain('Palette');
    expect(groupedTokens('limelight').map(([group]) => group)).toContain('Display Geometry');
  });

  it('groups the tokens the sheet own comments treat as one thing', () => {
    expect(groupOf('--topbar-bg')).toBe('Top Bar');
    expect(groupOf('--band-realistic')).toBe('Feasibility Bands');
    expect(groupOf('--field-invalid-bg')).toBe('Fields and Highlight');
    expect(groupOf('--highlight-bg')).toBe('Fields and Highlight');
    expect(groupOf('--shadow-offset')).toBe('Display Geometry');
    expect(groupOf('--sans')).toBe('Type');
    expect(groupOf('--chart-actual')).toBe('Chart');
    expect(groupOf('--lime')).toBe('Palette');
    expect(groupOf('--bg-3')).toBe('Ground');
    expect(groupOf('--text-2')).toBe('Text');
  });

  it('renders every group in one declared order', () => {
    for (const skin of SKIN_IDS) {
      const order = groupedTokens(skin).map(([group]) => group);
      const expected = GROUP_ORDER.filter((group) => order.includes(group));
      expect(order).toEqual(expected);
    }
  });
});

describe('resolving var() indirection', () => {
  it('follows the skin block first and the clinical root second', () => {
    expect(resolveValue('--accent', shippedValues('limelight'), shippedValues('clinical'))).toBe(
      '#ff5fcb',
    );
    expect(resolveValue('--band-surface', shippedValues('limelight'), shippedValues('clinical'))).toBe(
      '#000000',
    );
    expect(resolveValue('--accent', shippedValues('board'), shippedValues('clinical'))).toBe('#ffb000');
  });

  it('returns undefined for a token the skin does not declare and the root does not either', () => {
    expect(resolveValue('--lime', shippedValues('clinical'), shippedValues('clinical'))).toBeUndefined();
  });

  it('gives up after a bounded number of hops rather than chasing a cycle', () => {
    const cyclic = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ]);
    // It terminates, and hands back an unresolved var() rather than throwing or hanging. Which
    // of the two it lands on is a function of the hop budget and carries no meaning.
    const landed = resolveValue('--a', cyclic, new Map());
    expect(landed !== undefined && /^var\(--[ab]\)$/.test(landed)).toBe(true);
  });
});

describe('which control a token gets', () => {
  it('offers a colour input only where the value resolves to a colour', () => {
    expect(isColourToken('--bg', 'clinical')).toBe(true);
    expect(isColourToken('--line', 'clinical')).toBe(true); // rgba(), so the text input matters
    expect(isColourToken('--accent', 'limelight')).toBe(true); // var(--pink), resolved
    expect(isColourToken('--accent-rgb', 'clinical')).toBe(false); // a bare triple, not a colour
    expect(isColourToken('--sans', 'clinical')).toBe(false);
    expect(isColourToken('--display-stretch', 'limelight')).toBe(false);
    expect(isColourToken('--shadow-offset', 'limelight')).toBe(false);
  });
});

describe('the allow-list the applier needs', () => {
  it('names every token the sheet declares anywhere, once, sorted', () => {
    const names = allTokenNames();
    expect(names.length).toBe(53); // 34 clinical, plus 10 limelight-only and 9 board-only
    expect([...names]).toEqual([...names].sort());
    expect(names).toContain('--lime');
    expect(names).toContain('--amber');
    expect(names).toContain('--bg');
  });
});

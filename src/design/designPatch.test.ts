/**
 * The export patch: what goes in it, and what deliberately does not.
 *
 * The property that earns this suite is "only CHANGED tokens appear". A patch of 121 unchanged
 * declarations is not reviewable, and an unreviewable patch is one a human waves through.
 */
import { describe, expect, it } from 'vitest';
import { PATCH_VERSION, buildPatch, patchSize, utcStamp } from './designPatch';
import type { StoredEdits } from './designStorage';
import { shippedValues } from './tokenSheet';

describe('buildPatch', () => {
  it('carries only the declarations whose value differs from the sheet', () => {
    expect(shippedValues('limelight').get('--accent')).toBe('var(--pink)');
    expect(shippedValues('limelight').get('--lime')).toBe('#8ace00');
    const edits: StoredEdits = {
      version: 1,
      copy: {},
      r10: {},
      notes: [],
      tokens: {
        // --accent was changed. --lime was touched and put back to exactly what ships.
        limelight: { '--accent': '#ff0000', '--lime': '#8ace00' },
      },
    };

    expect(buildPatch(edits, 0).tokens.limelight).toEqual({ '--accent': '#ff0000' });
  });

  it('drops a token edited back to its shipped value, whitespace and all', () => {
    const edits: StoredEdits = {
      version: 1,
      copy: {},
      r10: {},
      notes: [],
      tokens: { clinical: { '--accent': '  #a3e635  ', '--bg': '#000000' } },
    };
    expect(buildPatch(edits, 0).tokens.clinical).toEqual({ '--bg': '#000000' });
  });

  it('drops a skin left with nothing, rather than emitting an empty object', () => {
    const edits: StoredEdits = {
      version: 1,
      copy: {},
      r10: {},
      notes: [],
      tokens: { clinical: { '--accent': '#a3e635' } },
    };
    expect(buildPatch(edits, 0).tokens).toEqual({});
  });

  it('never invents a token the skin does not declare', () => {
    // --lime is limelight only. An edit recorded against clinical is dropped, not exported: the
    // applier would refuse it, and a patch that cannot be applied is worse than one that is short.
    const edits: StoredEdits = {
      version: 1,
      copy: {},
      r10: {},
      notes: [],
      tokens: { clinical: { '--lime': '#00ff00', '--invented': '#ffffff' } },
    };
    expect(buildPatch(edits, 0).tokens).toEqual({});
  });

  it('emits the empty copy, r10, assets and notes fields when nothing was edited', () => {
    // `copy` was one of these three until Task 2 filled it; src/design/copyEdits.ts carries the
    // shape and the reason it is keyed by skin rather than flat. `r10` and `notes` were filled by
    // the widening to the long-form modules; `assets` is still Task 3's.
    const patch = buildPatch({ version: 1, tokens: {}, copy: {}, r10: {}, notes: [] }, 0);
    expect(patch.copy).toEqual({});
    expect(patch.r10).toEqual([]);
    expect(patch.assets).toEqual([]);
    expect(patch.notes).toEqual([]);
    expect(patch.version).toBe(PATCH_VERSION);
  });

  it('counts the declarations it would rewrite, across every skin', () => {
    const edits: StoredEdits = {
      version: 1,
      copy: {},
      r10: {},
      notes: [],
      tokens: {
        clinical: { '--bg': '#111111', '--text': '#eeeeee' },
        board: { '--amber': '#ffaa00' },
      },
    };
    expect(patchSize(buildPatch(edits, 0))).toBe(3);
  });
});

describe('utcStamp', () => {
  it('writes UTC, second precision, without toISOString', () => {
    // eslint.config.js bans toISOString outside src/domain/dates.ts. Built by hand, and this is
    // the assertion that it was built correctly.
    expect(utcStamp(Date.UTC(2026, 8, 10, 16, 4, 5))).toBe('2026-09-10T16:04:05Z');
    expect(utcStamp(0)).toBe('1970-01-01T00:00:00Z');
  });
});

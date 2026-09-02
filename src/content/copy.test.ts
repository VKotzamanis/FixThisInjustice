import { describe, expect, it } from 'vitest';
import {
  BOARD_COPY,
  DEFAULT_COPY,
  FORMAT,
  LIMELIGHT_COPY,
  SKIN_COPY,
  copy,
  copyFor,
} from './copy';
import type { CopyKey } from './copy';

/**
 * The copy contract, executed.
 *
 * docs/design/2026-09-01-copy-contract.md states R1-R11 in prose and says "test assertions quote
 * the default table". This file is the mechanical half: every rule that can be decided from the
 * string alone is decided here, over all three tables, with the per-skin relaxations the contract
 * and the round-three plan grant. What cannot be decided from the string alone (R7's ban on
 * hedging, R11's quantity names) is left to review and is named in "What this file does not check"
 * at the bottom.
 */

/**
 * Tokens that are a unit, not a word. The contract states the rule as "word counts exclude
 * numerals and units (`60 kg x 8` counts as one word)". A `{slot}` is excluded for the same
 * reason: at runtime it is a number the domain computed, so counting it as a word would charge a
 * sentence for a value it does not contain.
 */
const UNIT_TOKENS: ReadonlySet<string> = new Set([
  's',
  'S',
  'kg',
  'lb',
  'mL',
  'g',
  'kcal',
  'MiB',
  'cm',
  'mm',
  'ms',
  '%',
  '×', // MULTIPLICATION SIGN, as in "60 kg x 8"
]);

function wordCount(value: string): number {
  return value
    .split(/\s+/)
    .map((token) => token.replace(/\{[a-zA-Z]+\}/g, '').replace(/[.,:;!?()"'’]/g, ''))
    .filter((bare) => bare !== '' && /\p{L}/u.test(bare) && !UNIT_TOKENS.has(bare)).length;
}

/** Emoji ranges from round-three verification criterion 5. R6 binds every skin. */
function hasEmoji(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point >= 0x1f300 && point <= 0x1faff) return true;
    if (point >= 0x2600 && point <= 0x27bf) return true;
    if (point === 0xfe0f) return true;
    if (point >= 0x2b00 && point <= 0x2bff) return true;
  }
  return false;
}

/** R5: an en-dash is legal only between two digits (`6-8`). Anywhere else it is a connector. */
function hasConnectorEnDash(value: string): boolean {
  // A `{slot}` stands for a number a domain module computed, so it is scored as one digit here,
  // for the reason `wordCount` gives for not scoring it as a word: `status.blockSessions` is a
  // numeric range at runtime, and reading the brace as a letter would fail a legal string.
  const rendered = value.replace(/\{[a-zA-Z]+\}/g, '0');
  for (let i = 0; i < rendered.length; i += 1) {
    if (rendered[i] !== '–') continue;
    const before = rendered[i - 1] ?? '';
    const after = rendered[i + 1] ?? '';
    if (!/\d/.test(before) || !/\d/.test(after)) return true;
  }
  return false;
}

/** The `{slot}` names a string carries, as a sorted list. */
function slotsOf(value: string): readonly string[] {
  return [...value.matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => match[1] ?? '').sort();
}

/** Every run of digits in a string, sorted. `+30 s` yields ["30"]. */
function numbersOf(value: string): readonly string[] {
  return (value.match(/\d+/g) ?? []).slice().sort();
}

/** Case rules ignore slot names: a slot renders as a number, which has no case. */
function withoutSlots(value: string): string {
  return value.replace(/\{[a-zA-Z]+\}/g, '');
}

/**
 * R10 and R9 exemptions, key by key, each with the position that earns it.
 *
 * R10 exempts form cues, exercise notes and tips, Atlas card bodies and citations; none of those
 * live in this table (they are `src/content/formCues.ts` and `src/content/specimenCards.ts`).
 * What does live here is R9's other exemption: "text inside a disclosure is exempt from R1-R4".
 * A key earns a place below only by being rendered inside a `<details>`, and the call site is
 * named so the exemption can be revoked when the call site changes.
 */
const LENGTH_EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    'advice.motivationClipLimit',
    'rendered inside <details><summary>why?</summary> in src/ui/motivation/MotivationSettings.tsx',
  ],
]);

/**
 * The two aborts and the three commits. A skin may rename them; it may not swap them.
 * Master plan section 3: a skin never changes "the meaning of a plan-altering control".
 */
const ABORT_KEYS: readonly CopyKey[] = ['button.cancel', 'button.dismiss'];
const COMMIT_KEYS: readonly CopyKey[] = [
  'button.confirmSkip',
  'button.confirmStart',
  'button.wipeConfirm',
];
const COMMIT_WORDS = /\b(confirm|start|keep|delete|replace|wipe|yes|ok)\b/i;
const ABORT_WORDS = /\b(cancel|dismiss|back|never mind|not now|stop)\b/i;

const OVERRIDE_TABLES: ReadonlyArray<
  readonly [string, Readonly<Partial<Record<CopyKey, string>>>]
> = [
  ['LIMELIGHT_COPY', LIMELIGHT_COPY],
  ['BOARD_COPY', BOARD_COPY],
];

const ALL_TABLES: ReadonlyArray<readonly [string, Readonly<Partial<Record<CopyKey, string>>>]> = [
  ['DEFAULT_COPY', DEFAULT_COPY],
  ...OVERRIDE_TABLES,
];

function entriesOf(
  table: Readonly<Partial<Record<CopyKey, string>>>,
): ReadonlyArray<readonly [CopyKey, string]> {
  return Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string' ? [[key as CopyKey, value] as const] : [],
  );
}

describe('copy contract, every table', () => {
  for (const [name, table] of ALL_TABLES) {
    it(`${name}: R1, a button is at most three words`, () => {
      for (const [key, value] of entriesOf(table)) {
        if (!key.startsWith('button.')) continue;
        if (LENGTH_EXEMPT.has(key)) continue;
        const words = wordCount(value);
        expect({ key, words, ok: words <= 3 }).toEqual({ key, words, ok: true });
      }
    });

    it(`${name}: R2, a hero is at most eight words`, () => {
      for (const [key, value] of entriesOf(table)) {
        if (!key.startsWith('hero.')) continue;
        if (LENGTH_EXEMPT.has(key)) continue;
        const words = wordCount(value);
        expect({ key, words, ok: words <= 8 }).toEqual({ key, words, ok: true });
      }
    });

    it(`${name}: R3, an advice line is at most twelve words`, () => {
      for (const [key, value] of entriesOf(table)) {
        if (!key.startsWith('advice.')) continue;
        if (LENGTH_EXEMPT.has(key)) continue;
        const words = wordCount(value);
        expect({ key, words, ok: words <= 12 }).toEqual({ key, words, ok: true });
      }
    });

    it(`${name}: R4, a banner is at most two sentences`, () => {
      for (const [key, value] of entriesOf(table)) {
        if (!key.startsWith('banner.')) continue;
        const sentences = value.split(/(?<=[.?])\s+/).filter((part) => part !== '').length;
        expect({ key, ok: sentences <= 2 }).toEqual({ key, ok: true });
      }
    });

    it(`${name}: R5, no em-dash and no connector en-dash`, () => {
      for (const [key, value] of entriesOf(table)) {
        expect({ key, emDash: value.includes('—') }).toEqual({ key, emDash: false });
        expect({ key, enDash: hasConnectorEnDash(value) }).toEqual({ key, enDash: false });
      }
    });

    it(`${name}: R6, no emoji`, () => {
      for (const [key, value] of entriesOf(table)) {
        expect({ key, emoji: hasEmoji(value) }).toEqual({ key, emoji: false });
      }
    });

    it(`${name}: no URL, because a string is not a place to put a link`, () => {
      for (const [key, value] of entriesOf(table)) {
        expect({ key, url: /https?:\/\/|www\.[a-z]/i.test(value) }).toEqual({ key, url: false });
      }
    });
  }
});

describe('copy contract, the default table alone', () => {
  it('R8: no exclamation mark', () => {
    for (const [key, value] of entriesOf(DEFAULT_COPY)) {
      expect({ key, bang: value.includes('!') }).toEqual({ key, bang: false });
    }
  });

  it('R9: no arithmetic inside an advice line', () => {
    // A signed percentage, an equals sign, a rounding step or a storage conversion is a
    // justification; a bare threshold ("above 2 %") is an instruction and stays (round three,
    // section 3.1).
    const ARITHMETIC = /[+−-]\s*\d+([.,]\d+)?\s*%|=|\brounded\b|\bstored as\b/;
    for (const [key, value] of entriesOf(DEFAULT_COPY)) {
      if (!key.startsWith('advice.')) continue;
      expect({ key, arithmetic: ARITHMETIC.test(value) }).toEqual({ key, arithmetic: false });
    }
  });
});

describe('skin overrides', () => {
  it('gives every override key a home in CopyKey', () => {
    const defaultKeys = new Set(Object.keys(DEFAULT_COPY));
    for (const [name, table] of OVERRIDE_TABLES) {
      for (const [key] of entriesOf(table)) {
        expect({ name, key, known: defaultKeys.has(key) }).toEqual({ name, key, known: true });
      }
    }
  });

  it('keeps every slot the default uses, and adds none', () => {
    for (const [name, table] of OVERRIDE_TABLES) {
      for (const [key, value] of entriesOf(table)) {
        expect({ name, key, slots: slotsOf(value) }).toEqual({
          name,
          key,
          slots: slotsOf(DEFAULT_COPY[key]),
        });
      }
    }
  });

  it('carries exactly the numbers the default carries', () => {
    // Master plan section 3: a skin may put a word beside a number, never restate, round, add or
    // drop one. Anything the domain computes is a slot, so a literal digit in an override is only
    // legal when the default has the same literal digit.
    for (const [name, table] of OVERRIDE_TABLES) {
      for (const [key, value] of entriesOf(table)) {
        expect({ name, key, numbers: numbersOf(value) }).toEqual({
          name,
          key,
          numbers: numbersOf(DEFAULT_COPY[key]),
        });
      }
    }
  });

  it('never swaps an abort for a commit', () => {
    for (const [name, table] of OVERRIDE_TABLES) {
      for (const key of ABORT_KEYS) {
        const value = table[key];
        if (value === undefined) continue;
        expect({ name, key, commitWord: COMMIT_WORDS.test(value) }).toEqual({
          name,
          key,
          commitWord: false,
        });
      }
      for (const key of COMMIT_KEYS) {
        const value = table[key];
        if (value === undefined) continue;
        expect({ name, key, abortWord: ABORT_WORDS.test(value) }).toEqual({
          name,
          key,
          abortWord: false,
        });
      }
    }
  });

  it('gives the clinical skin an empty override table', () => {
    expect(SKIN_COPY.clinical).toEqual({});
    expect(SKIN_COPY.limelight).toBe(LIMELIGHT_COPY);
    expect(SKIN_COPY.board).toBe(BOARD_COPY);
  });
});

describe('the limelight table', () => {
  it('keeps the three strings the user asked for by name', () => {
    expect(LIMELIGHT_COPY['advice.drinkToThirst']).toBe('hydrate or diedrate');
    expect(LIMELIGHT_COPY['status.prStamp']).toBe('MOTHER');
    expect(LIMELIGHT_COPY['button.startSession']).toBe("LET'S GO BABES");
    // The week stamp's own key carries the same word: WeekStamp.tsx stopped reading
    // `status.prStamp` when a met week and a personal record became two different claims.
    expect(LIMELIGHT_COPY['status.weekMetStamp']).toBe('MOTHER');
  });

  it('shouts three keys carrying two words, and lowercases the rest', () => {
    // Round three, section 3.2: the uppercase list is closed at three, and the third is the
    // marquee, which is a component (Task 14) rather than a copy row. Three KEYS shout here and
    // the list is still closed at two WORDS: `status.weekMetStamp` is the same MOTHER as
    // `status.prStamp`, at the key the week stamp reads after the two stamps were split
    // (a met week is not a personal record). A fourth shouted word would fail this.
    const shouted = entriesOf(LIMELIGHT_COPY)
      .filter(([, value]) => withoutSlots(value) === withoutSlots(value).toUpperCase())
      .map(([key]) => key)
      .sort();
    expect(shouted).toEqual(['button.startSession', 'status.prStamp', 'status.weekMetStamp']);
    expect(new Set(shouted.map((key) => LIMELIGHT_COPY[key])).size).toBe(2);
    for (const [key, value] of entriesOf(LIMELIGHT_COPY)) {
      if (shouted.includes(key)) continue;
      expect({ key, lower: withoutSlots(value) === withoutSlots(value).toLowerCase() }).toEqual({
        key,
        lower: true,
      });
    }
  });

  it('covers every key the design tables and the brief name', () => {
    // The round-three copy table (section 3.4), mapped onto CopyKeys, plus the families the fun
    // mechanics need skinned: the coach lines, the toasts, the nav, the boot sequence and the
    // Konami refusal.
    const REQUIRED: readonly CopyKey[] = [
      // round three, section 3.4
      'button.startSession',
      'status.rest',
      'button.skipToday',
      'button.pausePlan',
      'button.trainSomethingElse',
      'status.weekDeltaNegative',
      'status.weekDeltaZero',
      'status.weekDeltaPositive',
      'advice.drinkToThirst',
      'status.prReached',
      'hero.weeklyTargetMissed',
      'status.sessionCursor',
      'status.planProgress',
      'button.extendRest',
      'button.skipRest',
      'hero.weekReview',
      'hero.sessionCompleted',
      'status.prStamp',
      'status.weekMetStamp',
      'advice.interventionBody',
      'label.settingsSkin',
      // the coach lines
      'coach.setLogged',
      'coach.setDeleted',
      'coach.setReadout',
      'coach.durationLogged',
      'coach.loadPr',
      'coach.repPr',
      'coach.overSuggested',
      'coach.underSuggested',
      'coach.aboveRange',
      'coach.aboveRangeOne',
      'coach.belowRange',
      'coach.topOfRange',
      'coach.insideRange',
      // toasts
      'toast.setDeleted',
      'status.milestoneSets',
      'status.specimenAcquired',
      // nav
      'nav.today',
      'nav.plan',
      'nav.train',
      'nav.targets',
      'nav.log',
      'nav.settings',
      'nav.atlas',
      // boot sequence and the Konami refusal
      'hero.boot',
      'status.bootConsole',
      'status.bootPlan',
      'status.bootStore',
      'status.bootPlanName',
      'status.bootSchedule',
      'status.bootOk',
      'status.bootReady',
      'status.konami',
      // the missed-week screen
      'button.play',
      'button.dismiss',
      'label.settingsSounds',
    ];
    const missing = REQUIRED.filter((key) => LIMELIGHT_COPY[key] === undefined);
    expect(missing).toEqual([]);
  });
});

describe('the board table', () => {
  it('is upper case throughout, because a split-flap board has no lower case', () => {
    for (const [key, value] of entriesOf(BOARD_COPY)) {
      expect({ key, upper: withoutSlots(value) === withoutSlots(value).toUpperCase() }).toEqual({
        key,
        upper: true,
      });
    }
  });

  it('replaces the design table em-dash with the colon R5 prescribes', () => {
    expect(BOARD_COPY['advice.drinkToThirst']).toBe('REFRESHMENT: DRINK TO THIRST');
    expect(BOARD_COPY['button.startSession']).toBe('BOARD');
  });

  it('stamps a met week with the round-two week_delta_zero phrase', () => {
    // docs/design/round2/2026-09-01-round2-plan.md section 5, copy table, `week_delta_zero`.
    // The board's own `status.weekDeltaZero` row carries the two counts and ends ALL ON TIME,
    // so ALL DEPARTED was free for the stamp and is the design's word for a week that met.
    expect(BOARD_COPY['status.weekMetStamp']).toBe('ALL DEPARTED');
    // The record stamp stays what it was: the two claims are different claims.
    expect(BOARD_COPY['status.prStamp']).toBe('NEW RECORD');
  });
});

describe('copy()', () => {
  it('returns the clinical string when no overlay is given', () => {
    expect(copy('button.startSession')).toBe('Start session');
    expect(copy('status.rest')).toBe('REST');
  });

  it('takes an overlay table, which is what the FORMAT frames pass through', () => {
    expect(copy('button.startSession', LIMELIGHT_COPY)).toBe("LET'S GO BABES");
    expect(copy('button.startSession', {})).toBe('Start session');
  });
});

describe('copyFor()', () => {
  it('returns the clinical string for the clinical skin', () => {
    expect(copyFor('clinical', 'button.startSession')).toBe('Start session');
  });

  it('returns the override when the skin has one', () => {
    expect(copyFor('limelight', 'button.startSession')).toBe("LET'S GO BABES");
    expect(copyFor('board', 'button.startSession')).toBe('BOARD');
    expect(copyFor('board', 'advice.drinkToThirst')).toBe('REFRESHMENT: DRINK TO THIRST');
  });

  it('falls back to the default when the skin has no override', () => {
    // The board table has no row for the Atlas hero; the clinical noun stands.
    expect(copyFor('board', 'hero.atlas')).toBe(DEFAULT_COPY['hero.atlas']);
    expect(copyFor('limelight', 'hero.atlas')).toBe(DEFAULT_COPY['hero.atlas']);
  });
});

describe('the FORMAT frames reach a skin', () => {
  it('fills the limelight milestone template', () => {
    expect(FORMAT.milestoneSets('250', SKIN_COPY.limelight)).toBe(
      LIMELIGHT_COPY['status.milestoneSets']?.replace('{count}', '250'),
    );
  });

  it('fills every slot of a limelight coach line', () => {
    const rendered = FORMAT.withSlots(
      'coach.loadPr',
      { load: '60 kg', reps: 8 },
      SKIN_COPY.limelight,
    );
    expect(rendered).toContain('60 kg');
    expect(rendered).toContain('8');
    expect(rendered).not.toContain('{');
  });

  it('reads the session cursor from the table, so a skin reaches the indicator', () => {
    expect(FORMAT.planPositionLabel(12, 48, '')).toBe('Session 12 of 48');
    expect(FORMAT.planPositionLabel(12, 48, '', SKIN_COPY.limelight)).toBe('ep. 12 of 48');
  });
});

/**
 * The thirteen frames P8 Task 16 moved off a template literal and onto a copy key.
 *
 * The check is parity, not plausibility: each expectation quotes the exact literal the frame
 * held before the conversion, so a table edit that changes what the clinical skin renders fails
 * here rather than in a screenshot. The en dash in `blockSessions` and the U+2212 MINUS SIGN in
 * `deloadNote` are part of that literal and are compared as written.
 */
describe('the converted frames render the clinical string they replaced', () => {
  it('renders each default byte for byte', () => {
    expect(FORMAT.nextSession('Wed', '07:00', 'Push')).toBe('Next: Wed 07:00 Push.');
    expect(FORMAT.pausedSince('2026-09-07')).toBe('Plan paused since 2026-09-07.');
    expect(FORMAT.skipReason('illness')).toBe('Reason: illness');
    expect(FORMAT.trainLabelToday('Legs')).toBe('Train Legs today');
    expect(FORMAT.blockLabel(2)).toBe('Block 2');
    expect(FORMAT.blockSessions(4, 6)).toBe('sessions 4\u20136');
    expect(FORMAT.deloadNote(50)).toBe('volume \u2212' + '50 %, load unchanged');
    expect(FORMAT.weekOfCount(1, 2)).toBe('Week 1 of 2');
    expect(FORMAT.videoInstanceOf(2, 6)).toBe('instance 2 of 6');
    expect(FORMAT.complianceWeek('2026-01-05', 2, 3)).toBe('Week of 2026-01-05: 2 of 3 completed');
    expect(FORMAT.estimated1RM('99 kg')).toBe('99 kg estimated 1RM');
    expect(FORMAT.amrapBest('Push-up', 15)).toBe('Push-up: best 15 reps in one set');
    expect(FORMAT.weekMissed('2026-08-24', 1, 4)).toBe(
      'Week of 2026-08-24: 1 of 4 sessions completed.',
    );
    expect(FORMAT.weekMissed('2026-08-24', 0, 4)).toBe('Week of 2026-08-24: no sessions completed.');
  });

  it('leaves no slot standing in any of them', () => {
    const rendered = [
      FORMAT.nextSession('Wed', '07:00', 'Push'),
      FORMAT.pausedSince('2026-09-07'),
      FORMAT.skipReason('illness'),
      FORMAT.trainLabelToday('Legs'),
      FORMAT.blockLabel(2),
      FORMAT.blockSessions(4, 6),
      FORMAT.deloadNote(50),
      FORMAT.weekOfCount(1, 2),
      FORMAT.videoInstanceOf(2, 6),
      FORMAT.complianceWeek('2026-01-05', 2, 3),
      FORMAT.estimated1RM('99 kg'),
      FORMAT.amrapBest('Push-up', 15),
      FORMAT.weekMissed('2026-08-24', 1, 4),
      FORMAT.weekMissed('2026-08-24', 0, 4),
    ];
    for (const value of rendered) {
      expect({ value, slot: /\{[a-zA-Z]+\}/.test(value) }).toEqual({ value, slot: false });
    }
  });

  it('takes an overlay table, so a skin reaches the words beside the numbers', () => {
    // A literal overlay, not a shipped skin: the point is that the frame reads the key, and a
    // row the limelight table does not carry today would make this assertion vacuous.
    const overlay: Partial<Record<CopyKey, string>> = {
      'label.block': 'act {number}',
      'status.blockSessions': 'shows {from}\u2013{to}',
      'status.amrapBest': '{name}: {reps} reps, top of the run',
      'advice.weekMissed': 'week of {monday}: {completed} of {target}. flop era.',
    };
    expect(FORMAT.blockLabel(2, overlay)).toBe('act 2');
    expect(FORMAT.blockSessions(4, 6, overlay)).toBe('shows 4\u20136');
    expect(FORMAT.amrapBest('Push-up', 15, overlay)).toBe('Push-up: 15 reps, top of the run');
    expect(FORMAT.weekMissed('2026-08-24', 1, 4, overlay)).toBe(
      'week of 2026-08-24: 1 of 4. flop era.',
    );
  });

  it('never expands a replacement pattern found in a value', () => {
    // The `$&` guard the frames record: a plan label the user typed is inserted verbatim.
    expect(FORMAT.trainLabelToday('$& Legs')).toBe('Train $& Legs today');
    expect(FORMAT.skipReason('$`illness')).toBe('Reason: $`illness');
  });
});

/**
 * What this file does not check.
 *
 * R7 (no hedging, no filler) and R11 (name the defined quantity) are judgements about meaning, not
 * properties of a string, and a regular expression that pretended otherwise would pass bad copy
 * and fail good copy. They stay with review. The same holds for the round-three tone rule, "the
 * joke is about the app, or about the week, never about the user": nothing in a string says who it
 * points at.
 */

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
 * docs/design/2026-09-01-copy-contract.md states R1 to R13 in prose and says "test assertions quote
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
  // 'S' WAS HERE, and it was the loophole that let the board write "+30 S DELAY" past the word
  // count: `S` is the siemens, and this app measures no conductance. A capital S counts as a
  // word now, so a table that shouts a unit symbol is charged for it (P8 review).
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
 * The unit SYMBOLS a string may carry, as whole tokens.
 *
 * A subset of UNIT_TOKENS: the members whose CASE and whose separating space are part of the
 * symbol rather than typography. `s` is the second and `S` is the siemens (SI brochure, 9th
 * edition, table 4), and 5.4.3 puts a space between the numerical value and the symbol, so
 * "+30s" is not an SI quantity at all and "+30 S" is a different one. `%` and `\u00d7` are in
 * UNIT_TOKENS but not here: they are signs with no case to get wrong.
 *
 * The list is the P8 review's, extended the first time a table carries another symbol.
 */
const UNIT_SYMBOLS: readonly string[] = [
  's',
  'kg',
  'lb',
  'mL',
  'min',
  // Added in P9 (review item G14). Each is already a UNIT_TOKEN and each is case-bearing in the
  // same way: `g` is the gram and `G` is nothing this app measures, `kcal` is not `KCAL`, `MiB`
  // is the binary prefix `Mi` on the byte and `MB` is a different quantity, and `ms`, `mm`, `cm`
  // are the milli- and centi- prefixes, which are lower case in the SI brochure whatever the
  // surrounding register shouts.
  'g',
  'kcal',
  'MiB',
  'cm',
  'mm',
  'ms',
];

/**
 * A value with its unit symbols removed, for the CASE rules.
 *
 * A register is a property of words. `+30 s DELAY` shouts every word it has and still writes
 * the second in lower case, because the case of a symbol is the symbol. Slots go first, for the
 * reason `withoutSlots` gives.
 */
function withoutUnits(value: string): string {
  return withoutSlots(value)
    .split(/\s+/)
    .filter((token) => !UNIT_SYMBOLS.includes(token))
    .join(' ');
}

/** The unit symbols a string carries, as a sorted list. `+30 s` yields ["s"], `+30s` yields []. */
function unitSymbolsOf(value: string): readonly string[] {
  return withoutSlots(value)
    .split(/\s+/)
    .map((token) => token.replace(/[.,:;!?()"'\u2019]/g, ''))
    .filter((token) => UNIT_SYMBOLS.includes(token))
    .sort();
}

/**
 * R10 and R9 exemptions, key by key, each with the position that earns it.
 *
 * R10 exempts form cues, exercise notes and tips, Atlas card bodies and citations; none of those
 * live in this table (they are `src/content/formCues.ts` and `src/content/specimenCards.ts`, and,
 * as of Brief G, `src/content/activityLevels.ts` for the "Where These Levels Come From" modal).
 * What does live here is R9's other exemption: "text inside a disclosure is exempt from R1-R4".
 * A key earns a place below only by being rendered inside a `<details>`, and the call site is
 * named so the exemption can be revoked when the call site changes.
 *
 * Brief G's two new keys, `advice.activityLevelsSource` (5 words) and `label.activityLevelsSource`
 * (`label.` carries no R1-R4 length cap at all), need no entry here: neither is rendered inside a
 * `<details>`, and both comply with their own family's cap unaided, so an exemption would be
 * simply wrong rather than merely unnecessary.
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

/**
 * The controls that close something FOR GOOD, and the words that would promise otherwise.
 *
 * `button.dismiss` is the only control on the missed-week popup, and pressing it writes
 * `missHandled` for that week (src/ui/motivation/MotivationModal.tsx): the screen does not come
 * back. "not now", "later", "soon" and "next" all state a postponement, so an override built
 * from one of them tells the user the wrong thing about their own record -- which is a control
 * semantic, not a register, and master plan section 3 puts that outside what a skin may change.
 *
 * `button.close` has no CopyKey yet. It is listed so the guard is already standing the day one
 * is added, which is why the list is `string[]` and the lookup is by string.
 */
const NO_RETURN_PROMISE_KEYS: readonly string[] = [
  'button.dismiss',
  'button.cancel',
  'button.close',
];
const RETURN_PROMISE_WORDS = /\b(now|later|soon|next)\b/i;

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

  it('carries the unit symbol the default carries, verbatim', () => {
    /*
     * The companion to the numbers rule above, and the same clause of master plan section 3: a
     * skin may put a word beside a quantity and may not restate the quantity. A UNIT is half of
     * one. Dropping the space ("+30s") or shouting the symbol with the sentence ("+30 S DELAY")
     * changes what the control claims to do -- thirty siemens is not thirty seconds -- and the
     * word-count rule cannot catch it, because a unit token is excluded from the count.
     *
     * Gated on the DEFAULT carrying a symbol, not on the override: a skin is free to write a
     * sentence that names no quantity, and every row that names one must name it the same way.
     */
    for (const [name, table] of OVERRIDE_TABLES) {
      for (const [key, value] of entriesOf(table)) {
        const units = unitSymbolsOf(DEFAULT_COPY[key]);
        if (units.length === 0) continue;
        expect({ name, key, units: unitSymbolsOf(value) }).toEqual({ name, key, units });
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

  it('never promises a return on a control that closes for good', () => {
    for (const [name, table] of OVERRIDE_TABLES) {
      for (const key of NO_RETURN_PROMISE_KEYS) {
        // By string, not by CopyKey: the list names one key the union does not have yet.
        const value = (table as Readonly<Record<string, string | undefined>>)[key];
        if (value === undefined) continue;
        expect({ name, key, promise: RETURN_PROMISE_WORDS.test(value) }).toEqual({
          name,
          key,
          promise: false,
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

  it('carries the two Train rows the close-out converted, keeping every quantity name', () => {
    /*
     * P8 close-out B: the drink control and the shortfall line were template literals in
     * copy.ts, so they were clinical under every skin. These two rows are the limelight words
     * for them, and they obey rule 1 of copy.limelight.ts exactly: the VOLUMES are slots the
     * domain filled, the quantity name "beverage intake" is the one the contract fixes (R11),
     * and only the verb and the tag are the skin's.
     */
    expect(LIMELIGHT_COPY['button.logVolume']).toBe('hydrate {volume}');
    expect(LIMELIGHT_COPY['advice.beverageShortfall']).toBe(
      'beverage intake {logged} of {target} today. top it up.',
    );
  });

  it('carries the three Train frames the mockup gives a voice, and no more', () => {
    /*
     * P8 close-out D wired the nine converted frames to the overlay at their call sites, which
     * made a row here reachable for the first time. Three of the seven candidates earned one,
     * each traced to a position the limelight mockup actually draws
     * (docs/design/round3/2026-09-01-design-I-limelight.html):
     *
     *   status.sessionEyebrow   the train system bar, "upper . ep. 12", and the today sub-line
     *   status.setCounter       the ticker item, "set 3 of 3 . bench"
     *   status.lastSessionSets  no mockup row; this table's own word for a session, which
     *                           `nav.train`, `hero.sessionInProgress` and `status.bootSchedule`
     *                           already set.
     *
     * The four that stay clinical are asserted below, so a later row cannot be added without
     * answering the reason recorded against it.
     */
    expect(LIMELIGHT_COPY['status.sessionEyebrow']).toBe('ep. {ordinal}, {label}');
    expect(LIMELIGHT_COPY['status.setCounter']).toBe('set {n} of {targetSets}');
    expect(LIMELIGHT_COPY['status.lastSessionSets']).toBe(
      'last show {date}: {load} \u00d7 {reps}',
    );
  });

  it('leaves the four Train frames with nothing to say in the clinical words', () => {
    /*
     * Each absence is a decision, not an omission.
     *
     * `status.setsBy`      the mockup's own exercise card renders "3 x 6-8", which IS the
     *                      clinical string: two numbers and the multiplication sign, with no
     *                      word for a skin to change.
     * `status.restRemaining` the mockup renders "1:47". The string is two slots and a colon, so
     *                      a row would carry no word at all.
     * `label.suggestedLoad` the mockup's line is "140 lb. up 5.", which rewrites the ADVICE
     *                      KIND and invents an increment. `{kind}` arrives already resolved
     *                      from `status.advice*`, which this table does not carry, and nothing
     *                      computes the step as a value, so shipping the mockup's sentence
     *                      would mean a skin inventing a number. Section 8, adopted item 2 of
     *                      the round-three plan refused a plate breakdown for that same reason.
     * `why.fluidLoss`      round three, section 3.3: the title may be camp, the body may not.
     *                      Every word left in it is a defined quantity or the citation.
     */
    for (const key of [
      'status.setsBy',
      'status.restRemaining',
      'label.suggestedLoad',
      'why.fluidLoss',
    ] as const) {
      expect({ key, row: LIMELIGHT_COPY[key] }).toEqual({ key, row: undefined });
    }
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
    //
    // THREE OF SECTION 3.4'S ROWS ARE ABSENT, and their absence is a decision rather than a gap:
    // `status.prReached`, `status.planProgress` and `toast.setDeleted` shipped a limelight row
    // and, for the first two, a board row, and no component ever read any of them. P9 Task 16
    // retired all three from every table. The words survive where the app actually says them:
    // `status.prStamp` is the record, and `coach.setDeleted` is the toast the UI queues.
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
      'hero.weeklyTargetMissed',
      'status.sessionCursor',
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
      // the missed-week screen. `button.play` was on this list and is gone: no control ever
      // rendered it (the clip autoplays muted, which is the only autoplay an engine allows), so
      // P8 close-out B retired the key rather than keep a required row for a screen that has no
      // such button.
      'button.dismiss',
      'label.settingsSounds',
    ];
    const missing = REQUIRED.filter((key) => LIMELIGHT_COPY[key] === undefined);
    expect(missing).toEqual([]);
  });
});

describe('the board table', () => {
  it('is upper case throughout, because a split-flap board has no lower case', () => {
    // Through withoutUnits, not withoutSlots alone: the register binds the WORDS.
    // `button.extendRest` reads "+30 s DELAY", and shouting the `s` into an `S` would rename the
    // quantity the control changes rather than restyle the sentence (P8 review).
    for (const [key, value] of entriesOf(BOARD_COPY)) {
      expect({ key, upper: withoutUnits(value) === withoutUnits(value).toUpperCase() }).toEqual({
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

  /**
   * The nine frames P8 close-out B moved off a template literal and onto a copy key.
   *
   * Same check as the thirteen above, and the same reason: each expectation quotes the exact
   * literal the frame held before the conversion, so a table edit that changes what the clinical
   * skin renders fails here rather than on a screen. `setsBy` and `lastSessionSets` carry the
   * MULTIPLICATION SIGN U+00D7 and `restRemaining` carries a zero-padded seconds field; both are
   * part of the literal and are compared as written.
   */
  it('renders each of the nine close-out frames byte for byte', () => {
    expect(FORMAT.setsBy('3\u20134', '6\u201310 reps')).toBe('3\u20134 \u00d7 6\u201310 reps');
    expect(FORMAT.sessionEyebrow(1, 'Upper')).toBe('SESSION 1, Upper');
    expect(FORMAT.setCounter(2, 3)).toBe('SET 2/3');
    expect(FORMAT.lastSessionSets('2026-02-27', '60 kg', '8, 8, 8')).toBe(
      'Last session 2026-02-27: 60 kg \u00d7 8, 8, 8',
    );
    expect(FORMAT.suggestedLoad('62.5 kg', 'add load')).toBe('Suggested 62.5 kg: add load');
    expect(FORMAT.restRemaining(2, 0)).toBe('2:00');
    expect(FORMAT.restRemaining(0, 5)).toBe('0:05');
    expect(FORMAT.logVolume('250 mL')).toBe('Log 250 mL');
    expect(FORMAT.beverageShortfall('900 mL', '2600 mL')).toBe(
      'Beverage intake 900 mL of 2600 mL today.',
    );
    expect(FORMAT.fluidLossWhy('2.4', 2)).toBe(
      'Loss of 2.4 % of pre-session mass, above the 2 % threshold (ACSM 2007).',
    );
  });

  it('leaves no slot standing in any of the nine', () => {
    const rendered = [
      FORMAT.setsBy('3', '8 reps'),
      FORMAT.sessionEyebrow(1, 'Upper'),
      FORMAT.setCounter(2, 3),
      FORMAT.lastSessionSets('2026-02-27', '60 kg', '8'),
      FORMAT.suggestedLoad('60 kg', 'hold'),
      FORMAT.restRemaining(1, 30),
      FORMAT.logVolume('250 mL'),
      FORMAT.beverageShortfall('900 mL', '2600 mL'),
      FORMAT.fluidLossWhy('2.4', 2),
    ];
    for (const value of rendered) {
      expect({ value, slot: /\{[a-zA-Z]+\}/.test(value) }).toEqual({ value, slot: false });
    }
  });

  it('lets an overlay reach all nine, which is the point of the conversion', () => {
    // A literal overlay, not a shipped skin, for the reason the thirteen's own overlay test
    // gives: a row limelight does not carry today would make the assertion vacuous.
    const overlay: Partial<Record<CopyKey, string>> = {
      'status.setsBy': '{sets} by {prescription}',
      'status.sessionEyebrow': 'ep. {ordinal}, {label}',
      'status.setCounter': 'take {n} of {targetSets}',
      'status.lastSessionSets': 'last time {date}: {load} for {reps}',
      'label.suggestedLoad': 'try {load}: {kind}',
      'status.restRemaining': '{minutes} m {seconds}',
      'button.logVolume': 'sip {volume}',
      'advice.beverageShortfall': '{logged} of {target} today. keep going.',
      'why.fluidLoss': 'down {loss} % of pre-session mass, over the {threshold} % line.',
    };
    expect(FORMAT.setsBy('3', '8 reps', overlay)).toBe('3 by 8 reps');
    expect(FORMAT.sessionEyebrow(1, 'Upper', overlay)).toBe('ep. 1, Upper');
    expect(FORMAT.setCounter(2, 3, overlay)).toBe('take 2 of 3');
    expect(FORMAT.lastSessionSets('2026-02-27', '60 kg', '8', overlay)).toBe(
      'last time 2026-02-27: 60 kg for 8',
    );
    expect(FORMAT.suggestedLoad('60 kg', 'hold', overlay)).toBe('try 60 kg: hold');
    // The zero padding belongs to the frame, not to the table: a skin rewords a clock, it does
    // not decide how many digits a seconds field has.
    expect(FORMAT.restRemaining(1, 5, overlay)).toBe('1 m 05');
    expect(FORMAT.logVolume('250 mL', overlay)).toBe('sip 250 mL');
    expect(FORMAT.beverageShortfall('900 mL', '2600 mL', overlay)).toBe(
      '900 mL of 2600 mL today. keep going.',
    );
    expect(FORMAT.fluidLossWhy('2.4', 2, overlay)).toBe(
      'down 2.4 % of pre-session mass, over the 2 % line.',
    );
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

/*
 * THE P9 CALL-SITE GATE, MOVED OFF A SHELL GREP (whole-app review, item 3).
 *
 * The master plan's P9 row asks that `git grep` find a call site for every key in
 * `DEFAULT_COPY`. Run against `src` with `src/content/copy*.ts` excluded, that grep reports four
 * keys as uncalled which are not dead at all: `advice.bodyFatEstimate`, `advice.beverageDefault`,
 * `why.beverageDefault` and `why.deloadSets`. Each is a FORMATTED SPECIMEN row — the table holds
 * the finished sentence a template-literal frame in `copy.ts` builds, marked `// formatted` where
 * it is defined — so the thing that renders it lives in the one file the grep excludes. Retiring
 * them on the grep's word would delete the specimen that pins the frame's wording, and
 * `why.deloadSets` is the text a user reads behind the deload disclosure at PlanView.tsx:308.
 *
 * This test is that gate, with the frame path included, and it replaces the shell command rather
 * than supplementing it: it runs on every push, it reads the tree the app actually ships, and it
 * cannot be run with the wrong pathspec.
 *
 * HOW THE CORPUS IS BUILT, and what each half is worth.
 *
 *   The call-site half is every `.ts`/`.tsx` file under `src` except `copy.*` and except the
 *   suites, read as raw text through `import.meta.glob`. A key found there is read by code:
 *   `copy('key')`, `t('key')`, a `Record<..., CopyKey>` table, or a JSX prop
 *   (`copyKey="button.skipToday"`), which is why the search is over text and not over quoted
 *   literals alone. The suites are out because a key only a test names is dead by definition;
 *   excluding them costs nothing, measured both ways on 2026-09-02, and it halves the corpus.
 *
 *   The frame half is `copy.ts` itself with its DECLARATION REGION removed — the `CopyKey` union
 *   through the closing brace of `DEFAULT_COPY`. That cut is what makes the test mean anything:
 *   the union names every key by construction, so searching `copy.ts` whole would pass every key
 *   including a genuinely dead one. What is left is the frames, `copy`, `copyFor` and the skin
 *   map.
 *
 * WHAT A HIT IN THE FRAME HALF PROVES, AND WHAT IT DOES NOT. For most keys it is a call:
 * `copy('label.weekOfCount', overrides)` inside `FORMAT.weekOfCount`. For the four specimen rows
 * it is the key NAMED in the frame's doc comment, because the frame builds the sentence from a
 * template literal and never reads the key. A comment is a weaker link than a call, so the four
 * are pinned a second time below, byte for byte against the frame that renders them. That
 * assertion is the real gate for those rows; this one keeps them from being swept.
 */
describe('the call-site gate over DEFAULT_COPY', () => {
  /** Every non-suite `.ts`/`.tsx` under `src`, as raw text, keyed by its root-relative path. */
  const SOURCES: Record<string, string> = import.meta.glob(
    ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  );

  /** `src/content/copy.ts`, `copy.limelight.ts`, `copy.board.ts`: tables, never renderers. */
  const IS_COPY_TABLE = /\/copy\.[^/]*$/;
  /** Any suite. The glob already excludes these; this is what asserts that it still does. */
  const IS_TEST = /\.test\.tsx?$/;

  /** The four rows whose only link to a renderer is the frame's doc comment. */
  const SPECIMEN_ROWS = [
    'advice.bodyFatEstimate',
    'advice.beverageDefault',
    'why.beverageDefault',
    'why.deloadSets',
  ] as const;

  it('reads the tree it claims to read', () => {
    // A glob that resolved to nothing would make every assertion below vacuously true, so the
    // corpus is asserted before it is searched. 100 is a floor well under the count on
    // 2026-09-02 (131 files), not the count itself: this test is about the glob working.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(SOURCES['/src/content/copy.ts']).toContain('export const DEFAULT_COPY');
    expect(SOURCES['/src/ui/views/PlanView.tsx']).toContain('FORMAT.deloadSetsBasis');
  });

  it('finds a call site or a frame for every key', () => {
    const copySource = SOURCES['/src/content/copy.ts'];
    if (copySource === undefined) throw new Error('the glob did not reach src/content/copy.ts');

    // The declaration region: the union through the closing brace of the table. Both markers are
    // asserted rather than assumed, so a rename that moved them fails here instead of silently
    // leaving the union in the corpus and passing every key.
    const unionStart = copySource.indexOf('export type CopyKey');
    const tableStart = copySource.indexOf('export const DEFAULT_COPY');
    const tableEnd = copySource.indexOf('\n};\n', tableStart);
    // `indexOf` returns -1 for a marker that moved, and -1 would slice the region from the wrong
    // end and leave the union in the corpus. Ordered, so a rename fails here and not silently.
    expect(unionStart).toBeGreaterThanOrEqual(0);
    expect(unionStart).toBeLessThan(tableStart);
    expect(tableStart).toBeLessThan(tableEnd);

    const frames = copySource.slice(0, unionStart) + copySource.slice(tableEnd + '\n};\n'.length);
    // The cut worked only if the union is gone. `'shell.status.loading'` is the first member and
    // is read nowhere else in this file's remainder.
    expect(frames).not.toContain("| 'shell.status.loading'");

    const callSites = Object.entries(SOURCES)
      .filter(([path]) => !IS_COPY_TABLE.test(path))
      .map(([, text]) => text)
      .join('\n');

    const uncalled = Object.keys(DEFAULT_COPY).filter(
      (key) => !callSites.includes(key) && !frames.includes(key),
    );
    expect(uncalled).toEqual([]);
  });

  it('excludes the copy tables and the suites, or the gate would pass on itself', () => {
    // The three tables are in the corpus and are filtered out by name, asserted here rather than
    // trusted to a regular expression nobody reads: a hit in `copy.limelight.ts` or
    // `copy.board.ts` says only that a skin has a row, not that anything renders it.
    const tables = Object.keys(SOURCES).filter((path) => IS_COPY_TABLE.test(path));
    expect(tables.sort()).toEqual([
      '/src/content/copy.board.ts',
      '/src/content/copy.limelight.ts',
      '/src/content/copy.ts',
    ]);

    // The suites are excluded by the glob's own negative pattern, so nothing here has to filter
    // them; this asserts the pattern still bites. `copy.test.ts` would be absent even without
    // it: Vite omits the importing module from its own `import.meta.glob` (measured 2026-09-02,
    // the same glob from a second file in this directory does list copy.test.ts).
    expect(Object.keys(SOURCES).filter((path) => IS_TEST.test(path))).toEqual([]);
    expect(Object.keys(SOURCES)).not.toContain('/src/content/copy.test.ts');
  });

  it('pins each specimen row to the frame that renders it, byte for byte', () => {
    // What the doc-comment hit above stands in for. A specimen row is the table's copy of a
    // sentence a template literal builds, so the two can drift silently; these four assertions
    // are what stops that. The arguments are the values the shipped row was formatted from:
    // 21.9 % and its 3.52-point standard error, the 0.5 set modifier of a deload block, and the
    // IOM beverage shares of 3000 and 2200 mL/day.
    expect(FORMAT.bodyFatEstimate(21.9, 3.52)).toBe(DEFAULT_COPY['advice.bodyFatEstimate']);
    expect(FORMAT.deloadSetsBasis(0.5)).toBe(DEFAULT_COPY['why.deloadSets']);
    expect(FORMAT.beverageDefault('3000 mL')).toBe(DEFAULT_COPY['advice.beverageDefault']);
    expect(FORMAT.beverageBasis(3000, 2200)).toBe(DEFAULT_COPY['why.beverageDefault']);
  });

  it('shows the four really do depend on the frame path', () => {
    // Without this the gate could keep passing after someone gave the four rows an ordinary
    // call site, and the frame half would be carrying nothing. Each of the four is absent from
    // every production file and present in the frame region: that is the claim the gate's
    // second half exists for, stated as an assertion rather than as a comment.
    const callSites = Object.entries(SOURCES)
      .filter(([path]) => !IS_COPY_TABLE.test(path))
      .map(([, text]) => text)
      .join('\n');
    const copySource = SOURCES['/src/content/copy.ts'];
    if (copySource === undefined) throw new Error('the glob did not reach src/content/copy.ts');
    const tableEnd = copySource.indexOf('\n};\n', copySource.indexOf('export const DEFAULT_COPY'));
    const frames =
      copySource.slice(0, copySource.indexOf('export type CopyKey')) +
      copySource.slice(tableEnd + '\n};\n'.length);

    for (const key of SPECIMEN_ROWS) {
      expect({ key, inCode: callSites.includes(key), inFrames: frames.includes(key) }).toEqual({
        key,
        inCode: false,
        inFrames: true,
      });
      expect(DEFAULT_COPY[key]).toBeTypeOf('string');
    }
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

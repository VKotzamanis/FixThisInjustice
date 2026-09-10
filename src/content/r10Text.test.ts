/**
 * THE R10 LOCK, AND THE THING IT HAS TO KEEP BEING TRUE ABOUT.
 *
 * The rule under test is "a module that CITES something is not editable", replacing "R10 is not
 * editable". The risk the rule introduces is obvious and it is the one this file is aimed at: a
 * module that stops citing in the registry's opinion but starts citing in fact.
 *
 * So the assertions here are deliberately not "introSlides is editable" alone, which would pass
 * for as long as nobody edited introSlides. They are:
 *
 *   1. the DERIVATION fires, proved by running it over content that carries a DOI;
 *   2. the SOURCE of every module the registry reports editable carries no DOI, which catches one
 *      written into a comment where the value scan cannot see it;
 *   3. every field reported editable can actually be located by the applier, so a module cannot be
 *      declared editable while half its rows are un-appliable concatenations.
 */
import { describe, expect, it } from 'vitest';
import {
  DOI_PATTERN,
  R10_FIELDS,
  R10_MODULES,
  checkR10Value,
  derivedLock,
  evidenceIn,
  r10Field,
  r10FieldForValue,
  r10Lock,
  r10ValueCollisions,
} from './r10Text';
import type { R10Field } from './r10Text';

/** Every module source, so the gate can be checked against the file and not only the values. */
const SOURCES: Record<string, string> = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function sourceOf(file: string): string {
  const name = `./${file.slice('src/content/'.length)}`;
  const body = SOURCES[name];
  if (body === undefined) throw new Error(`no source loaded for ${file}`);
  return body;
}

describe('the registry', () => {
  it('walks every module and finds its strings without a hand-written field list', () => {
    expect(R10_MODULES).toHaveLength(11);
    for (const module of R10_MODULES) {
      expect(module.fields.length).toBeGreaterThan(0);
      expect(module.file).toBe(`src/content/${module.id}.ts`);
    }
  });

  it('skips the ASCII figure, because a one-line contenteditable would flatten it', () => {
    // INTRO_FIGURE is four lines by seven columns. A string with a newline is not prose.
    expect(R10_FIELDS.some((field) => field.path === 'INTRO_FIGURE')).toBe(false);
    expect(R10_FIELDS.some((field) => field.value.includes('\n'))).toBe(false);
  });

  it('derives a heading from the path, so R14 binds a heading and not a paragraph', () => {
    expect(r10Field('introSlides:INTRO_SLIDES.1.heading')?.kind).toBe('heading');
    expect(r10Field('introSlides:INTRO_SLIDES.1.lead')?.kind).toBe('prose');
    expect(r10Field('introSlides:INTRO_DISCLAIMER_HEADING')?.kind).toBe('heading');
  });
});

describe('the lock', () => {
  it('leaves introSlides editable: it is the owner’s own prose and cites nothing', () => {
    const intro = R10_MODULES.find((module) => module.id === 'introSlides');
    expect(intro?.lock).toBeNull();
    expect(r10Lock('introSlides:INTRO_SLIDES.1.heading')).toBeNull();
  });

  it('locks guidanceReferences, and the reason names what it carries', () => {
    const references = R10_MODULES.find((module) => module.id === 'guidanceReferences');
    expect(references?.lock).not.toBeNull();
    expect(references?.lock).toMatch(/DOI/);
  });

  it('locks every module that is not introSlides', () => {
    const editable = R10_MODULES.filter((module) => module.lock === null).map((module) => module.id);
    expect(editable).toEqual(['introSlides']);
  });

  /*
   * THE GATE ITSELF, exercised against content this file supplies rather than against today's
   * modules. This is the assertion the brief asked for: adding a citation to a currently editable
   * module locks it, with nobody editing a list to make that happen.
   */
  it('fires when a DOI appears in a module that had none', () => {
    const intro = R10_MODULES.find((module) => module.id === 'introSlides');
    expect(intro).toBeDefined();
    const clean = intro?.fields ?? [];
    expect(derivedLock('src/content/introSlides.ts', clean)).toBeNull();

    const withCitation: readonly R10Field[] = [
      ...clean,
      {
        module: 'introSlides',
        path: 'INTRO_SLIDES.1.bullets.0.rest',
        id: 'introSlides:INTRO_SLIDES.1.bullets.0.rest',
        kind: 'prose',
        value: 'and the evidence for that is Schoenfeld et al., 10.1519/JSC.0000000000002200.',
      },
    ];
    const locked = derivedLock('src/content/introSlides.ts', withCitation);
    expect(locked).not.toBeNull();
    expect(locked).toMatch(/a DOI/);
    expect(locked).toMatch(/INTRO_SLIDES\.1\.bullets\.0\.rest/);
  });

  it('fires on a dose, a URL and an author list, not on a DOI alone', () => {
    // supplementGuidance.ts carries NO DOI and is the most dangerous module in the set. A gate
    // that read only for `10.` would have handed its EFSA caffeine limits to a WYSIWYG.
    expect(DOI_PATTERN.test(sourceOf('src/content/supplementGuidance.ts'))).toBe(false);
    expect(evidenceIn('a safe single dose for healthy adults at 200 mg')).toBe('a number with a unit');
    expect(evidenceIn('roughly 0.4 g per kg of body mass')).toBe('a decimal number');
    expect(evidenceIn('14.8 per cent held undeclared anabolic steroids')).toBe('a decimal number');
    expect(evidenceIn('Schoenfeld et al. found the same')).toBe('an author list');
    expect(evidenceIn('https://example.org/paper')).toBe('a URL');
    expect(evidenceIn('See reference 11.')).toBe('a reference number');
  });

  it('does not fire on the intro’s own digits, which are a year and a price', () => {
    expect(evidenceIn('and not someone who has actively pursued bodybuilding since 2020.')).toBeNull();
    expect(evidenceIn('most people I know cannot spend 150 dollars a session')).toBeNull();
  });
});

describe('the merge gate over the source, which the value scan cannot see', () => {
  it('finds no DOI in the source of any module the registry reports editable', () => {
    for (const module of R10_MODULES) {
      if (module.lock !== null) continue;
      const source = sourceOf(module.file);
      const doi = DOI_PATTERN.exec(source);
      expect(
        doi === null ? null : `${module.file} carries ${doi[0]} and must not be editable`,
      ).toBeNull();
    }
  });

  /*
   * THE APPLIER'S OWN RULE, checked here so it is not first met at export time. A value the source
   * builds by joining two literals across two lines cannot be replaced in place, and
   * scripts/design-patch.mjs refuses it. A module declared editable whose rows fail this would
   * hand the owner an afternoon of edits that no one can apply.
   */
  it('can locate every editable field as exactly one single-line literal', () => {
    const unlocatable: string[] = [];
    for (const module of R10_MODULES) {
      if (module.lock !== null) continue;
      const source = sourceOf(module.file);
      for (const field of module.fields) {
        const single = `'${field.value.replace(/\\/g, '\\\\')}'`;
        const double = `"${field.value.replace(/\\/g, '\\\\')}"`;
        const hits =
          source.split(single).length - 1 + (single === double ? 0 : source.split(double).length - 1);
        if (hits !== 1) unlocatable.push(`${field.id} appears ${String(hits)} times`);
      }
    }
    expect(unlocatable).toEqual([]);
  });
});

describe('the value index', () => {
  it('finds a field from the exact text an element renders', () => {
    const lead = r10Field('introSlides:INTRO_SLIDES.2.lead');
    expect(lead).toBeDefined();
    expect(r10FieldForValue(lead?.value ?? '')?.id).toBe('introSlides:INTRO_SLIDES.2.lead');
  });

  it('matches the whole string only, never a substring of it', () => {
    const lead = r10Field('introSlides:INTRO_SLIDES.2.lead');
    expect(r10FieldForValue(`${lead?.value ?? ''} and more`)).toBeUndefined();
    expect(r10FieldForValue((lead?.value ?? '').slice(0, 20))).toBeUndefined();
  });

  it('offers no field at all for a string two fields share', () => {
    // The objection copyMarkers.ts raised against value matching is answered by DROPPING the
    // collision rather than by hoping there is none. Two of the R10 modules quote the same
    // FAO/WHO/UNU sentence, and neither is offered because of it.
    expect(r10ValueCollisions()).toBeGreaterThan(0);
    const counts = new Map<string, number>();
    for (const field of R10_FIELDS) {
      counts.set(field.value, (counts.get(field.value) ?? 0) + 1);
    }
    for (const [value, count] of counts) {
      if (count > 1) expect(r10FieldForValue(value)).toBeUndefined();
    }
  });
});

describe('which contract rules bind long-form text', () => {
  it('does not apply a length cap, because that is what R10 exists to exempt', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen.';
    expect(checkR10Value('prose', long)).toEqual([]);
  });

  it('does not apply R8, which the contract scopes to the default copy table', () => {
    expect(checkR10Value('prose', 'Come to the gym with me!')).toEqual([]);
  });

  it('applies R5, R6 and the URL ban', () => {
    expect(checkR10Value('prose', 'a sentence — with an em dash').map((v) => v.rule)).toContain('R5');
    expect(checkR10Value('prose', 'a sentence with ☀ in it').map((v) => v.rule)).toContain('R6');
    expect(checkR10Value('prose', 'go to https://example.org').map((v) => v.rule)).toContain('URL');
  });

  it('applies R14 to a heading and not to a paragraph', () => {
    expect(checkR10Value('heading', 'who i am').map((v) => v.rule)).toContain('R14');
    expect(checkR10Value('prose', 'who i am today and yesterday')).toEqual([]);
  });

  it('flags an edit that would lock the module, as an error and not an advisory', () => {
    const found = checkR10Value('prose', 'as shown in 10.1519/JSC.0000000000002200');
    const evidence = found.find((violation) => violation.rule === 'EVIDENCE');
    expect(evidence?.severity).toBe('error');
    expect(evidence?.message).toMatch(/locks itself/);
  });

  it('reports R11 as an advisory, exactly as the copy tables do', () => {
    const found = checkR10Value('prose', 'track your weight over time');
    expect(found.find((violation) => violation.rule === 'R11')?.severity).toBe('advisory');
  });
});

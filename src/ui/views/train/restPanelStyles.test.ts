// src/ui/views/train/restPanelStyles.test.ts
//
// The rest sign's CSS guarantees (stylize survey item 3), asserted in train.css's own text for
// restGameStyles.test.ts's reason: jsdom runs no animation and evaluates no media query.
//
// WCAG 2.3.1 allows at most three flashes in any one second. The pulse here is held to the
// brief's tighter numbers: at most 3 pulses in all, at most 2 per second, then a steady fill.
import { describe, expect, it } from 'vitest';
import trainCss from '../../styles/train.css?raw';

const CSS = trainCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Innermost `selector { body }` pairs; an @media or @keyframes wrapper is dropped. */
function rulesOf(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: m[2] ?? '',
  }));
}

/** The text of the block opened by `at`, up to its matching closing brace. */
function blockAt(css: string, at: number): string {
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

function bodyOf(selector: string): string {
  const rule = rulesOf(CSS).find((r) => r.selector === selector);
  expect({ selector, found: rule !== undefined }).toEqual({ selector, found: true });
  return rule?.body ?? '';
}

const MS_PER_S = 1000; // [ms/s]
const MAX_PULSES = 3; // [pulses]
const MAX_PULSE_HZ = 2; // [1/s]

describe('rest sign styles (stylize survey item 3)', () => {
  it('runs on black: lime numerals and track, pink arc, white label', () => {
    expect(bodyOf('.rest-time')).toMatch(/color:\s*var\(--lime\)/);
    expect(bodyOf('.rest-ring-track')).toMatch(/stroke:\s*var\(--lime\)/);
    expect(bodyOf('.rest-ring-arc')).toMatch(/stroke:\s*var\(--pink\)/);
    expect(bodyOf('.rest-label')).toMatch(/color:\s*var\(--panel-text\)/);
  });

  it('holds a steady pink fill with ink type once the rest is over', () => {
    // The inverted panel reads --panel and --panel-text, so the over state re-points both:
    // ink on pink is 7.75:1 (tokens.css, round-three section 2.3).
    const body = bodyOf('.rest-summary.rest-over');
    expect(body).toMatch(/--panel:\s*var\(--pink\)/);
    expect(body).toMatch(/--panel-text:\s*var\(--ink\)/);
  });

  it('pulses at most 3 times, at no more than 2 per second, then stops', () => {
    const animation = /animation:\s*([\w-]+)\s+(\d+)ms\s+steps\(1,\s*end\)\s+(\d+)\s*;/.exec(
      bodyOf('.rest-summary.rest-over-pulse'),
    );
    expect(animation).not.toBeNull();
    const [, name = '', periodMs = '0', count = '0'] = animation ?? [];
    expect(Number(count)).toBeGreaterThan(0);
    expect(Number(count)).toBeLessThanOrEqual(MAX_PULSES);
    expect(MS_PER_S / Number(periodMs)).toBeLessThanOrEqual(MAX_PULSE_HZ); // [1/s]

    // One period is one pulse: a dark half, then a pink half, and the last stop is pink, so the
    // final iteration hands over to the steady fill without a step.
    const at = CSS.indexOf(`@keyframes ${name}`);
    expect(at).toBeGreaterThanOrEqual(0);
    const stops = rulesOf(blockAt(CSS, at));
    expect(stops.map((s) => s.selector.replace(/\s+/g, ''))).toEqual(['0%', '50%,100%']);
    expect(stops[0]?.body).toMatch(/background-color:\s*var\(--ink\)/);
    expect(stops[1]?.body).toMatch(/background-color:\s*var\(--pink\)/);
    expect(stops[1]?.body).toMatch(/color:\s*var\(--ink\)/);
  });

  it('does not pulse under prefers-reduced-motion', () => {
    const reduced = [...CSS.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g)]
      .map((m) => blockAt(CSS, m.index))
      .join('\n');
    const stopped = rulesOf(reduced)
      .filter((rule) => /animation:\s*none/.test(rule.body))
      .flatMap((rule) => rule.selector.split(',').map((s) => s.trim()));
    expect(stopped).toContain('.rest-summary.rest-over-pulse');
  });

  it('colours only through tokens', () => {
    const literal = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;
    const sign = rulesOf(CSS).filter((rule) => /\.rest-(summary|ring|time|label|controls|over)/.test(rule.selector));
    expect(sign.length).toBeGreaterThan(0);
    expect(sign.filter((rule) => literal.test(rule.body)).map((rule) => rule.selector)).toEqual([]);
  });
});

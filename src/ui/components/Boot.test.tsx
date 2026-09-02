// @vitest-environment jsdom
//
// The generic boot sequence (P8 Task 6).
//
// Two things are under test and they are separate concerns: `buildBootLines` is a pure
// function of the document, so it is asserted as strings; `Boot` is the timed print of those
// strings, so it is asserted through the clock. The gate that mounts the sequence once is a
// third component (`BootGate`) and is asserted through the store flag it reads.
//
// The banned-term regex is the same one src/content/specimenCards.test.ts and the CI job in
// .github/workflows/ci.yml apply. It is restated here rather than imported because the CI grep
// is the real gate and a shared constant would let a single edit lift both at once. Each needle
// is assembled from two halves at run time for the reason specimenCards.test.ts records: spelt
// out in full, this file would itself match the grep it exists to protect.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Boot, BootGate, BOOT_LINE_INTERVAL_MS, buildBootLines } from './Boot';
import { copy, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeAppState, makePlan, makeProfile, makeUiPrefs } from '../../test/funFixtures';
import type { AppState } from '../../domain/types';
import type { SkinId } from '../../domain/types';

const BANNED = new RegExp(
  ['vyvan' + 'se', 'lisdexamfetam' + 'ine', 'ym' + 'ca', 'amphetam' + 'ine'].join('|'),
  'i',
);
/** A mass or a body-fat figure: the legacy boot printed both and neither may come back. */
const BODY_COMPOSITION = /\bbf\b|body fat|lean mass|\d+(\.\d+)?\s?kg|\d+(\.\d+)?\s?lb/i;

/** The document every UI case here starts from: one profile, one plan, boot not yet seen. */
function unseenState(patch: Partial<AppState> = {}): AppState {
  return makeAppState({ ui: makeUiPrefs({ bootSeen: false }), ...patch });
}

function bootText(): string {
  return screen.getByTestId('boot-text').textContent ?? '';
}

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers();
  useAppStore.setState(unseenState());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('buildBootLines', () => {
  it('prints the plan name, the week and the weekly session count', () => {
    const lines = buildBootLines(unseenState());
    const text = lines.join('\n');
    expect(text).toContain('Upper / Lower x2'); // makePlan().name
    expect(text).toContain('week 1 of 12'); // nextSessionIndex 0, weeks 12
    expect(text).toContain('4 sessions per week'); // makePlan().sessionsPerWeek
    expect(lines[lines.length - 1]).toBe(copy('status.bootReady'));
  });

  it('reads the week from the cursor rather than the calendar', () => {
    const state = unseenState();
    const plan = makePlan();
    const lines = buildBootLines({
      ...state,
      // 4 sessions/week: the fifth session (index 4) is the first of week 2.
      cursors: { [makeProfile().id]: { planId: plan.id, nextSessionIndex: 4, startedOn: '2026-09-07', completedOn: null } },
    });
    expect(lines.join('\n')).toContain('week 2 of 12');
  });

  it('degrades to a two-line boot with no plan', () => {
    const lines = buildBootLines(unseenState({ activeProfileId: null, cursors: {}, plans: {} }));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(copy('status.bootReady'));
  });

  it('carries no name, no place, no body composition and no medication', () => {
    const text = buildBootLines(unseenState()).join('\n');
    expect(text).not.toContain(makeProfile().displayName);
    expect(text).not.toContain(makeProfile().timezone);
    expect(BANNED.test(text)).toBe(false);
    expect(BODY_COMPOSITION.test(text)).toBe(false);
  });
});

describe('Boot', () => {
  it('prints one line per interval', () => {
    render(<Boot />);
    expect(bootText()).toBe('');

    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(bootText().split('\n')).toHaveLength(1);
    expect(bootText()).toContain('FTI CONSOLE v3');

    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(bootText().split('\n')).toHaveLength(2);

    const total = buildBootLines(useAppStore.getState()).length;
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * total);
    });
    expect(bootText().split('\n')).toHaveLength(total);
    expect(bootText()).toContain(copy('status.bootReady'));
  });

  it('skips to the end on a tap and records the boot as seen', () => {
    render(<Boot />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.skipBoot') }));
    expect(bootText()).toContain(copy('status.bootReady'));
    expect(useAppStore.getState().ui.bootSeen).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips to the end on a key press', () => {
    render(<Boot />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(bootText()).toContain(copy('status.bootReady'));
    expect(useAppStore.getState().ui.bootSeen).toBe(true);
  });

  it('holds the last line for one interval before recording the boot as seen', () => {
    /*
     * READY. is the last line and it was on screen for one commit: the same effect that saw
     * `shown === lines.length` called finish(), which set `bootSeen`, which unmounts the whole
     * sequence through BootGate on the next render. The line the sequence exists to end on was
     * therefore never read.
     *
     * One BOOT_LINE_INTERVAL_MS, not a number of its own: the dwell is the same beat the rest of
     * the sequence prints at, which is what makes it read as the last step rather than as a
     * pause. The total cost is 90 ms on a sequence already under the 1 s "the app started"
     * threshold BOOT_LINE_INTERVAL_MS is chosen against.
     */
    const total = buildBootLines(useAppStore.getState()).length;
    render(<Boot />);
    expect(useAppStore.getState().ui.bootSeen).toBe(false);

    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * total);
    });
    // Every line is printed, READY. included, and the boot is NOT yet recorded.
    expect(bootText().split('\n')).toHaveLength(total);
    expect(bootText()).toContain(copy('status.bootReady'));
    expect(useAppStore.getState().ui.bootSeen).toBe(false);

    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(useAppStore.getState().ui.bootSeen).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders nothing on a later mount, once the boot has been seen', () => {
    useAppStore.setState({ ui: makeUiPrefs({ bootSeen: true }) });
    const { container } = render(<Boot />);
    expect(container.firstChild).toBeNull();
  });

  it('prints every line at once, with no timer, under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    const total = buildBootLines(useAppStore.getState()).length;
    render(<Boot />);
    expect(bootText().split('\n')).toHaveLength(total);
    expect(bootText()).toContain(copy('status.bootReady'));
    // No timer, the dwell included: with every line already printed at mount there is no last
    // line to hold, and a 90 ms hold would turn a screen this user never sees into a flash.
    expect(vi.getTimerCount()).toBe(0);
    expect(useAppStore.getState().ui.bootSeen).toBe(true);
  });

  it('leaves no timer behind when it is unmounted mid-sequence', () => {
    const { unmount } = render(<Boot />);
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * 2);
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0); // the remaining lines are pending
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows nothing the personal-data gate bans', () => {
    render(<Boot />);
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * 30);
    });
    expect(BANNED.test(bootText())).toBe(false);
    expect(BODY_COMPOSITION.test(bootText())).toBe(false);
  });
});

describe('BootGate', () => {
  it('mounts the sequence while the boot has not been seen', () => {
    render(<BootGate />);
    expect(screen.getByTestId('boot-text')).toBeInTheDocument();
  });

  it('unmounts the sequence as soon as it is recorded as seen', () => {
    const total = buildBootLines(useAppStore.getState()).length;
    render(<BootGate />);
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * total);
    });
    // Two advances, not one: the hold is scheduled by the effect that sees the last line
    // printed, so it does not exist until React has committed that render.
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(screen.queryByTestId('boot-text')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders nothing at all once the boot has been seen', () => {
    useAppStore.setState({ ui: makeUiPrefs({ bootSeen: true }) });
    const { container } = render(<BootGate />);
    expect(container.firstChild).toBeNull();
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('Boot under a skin', () => {
  it('prints the limelight console line, and the default one under clinical', () => {
    pinSkin('limelight');
    const view = render(<Boot />);
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(bootText()).toContain(copyFor('limelight', 'status.bootConsole'));
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.skipBoot') }),
    ).toBeInTheDocument();
    view.unmount();

    useAppStore.setState(unseenState());
    pinSkin('clinical');
    render(<Boot />);
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS);
    });
    expect(bootText()).toContain(copyFor('clinical', 'status.bootConsole'));
    expect(
      screen.getByRole('button', { name: copyFor('clinical', 'button.skipBoot') }),
    ).toBeInTheDocument();
  });
});

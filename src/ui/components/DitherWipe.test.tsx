// src/ui/components/DitherWipe.test.tsx
//
// The ordered-dither wipe (stylize survey item 10) and the three places allowed to mount it.
//
// jsdom has no 2D canvas, so getContext is replaced by a recording fake and what is asserted is
// the loop's life cycle - drawn, finished, stopped, removed - and the alpha of the frames it put,
// never pixels on a screen. vi.useFakeTimers() fakes requestAnimationFrame and performance.now()
// together (vitest 4 fakes every timer but nextTick and queueMicrotask), so the clock the loop
// reads and the frames it is handed agree.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DITHER_CELL_PX, DITHER_WIPE_MS, DitherWipe } from './DitherWipe';
import { BootGate, BOOT_LINE_INTERVAL_MS, buildBootLines } from './Boot';
import { PhaseTransition } from './PhaseTransition';
import { WeekStamp } from './WeekStamp';
import { SKIN_COPY, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { WeeklyReview } from '../../domain/types';

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../skins/sfx', () => ({ playSfx }));

/** [CSS px] The box the fake canvas reports: a 320 x 640 phone viewport. */
const BOX = { width: 320, height: 640 };
/** RGBA the fake reads back for `color: var(--pink)`. */
const PINK = [255, 95, 203, 255];

/** A closed block's statistics: [sessions], [sets], [kg], [cards]. */
const STATS = { sessionsCompleted: 20, setsLogged: 240, tonnageKg: 61_234, specimensOwned: 3 };

/** A closed week that met its target: delta = completed - target = 0 [sessions/week]. */
const MET: WeeklyReview = {
  profileId: 'p1',
  weekStart: '2026-08-24',
  weekEnd: '2026-08-30',
  target: 4, // [sessions/week]
  completed: 4, // [sessions]
  skipped: 0, // [sessions]
  paused: false,
  delta: 0, // [sessions/week]
  evaluatedAt: 1_756_684_800_000, // [ms] epoch, UTC
  missHandled: true,
};

interface Frame {
  data: Uint8ClampedArray;
}

/** Installs a 2D context that records every frame put, and a measurable box. */
function fakeCanvas(): { frames: Frame[]; getContext: ReturnType<typeof vi.fn> } {
  const frames: Frame[] = [];
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    getImageData: () => ({ data: Uint8ClampedArray.from(PINK) }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (frame: Frame) => {
      frames.push({ data: Uint8ClampedArray.from(frame.data) });
    },
  };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...BOX,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: BOX.width,
    bottom: BOX.height,
    toJSON: () => BOX,
  });
  return { frames, getContext };
}

/** The alpha bytes of a frame: 255 = still pink, 0 = cleared. */
function alphas(frame: Frame | undefined): number[] {
  return frame === undefined ? [] : [...frame.data].filter((_, i) => i % 4 === 3);
}

function reduceMotion(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

const wipe = (): HTMLElement | null => screen.queryByTestId('dither-wipe');

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers();
  playSfx.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'hidden');
});

describe('DitherWipe', () => {
  it('covers the viewport with an inert canvas drawn at one eighth of its CSS size', () => {
    const { frames } = fakeCanvas();
    render(<DitherWipe />);
    const canvas = wipe() as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    // Never an input target, not even while it runs.
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.style.position).toBe('fixed');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.width).toBe(BOX.width / DITHER_CELL_PX); // [cells] 40
    expect(canvas.height).toBe(BOX.height / DITHER_CELL_PX); // [cells] 80
    // The first frame is solid pink: every cell on, in the token's colour.
    expect(alphas(frames[0]).every((a) => a === 255)).toBe(true);
    expect([...(frames[0]?.data.slice(0, 3) ?? [])]).toEqual(PINK.slice(0, 3));
  });

  it('dithers away in about 600 ms, then removes the canvas and leaves no frame pending', () => {
    const { frames } = fakeCanvas();
    render(<DitherWipe />);
    act(() => {
      vi.advanceTimersByTime(DITHER_WIPE_MS / 2); // [ms]
    });
    expect(wipe()).not.toBeNull();
    const half = alphas(frames.at(-1));
    // Mid-wipe: part cleared, part still pink, on the Bayer pattern rather than a hard edge.
    expect(half.some((a) => a === 0)).toBe(true);
    expect(half.some((a) => a === 255)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(DITHER_WIPE_MS); // [ms] well past the end
    });
    expect(wipe()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the loop and removes the canvas the moment the page is hidden', () => {
    const { frames } = fakeCanvas();
    render(<DitherWipe />);
    act(() => {
      vi.advanceTimersByTime(100); // [ms]
    });
    setHidden(true);
    fireEvent(document, new Event('visibilitychange'));
    const drawn = frames.length;
    expect(wipe()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(DITHER_WIPE_MS); // [ms]
    });
    expect(frames).toHaveLength(drawn);
  });

  it('is skipped under prefers-reduced-motion: the instant cut, no canvas and no frame', () => {
    reduceMotion();
    const { getContext } = fakeCanvas();
    render(<DitherWipe />);
    expect(wipe()).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cuts instantly where the browser gives no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<DitherWipe />);
    expect(wipe()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/*
 * THREE PLACES AND NO OTHER (stylize survey item 10): boot to app, the cutscene opening, the
 * stamp landing. Read from the source tree, so a fourth call site fails here rather than in review.
 */
describe('DitherWipe: where it may appear', () => {
  const SOURCES: Record<string, string> = import.meta.glob(
    ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  );

  it('is mounted by Boot, PhaseTransition and WeekStamp only', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    const mounts = Object.entries(SOURCES)
      .filter(([, text]) => /<DitherWipe\b/.test(text))
      .map(([path]) => path)
      .sort();
    expect(mounts).toEqual([
      '/src/ui/components/Boot.tsx',
      '/src/ui/components/PhaseTransition.tsx',
      '/src/ui/components/WeekStamp.tsx',
    ]);
  });

  it('brings the app in through the wipe when the boot ends, and only then', () => {
    fakeCanvas();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ bootSeen: false }) }));
    const total = buildBootLines(useAppStore.getState(), SKIN_COPY.limelight).length;
    render(<BootGate />);
    expect(wipe()).toBeNull(); // not over the boot itself
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS * total);
    });
    act(() => {
      vi.advanceTimersByTime(BOOT_LINE_INTERVAL_MS); // the held last line
    });
    expect(screen.queryByTestId('boot-text')).toBeNull();
    expect(wipe()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(DITHER_WIPE_MS * 2);
    });
    expect(wipe()).toBeNull();
  });

  it('never runs on a mount whose boot was already seen', () => {
    fakeCanvas();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ bootSeen: true }) }));
    const { container } = render(<BootGate />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the cutscene through the wipe and has cleared before the first statistic shows', () => {
    const { frames } = fakeCanvas();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    render(
      <PhaseTransition fromIndex={0} toIndex={1} stats={STATS} units="metric" onClose={() => undefined} />,
    );
    expect(wipe()).not.toBeNull();
    const firstStat = copyFor('limelight', 'label.blockSessionsCompleted');
    // Advance frame by frame until the first statistic appears, then read the last frame put:
    // section 2.5 forbids covering a number, so nothing may still be pink when one shows.
    for (let t = 0; t < DITHER_WIPE_MS * 2 && screen.queryByText(firstStat) === null; t += 1) {
      act(() => {
        vi.advanceTimersByTime(1); // [ms]
      });
    }
    expect(screen.queryByText(firstStat)).not.toBeNull();
    expect(wipe() === null || alphas(frames.at(-1)).every((a) => a === 0)).toBe(true);
  });

  it('lands the stamp through the wipe over the mascot and the word, never over the counts', () => {
    fakeCanvas();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    const { container } = render(<WeekStamp review={MET} />);
    const canvas = wipe();
    expect(canvas).not.toBeNull();
    // Placed on the stamp's first two grid rows (the mascot and the word); the counts are row 3.
    expect(canvas?.style.position).toBe('absolute');
    expect(canvas?.style.gridRow).toBe('1 / 3');
    const inFlow = [...(container.querySelector('.ll-stamp')?.children ?? [])].filter(
      (child) => child !== canvas && !child.classList.contains('ll-stamp-fan'),
    );
    expect(inFlow[2]?.classList.contains('ll-stamp-line')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(DITHER_WIPE_MS * 2);
    });
    expect(wipe()).toBeNull();
  });

  it('is absent from all three places under reduced motion', () => {
    reduceMotion();
    const { getContext } = fakeCanvas();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ bootSeen: false, skin: 'limelight' }) }));
    render(<BootGate />);
    // Reduced motion prints the whole boot at mount and records it seen in the same pass.
    expect(screen.queryByTestId('boot-text')).toBeNull();
    render(
      <PhaseTransition fromIndex={0} toIndex={1} stats={STATS} units="metric" onClose={() => undefined} />,
    );
    render(<WeekStamp review={MET} />);
    expect(screen.getByTestId('week-stamp')).toBeInTheDocument();
    expect(wipe()).toBeNull();
    // The loop can only start after a context is taken, so no context means no frame was ever
    // scheduled. (The timer count is not asserted here: the boot's setUi write leaves the store's
    // own save timers pending, which are not this component's.)
    expect(getContext).not.toHaveBeenCalled();
  });
});

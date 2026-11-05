import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { BurnWord } from './BurnWord';
import { createBurn, type BurnHandle, type BurnOptions } from './burnText';

vi.mock('./burnText', () => ({ createBurn: vi.fn() }));

const create = vi.mocked(createBurn);

/** A handle whose burn the test ends; records dispose. */
function fakeHandle(): { handle: BurnHandle; end: () => void; dispose: ReturnType<typeof vi.fn> } {
  let end: () => void = () => undefined;
  const dispose = vi.fn();
  const handle: BurnHandle = {
    canvas: document.createElement('canvas'),
    running: false,
    burn: () =>
      new Promise<void>((resolve) => {
        end = resolve;
      }),
    dispose,
  };
  return { handle, end: () => end(), dispose };
}

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  create.mockReset();
  setReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BurnWord moments (AM-4a-9)', () => {
  it('burns once after its delay, then releases the canvas and shows the text', async () => {
    const f = fakeHandle();
    create.mockReturnValue(f.handle);
    const { container, rerender } = render(<BurnWord text="ate" delayMs={700} />);
    expect(create).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.burn-word.is-burning')).not.toBeNull();
    await act(async () => {
      f.end();
      await Promise.resolve();
    });
    expect(f.dispose).toHaveBeenCalled();
    expect(container.querySelector('.burn-word.is-burning')).toBeNull();
    rerender(<BurnWord text="ate" delayMs={700} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(create).toHaveBeenCalledTimes(1); // once per moment, not per render
  });

  it('keeps the word as its accessible text throughout', () => {
    create.mockReturnValue(fakeHandle().handle);
    render(<BurnWord text="mother" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText('mother')).toBeInTheDocument();
  });

  it('passes reduced motion to the renderer (one still frame, no frame loop)', () => {
    setReducedMotion(true);
    create.mockReturnValue(fakeHandle().handle);
    render(<BurnWord text="rest over" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const opts = create.mock.calls[0]?.[2] as BurnOptions | undefined;
    expect(opts?.reduced).toBe(true);
  });

  it('stays plain styled text when WebGL is unavailable', () => {
    create.mockReturnValue(null);
    const { container } = render(<BurnWord text="ate" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(container.querySelector('.burn-word.is-burning')).toBeNull();
    expect(screen.getByText('ate')).toBeInTheDocument();
  });

  it('never burns during set entry, and stops when a field takes focus', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    create.mockReturnValue(fakeHandle().handle);
    render(<BurnWord text="ate" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(create).not.toHaveBeenCalled();
    input.blur();

    const f = fakeHandle();
    create.mockReturnValue(f.handle);
    const { container } = render(<BurnWord text="locked in" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(create).toHaveBeenCalledTimes(1);
    act(() => {
      input.focus();
    });
    expect(f.dispose).toHaveBeenCalled();
    expect(container.querySelector('.burn-word.is-burning')).toBeNull();
    input.remove();
  });

  it('does not burn a stale moment', () => {
    create.mockReturnValue(fakeHandle().handle);
    render(<BurnWord text="rest over" burn={false} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(create).not.toHaveBeenCalled();
  });
});

// src/ui/components/KonamiOverlay.test.tsx
//
// The one easter egg, and the Rules-of-Hooks defect it exists to close.
//
// Code review A52 found `useKonamiCode` called behind an `if` in the legacy build, which made
// the hook count depend on a runtime condition and survived only because the script load order
// made that condition constant. The hook is called unconditionally by the shell now, so the
// test that matters is that it is inert until the sequence arrives.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { copy } from '../../content/copy';
import { KONAMI_OVERLAY_MS, KonamiOverlay, useKonamiCode } from './KonamiOverlay';

const CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

function Listener({ onActivate }: { onActivate: () => void }): ReactElement {
  useKonamiCode(onActivate);
  return <div />;
}

function press(keys: readonly string[]): void {
  for (const key of keys) fireEvent.keyDown(window, { key });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useKonamiCode', () => {
  it('stays silent through a partial sequence', () => {
    const activate = vi.fn();
    render(<Listener onActivate={activate} />);
    press(CODE.slice(0, CODE.length - 1));
    expect(activate).not.toHaveBeenCalled();
  });

  it('fires once on the full sequence', () => {
    const activate = vi.fn();
    render(<Listener onActivate={activate} />);
    press(CODE);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('reads the letters case-insensitively', () => {
    const activate = vi.fn();
    render(<Listener onActivate={activate} />);
    press([...CODE.slice(0, 8), 'B', 'A']);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('recovers from a false start rather than latching', () => {
    const activate = vi.fn();
    render(<Listener onActivate={activate} />);
    press(['ArrowUp', 'ArrowDown', 'x']);
    press(CODE);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('needs the whole sequence again for a second activation', () => {
    const activate = vi.fn();
    render(<Listener onActivate={activate} />);
    press(CODE);
    press(['a', 'a', 'a']);
    expect(activate).toHaveBeenCalledTimes(1);
    press(CODE);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('binds nothing once its component is gone', () => {
    const activate = vi.fn();
    const { unmount } = render(<Listener onActivate={activate} />);
    unmount();
    press(CODE);
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('KonamiOverlay', () => {
  it('is a modal dialog carrying its line from the copy table', () => {
    render(<KonamiOverlay onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(copy('status.konami'));
    expect(screen.getByText(copy('status.konami'))).toBeInTheDocument();
  });

  it('draws itself in ASCII and no emoji', () => {
    render(<KonamiOverlay onClose={() => {}} />);
    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    // Printable ASCII and whitespace only: the default skin admits no emoji (copy contract R6),
    // and the box is drawn with + - | rather than with box-drawing code points.
    expect(/^[\x20-\x7e\s]+$/.test(text)).toBe(true);
  });

  it('closes on any key, not only on a named one', () => {
    const close = vi.fn();
    render(<KonamiOverlay onClose={close} />);
    fireEvent.keyDown(window, { key: 'q' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes on the dismiss control, for a pointer with no keyboard', () => {
    const close = vi.fn();
    render(<KonamiOverlay onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes itself if it is left alone', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    render(<KonamiOverlay onClose={close} />);
    expect(close).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(KONAMI_OVERLAY_MS); // [ms]
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

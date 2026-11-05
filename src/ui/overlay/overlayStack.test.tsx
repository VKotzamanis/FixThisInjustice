import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';
import { currentEntry, pushEntry, replaceEntry, resetHistoryForTests, setViewShower } from '../nav/history';
import { overlayDepth, resetOverlaysForTests, useOverlay } from './overlayStack';

/** Resolves after the browser has delivered any queued history traversal. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
  });
}

function Layer(props: { name: string; modal?: boolean; onClose: () => void }): ReactElement {
  useOverlay(props.onClose, { modal: props.modal ?? true });
  return <div data-testid={props.name} />;
}

function Harness(): ReactElement {
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  return (
    <>
      {a && (
        <Layer
          name="a"
          onClose={() => {
            setA(false);
          }}
        />
      )}
      {b && (
        <Layer
          name="b"
          onClose={() => {
            setB(false);
          }}
        />
      )}
      <button
        type="button"
        onClick={() => {
          setB(false);
        }}
      >
        close b
      </button>
      <button
        type="button"
        onClick={() => {
          setA(false);
          setB(false);
        }}
      >
        close both
      </button>
    </>
  );
}

describe('the overlay stack (R6, F01, F12)', () => {
  beforeEach(async () => {
    await settle(); // the previous test's own step-backs land first
    replaceEntry({ view: 'train', depth: 0 });
  });
  afterEach(() => {
    resetOverlaysForTests();
    resetHistoryForTests();
  });

  it('pushes one history entry per open overlay', () => {
    const before = window.history.length;
    render(<Harness />);
    expect(overlayDepth()).toBe(2);
    expect(window.history.length - before).toBe(2);
    expect(currentEntry()).toEqual({ view: 'train', depth: 2 });
  });

  it('Escape closes the top overlay only', async () => {
    const { queryByTestId } = render(<Harness />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(queryByTestId('b')).toBeNull();
    expect(queryByTestId('a')).not.toBeNull();
    await settle();
    expect(currentEntry()).toEqual({ view: 'train', depth: 1 });
  });

  it('Back closes the top overlay, then the next, then switches view', async () => {
    replaceEntry({ view: 'today', depth: 0 });
    pushEntry({ view: 'train', depth: 0 });
    const shown: string[] = [];
    setViewShower((v) => {
      shown.push(v);
    });
    const { queryByTestId } = render(<Harness />);
    const back = async (): Promise<void> => {
      await act(async () => {
        window.history.back();
        await new Promise((resolve) => setTimeout(resolve, 20)); // [ms]
      });
    };
    await back();
    expect(queryByTestId('b')).toBeNull();
    expect(queryByTestId('a')).not.toBeNull();
    await back();
    expect(queryByTestId('a')).toBeNull();
    expect(overlayDepth()).toBe(0);
    expect(shown).toEqual(['train', 'train']);
    await back();
    expect(shown).toEqual(['train', 'train', 'today']);
  });

  it('locks the page scroll while a modal overlay is open, once', () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('a close by its own control steps back over its own entry', async () => {
    const spy = vi.spyOn(window.history, 'go');
    const { getByText } = render(<Harness />);
    await act(async () => {
      getByText('close b').click();
      await Promise.resolve(); // the step-back is issued in a microtask
    });
    expect(spy).toHaveBeenCalledWith(-1);
    await settle();
    expect(currentEntry()).toEqual({ view: 'train', depth: 1 });
  });

  it('two overlays closed together step back twice, to the view entry', async () => {
    const spy = vi.spyOn(window.history, 'go');
    const { getByText } = render(<Harness />);
    await act(async () => {
      getByText('close both').click();
      await Promise.resolve(); // the step-backs are issued together in a microtask
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(-2);
    await settle();
    expect(currentEntry()).toEqual({ view: 'train', depth: 0 });
  });

  it('works under fake timers too (no settle)', () => {
    vi.useFakeTimers();
    const { getByText } = render(<Harness />);
    act(() => {
      getByText('close b').click();
    });
    expect(overlayDepth()).toBe(1);
    vi.useRealTimers();
  });
});

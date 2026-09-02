import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { DEFAULT_COPY, FORMAT } from '../../content/copy';
import { SPECIMEN_BY_ID } from '../../content/specimenCards';
import {
  TOAST_DURATION_MS,
  TOAST_MAX_QUEUE,
  TOAST_PRIORITY,
  ToastProvider,
  ToastQueue,
  selectVisible,
  useToasts,
} from './ToastQueue';
import type { Toast } from './ToastQueue';

function t(id: string, kind: Toast['kind']): Toast {
  if (kind === 'undo') return { id, kind, message: 'Set deleted.', onUndo: () => undefined };
  if (kind === 'milestone') return { id, kind, count: 50 };
  if (kind === 'specimen') return { id, kind, cardId: 'c001' };
  return { id, kind, message: 'msg' };
}

let api: ReturnType<typeof useToasts> | null = null;

function Probe(): ReactElement {
  api = useToasts();
  return <ToastQueue />;
}

/** `extra` mounts a sibling inside the provider; the Escape guard test needs an open dialog. */
function renderQueue(extra?: ReactElement): void {
  render(
    <ToastProvider>
      <Probe />
      {extra}
    </ToastProvider>,
  );
}

/** Every rendered toast, however many are on screen. The one-at-a-time rule is asserted, not assumed. */
function onScreen(): HTMLElement[] {
  return screen.queryAllByTestId('toast');
}

describe('selectVisible', () => {
  // G9
  it('orders classes undo > milestone > coach > telemetry > specimen', () => {
    const queue = [
      t('1', 'specimen'),
      t('2', 'telemetry'),
      t('3', 'coach'),
      t('4', 'milestone'),
      t('5', 'undo'),
    ];
    expect(selectVisible(queue).map((x) => x.kind)).toEqual([
      'undo',
      'milestone',
      'coach',
      'telemetry',
      'specimen',
    ]);
    expect([...TOAST_PRIORITY]).toEqual(['undo', 'milestone', 'coach', 'telemetry', 'specimen']);
  });

  // G9: the A59 fix. The second specimen waits instead of replacing the first.
  it('shows only the first queued toast of each class', () => {
    const queue = [t('1', 'specimen'), t('2', 'specimen'), t('3', 'telemetry')];
    expect(selectVisible(queue).map((x) => x.id)).toEqual(['3', '1']);
  });

  it('returns nothing for an empty queue', () => {
    expect(selectVisible([])).toEqual([]);
  });
});

describe('useToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues a pushed toast and returns its id', () => {
    renderQueue();
    let id = '';
    act(() => {
      id = api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    expect(id).not.toBe('');
    expect(api!.queue).toHaveLength(1);
    expect(screen.getByText('set banked')).toBeInTheDocument();
  });

  it('shows one toast at a time, the most urgent first', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'specimen', cardId: 'c001' });
      api!.push({ kind: 'telemetry', message: 'set banked' });
      api!.push({ kind: 'coach', message: 'hold this load' });
      api!.push({ kind: 'milestone', count: 50 });
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo: () => undefined });
    });
    expect(api!.queue).toHaveLength(5);
    expect(onScreen()).toHaveLength(1);
    expect(api!.visible.map((x) => x.kind)).toEqual(['undo']);
    expect(screen.getByText(DEFAULT_COPY['coach.setDeleted'])).toBeInTheDocument();
    expect(screen.queryByText('hold this load')).toBeNull();

    act(() => {
      api!.dismiss(api!.visible[0]!.id);
    });
    expect(onScreen()).toHaveLength(1);
    expect(api!.visible.map((x) => x.kind)).toEqual(['milestone']);
  });

  it('dismisses by id', () => {
    renderQueue();
    let id = '';
    act(() => {
      id = api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    act(() => {
      api!.dismiss(id);
    });
    expect(api!.queue).toHaveLength(0);
    expect(screen.queryByText('set banked')).toBeNull();
  });

  it('auto-dismisses each class after its own legacy duration', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'telemetry', message: 'telemetry line' });
      api!.push({ kind: 'specimen', cardId: 'c001' });
    });
    expect(screen.getByText('telemetry line')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.telemetry);
    });
    expect(screen.queryByText('telemetry line')).toBeNull();
    // The specimen was queued behind it and is only now on screen, so its 12 s start here.
    expect(screen.getByText(SPECIMEN_BY_ID['c001']!.title)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen - 1);
    });
    expect(api!.queue).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(api!.queue).toHaveLength(0);
    expect(onScreen()).toHaveLength(0);
  });

  it("starts a queued toast's timer only once it becomes visible", () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'specimen', cardId: 'c001' });
      api!.push({ kind: 'specimen', cardId: 'c002' });
    });
    // First specimen expires; the second becomes visible and gets a full duration of its own.
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen);
    });
    expect(api!.queue).toHaveLength(1);
    expect(api!.queue[0]!.kind).toBe('specimen');
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen - 1);
    });
    expect(api!.queue).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(api!.queue).toHaveLength(0);
  });

  it('does not restart the visible toast when another is pushed behind it', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'telemetry', message: 'first line' });
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
      // A push re-renders the region. The deadline belongs to the toast, not to the render, so
      // the arrival of a second one must not hand the first a fresh interval.
      api!.push({ kind: 'telemetry', message: 'second line' });
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.telemetry - 3_000);
    });
    expect(screen.queryByText('first line')).toBeNull();
    expect(screen.getByText('second line')).toBeInTheDocument();
  });

  it('clears a toast whose deadline passed while the tab was hidden', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'specimen', cardId: 'c001' });
    });
    /*
     * A backgrounded tab throttles timeouts, so the wall clock passes the deadline while the
     * pending timeout has not fired. setSystemTime moves the clock and shifts the pending
     * timer with it, which is exactly that state. An absolute deadline clears the toast on
     * return; a countdown would come back with time still on it (code review A31).
     */
    act(() => {
      vi.setSystemTime(Date.now() + TOAST_DURATION_MS.specimen + 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(1);
    });
    expect(api!.queue).toHaveLength(0);
    expect(onScreen()).toHaveLength(0);
  });

  it('keeps a toast whose deadline has not passed when the tab comes back', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'specimen', cardId: 'c001' });
    });
    act(() => {
      vi.setSystemTime(Date.now() + 1_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api!.queue).toHaveLength(1);
    // The re-armed timeout runs to the ORIGINAL deadline, so what is left is the duration less
    // the second the tab was away: a re-arm must not hand the toast a fresh interval either.
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS.specimen - 1_000 - 1);
    });
    expect(api!.queue).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(api!.queue).toHaveLength(0);
  });

  it('merges a duplicate push and returns the standing toast id', () => {
    renderQueue();
    let first = '';
    let second = '';
    act(() => {
      first = api!.push({ kind: 'telemetry', message: 'set banked' });
      second = api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    expect(api!.queue).toHaveLength(1);
    expect(second).toBe(first);
    // A different message of the same class is not a duplicate: it waits its turn.
    act(() => {
      api!.push({ kind: 'telemetry', message: 'another line' });
    });
    expect(api!.queue).toHaveLength(2);
  });

  it('never merges two undo offers', () => {
    renderQueue();
    const first = vi.fn();
    const second = vi.fn();
    act(() => {
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo: first });
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo: second });
    });
    // Same message, different callbacks: merging them would discard the second route back.
    expect(api!.queue).toHaveLength(2);
  });

  it('caps the queue and drops the newest, least urgent toast', () => {
    renderQueue();
    act(() => {
      for (let i = 0; i < TOAST_MAX_QUEUE + 2; i += 1) {
        api!.push({ kind: 'telemetry', message: `line ${i}` });
      }
    });
    expect(api!.queue).toHaveLength(TOAST_MAX_QUEUE);
    expect(api!.queue.map((x) => (x.kind === 'telemetry' ? x.message : ''))).toEqual(
      Array.from({ length: TOAST_MAX_QUEUE }, (_, i) => `line ${i}`),
    );
    // The oldest is still the one on screen: the cap never evicts the visible toast.
    expect(screen.getByText('line 0')).toBeInTheDocument();
  });

  it('makes room for an undo rather than dropping it', () => {
    renderQueue();
    act(() => {
      for (let i = 0; i < TOAST_MAX_QUEUE; i += 1) {
        api!.push({ kind: 'telemetry', message: `line ${i}` });
      }
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo: () => undefined });
    });
    expect(api!.queue).toHaveLength(TOAST_MAX_QUEUE);
    expect(api!.queue.filter((x) => x.kind === 'undo')).toHaveLength(1);
    // The evicted one is the newest telemetry line, not the oldest.
    const messages = api!.queue.map((x) => (x.kind === 'telemetry' ? x.message : ''));
    expect(messages).toContain('line 0');
    expect(messages).not.toContain(`line ${TOAST_MAX_QUEUE - 1}`);
    expect(screen.getByText(DEFAULT_COPY['coach.setDeleted'])).toBeInTheDocument();
  });

  it('dismisses the visible toast on Escape', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'telemetry', message: 'set banked' });
      api!.push({ kind: 'specimen', cardId: 'c001' });
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByText('set banked')).toBeNull();
    // Only the visible one goes: Escape is a dismissal, not a clear.
    expect(api!.queue).toHaveLength(1);
    expect(screen.getByText(SPECIMEN_BY_ID['c001']!.title)).toBeInTheDocument();
  });

  it('leaves the toast alone when Escape is closing an open dialog', () => {
    renderQueue(<div role="dialog" aria-modal="true" aria-label="Form reference" />);
    act(() => {
      api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.getByText('set banked')).toBeInTheDocument();
  });

  it('dismisses on a tap anywhere on an ordinary toast', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('toast'));
    });
    expect(api!.queue).toHaveLength(0);
  });

  it('runs the undo callback and dismisses the toast', () => {
    renderQueue();
    const onUndo = vi.fn();
    act(() => {
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: DEFAULT_COPY['button.undo'] }));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(api!.queue).toHaveLength(0);
  });

  it('does not lose the undo offer to a tap on the toast body', () => {
    renderQueue();
    const onUndo = vi.fn();
    act(() => {
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('toast'));
    });
    expect(onUndo).not.toHaveBeenCalled();
    expect(api!.queue).toHaveLength(1);
    // It goes through the named control instead.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: DEFAULT_COPY['button.dismiss'] }));
    });
    expect(api!.queue).toHaveLength(0);
  });

  it('renders every string from the copy table', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'coach', message: 'hold this load' });
    });
    expect(screen.getByText(DEFAULT_COPY['label.coachNote'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DEFAULT_COPY['button.dismiss'] })).toBeInTheDocument();

    act(() => {
      api!.clear();
      api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    expect(screen.getByText(DEFAULT_COPY['label.telemetry'])).toBeInTheDocument();

    act(() => {
      api!.clear();
      api!.push({ kind: 'milestone', count: 250 });
    });
    expect(screen.getByText(FORMAT.milestoneSets('250'))).toBeInTheDocument();
  });

  it('renders a specimen card from the content module under a copy-table eyebrow', () => {
    renderQueue();
    const card = SPECIMEN_BY_ID['c005'];
    expect(card).toBeDefined();
    act(() => {
      api!.push({ kind: 'specimen', cardId: 'c005' });
    });
    expect(screen.getByText(FORMAT.specimenAcquired(card!.rarity))).toBeInTheDocument();
    expect(screen.getByText('Volume and hypertrophy')).toBeInTheDocument();
    expect(screen.getByText(card!.body)).toBeInTheDocument();
    expect(screen.getByText(card!.source.citation)).toBeInTheDocument();
  });

  it('ignores a specimen toast for an unknown card id', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'specimen', cardId: 'nope' });
    });
    // Refused at the door, not queued: an unrenderable toast would hold the one visible slot
    // for its full 12 s and show nothing there.
    expect(api!.queue).toHaveLength(0);
    expect(onScreen()).toHaveLength(0);
    expect(screen.queryByText(/specimen acquired/i)).toBeNull();
  });

  it('announces politely, and assertively only for the undo class', () => {
    renderQueue();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    act(() => {
      api!.push({ kind: 'telemetry', message: 'set banked' });
    });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    act(() => {
      api!.push({ kind: 'undo', message: DEFAULT_COPY['coach.setDeleted'], onUndo: () => undefined });
    });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'assertive');
  });

  it('clears everything', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'coach', message: 'hold this load' });
      api!.push({ kind: 'telemetry', message: 'banked' });
      api!.clear();
    });
    expect(api!.queue).toHaveLength(0);
    expect(onScreen()).toHaveLength(0);
  });

  it('carries no dash connector and no emoji in what it renders', () => {
    renderQueue();
    act(() => {
      api!.push({ kind: 'milestone', count: 250 });
    });
    expect(document.body.textContent ?? '').not.toMatch(/[—–]/);
    expect(document.body.textContent ?? '').not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

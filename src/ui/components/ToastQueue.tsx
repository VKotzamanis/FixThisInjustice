// src/ui/components/ToastQueue.tsx
//
// One ordered, non-persisted toast queue. It replaces the four independent single-value slots
// the legacy app kept in persisted state - `lastTelemetry`, `lastDrop`, `lastMilestone` and
// `lastDeletedSet` (legacy/console-app.jsx:190-215) - each with its own component and its own
// timer.
//
// Two code review findings drove the shape. A59: a second specimen drop inside the first
// one's 12 s window silently replaced it, so a card was credited without ever being shown; a
// queue makes the second one wait instead. A43: those timers fired mid-import and re-persisted
// stale state; nothing here is persisted, so the queue cannot race persistence at all.
//
// A31 drove the timing. Every deadline is an absolute instant, not a countdown: a backgrounded
// tab throttles timeouts, so a toast holding a remaining duration comes back with time still on
// it. The deadline is re-armed on visibilitychange, which clears anything already expired.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import './toastQueue.css';
import { FORMAT, copy } from '../../content/copy';
import { SPECIMEN_BY_ID } from '../../content/specimenCards';
import { newId } from '../../domain/ids';
import type { EpochMs } from '../../domain/types';

export type ToastKind = 'undo' | 'milestone' | 'coach' | 'telemetry' | 'specimen';

export type ToastInput =
  | { kind: 'undo'; message: string; onUndo: () => void }
  | { kind: 'milestone'; count: number }
  | { kind: 'coach'; message: string }
  | { kind: 'telemetry'; message: string }
  | { kind: 'specimen'; cardId: string };

export type Toast = ToastInput & { id: string };

/**
 * Highest priority first. `undo` leads because it is the only class carrying a deadline the
 * user can miss irreversibly. The rest keep the brief's ordering, which survives here as a
 * subsequence (`undo > coach > telemetry > specimen`).
 */
export const TOAST_PRIORITY: readonly ToastKind[] = [
  'undo',
  'milestone',
  'coach',
  'telemetry',
  'specimen',
];

/** Auto-dismiss durations [ms], carried over from the legacy components unchanged. */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
  undo: 6000, // [ms] legacy/console-fun.jsx:517 UndoToast
  milestone: 7000, // [ms] legacy/console-fun.jsx:449 MilestoneToast
  coach: 4500, // [ms] legacy/console-fun.jsx:105 TelemetryToast (coach tone)
  telemetry: 4500, // [ms] legacy/console-fun.jsx:105 TelemetryToast
  specimen: 12000, // [ms] legacy/console-fun.jsx:77 SpecimenDrop
};

/**
 * The most toasts held at once.
 *
 * The queue drains SERIALLY - one toast on screen at a time - so a bound is a bound on delay,
 * not on clutter: six waiting specimen toasts, the longest class at 12 s each, already take
 * 72 s to clear, by which point a toast reports an action the user has left behind. Pushes can
 * outrun the drain (a hidden tab logging sets, an import replaying events), so the queue needs
 * a ceiling rather than an assumption that they cannot.
 */
export const TOAST_MAX_QUEUE = 6;

/**
 * The order toasts are shown in: the earliest queued toast of each class, most urgent class
 * first. A second toast of a class waits rather than replacing the first (code review A59).
 *
 * The component renders the HEAD of this list and nothing else, so the tail is the order in
 * which the rest will follow. The whole list is returned because the ordering is the thing
 * verification gate G9 checks, and because P8 Task 14 inserts a sixth class into it.
 */
export function selectVisible(queue: readonly Toast[]): Toast[] {
  const out: Toast[] = [];
  for (const kind of TOAST_PRIORITY) {
    const first = queue.find((t) => t.kind === kind);
    if (first !== undefined) out.push(first);
  }
  return out;
}

/**
 * What makes two pushes the same toast.
 *
 * `undo` returns null and is never merged: two deleted sets carry the same message and
 * different callbacks, so merging them would silently discard the second route back. Every
 * other class is identified by its payload, because a repeat of it says nothing new.
 */
function payloadKey(input: ToastInput): string | null {
  switch (input.kind) {
    case 'undo':
      return null;
    case 'milestone':
      return `milestone:${String(input.count)}`;
    case 'coach':
      return `coach:${input.message}`;
    case 'telemetry':
      return `telemetry:${input.message}`;
    case 'specimen':
      return `specimen:${input.cardId}`;
  }
}

/**
 * The toast the cap drops when the queue is full: the reverse of the visible order, so the
 * least urgent class goes first and, within a class, the most recently queued.
 *
 * That keeps the toasts nearest to being shown, including the one on screen, and drops the
 * ones furthest from it - which, when the incoming toast is itself the least urgent and
 * newest, is the incoming one. `undo` is never a candidate: dropping it removes the user's
 * only route back from a deletion. Returns -1 when every toast is an `undo`, and the cap then
 * yields rather than take that route away.
 */
function evictionIndex(queue: readonly Toast[]): number {
  for (let p = TOAST_PRIORITY.length - 1; p >= 0; p -= 1) {
    const kind = TOAST_PRIORITY[p];
    if (kind === undefined || kind === 'undo') continue;
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i]?.kind === kind) return i;
    }
  }
  return -1;
}

/** Append, then enforce the cap. Pure, so the ordering rules are testable without a render. */
function enqueue(queue: readonly Toast[], toast: Toast): Toast[] {
  const next = [...queue, toast];
  if (next.length <= TOAST_MAX_QUEUE) return next;
  const drop = evictionIndex(next);
  return drop === -1 ? next : next.filter((_, i) => i !== drop);
}

interface ToastApi {
  queue: Toast[];
  /** The toast on screen. At most one, as a list so the shape survives a sixth class. */
  visible: Toast[];
  /*
   * Declared as function-typed properties rather than method shorthand: the components
   * destructure them off the context value, and a method signature loses its `this` binding
   * when separated from its object (@typescript-eslint/unbound-method). The shape is
   * otherwise the one the plan prints.
   */
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [queue, setQueue] = useState<Toast[]>([]);
  /*
   * The ref is the queue's live value; the state is its rendered mirror. `push` has to READ the
   * queue to answer two questions synchronously - is this a duplicate, and what id does the
   * caller get back - and a functional setState updater cannot return an answer to its caller.
   * The ref also makes two pushes in one tick see each other, which a stale `queue` closure
   * would not.
   */
  const queueRef = useRef<Toast[]>([]);

  const commit = useCallback((next: Toast[]): void => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const push = useCallback(
    (input: ToastInput): string => {
      /*
       * A specimen toast whose card id is not in the library is refused rather than queued: it
       * would render nothing and still hold the one visible slot for its full 12 s. The caller
       * gets an id back, so nothing has to branch on this.
       */
      if (input.kind === 'specimen' && SPECIMEN_BY_ID[input.cardId] === undefined) return newId();

      const key = payloadKey(input);
      if (key !== null) {
        const standing = queueRef.current.find((t) => payloadKey(t) === key);
        // Merged, not queued twice. The caller gets the standing toast's id, so dismissing it
        // dismisses the one the user can actually see.
        if (standing !== undefined) return standing.id;
      }

      const toast: Toast = { ...input, id: newId() };
      commit(enqueue(queueRef.current, toast));
      return toast.id;
    },
    [commit],
  );

  const dismiss = useCallback(
    (id: string): void => {
      const next = queueRef.current.filter((t) => t.id !== id);
      // An unknown id is a no-op, which is what a dropped or merged push needs it to be.
      if (next.length !== queueRef.current.length) commit(next);
    },
    [commit],
  );

  const clear = useCallback((): void => {
    if (queueRef.current.length > 0) commit([]);
  }, [commit]);

  // One toast on screen at a time: the head of the visible order, and nothing behind it.
  const visible = useMemo(() => selectVisible(queue).slice(0, 1), [queue]);
  const value = useMemo<ToastApi>(
    () => ({ queue, visible, push, dismiss, clear }),
    [queue, visible, push, dismiss, clear],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  // A missing provider is a wiring bug, not a state: a silent no-op queue would swallow the
  // undo offer along with everything else.
  if (ctx === null) throw new Error('useToasts must be used inside <ToastProvider>');
  return ctx;
}

/**
 * Withdraws the toast at its own deadline.
 *
 * The deadline is absolute and the timeout is re-armed whenever the page's visibility changes,
 * so a tab that was hidden past the deadline clears the toast on return instead of showing it
 * for a fresh interval (code review A31). The effect runs when the toast becomes VISIBLE,
 * which is when this component mounts, so a queued toast spends no part of its duration
 * waiting.
 */
function useAutoDismiss(id: string, kind: ToastKind, onDismiss: (id: string) => void): void {
  useEffect(() => {
    const expiresAt: EpochMs = Date.now() + TOAST_DURATION_MS[kind]; // [ms] epoch UTC
    let handle = 0;
    const arm = (): void => {
      window.clearTimeout(handle);
      handle = window.setTimeout(() => {
        onDismiss(id);
      }, Math.max(0, expiresAt - Date.now()));
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(handle);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [id, kind, onDismiss]);
}

/** The body of one toast. Every string comes from the copy table or the content module. */
function toastContent(toast: Toast): ReactElement | null {
  switch (toast.kind) {
    case 'undo':
      // No tag: the caller's message already reports the deletion, and a "DELETED" eyebrow
      // above it would say the same thing twice.
      return <span className="toast-message">{toast.message}</span>;
    case 'milestone':
      return (
        <span className="toast-message">{FORMAT.milestoneSets(String(toast.count))}</span>
      );
    case 'coach':
    case 'telemetry':
      return (
        <>
          <span className="toast-tag">
            {copy(toast.kind === 'coach' ? 'label.coachNote' : 'label.telemetry')}
          </span>
          <span className="toast-message">{toast.message}</span>
        </>
      );
    case 'specimen': {
      const card = SPECIMEN_BY_ID[toast.cardId];
      // Unreachable through push(), which refuses an unknown id. Held anyway because the
      // lookup is a partial function and a card library is edited by hand.
      if (card === undefined) return null;
      return (
        <>
          <span className="toast-tag">{FORMAT.specimenAcquired(card.rarity)}</span>
          <span className="toast-category">{card.category}</span>
          <span className="toast-title">{card.title}</span>
          <span className="toast-body">{card.body}</span>
          <span className="toast-source">{card.source.citation}</span>
        </>
      );
    }
  }
}

function ToastShell(props: { toast: Toast; onDismiss: (id: string) => void }): ReactElement | null {
  const { toast, onDismiss } = props;
  useAutoDismiss(toast.id, toast.kind, onDismiss);

  const dismiss = (): void => {
    onDismiss(toast.id);
  };
  const content = toastContent(toast);
  if (content === null) return null;

  const rarity = toast.kind === 'specimen' ? (SPECIMEN_BY_ID[toast.cardId]?.rarity ?? null) : null;
  /*
   * Tap anywhere dismisses - except on the undo toast, where a mis-tap on the body would take
   * away the offer it exists to make. Keyboard and screen reader users reach the same action
   * through the Dismiss control below, which is a real button; the body handler is an extra
   * for pointers, never the only route.
   */
  const tapDismisses = toast.kind !== 'undo';

  return (
    <div
      className={`toast toast-${toast.kind}${rarity === null ? '' : ` rarity-${rarity}`}`}
      data-testid="toast"
      onClick={tapDismisses ? dismiss : undefined}
    >
      {content}
      <span className="toast-controls">
        {toast.kind === 'undo' && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              toast.onUndo();
              dismiss();
            }}
          >
            {copy('button.undo')}
          </button>
        )}
        <button type="button" className="toast-dismiss" onClick={dismiss}>
          {copy('button.dismiss')}
        </button>
      </span>
    </div>
  );
}

/**
 * The one live region, mounted once beside the app's views.
 *
 * It is always in the DOM, empty or not: a live region a screen reader first meets at the
 * moment its content arrives is announced unreliably. `role="status"` carries an implicit
 * polite announcement and the attribute is written anyway, because the undo class overrides it
 * to `assertive` - that class is the only one with a deadline the user can miss irreversibly,
 * and it is the only one allowed to interrupt.
 */
export function ToastQueue(): ReactElement {
  const { visible, dismiss } = useToasts();
  const front = visible[0] ?? null;
  const frontId = front?.id ?? null;

  useEffect(() => {
    if (frontId === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      /*
       * An open dialog owns Escape. ModalShell listens on this same window, so without this
       * guard one keypress would close the dialog AND withdraw the toast behind it - including
       * an undo offer the user never aimed at.
       */
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      dismiss(frontId);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [frontId, dismiss]);

  return (
    <div
      className="toast-stack"
      role="status"
      aria-live={front?.kind === 'undo' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {front !== null && <ToastShell key={front.id} toast={front} onDismiss={dismiss} />}
    </div>
  );
}

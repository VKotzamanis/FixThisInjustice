// src/ui/hotkeys.test.tsx
//
// The registry that makes code review A54 impossible: one window listener, scopes, and a
// duplicate binding that fails loudly instead of shadowing silently.
//
// Deviations from the P8 plan's Task 9 Step 1 draft, recorded here and in the task report:
//  - Double quotes to single quotes, repo style.
//  - Two suites added for the guards the plan's draft states in prose but never asserts: keys
//    are ignored while a modal dialog is open (except in the 'dialog' scope), and the one
//    listener is REMOVED on unmount rather than merely counted on mount.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { HotkeyProvider, normalizeCombo, useHotkeys } from './hotkeys';
import type { HotkeyScope } from './hotkeys';

function Binder({
  scope,
  bindings,
}: {
  scope: HotkeyScope;
  bindings: Record<string, () => void>;
}): ReactElement {
  useHotkeys(scope, bindings);
  return <div />;
}

/** A dialog exactly as ModalShell renders one, so the guard is asserted against real markup. */
function Modal({ children }: { children?: ReactElement }): ReactElement {
  return (
    <div role="dialog" aria-modal="true" aria-label="a dialog">
      {children}
    </div>
  );
}

describe('normalizeCombo', () => {
  it('lowercases plain keys', () => {
    expect(normalizeCombo({ key: 'J', metaKey: false, ctrlKey: false })).toBe('j');
    expect(normalizeCombo({ key: 'ArrowRight', metaKey: false, ctrlKey: false })).toBe(
      'arrowright',
    );
    expect(normalizeCombo({ key: '1', metaKey: false, ctrlKey: false })).toBe('1');
  });

  it('prefixes mod for either meta or control', () => {
    expect(normalizeCombo({ key: 'k', metaKey: true, ctrlKey: false })).toBe('mod+k');
    expect(normalizeCombo({ key: 'k', metaKey: false, ctrlKey: true })).toBe('mod+k');
  });
});

describe('useHotkeys', () => {
  it('runs a global binding', () => {
    const run = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: run }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 't' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  // A54: one key, two scopes, exactly one handler runs.
  it("lets the active view's binding win over the global one, and runs only that", () => {
    const globalJ = vi.fn();
    const trainJ = vi.fn();
    render(
      <HotkeyProvider activeScope="train">
        <Binder scope="global" bindings={{ j: globalJ }} />
        <Binder scope="train" bindings={{ j: trainJ }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 'j' });
    expect(trainJ).toHaveBeenCalledTimes(1);
    expect(globalJ).not.toHaveBeenCalled();
  });

  it('falls back to the global binding when the active scope has none', () => {
    const globalJ = vi.fn();
    const trainK = vi.fn();
    render(
      <HotkeyProvider activeScope="train">
        <Binder scope="global" bindings={{ j: globalJ }} />
        <Binder scope="train" bindings={{ k: trainK }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 'j' });
    expect(globalJ).toHaveBeenCalledTimes(1);
    expect(trainK).not.toHaveBeenCalled();
  });

  it('ignores a scope that is not active', () => {
    const planJ = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="plan" bindings={{ j: planJ }} />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 'j' });
    expect(planJ).not.toHaveBeenCalled();
  });

  // A duplicate binding is a bug, so it fails loudly rather than silently shadowing.
  it('throws when the same combo is bound twice in one scope', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <HotkeyProvider activeScope="train">
          <Binder scope="train" bindings={{ j: () => {} }} />
          <Binder scope="train" bindings={{ j: () => {} }} />
        </HotkeyProvider>,
      ),
    ).toThrow(/already bound/i);
    spy.mockRestore();
  });

  it('does not fire while a text field has focus', () => {
    const run = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: run }} />
        <input aria-label="note" />
      </HotkeyProvider>,
    );
    const field = screen.getByLabelText('note');
    field.focus();
    fireEvent.keyDown(field, { key: 't' });
    expect(run).not.toHaveBeenCalled();
  });

  it('still fires Escape and mod+k inside a text field', () => {
    const esc = vi.fn();
    const palette = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ escape: esc, 'mod+k': palette }} />
        <input aria-label="note" />
      </HotkeyProvider>,
    );
    const field = screen.getByLabelText('note');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(field, { key: 'k', metaKey: true });
    expect(esc).toHaveBeenCalledTimes(1);
    expect(palette).toHaveBeenCalledTimes(1);
  });

  it('releases a binding when its component unmounts', () => {
    const run = vi.fn();
    const { unmount } = render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: run }} />
      </HotkeyProvider>,
    );
    unmount();
    fireEvent.keyDown(window, { key: 't' });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('an open modal dialog', () => {
  it('swallows every global and view binding, including the always-active ones', () => {
    const digit = vi.fn();
    const palette = vi.fn();
    const esc = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ '1': digit, 'mod+k': palette }} />
        <Binder scope="today" bindings={{ escape: esc }} />
        <Modal />
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(digit).not.toHaveBeenCalled();
    expect(palette).not.toHaveBeenCalled();
    expect(esc).not.toHaveBeenCalled();
  });

  it("leaves the dialog's own scope working", () => {
    const inDialog = vi.fn();
    const globalJ = vi.fn();
    render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ j: globalJ }} />
        <Modal>
          <Binder scope="dialog" bindings={{ j: inDialog }} />
        </Modal>
      </HotkeyProvider>,
    );
    fireEvent.keyDown(window, { key: 'j' });
    expect(inDialog).toHaveBeenCalledTimes(1);
    expect(globalJ).not.toHaveBeenCalled();
  });

  it('hands the keys back once the dialog is gone', () => {
    const run = vi.fn();
    function Host({ open }: { open: boolean }): ReactElement {
      return (
        <HotkeyProvider activeScope="today">
          <Binder scope="global" bindings={{ t: run }} />
          {open ? <Modal /> : null}
        </HotkeyProvider>
      );
    }
    const { rerender } = render(<Host open />);
    fireEvent.keyDown(window, { key: 't' });
    expect(run).not.toHaveBeenCalled();
    rerender(<Host open={false} />);
    fireEvent.keyDown(window, { key: 't' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('the one listener', () => {
  it('is added once however many bindings exist, and removed on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <HotkeyProvider activeScope="today">
        <Binder scope="global" bindings={{ t: () => {}, j: () => {}, k: () => {} }} />
        <Binder scope="today" bindings={{ '1': () => {}, '2': () => {} }} />
      </HotkeyProvider>,
    );
    // String(type) rather than a bare comparison: addEventListener is overloaded, and the
    // overload TypeScript picks for the spy types the first argument as a worker event name.
    const keydowns = (calls: [unknown, ...unknown[]][]): unknown[] =>
      calls.filter(([type]) => String(type) === 'keydown');

    expect(keydowns(add.mock.calls)).toHaveLength(1);
    expect(keydowns(remove.mock.calls)).toHaveLength(0);

    unmount();
    // Net zero: the one listener the provider added is the one it took away.
    expect(keydowns(add.mock.calls)).toHaveLength(1);
    expect(keydowns(remove.mock.calls)).toHaveLength(1);
  });
});

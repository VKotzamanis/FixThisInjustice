// src/ui/components/ModalShell.test.tsx
//
// The scroll lock, which is the one piece of ModalShell that is not local to its own subtree:
// it writes `document.body.style.overflow`, a single global slot, from a component that can be
// mounted more than once at a time.
//
// The stacked case is the reviewer's (P4 polish item 4). Each shell used to save the overflow
// it found and restore that value on unmount, so two live shells recorded '' and 'hidden'
// respectively, and unmounting them in the order they were opened unlocked the page while the
// second was still up and then LOCKED IT FOR GOOD when the second closed. The two shells are
// rendered into separate roots here precisely so the unmount order is the test's to choose;
// nesting them would let React's own child-first cleanup hide the defect.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ModalShell } from './ModalShell';

function renderShell(testId: string): ReturnType<typeof render> {
  return render(
    <ModalShell
      labelledBy={`${testId}-title`}
      className="shell"
      backdropClassName="shell-bg"
      testId={testId}
      onClose={() => {
        /* the close path is covered by the two modals' own suites */
      }}
    >
      <h2 id={`${testId}-title`}>{testId}</h2>
    </ModalShell>,
  );
}

beforeEach(() => {
  document.body.style.overflow = '';
});

afterEach(() => {
  document.body.style.overflow = '';
});

describe('ModalShell scroll lock', () => {
  it('locks the body while one shell is open and restores it on unmount', () => {
    const shell = renderShell('one');
    expect(document.body.style.overflow).toBe('hidden');

    shell.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps the lock until the LAST of two stacked shells unmounts', () => {
    const first = renderShell('first');
    const second = renderShell('second');
    expect(document.body.style.overflow).toBe('hidden');

    // Closed in the order they were opened, which is what the video modal does when the form
    // cues are opened over it and the video is dismissed first.
    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    second.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the page style the FIRST shell found, not the lock a later one saw', () => {
    // A page that was already scroll-locked for its own reasons must be handed back that lock,
    // and a page that was not must be handed back nothing.
    document.body.style.overflow = 'auto';
    const first = renderShell('first');
    const second = renderShell('second');
    second.unmount();
    first.unmount();

    expect(document.body.style.overflow).toBe('auto');
  });

  it('locks and restores again for a shell opened after the previous one closed', () => {
    // The counter must return to zero, or the second dialog of a session would never lock.
    renderShell('one').unmount();
    const later = renderShell('two');
    expect(document.body.style.overflow).toBe('hidden');

    later.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copy } from '../../content/copy';
import { READINESS_NOTICE_KEY, ReadinessNotice } from './ReadinessNotice';

beforeEach(() => {
  sessionStorage.clear();
});

describe('ReadinessNotice', () => {
  it('renders nothing when the profile is not flagged', () => {
    const { container } = render(<ReadinessNotice flagged={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the physician notice when the profile is flagged', () => {
    render(<ReadinessNotice flagged />);
    expect(screen.getByText(copy('advice.readinessConsult'))).toBeInTheDocument();
  });

  it('uses a live region so a screen reader announces it at session start', () => {
    render(<ReadinessNotice flagged />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hides after Dismiss and stays hidden on a remount in the same session', () => {
    const first = render(<ReadinessNotice flagged />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));
    expect(first.container.firstChild).toBeNull();
    first.unmount();

    const second = render(<ReadinessNotice flagged />);
    expect(second.container.firstChild).toBeNull();
    expect(sessionStorage.getItem(READINESS_NOTICE_KEY)).toBe('1');
  });

  it('returns in a new browser session', () => {
    render(<ReadinessNotice flagged />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));
    // A new browser session starts with an empty sessionStorage. localStorage would not, which
    // is why the dismissal is held here and not there: the notice is per session, not for good.
    sessionStorage.clear();
    expect(render(<ReadinessNotice flagged />).container.firstChild).not.toBeNull();
  });

  it('shows the notice when sessionStorage is unavailable rather than suppressing it', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      const { container } = render(<ReadinessNotice flagged />);
      expect(container.firstChild).not.toBeNull();
      // Dismiss must not throw either: the write fails, the notice still closes for this mount.
      fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));
      expect(container.firstChild).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original);
    }
  });

  it('keeps the notice to one dismiss control and no dash connector', () => {
    render(<ReadinessNotice flagged />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect((buttons[0]?.textContent ?? '').trim().split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(document.body.textContent ?? '').not.toMatch(/[—–]/);
  });
});

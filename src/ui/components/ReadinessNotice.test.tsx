import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copy } from '../../content/copy';
import { installFakeStorage, makeStorageUnavailable } from '../../store/testStorage';
import { READINESS_NOTICE_KEY, ReadinessNotice } from './ReadinessNotice';

/**
 * The raw Web Storage backing. The `sessionStorage` global is deliberately not named in a test
 * file: eslint.config.js exempts the component and src/store/sessionMirror.ts only (P4 polish
 * item 5), on the argument src/store/testStorage.ts already makes for localStorage.
 */
let storage: Map<string, string>;

beforeEach(() => {
  storage = installFakeStorage();
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
    expect(storage.get(READINESS_NOTICE_KEY)).toBe('1');
  });

  it('returns in a new browser session', () => {
    render(<ReadinessNotice flagged />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));
    // A new browser session starts with an empty sessionStorage. localStorage would not, which
    // is why the dismissal is held here and not there: the notice is per session, not for good.
    storage.clear();
    expect(render(<ReadinessNotice flagged />).container.firstChild).not.toBeNull();
  });

  it('shows the notice when session storage is unavailable rather than suppressing it', () => {
    // Safari private browsing throws from the accessor itself; a blocked or partitioned context
    // throws from the method. The component's try/catch covers both, and this is the shape the
    // shared helper produces without naming the global.
    makeStorageUnavailable();
    const { container } = render(<ReadinessNotice flagged />);
    expect(container.firstChild).not.toBeNull();
    // Dismiss must not throw either: the write fails, the notice still closes for this mount.
    fireEvent.click(screen.getByRole('button', { name: copy('button.dismiss') }));
    expect(container.firstChild).toBeNull();
  });

  it('keeps the notice to one dismiss control and no dash connector', () => {
    render(<ReadinessNotice flagged />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect((buttons[0]?.textContent ?? '').trim().split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(document.body.textContent ?? '').not.toMatch(/[—–]/);
  });
});

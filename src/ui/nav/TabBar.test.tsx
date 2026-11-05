import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFor, type CopyKey } from '../../content/copy';
import { useAppStore } from '../../store';
import { MoreSheet } from './MoreSheet';
import { TabBar } from './TabBar';
import { MORE_VIEWS, TAB_ORDER, VIEWS, type TabSlot } from './views';

/** A word as the app renders it: the store's skin (limelight ships as the default). */
const copy = (key: CopyKey): string => copyFor(useAppStore.getState().ui.skin, key);

/** The rendered label of a slot, read through the registry as TabBar reads it. */
const labelOf = (slot: TabSlot): string =>
  copy(slot === 'more' ? 'nav.more' : (VIEWS.find((v) => v.id === slot)?.copyKey ?? 'nav.more'));

describe('the bottom tab bar (brief 2.2)', () => {
  beforeEach(() => {
    useAppStore.getState().setUi({ lastView: 'today', hotkeys: true });
  });

  it('renders the slots of TAB_ORDER, in order, as one navigation landmark', () => {
    render(<TabBar view="today" moreOpen={false} onMore={() => undefined} />);
    const nav = screen.getByRole('navigation', { name: copy('nav.label') });
    const names = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(TAB_ORDER.map(labelOf));
  });

  it('marks the view on screen as the current page, and More while a More view is shown', () => {
    const { rerender } = render(<TabBar view="train" moreOpen={false} onMore={() => undefined} />);
    expect(screen.getByRole('button', { name: copy('nav.train') })).toHaveAttribute('aria-current', 'page');
    rerender(<TabBar view="settings" moreOpen={false} onMore={() => undefined} />);
    expect(screen.getByRole('button', { name: copy('nav.more') })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: copy('nav.train') })).not.toHaveAttribute('aria-current');
  });

  it('a tab switches the view; More asks for the sheet', () => {
    const onMore = vi.fn();
    render(<TabBar view="today" moreOpen={false} onMore={onMore} />);
    fireEvent.click(screen.getByRole('button', { name: copy('nav.log') }));
    expect(useAppStore.getState().ui.lastView).toBe('log');
    fireEvent.click(screen.getByRole('button', { name: copy('nav.more') }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('More lists every view the bar does not hold, then the palette row', () => {
    const onClose = vi.fn();
    const onFind = vi.fn();
    render(<MoreSheet view="atlas" onClose={onClose} onFind={onFind} />);
    const sheet = screen.getByRole('dialog', { name: copy('nav.more') });
    const rows = within(sheet).getAllByRole('button').map((b) => b.textContent);
    expect(rows).toEqual([...MORE_VIEWS.map(labelOf), copy('button.openSpotlight')]);
    expect(within(sheet).getByRole('button', { name: copy('nav.atlas') })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(sheet).getByRole('button', { name: copy('nav.plan') }));
    expect(onClose).toHaveBeenCalled();
    expect(useAppStore.getState().ui.lastView).toBe('plan');
  });

  it('the palette row closes the sheet and opens the palette', () => {
    const onClose = vi.fn();
    const onFind = vi.fn();
    render(<MoreSheet view="today" onClose={onClose} onFind={onFind} />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.openSpotlight') }));
    expect(onClose).toHaveBeenCalled();
    expect(onFind).toHaveBeenCalled();
  });
});

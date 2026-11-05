import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UPDATE_DOCK_ANCHOR, UpdatePrompt, notifyUpdateReady } from './UpdatePrompt';
import { copyFor } from '../content/copy';

describe('UpdatePrompt', () => {
  /**
   * One test rather than two: the pending-update slot is module state, so a
   * "renders nothing" test and a "renders on needRefresh" test would be
   * order-dependent on each other. Both assertions live in one sequence.
   */
  it('appears only once a waiting worker is reported, and hands the click to the updater', async () => {
    const apply = vi.fn();
    render(<UpdatePrompt />);

    // registerType is 'prompt': nothing is shown until the plugin says so.
    expect(screen.queryByText(copyFor('limelight', 'banner.update.tag'))).toBeNull();

    act(() => {
      notifyUpdateReady(apply);
    });
    expect(screen.getByText(copyFor('limelight', 'banner.update.tag'))).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();

    // The apply callback is the only thing that swaps the running worker, and
    // only a click reaches it.
    await userEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.reload') }));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

// Every stylesheet under src, as text, keyed by path (the limeContrast.test.ts convention).
const SHEETS = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true });

describe('UpdatePrompt placement (audit E13)', () => {
  it('renders inside a fixed dock, not in the scrolling flow', () => {
    act(() => {
      notifyUpdateReady(vi.fn());
    });
    render(<UpdatePrompt />);
    const dock = document.querySelector('.update-dock');
    expect(dock).not.toBeNull();
    expect(dock?.querySelector('.banner.update')).not.toBeNull();
  });

  it('docks fixed, under the header, one rung above every modal and below the system layers', () => {
    const shell = SHEETS['./appShell.css'] ?? '';
    const rule = /\.update-dock\s*\{([^}]*)\}/.exec(shell)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/z-index:\s*calc\(var\(--z-modal\) \+ 1\);/);
    const tokens = SHEETS['../ui/styles/tokens.css'] ?? '';
    const rung = (name: string): number => Number(new RegExp(`--z-${name}:\\s*(\\d+);`).exec(tokens)?.[1]);
    expect(rung('modal') + 1).toBeLessThan(rung('system'));
    expect(rung('toast')).toBeLessThan(rung('modal') + 1);
    // Nothing else claims the dock's rung or sits between it and the system layers.
    const crowding = Object.entries(SHEETS)
      .filter(([path]) => !path.endsWith('appShell.css'))
      .flatMap(([path, css]) => [...css.matchAll(/z-index:\s*calc\(var\(--z-modal\) \+ (\d)\)/g)].map((m) => `${path}: +${m[1] ?? ''}`));
    expect(crowding).toEqual([]);
  });

  it('measures the header it docks under', () => {
    expect(UPDATE_DOCK_ANCHOR).toBe('header.topbar');
  });
});

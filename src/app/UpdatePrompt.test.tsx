import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdatePrompt, notifyUpdateReady } from './UpdatePrompt';

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
    expect(screen.queryByText('UPDATE READY')).toBeNull();

    act(() => {
      notifyUpdateReady(apply);
    });
    expect(screen.getByText('UPDATE READY')).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();

    // The apply callback is the only thing that swaps the running worker, and
    // only a click reaches it.
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

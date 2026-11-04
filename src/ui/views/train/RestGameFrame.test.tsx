import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, copy } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { RestGameFrame, type RestGameResult } from './RestGameFrame';
import { DEFAULT_REST_GAME_HOST, RestGameHostContext } from './restGameHost';

const CLOCK = { remainingS: 45, minutes: 0, seconds: 45 }; // [s], [min], [s]

function renderFrame(
  result: RestGameResult,
  options: { onHide?: () => void; endNote?: string | null } = {},
) {
  const onExit = vi.fn();
  const view = render(
    <RestGameHostContext value={{ ...DEFAULT_REST_GAME_HOST, onHide: options.onHide ?? null }}>
      <RestGameFrame
        variant="rest-test"
        titleKey="hero.restWord"
        ruleKey="advice.restWordRule"
        t={copy}
        overrides={{}}
        clock={CLOCK}
        result={result}
        answer="lunge"
        endNote={options.endNote ?? null}
        status={REST_GAME_FORMAT.progress(1, 3)}
        onExit={onExit}
      >
        <button type="button">Board Control</button>
      </RestGameFrame>
    </RestGameHostContext>,
  );
  return { ...view, onExit };
}

describe('RestGameFrame (P6)', () => {
  it('names the game, shows the round clock and the rule, and holds the board during play', () => {
    renderFrame(null);
    expect(screen.getByRole('heading', { name: copy('hero.restWord') })).toBeInTheDocument();
    expect(screen.getByText(FORMAT.restRemaining(0, 45))).toBeInTheDocument();
    expect(screen.getByText(copy('advice.restWordRule'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board Control' })).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.progress(1, 3))).toBeInTheDocument();
  });

  it('leaves at once on Exit', () => {
    const { onExit } = renderFrame(null);
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordExit') }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('offers Hide only when a host can hide it', () => {
    renderFrame(null);
    expect(screen.queryByRole('button', { name: copy('button.restGameHide') })).toBeNull();
  });

  it('calls the host on Hide', () => {
    const onHide = vi.fn();
    renderFrame(null, { onHide });
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameHide') }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('ends won: says so, plays her sprite once, reveals nothing', () => {
    const { container } = renderFrame('won');
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(container.querySelector('.ll-sprite')?.getAttribute('data-sprite')).toBe('playing');
    expect(screen.queryByText(REST_GAME_FORMAT.answer('lunge'))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Board Control' })).toBeNull();
  });

  it('ends lost: says so and reveals the answer', () => {
    const { container } = renderFrame('lost');
    expect(screen.getByText(copy('status.restWordLost'))).toBeInTheDocument();
    expect(screen.getByText('The answer was LUNGE.')).toBeInTheDocument();
    expect(container.querySelector('.ll-sprite')?.getAttribute('data-sprite')).toBe('still');
    expect(container.querySelector('.rest-loss-chomp')).toBeInTheDocument();
  });

  it('ends out of time in its own words, with the answer and the end note', () => {
    renderFrame('timeUp', { endNote: 'Best 210 ms' });
    expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
    expect(screen.getByText(REST_GAME_FORMAT.answer('lunge'))).toBeInTheDocument();
    expect(screen.getByText('Best 210 ms')).toBeInTheDocument();
    // Exit stays available in every state (rest-games.md constraint 2).
    expect(screen.getByRole('button', { name: copy('button.restWordExit') })).toBeEnabled();
  });
});

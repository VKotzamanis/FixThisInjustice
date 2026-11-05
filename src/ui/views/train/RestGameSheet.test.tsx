import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FAMILIES, seededFamily, type RestGameFamily } from '../../../domain/fun/restGames';
import type { RestTimer } from '../../../domain/training/restTimer';
import { REST_GAME_CATALOG } from './restGameCatalog';
import { forgetRestGameChoice, rememberRestGameChoice } from './restGameChoice';
import { RestGameSheet } from './RestGameSheet';
import { entryOf } from '../../nav/history';
import { openOverlay } from '../../overlay/overlayStack';

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0); // [ms] epoch UTC

const TIMER: RestTimer = {
  startedAt: NOW,
  endsAt: NOW + 120_000, // [ms]
  durationS: 120, // [s]
  game: {
    exerciseId: 'barbell-bench-press',
    sessionId: 'session-1',
    assignmentDate: '2026-09-11',
    setNumber: 1,
    sessionSetOrdinal: 1,
  },
};

function renderSheet() {
  const onClose = vi.fn();
  const onWin = vi.fn();
  const view = render(
    <RestGameSheet
      timer={TIMER}
      priorWins={0}
      soundsEnabled={false}
      units="metric"
      t={copy}
      overrides={{}}
      onClose={onClose}
      onWin={onWin}
    />,
  );
  return { ...view, onClose, onWin };
}

const titleOf = (family: RestGameFamily): string => copy(REST_GAME_CATALOG[family].titleKey);

/** The picker's games in order, by the name each option is labelled with. */
function options(): string[] {
  return within(screen.getByRole('list'))
    .getAllByRole('button')
    .map((button) => button.querySelector('.rest-picker-name')?.textContent ?? '');
}

let back: MockInstance;

describe('RestGameSheet (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    forgetRestGameChoice();
    // A traversal that lands without moving: the stack swallows its own popstate (one per go),
    // so every case starts with nothing in flight, and jsdom's history never walks off its start.
    back = vi.spyOn(window.history, 'go').mockImplementation(() => {
      setTimeout(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
      }, 0);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens as a non-modal dialog on the picker, the seeded game first and tagged Suggested', () => {
    renderSheet();
    const sheet = screen.getByRole('dialog', { name: copy('label.restGameSheet') });
    expect(sheet.getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('heading', { name: copy('hero.restGamePicker') })).toBeInTheDocument();
    const first = seededFamily(TIMER.game!);
    expect(options()).toEqual([titleOf(first), ...REST_GAME_FAMILIES.filter((f) => f !== first).map(titleOf)]);
    expect(screen.getByText(copy('label.restGameSuggested'))).toBeInTheDocument();
  });

  it('puts the game last picked in this session first, tagged Last Played', () => {
    rememberRestGameChoice('session-1', 'reaction');
    renderSheet();
    expect(options()[0]).toBe(titleOf('reaction'));
    expect(screen.getByText(copy('label.restGameLastPlayed'))).toBeInTheDocument();
  });

  it('ignores a pick remembered from another session', () => {
    rememberRestGameChoice('another-session', 'reaction');
    renderSheet();
    expect(options()[0]).toBe(titleOf(seededFamily(TIMER.game!)));
    expect(screen.getByText(copy('label.restGameSuggested'))).toBeInTheDocument();
  });

  it('starts one round of the picked game and remembers the pick for the next rest', () => {
    const { unmount } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: titleOf('plateMath') }));
    expect(screen.getByRole('heading', { name: titleOf('plateMath') })).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    unmount();
    renderSheet();
    expect(options()[0]).toBe(titleOf('plateMath'));
  });

  it('closes unplayed on Not Now, and played on Exit after a pick', () => {
    const first = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameNotNow') }));
    expect(first.onClose).toHaveBeenCalledWith(false);
    first.unmount();

    const second = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: titleOf('restWord') }));
    fireEvent.click(screen.getByRole('button', { name: copy('button.restWordExit') }));
    expect(second.onClose).toHaveBeenCalledWith(true);
  });

  it('closes on Escape, unless an overlay opened above it takes the key first (one stack, R6)', () => {
    const { onClose } = renderSheet();
    const above = vi.fn();
    const modal = openOverlay(above, { modal: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(above).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    modal.release();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('pushes one history entry and closes on Back (R6)', async () => {
    // An earlier case's close is a real history.go(-1) that jsdom delivers on a later task; the
    // stack defers pushes until its own traversal has landed, so let it land first.
    await new Promise((resolve) => {
      setTimeout(resolve, 20); // [ms]
    });
    const push = vi.spyOn(window.history, 'pushState');
    const { onClose } = renderSheet();
    expect(push).toHaveBeenCalledTimes(1);
    expect(entryOf(push.mock.calls[0]?.[0])).toMatchObject({ depth: 1 });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { fti: { view: 'train', depth: 0 } } }));
    });
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('steps back over its own history entry when it closes any other way', async () => {
    const { unmount } = renderSheet();
    await act(async () => {
      unmount();
      await Promise.resolve(); // the step-back is issued in a microtask (src/ui/nav/history.ts)
    });
    expect(back).toHaveBeenCalledWith(-1);
  });

  it('hides the round behind a bar and shows the same board again', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: titleOf('restWord') }));
    fireEvent.click(screen.getByRole('button', { name: 'Q' }));
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameHide') }));
    expect(screen.queryByRole('heading', { name: titleOf('restWord') })).toBeNull();
    expect(document.body.classList.contains('rest-sheet-min')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameShow') }));
    expect(screen.getByRole('heading', { name: titleOf('restWord') })).toBeInTheDocument();
    const board = screen.getByRole('group', { name: copy('label.restWordBoard') });
    expect(board.querySelector('.rest-word-tile')?.textContent).toBe('Q');
  });

  it('marks the page under it while open and unmarks it on close', () => {
    const { unmount } = renderSheet();
    expect(document.body.classList.contains('rest-sheet-open')).toBe(true);
    unmount();
    expect(document.body.classList.contains('rest-sheet-open')).toBe(false);
  });

  it('takes focus when it opens, so a hardware key reaches the game', () => {
    renderSheet();
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: copy('label.restGameSheet') }));
  });
  it('shows the remaining rest in its minimised bar, which stands in for the rest bar (brief 5.1)', () => {
    render(
      <RestGameSheet
        timer={TIMER}
        priorWins={0}
        soundsEnabled={false}
        units="metric"
        t={copy}
        overrides={{}}
        clock="1:30"
        onClose={() => undefined}
        onWin={() => undefined}
      />,
    );
    // Open: the round clock above the board is the only clock (the 30 px row cost the 390 x 664
    // sheet its no-inner-scroll fit, e2e/p6-rest-sheet.spec.ts).
    expect(screen.queryByText('1:30')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: titleOf('restWord') }));
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGameHide') }));
    expect(document.querySelector('.rest-sheet-bar .rest-sheet-clock')?.textContent).toBe('1:30');
  });
});

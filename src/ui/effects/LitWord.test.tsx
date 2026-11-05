// LitWord (owner answer to review item 8): the still shader frame over the word, the word kept in
// the DOM for its accessible name, the plain text whenever the frame cannot be drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LitWord } from './LitWord';
import { litSwitchOn, renderLit } from './litText';

vi.mock('./litText', () => ({ renderLit: vi.fn(), litSwitchOn: vi.fn() }));

const draw = vi.mocked(renderLit);
const switchOn = vi.mocked(litSwitchOn);

function frame(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'lit-canvas';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

beforeEach(() => {
  draw.mockReset();
  switchOn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LitWord (review item 8)', () => {
  it('draws the still frame over the word and keeps the word as its name', async () => {
    switchOn.mockReturnValue(true);
    draw.mockReturnValue(frame());
    const { container } = render(
      <button type="button">
        <LitWord text="today" />
      </button>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]?.[1]).toBe('today');
    expect(container.querySelector('.lit-word.is-lit canvas.lit-canvas')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'today' })).toBeInTheDocument();
  });

  it('keeps the plain text when the switch is off: no draw at all', async () => {
    switchOn.mockReturnValue(false);
    const { container } = render(<LitWord text="today" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(draw).not.toHaveBeenCalled();
    expect(container.querySelector('.lit-word.is-lit')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('keeps the plain text without WebGL (renderLit null)', async () => {
    switchOn.mockReturnValue(true);
    draw.mockReturnValue(null);
    const { container } = render(<LitWord text="today" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.lit-word.is-lit')).toBeNull();
    expect(screen.getByText('today')).toBeInTheDocument();
  });

  it('removes its canvas on unmount and redraws for a new word', async () => {
    switchOn.mockReturnValue(true);
    draw.mockImplementation(() => frame());
    const { container, rerender, unmount } = render(<LitWord text="today" />);
    await act(async () => {
      await Promise.resolve();
    });
    rerender(<LitWord text="log" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(draw.mock.calls.map((c) => c[1])).toEqual(['today', 'log']);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    unmount();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('draws the DOM form in upper case when the word is set uppercase', async () => {
    switchOn.mockReturnValue(true);
    draw.mockReturnValue(frame());
    render(
      <span style={{ textTransform: 'uppercase' }}>
        <LitWord text="Rest Word" />
      </span>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(draw.mock.calls[0]?.[1]).toBe('REST WORD');
  });
});

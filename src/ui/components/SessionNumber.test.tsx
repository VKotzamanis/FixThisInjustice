// The session counter (owner answer to review item 10, 2026-11-05): the bare number in the burn
// font, named "Session n" for assistive technology, burning once when the cursor advances.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FORMAT } from '../../content/copy';
import { createBurn } from '../effects/burnText';
import { resetSessionMoments } from '../effects/burnMoments';
import { ViewActiveContext } from '../nav/viewActive';
import { SessionNumber } from './SessionNumber';
import sessionNumberCss from './sessionNumber.css?raw';
import trainCss from '../styles/train.css?raw';
import tokensCss from '../styles/tokens.css?raw';

vi.mock('../effects/burnText', () => ({ createBurn: vi.fn(() => null) }));
vi.mock('../effects/litText', () => ({ renderLit: vi.fn(() => null), litSwitchOn: vi.fn(() => false) }));

const create = vi.mocked(createBurn);

beforeEach(() => {
  vi.useFakeTimers();
  create.mockClear();
  resetSessionMoments();
  // jsdom lays nothing out; a rendered counter is one with a box.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 20, 14)] as unknown as DOMRectList);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SessionNumber (review item 10)', () => {
  it('shows the bare number and is named "Session n"', () => {
    render(<SessionNumber planId="p" shown={12} />);
    expect(FORMAT.planPosition(12, '')).toBe('12');
    const counter = screen.getByRole('img', { name: 'Session 12' });
    expect(counter.textContent).toBe('12');
  });

  it('does not burn on a first look, burns once when the number advances', () => {
    const { rerender } = render(<SessionNumber planId="p" shown={12} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).not.toHaveBeenCalled();
    rerender(<SessionNumber planId="p" shown={13} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1]).toBe('13');
    // A re-render of the same number is not a new moment.
    rerender(<SessionNumber planId="p" shown={13} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('burns in one renderer only when several show the same counter', () => {
    const { rerender } = render(
      <>
        <SessionNumber planId="p" shown={4} />
        <SessionNumber planId="p" shown={4} />
      </>,
    );
    rerender(
      <>
        <SessionNumber planId="p" shown={5} />
        <SessionNumber planId="p" shown={5} />
      </>,
    );
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a hidden renderer (a view kept mounted behind another) leaves the moment to a shown one', () => {
    const { rerender } = render(
      <>
        <div hidden>
          <SessionNumber planId="p" shown={7} />
        </div>
        <SessionNumber planId="p" shown={7} />
      </>,
    );
    rerender(
      <>
        <div hidden>
          <SessionNumber planId="p" shown={8} />
        </div>
        <SessionNumber planId="p" shown={8} />
      </>,
    );
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).toHaveBeenCalledTimes(1);
    const host = create.mock.calls[0]?.[0];
    expect(host?.closest('[hidden]')).toBeNull();
  });

  it('claims an advance seen behind another view once that view comes on screen', () => {
    // The counter left the always-shown header ticker (owner report on 4a27393), so Today kept
    // mounted behind Train (a finish that stays for the post-session weigh-in) must still burn.
    const at = (active: boolean, shown: number) => (
      <ViewActiveContext value={active}>
        <SessionNumber planId="p" shown={shown} />
      </ViewActiveContext>
    );
    const { rerender } = render(at(true, 3));
    rerender(at(false, 4));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).not.toHaveBeenCalled();
    rerender(at(true, 4));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).toHaveBeenCalledTimes(1);
    rerender(at(false, 4));
    rerender(at(true, 4));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('is set at the rest-over word size, read from the one token both rules use', () => {
    // Rule 2 (derive, never copy): neither sheet restates the size; the token names it once.
    const fontSizeOf = (css: string, selector: string): string | undefined =>
      new RegExp(`${selector.replace('.', '\\.')} \\{[^}]*font-size:\\s*([^;]+);`).exec(css)?.[1]?.trim();
    expect(fontSizeOf(sessionNumberCss, '.session-number-word')).toBe('var(--burn-word-size)');
    expect(fontSizeOf(trainCss, '.rest-over-word')).toMatch(/^var\(--burn-word-size\)/);
    expect(tokensCss.match(/--burn-word-size:\s*var\(--text-lg\);/g)).toHaveLength(2);
  });

  it('appends a status word after the number, outside the burn', () => {
    render(<SessionNumber planId="p" shown={208} suffix="wrapped" />);
    expect(screen.getByText('wrapped')).toBeInTheDocument();
    expect(screen.getByText('208')).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCopy, useCopyOverrides } from './useCopy';
import { DEFAULT_COPY, FORMAT, LIMELIGHT_COPY, SKIN_COPY } from './copy';
import { useAppStore } from '../store';
import { makeAppState, makeUiPrefs } from '../test/funFixtures';
import type { SkinId } from '../domain/types';

function setSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

describe('useCopy', () => {
  it('reads the clinical table under the clinical skin', () => {
    setSkin('clinical');
    const { result } = renderHook(() => useCopy());
    expect(result.current('button.startSession')).toBe('Start Session');
  });

  it('reads the override table under each skin that has one', () => {
    setSkin('limelight');
    const limelight = renderHook(() => useCopy());
    expect(limelight.result.current('button.startSession')).toBe("LET'S GO BABES");

    setSkin('board');
    const board = renderHook(() => useCopy());
    expect(board.result.current('button.startSession')).toBe('BOARD');
  });

  it('falls back to the clinical string for a key the skin does not name', () => {
    setSkin('limelight');
    const { result } = renderHook(() => useCopy());
    expect(result.current('hero.atlas')).toBe(DEFAULT_COPY['hero.atlas']);
  });

  it('follows a skin change without remounting', () => {
    setSkin('clinical');
    const { result } = renderHook(() => useCopy());
    expect(result.current('status.rest')).toBe('REST');
    act(() => {
      setSkin('limelight');
    });
    expect(result.current('status.rest')).toBe('catch ur breath');
  });

  it('keeps one identity per skin, so an effect does not re-run every render', () => {
    setSkin('limelight');
    const { result, rerender } = renderHook(() => useCopy());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useCopyOverrides', () => {
  it('hands the FORMAT frames the active skin table', () => {
    setSkin('limelight');
    const { result } = renderHook(() => useCopyOverrides());
    expect(result.current).toBe(SKIN_COPY.limelight);
    expect(FORMAT.milestoneSets('250', result.current)).toBe(
      LIMELIGHT_COPY['status.milestoneSets']?.replace('{count}', '250'),
    );
  });

  it('hands the clinical skin an empty table, which changes no frame', () => {
    setSkin('clinical');
    const { result } = renderHook(() => useCopyOverrides());
    expect(result.current).toEqual({});
    expect(FORMAT.milestoneSets('250', result.current)).toBe('250 sets recorded.');
  });
});

import { describe, expect, it, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { JSX } from 'react';
import { SKIN_IDS, useApplySkin, useSkin } from './skinContext';
import { useAppStore } from '../store';
import { makeAppState, makeUiPrefs } from '../test/funFixtures';
import type { SkinId } from '../domain/types';

/**
 * A probe that does both jobs of the module at once: it applies the attribute and prints the
 * value the hook read. Rendering a probe rather than App keeps this suite independent of the
 * shell, which is another task's file.
 */
function Probe(): JSX.Element {
  useApplySkin();
  return <span data-testid="skin">{useSkin()}</span>;
}

function mount(skin: SkinId): ReturnType<typeof render> {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
  return render(<Probe />);
}

afterEach(() => {
  delete document.documentElement.dataset.skin;
});

describe('SKIN_IDS', () => {
  it('lists the three ids in the order the schema enumerates them', () => {
    expect(SKIN_IDS).toEqual(['clinical', 'limelight', 'board']);
  });
});

describe('useApplySkin', () => {
  it('writes each skin id to the document root', () => {
    for (const skin of SKIN_IDS) {
      const view = mount(skin);
      expect(document.documentElement.getAttribute('data-skin')).toBe(skin);
      view.unmount();
    }
  });

  it('follows a live skin change through the store', () => {
    const { getByTestId } = mount('clinical');
    expect(document.documentElement.getAttribute('data-skin')).toBe('clinical');
    act(() => {
      useAppStore.getState().setUi({ skin: 'limelight' });
    });
    expect(document.documentElement.getAttribute('data-skin')).toBe('limelight');
    expect(getByTestId('skin').textContent).toBe('limelight');
  });

  it('clears the attribute when it unmounts, leaving no global state behind', () => {
    const view = mount('board');
    expect(document.documentElement.getAttribute('data-skin')).toBe('board');
    view.unmount();
    expect(document.documentElement.getAttribute('data-skin')).toBeNull();
  });
});

describe('useSkin', () => {
  it('reads ui.skin from the store, which is the single source of truth', () => {
    const { getByTestId } = mount('board');
    expect(getByTestId('skin').textContent).toBe('board');
    expect(useAppStore.getState().ui.skin).toBe('board');
  });
});

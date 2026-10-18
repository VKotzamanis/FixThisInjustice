import { describe, expect, it, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
  it('lists the sole shipped id', () => {
    expect(SKIN_IDS).toEqual(['limelight']);
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

  it('clears the attribute when it unmounts, leaving no global state behind', () => {
    const view = mount('limelight');
    expect(document.documentElement.getAttribute('data-skin')).toBe('limelight');
    view.unmount();
    expect(document.documentElement.getAttribute('data-skin')).toBeNull();
  });
});

describe('useSkin', () => {
  it('reads ui.skin from the store, which is the single source of truth', () => {
    const { getByTestId } = mount('limelight');
    expect(getByTestId('skin').textContent).toBe('limelight');
    expect(useAppStore.getState().ui.skin).toBe('limelight');
  });
});

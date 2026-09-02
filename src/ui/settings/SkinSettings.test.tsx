import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkinSettings } from './SkinSettings';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';

afterEach(() => {
  delete document.documentElement.dataset.skin;
});

describe('SkinSettings', () => {
  it('offers the three skins with the stored one selected', () => {
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    render(<SkinSettings />);

    const group = screen.getByRole('group', { name: copy('label.settingsSkin') });
    expect(group).toBeInTheDocument();
    // The names are proper nouns, not the stored ids: a skin is a thing with a name.
    expect(screen.getByRole('radio', { name: 'Clinical' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Limelight' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Board' })).not.toBeChecked();
  });

  it('writes the chosen skin to the store', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    render(<SkinSettings />);

    await user.click(screen.getByRole('radio', { name: 'Board' }));
    expect(useAppStore.getState().ui.skin).toBe('board');
    expect(screen.getByRole('radio', { name: 'Board' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Clinical' }));
    expect(useAppStore.getState().ui.skin).toBe('clinical');
  });

  it('leaves the other UI preferences alone when the skin changes', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical', lastView: 'train' }) }));
    render(<SkinSettings />);

    await user.click(screen.getByRole('radio', { name: 'Limelight' }));
    expect(useAppStore.getState().ui.lastView).toBe('train');
    expect(useAppStore.getState().ui.accent).toBe('#a3e635');
  });

  it('keeps sounds off until the user turns them on', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs() }));
    render(<SkinSettings />);

    const toggle = screen.getByRole('checkbox', { name: copy('label.settingsSounds') });
    expect(toggle).not.toBeChecked();
    expect(useAppStore.getState().ui.sounds).toBe(false);

    await user.click(toggle);
    expect(useAppStore.getState().ui.sounds).toBe(true);
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(useAppStore.getState().ui.sounds).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkinSettings } from './SkinSettings';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';

/*
 * The sound-effect player is mocked so the unlock can be counted. It is held in a hoisted object
 * rather than read back off the mocked module because a bare `sfxPlayer.unlock` reference is an
 * unbound method, which this project's lint configuration rejects.
 */
const sfx = vi.hoisted(() => ({ unlock: vi.fn(() => Promise.resolve()) }));
vi.mock('../../skins/sfx', () => ({
  sfxPlayer: { unlock: sfx.unlock, play: vi.fn(), dispose: vi.fn() },
}));

beforeEach(() => {
  sfx.unlock.mockClear();
});

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

  it('unlocks audio inside the gesture that turns sounds on, and only then', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs() }));
    render(<SkinSettings />);

    const toggle = screen.getByRole('checkbox', { name: copy('label.settingsSounds') });
    expect(sfx.unlock).not.toHaveBeenCalled();

    await user.click(toggle);
    expect(sfx.unlock).toHaveBeenCalledTimes(1);

    // Turning them off spends no gesture: there is nothing to resume and nothing to decode.
    await user.click(toggle);
    expect(sfx.unlock).toHaveBeenCalledTimes(1);
  });

  it('leaves the audio unlock out of a skin change', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
    render(<SkinSettings />);

    await user.click(screen.getByRole('radio', { name: 'Board' }));
    expect(sfx.unlock).not.toHaveBeenCalled();
  });
});

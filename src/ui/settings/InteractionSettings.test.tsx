import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InteractionSettings } from './InteractionSettings';
import { copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';

const sfx = vi.hoisted(() => ({ unlock: vi.fn(() => Promise.resolve()) }));
vi.mock('../../skins/sfx', () => ({
  sfxPlayer: { unlock: sfx.unlock, play: vi.fn(), dispose: vi.fn() },
}));

beforeEach(() => {
  sfx.unlock.mockReset();
  sfx.unlock.mockImplementation(() => Promise.resolve());
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
});

describe('InteractionSettings', () => {
  it('keeps sounds off until the user turns them on', async () => {
    const user = userEvent.setup();
    render(<InteractionSettings />);
    const toggle = screen.getByRole('checkbox', {
      name: copyFor('limelight', 'label.settingsSounds'),
    });
    expect(toggle).not.toBeChecked();
    expect(useAppStore.getState().ui.sounds).toBe(false);
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(useAppStore.getState().ui.sounds).toBe(true);
    await user.click(toggle);
    expect(useAppStore.getState().ui.sounds).toBe(false);
  });

  it('unlocks audio only when sounds are turned on', async () => {
    const user = userEvent.setup();
    render(<InteractionSettings />);
    const toggle = screen.getByRole('checkbox', {
      name: copyFor('limelight', 'label.settingsSounds'),
    });
    expect(sfx.unlock).not.toHaveBeenCalled();
    await user.click(toggle);
    expect(sfx.unlock).toHaveBeenCalledTimes(1);
    await user.click(toggle);
    expect(sfx.unlock).toHaveBeenCalledTimes(1);
  });

  it('offers the character-key shortcuts an off switch that starts on', async () => {
    const user = userEvent.setup();
    render(<InteractionSettings />);
    const toggle = screen.getByRole('checkbox', {
      name: copyFor('limelight', 'label.settingsHotkeys'),
    });
    expect(toggle).toBeChecked();
    expect(useAppStore.getState().ui.hotkeys).toBe(true);
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(useAppStore.getState().ui.hotkeys).toBe(false);
  });

  it('describes both switches', () => {
    render(<InteractionSettings />);
    expect(screen.getByText(copyFor('limelight', 'advice.soundsSilent'))).toBeInTheDocument();
    expect(
      screen.getByText(copyFor('limelight', 'advice.hotkeysKeyboardOnly')),
    ).toBeInTheDocument();
  });

  it('changes hotkeys without spending an audio gesture or disturbing other UI preferences', async () => {
    const user = userEvent.setup();
    useAppStore.setState(
      makeAppState({
        ui: makeUiPrefs({ skin: 'limelight', sounds: true, lastView: 'train' }),
      }),
    );
    render(<InteractionSettings />);
    await user.click(
      screen.getByRole('checkbox', { name: copyFor('limelight', 'label.settingsHotkeys') }),
    );
    const ui = useAppStore.getState().ui;
    expect(ui.hotkeys).toBe(false);
    expect(ui.skin).toBe('limelight');
    expect(ui.sounds).toBe(true);
    expect(ui.lastView).toBe('train');
    expect(sfx.unlock).not.toHaveBeenCalled();
  });
});

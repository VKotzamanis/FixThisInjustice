import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkinSettings } from './SkinSettings';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { SkinId } from '../../domain/types';

/*
 * The sound-effect player is mocked so the unlock can be counted. It is held in a hoisted object
 * rather than read back off the mocked module because a bare `sfxPlayer.unlock` reference is an
 * unbound method, which this project's lint configuration rejects.
 */
const sfx = vi.hoisted(() => ({ unlock: vi.fn(() => Promise.resolve()) }));
vi.mock('../../skins/sfx', () => ({
  sfxPlayer: { unlock: sfx.unlock, play: vi.fn(), dispose: vi.fn() },
}));

/*
 * mockReset, not mockClear: one test below replaces the implementation to record what the store
 * held when the unlock ran, and vitest's restoreMocks does not restore a vi.fn() created outside a
 * test (measured for the same pattern in src/skins/sfx.test.ts), so the default is re-established
 * here rather than assumed.
 */
beforeEach(() => {
  sfx.unlock.mockReset();
  sfx.unlock.mockImplementation(() => Promise.resolve());
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

  it('offers the character-key shortcuts an off switch that starts on', async () => {
    /*
     * WCAG 2.1 SC 2.1.4 asks for a MECHANISM to turn single-character shortcuts off, not for
     * them to ship off, which is why the stored default is true (src/domain/schema.ts, a Zod
     * default) and this is the control that criterion names. Until now `ui.hotkeys` was written
     * by nothing in the app: the field existed, the registry read it, and no screen could reach
     * it, so the criterion was met on paper and not in the product.
     */
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs() }));
    render(<SkinSettings />);

    const toggle = screen.getByRole('checkbox', { name: copy('label.settingsHotkeys') });
    expect(toggle).toBeChecked();
    expect(useAppStore.getState().ui.hotkeys).toBe(true);

    await user.click(toggle);
    expect(useAppStore.getState().ui.hotkeys).toBe(false);
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(useAppStore.getState().ui.hotkeys).toBe(true);
  });

  it('writes the hotkeys field alone, and spends no audio gesture on it', async () => {
    const user = userEvent.setup();
    useAppStore.setState(
      makeAppState({ ui: makeUiPrefs({ skin: 'board', sounds: true, lastView: 'train' }) }),
    );
    render(<SkinSettings />);

    await user.click(screen.getByRole('checkbox', { name: copy('label.settingsHotkeys') }));
    const ui = useAppStore.getState().ui;
    expect(ui.hotkeys).toBe(false);
    expect(ui.skin).toBe('board');
    expect(ui.sounds).toBe(true);
    expect(ui.lastView).toBe('train');
    // Nothing to decode and no context to resume: a keyboard preference is not an audio one.
    expect(sfx.unlock).not.toHaveBeenCalled();
  });

  it('unlocks audio on a skin change, after the new skin is in the store', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));

    /*
     * A radio click is a user gesture, which is the only place an unlock may be spent, and the
     * skin change is the one moment the held sound set stops matching the skin on screen. Without
     * this call nothing re-decodes and play() stays silent under the new skin until some unrelated
     * gesture happens to unlock again.
     *
     * The order is as load-bearing as the call. The player reads the skin through getState(), so
     * an unlock raised before the store write would decode the skin the user has just left. The
     * implementation is replaced here to record what the store held at the moment it ran.
     */
    const seen: SkinId[] = [];
    sfx.unlock.mockImplementation(() => {
      seen.push(useAppStore.getState().ui.skin);
      return Promise.resolve();
    });
    render(<SkinSettings />);

    await user.click(screen.getByRole('radio', { name: 'Board' }));
    expect(sfx.unlock).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['board']);
  });
});

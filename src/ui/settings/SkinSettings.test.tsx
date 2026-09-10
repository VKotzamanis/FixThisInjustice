import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkinSettings } from './SkinSettings';
import { copy, copyFor } from '../../content/copy';
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

    const group = screen.getByRole('group', { name: copyFor('limelight', 'label.settingsSkin') });
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
    // Pinned, because the assertions below quote the DEFAULT table and the SHIPPED skin is
    // limelight (src/domain/schema.ts). What a skin changes is asserted in its own suite.
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
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
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
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
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
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

  it('gives both switches a description of what they do (round 3, the owner: "I have no idea what they do")', () => {
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
    render(<SkinSettings />);

    // Sounds: honest about there being no shipped audio, never a promise it will play.
    expect(screen.getByText(copy('advice.soundsSilent'))).toBeInTheDocument();
    // Hotkeys: honest that the switch changes nothing reachable without a keyboard.
    expect(screen.getByText(copy('advice.hotkeysKeyboardOnly'))).toBeInTheDocument();
  });

  it('writes the hotkeys field alone, and spends no audio gesture on it', async () => {
    const user = userEvent.setup();
    useAppStore.setState(
      makeAppState({ ui: makeUiPrefs({ skin: 'board', sounds: true, lastView: 'train' }) }),
    );
    render(<SkinSettings />);

    // BOARD_COPY names no toggle, so this key falls through to the default. Quoted through
    // `copyFor` rather than `copy` so the expectation states which table it expects.
    await user.click(
      screen.getByRole('checkbox', { name: copyFor('board', 'label.settingsHotkeys') }),
    );
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

/**
 * THE PICKER UNDER A SKIN (P8 review).
 *
 * Every string in this component came from a bare `copy()` call, so the one row whose whole
 * subject is the skin rendered the clinical words under all three of them: "Skin" where the
 * design says "the look", and no crown, on the position round three section 4.4 draws the crown
 * at (src/skins/limelight/Icon.tsx, ICON_FOR_KEY['label.settingsSkin']).
 *
 * Asserted by KEY through `copyFor`, never as a literal. The three SKIN NAMES are the deliberate
 * exception and are asserted as literals, because a proper noun is what they are.
 */
describe('SkinSettings under a skin', () => {
  it('names the picker and the toggles in the limelight words', () => {
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    render(<SkinSettings />);

    expect(
      screen.getByRole('group', { name: copyFor('limelight', 'label.settingsSkin') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: copyFor('limelight', 'label.settingsSounds') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: copyFor('limelight', 'label.settingsHotkeys') }),
    ).toBeInTheDocument();
    // The clinical word is gone, not merely joined.
    expect(
      screen.queryByRole('group', { name: copyFor('clinical', 'label.settingsSkin') }),
    ).toBeNull();
  });

  it('draws the crown at the position the design gives it, and only under limelight', () => {
    /*
     * The icon is DECORATIVE (empty alt, aria-hidden), so it is asserted through the DOM rather
     * than through an accessible name: an icon that announced itself would double the group's
     * name. Its absence off limelight is Icon's own skin gate, asserted here because this is the
     * call site that has to survive it.
     */
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'limelight' }) }));
    const limelight = render(<SkinSettings />);
    expect(limelight.container.querySelector('legend img.ll-icon')).not.toBeNull();
    limelight.unmount();

    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
    const clinical = render(<SkinSettings />);
    expect(clinical.container.querySelector('legend img.ll-icon')).toBeNull();
  });

  it('shouts the picker in the board words, and still writes the id the radio names', async () => {
    const user = userEvent.setup();
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'board' }) }));
    render(<SkinSettings />);

    expect(
      screen.getByRole('group', { name: copyFor('board', 'label.settingsSkin') }),
    ).toBeInTheDocument();
    // BOARD_COPY names neither toggle, so both fall through to the default: the fall-through is
    // per KEY, which is what makes a partial override table safe.
    expect(
      screen.getByRole('checkbox', { name: copyFor('board', 'label.settingsHotkeys') }),
    ).toBeInTheDocument();

    // A skin renames the row and never the control: the radios still write `ui.skin`.
    await user.click(screen.getByRole('radio', { name: 'Clinical' }));
    expect(useAppStore.getState().ui.skin).toBe('clinical');
  });

  it('leaves the three skin names as proper nouns under every skin', () => {
    /*
     * The one row this component may NOT skin. A skin that renamed the other two would be a skin
     * a user could not reliably leave, and the name also matches the id an exported document
     * carries, so the screen and the file agree.
     */
    for (const skin of ['clinical', 'limelight', 'board'] as const) {
      useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
      const view = render(<SkinSettings />);
      for (const name of ['Clinical', 'Limelight', 'Board']) {
        expect(screen.getByRole('radio', { name })).toBeInTheDocument();
      }
      view.unmount();
    }
  });

  it('renders the default table under clinical', () => {
    useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin: 'clinical' }) }));
    render(<SkinSettings />);

    expect(
      screen.getByRole('group', { name: copyFor('clinical', 'label.settingsSkin') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: copyFor('clinical', 'hero.skin') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: copyFor('clinical', 'label.settingsSounds') }),
    ).toBeInTheDocument();
  });
});

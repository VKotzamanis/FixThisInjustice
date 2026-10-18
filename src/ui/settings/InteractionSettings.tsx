import type { ChangeEvent, JSX } from 'react';

import { sfxPlayer } from '../../skins/sfx';
import { useCopy } from '../../content/useCopy';
import { useAppStore } from '../../store';

/**
 * The Settings row for the sound and shortcut switches: what SkinSettings rendered before the
 * skin picker was removed (limelight is the only skin), under the same `hero.skin` heading.
 */
export function InteractionSettings(): JSX.Element {
  const c = useCopy();
  const sounds = useAppStore((state) => state.ui.sounds);
  const hotkeys = useAppStore((state) => state.ui.hotkeys);

  /*
   * Turning sounds on unlocks Web Audio inside this handler, because resume() has to run in the
   * gesture task and not in an effect that follows it (round-three plan section 6.2 rule 1).
   * Turning them off unlocks nothing: there is no gesture to spend and nothing to decode.
   */
  const onSoundsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.checked;
    useAppStore.getState().setUi({ sounds: next });
    if (next) void sfxPlayer.unlock();
  };

  /*
   * The WCAG 2.1 SC 2.1.4 mechanism for single-character shortcuts. No unlock: a keyboard
   * preference decodes nothing. What it switches off is decided by src/ui/hotkeys.tsx; this only
   * records the preference.
   */
  const onHotkeysChange = (event: ChangeEvent<HTMLInputElement>): void => {
    useAppStore.getState().setUi({ hotkeys: event.target.checked });
  };

  return (
    <>
      <h2>{c('hero.skin')}</h2>
      <label className="view-inline">
        <input type="checkbox" checked={sounds} onChange={onSoundsChange} />
        {c('label.settingsSounds')}
      </label>
      <p className="view-note">{c('advice.soundsSilent')}</p>
      <label className="view-inline">
        <input type="checkbox" checked={hotkeys} onChange={onHotkeysChange} />
        {c('label.settingsHotkeys')}
      </label>
      <p className="view-note">{c('advice.hotkeysKeyboardOnly')}</p>
      <p className="view-note">{c('advice.hotkeysOff')}</p>
    </>
  );
}

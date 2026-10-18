import type { ChangeEvent, JSX } from 'react';

import { sfxPlayer } from '../../skins/sfx';
import { useCopy } from '../../content/useCopy';
import { useAppStore } from '../../store';

/** Sound and keyboard preferences that do not select an application skin. */
export function InteractionSettings(): JSX.Element {
  const c = useCopy();
  const sounds = useAppStore((state) => state.ui.sounds);
  const hotkeys = useAppStore((state) => state.ui.hotkeys);

  const onSoundsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.checked;
    useAppStore.getState().setUi({ sounds: next });
    if (next) void sfxPlayer.unlock();
  };

  const onHotkeysChange = (event: ChangeEvent<HTMLInputElement>): void => {
    useAppStore.getState().setUi({ hotkeys: event.target.checked });
  };

  return (
    <>
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

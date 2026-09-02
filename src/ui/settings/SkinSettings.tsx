import type { ChangeEvent, JSX } from 'react';

import { SKIN_IDS, useSkin } from '../../skins/skinContext';
import { copy, type CopyKey } from '../../content/copy';
import { useAppStore } from '../../store';
import type { SkinId } from '../../domain/types';

/**
 * The name each skin is offered under. Proper nouns, and deliberately NOT skinned: a skin that
 * renamed the other skins in this row would be a skin a user could not reliably leave. The name
 * also matches the id an exported document carries, so the screen and the file agree.
 */
const SKIN_LABEL: Readonly<Record<SkinId, CopyKey>> = {
  clinical: 'option.skinClinical',
  limelight: 'option.skinLimelight',
  board: 'option.skinBoard',
};

/**
 * The Settings row that chooses the skin and turns sounds on (P8 Task 12).
 *
 * A native radio group inside a fieldset, not a row of buttons carrying role="radio". The
 * platform control brings arrow-key roving focus, the group's accessible name from the legend,
 * and the one-of-n semantic, none of which a div has to be talked into; and `checked` is driven
 * from the store rather than from local state, so the picker reflects a skin changed anywhere
 * else in the app rather than holding a second opinion about it.
 *
 * A change writes one field. `setUi` is a shallow patch over `ui`, so choosing a skin cannot
 * disturb the accent, the last view, or the migration decision sitting beside it.
 */
export function SkinSettings(): JSX.Element {
  const skin = useSkin();
  const sounds = useAppStore((state) => state.ui.sounds);

  /*
   * The action is reached through getState() at the moment of the change rather than selected
   * into a local, which is DataSection's pattern in this directory. Selecting it would subscribe
   * this component to a function identity it never renders, and the eslint unbound-method rule
   * refuses the detached reference on a typed store method.
   */
  const onSkinChange = (next: SkinId) => (): void => {
    useAppStore.getState().setUi({ skin: next });
  };

  /*
   * This writes the preference and nothing else. Web Audio cannot be unlocked from here: a
   * browser only grants an AudioContext on a user gesture, and the gesture that matters is the
   * one on the screen that plays the sound. P8 Task 15 owns that unlock and the four moments
   * (round-three plan section 6.1); this checkbox is the flag it reads.
   */
  const onSoundsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    useAppStore.getState().setUi({ sounds: event.target.checked });
  };

  return (
    <>
      <h2>{copy('hero.skin')}</h2>
      <p className="view-note">{copy('advice.skinChanges')}</p>
      <fieldset className="skin-picker">
        <legend>{copy('label.settingsSkin')}</legend>
        {SKIN_IDS.map((id) => (
          <label key={id} className="skin-option">
            <input
              type="radio"
              name="skin"
              value={id}
              checked={skin === id}
              onChange={onSkinChange(id)}
            />
            {copy(SKIN_LABEL[id])}
          </label>
        ))}
      </fieldset>
      <label className="settings-toggle">
        <input type="checkbox" checked={sounds} onChange={onSoundsChange} />
        {copy('label.settingsSounds')}
      </label>
    </>
  );
}

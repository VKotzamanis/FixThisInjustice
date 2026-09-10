import type { ChangeEvent, JSX } from 'react';

import { SKIN_IDS, useSkin } from '../../skins/skinContext';
import { sfxPlayer } from '../../skins/sfx';
import { SkinLabel } from '../../skins/limelight/Icon';
import { copy, type CopyKey } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
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
 * The Settings row that chooses the skin, turns sounds on, and switches the single-character
 * shortcuts off (P8 Task 12; the shortcut switch added by P8 close-out B).
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
  /*
   * The row's own words, resolved at RENDER against the active skin.
   *
   * Every string here was a bare `copy()` call until the P8 review, which is the DEFAULT table
   * whatever `ui.skin` says: the one screen whose whole subject is the skin was the one screen
   * that did not follow it. `SKIN_LABEL` above is the deliberate exception and stays on `copy()`.
   */
  const c = useCopy();
  const sounds = useAppStore((state) => state.ui.sounds);
  const hotkeys = useAppStore((state) => state.ui.hotkeys);

  /*
   * The action is reached through getState() at the moment of the change rather than selected
   * into a local, which is DataSection's pattern in this directory. Selecting it would subscribe
   * this component to a function identity it never renders, and the eslint unbound-method rule
   * refuses the detached reference on a typed store method.
   *
   * The store is written first, then the unlock is raised, and both orderings are deliberate. The
   * player holds one skin's decoded set and refuses to play it under any other skin, so a change
   * with no unlock behind it leaves the new skin silent until an unrelated gesture happens to
   * unlock again; and the player reads the skin through getState(), so an unlock raised before the
   * write would decode the skin the user has just left. A radio click is a real user gesture,
   * which is what resume() has to run inside, and unlock() returns immediately while sounds are
   * off, so a skin change with sounds off still fetches nothing.
   */
  const onSkinChange = (next: SkinId) => (): void => {
    useAppStore.getState().setUi({ skin: next });
    void sfxPlayer.unlock();
  };

  /*
   * Turning sounds on unlocks Web Audio inside this handler, because resume() has to run in the
   * gesture task and not in an effect that follows it. This is the second of the two unlock points
   * round-three plan section 6.2 rule 1 names, and it is the one that matters for a user who turns
   * sounds on before touching anything else on the screen; the first is useFirstGestureUnlock().
   * Turning them off unlocks nothing: there is no gesture to spend and nothing to decode.
   */
  const onSoundsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.checked;
    useAppStore.getState().setUi({ sounds: next });
    if (next) void sfxPlayer.unlock();
  };

  /*
   * The WCAG 2.1 SC 2.1.4 mechanism, wired to the field ae13db6 added.
   *
   * No unlock and no second field: a keyboard preference decodes nothing and resumes nothing, so
   * the gesture is not spent here. `setUi` is a shallow patch, so this cannot disturb the skin,
   * the sounds flag, or the last view sitting beside it in `ui`.
   *
   * What it takes away is decided by src/ui/hotkeys.tsx, not here: combos carrying a modifier
   * (`mod+k`) and keys that type no character (Escape) stay bound whatever this checkbox says,
   * because a switch that stranded the user in one view would be an accessibility defect of its
   * own. This component only records the preference.
   */
  const onHotkeysChange = (event: ChangeEvent<HTMLInputElement>): void => {
    useAppStore.getState().setUi({ hotkeys: event.target.checked });
  };

  return (
    <>
      <h2>{c('hero.skin')}</h2>
      <p className="view-note">{c('advice.skinChanges')}</p>
      {/*
        * THE CLASS NAMES ARE THE SHEET'S, NOT THIS COMPONENT'S. `skin-picker`, `skin-option` and
        * `settings-toggle` named no rule in any stylesheet this app loads, so the picker
        * rendered at the browser default: a checkbox with no 44 px target, in a fieldset with a
        * default border src/ui/views/views.css styles nowhere. Rather than write a fourth
        * stylesheet for three declarations, this row now uses the classes the rest of Settings
        * uses -- a bare <fieldset> with a <legend>, and `view-inline` on every label -- which is
        * exactly src/ui/components/ReminderSettingsPanel.tsx's markup and which views.css
        * already gives `min-height: 2.75rem` (44 px at the 16 px root) and a token palette.
        */}
      <fieldset>
        {/*
          * Through SkinLabel rather than `c('label.settingsSkin')` alone, because round three
          * section 4.4 draws the CROWN at this position and ICON_FOR_KEY carries it. SkinLabel
          * is the one call-site shape that replaces an emoji position: it reads the string
          * through `useCopy()` and renders the icon only on limelight, where Icon is the only
          * skin that has art. The icon is decorative, so the legend's text is still the whole
          * accessible name of the fieldset.
          */}
        <legend>
          <SkinLabel copyKey="label.settingsSkin" />
        </legend>
        {/* The three names stay `copy()`: see SKIN_LABEL above. */}
        {SKIN_IDS.map((id) => (
          <label key={id} className="view-inline">
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
      <label className="view-inline">
        <input type="checkbox" checked={sounds} onChange={onSoundsChange} />
        {c('label.settingsSounds')}
      </label>
      {/*
        * Round 3, the owner: the switch names alone did not say what either one does. Neither
        * line is skinned (see the comment beside the keys in copy.ts): both state a fact about
        * the app's own rules, not its register. This one must never promise sound will play,
        * because public/sfx/ ships empty (src/skins/sfx.ts).
        */}
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

// src/ui/views/train/RestGamePicker.tsx
//
// Pick this rest's game (P6, R10). Five options, the first is the last pick in this session or
// the rest's own suggestion, tagged in words. One tap starts one round; Not Now closes the picker
// and leaves the offer standing. Each option is named by the game alone and described by its rule.
import { useId, type ReactElement } from 'react';
import type { CopyKey } from '../../../content/copy';
import type { RestGameFamily } from '../../../domain/fun/restGames';
import { REST_GAME_CATALOG } from './restGameCatalog';
import { Echo } from '../../components/Echo';

export type RestGamePickerTag = 'suggested' | 'lastPlayed';

export interface RestGamePickerProps {
  /** Every family, the one to offer first at index 0. */
  families: readonly RestGameFamily[];
  tag: RestGamePickerTag;
  t: (key: CopyKey) => string;
  onPick: (family: RestGameFamily) => void;
  onClose: () => void;
}

const TAG_KEY: Readonly<Record<RestGamePickerTag, CopyKey>> = {
  suggested: 'label.restGameSuggested',
  lastPlayed: 'label.restGameLastPlayed',
};

export function RestGamePicker(props: RestGamePickerProps): ReactElement {
  const { families, tag, t, onPick, onClose } = props;
  const id = useId();
  const titleId = `${id}-title`;

  return (
    <div className="rest-game rest-picker" role="group" aria-labelledby={titleId}>
      <div className="rest-game-topline">
        <h3 id={titleId}>
          <Echo text={t('hero.restGamePicker')} />
        </h3>
        <div className="rest-game-actions">
          <button type="button" className="rest-game-exit" onClick={onClose}>
            {t('button.restGameNotNow')}
          </button>
        </div>
      </div>
      <p className="rest-game-rule">{t('advice.restGamePicker')}</p>
      <ul className="rest-picker-list">
        {families.map((family, index) => {
          const entry = REST_GAME_CATALOG[family];
          const nameId = `${id}-${family}`;
          return (
            <li key={family}>
              <button
                type="button"
                className={index === 0 ? 'rest-picker-option is-first' : 'rest-picker-option'}
                aria-labelledby={nameId}
                aria-describedby={`${nameId}-rule`}
                onClick={() => {
                  onPick(family);
                }}
              >
                <span id={nameId} className="rest-picker-name">
                  {t(entry.titleKey)}
                </span>
                {index === 0 && <span className="rest-picker-tag">{t(TAG_KEY[tag])}</span>}
                <span id={`${nameId}-rule`} className="rest-picker-rule">
                  {t(entry.ruleKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

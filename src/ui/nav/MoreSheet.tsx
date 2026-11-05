// src/ui/nav/MoreSheet.tsx
//
// The More sheet (P4 design brief 2.2): the views the bar does not hold (MORE_VIEWS: Plan,
// Atlas, Settings) and the palette ("find it"), as 44 px rows with an icon and the owner's label,
// the current view's row a sticker. A reading sheet on the one overlay stack (ModalShell), so
// Android Back and Escape close it before anything else.
import { useId, type ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { Icon } from '../../skins/limelight/Icon';
import { useAppStore } from '../../store';
import { ModalShell } from '../components/ModalShell';
import { displayClass } from '../format/display';
import { goToView } from './router';
import { MORE_ICONS, MORE_VIEWS, VIEWS, type ViewId } from './views';
import './tabBar.css';

export interface MoreSheetProps {
  view: ViewId;
  onClose: () => void;
  /** Opens the palette; the sheet closes first. */
  onFind: () => void;
}

export function MoreSheet(props: MoreSheetProps): ReactElement {
  const { view, onClose, onFind } = props;
  const c = useCopy();
  const titleId = useId();
  const hotkeysOn = useAppStore((s) => s.ui.hotkeys);
  const findIcon = MORE_ICONS.find;

  return (
    <ModalShell
      labelledBy={titleId}
      className="more-sheet"
      backdropClassName="more-sheet-bg"
      testId="more-sheet"
      onClose={onClose}
      sheet="reading"
    >
      <h2 id={titleId} className={displayClass(c('nav.more'))}>
        {c('nav.more')}
      </h2>
      <ul className="more-rows">
        {MORE_VIEWS.map((id) => {
          const def = VIEWS.find((v) => v.id === id);
          if (def === undefined) return null;
          const icon = MORE_ICONS[id];
          return (
            <li key={id}>
              <button
                type="button"
                className="more-row"
                aria-current={id === view ? 'page' : undefined}
                aria-keyshortcuts={hotkeysOn ? String(def.digit) : undefined}
                onClick={() => {
                  // Close first: the sheet's history entry is stepped back over before the view's
                  // own entry is pushed (src/ui/nav/history.ts defers the push until it lands).
                  onClose();
                  goToView(id);
                }}
              >
                {icon !== undefined && <Icon name={icon} width={32} height={32} />}
                <span>{c(def.copyKey)}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="more-row"
            onClick={() => {
              onClose();
              onFind();
            }}
          >
            {findIcon !== undefined && <Icon name={findIcon} width={32} height={32} />}
            <span>{c('button.openSpotlight')}</span>
          </button>
        </li>
      </ul>
    </ModalShell>
  );
}

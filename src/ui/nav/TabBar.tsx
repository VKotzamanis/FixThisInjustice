// src/ui/nav/TabBar.tsx
//
// The fixed bottom tab bar (P4 design brief 2.2; audit F05): five equal slots on the black
// lit-sign surface, a 32 px pixel icon over the owner's label, the current slot a pink sticker.
// Bottom, not top: the top edge is the far reach for one thumb, and 7 labels need 854 px [brief].
// Order and icons come from src/ui/nav/views.ts (TAB_ORDER, TAB_ICONS); nothing is listed here.
import type { ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { Icon } from '../../skins/limelight/Icon';
import { LitWord } from '../effects/LitWord';
import { useAppStore } from '../../store';
import { goToView } from './router';
import { MORE_VIEWS, TAB_ICONS, TAB_ORDER, VIEWS, type ViewId } from './views';
import './tabBar.css';

export interface TabBarProps {
  /** The view on screen. */
  view: ViewId;
  /** Whether the More sheet is open (the More slot's aria-expanded). */
  moreOpen: boolean;
  onMore: () => void;
}

export function TabBar(props: TabBarProps): ReactElement {
  const { view, moreOpen, onMore } = props;
  const c = useCopy();
  // WCAG 2.1 SC 2.1.4: announce a digit only while the digits work.
  const hotkeysOn = useAppStore((s) => s.ui.hotkeys);

  return (
    <nav className="tabbar" aria-label={c('nav.label')}>
      {TAB_ORDER.map((slot) => {
        const def = slot === 'more' ? null : (VIEWS.find((v) => v.id === slot) ?? null);
        // The More slot is the current one while Plan, Atlas or Settings is shown (brief 2.2).
        const current = slot === 'more' ? MORE_VIEWS.includes(view) : slot === view;
        const icon = TAB_ICONS[slot];
        const label = c(def === null ? 'nav.more' : def.copyKey);
        return (
          <button
            key={slot}
            type="button"
            className="tab"
            aria-current={current ? 'page' : undefined}
            aria-expanded={slot === 'more' ? moreOpen : undefined}
            aria-keyshortcuts={hotkeysOn && def !== null ? String(def.digit) : undefined}
            onClick={() => {
              if (slot === 'more') onMore();
              else goToView(slot);
            }}
          >
            {icon !== undefined && <Icon name={icon} width={32} height={32} />}
            {/*
              * Owner answer to review item 8: a lime label on the black bar is a lit word. The
              * current slot's label is ink on the pink sticker, not lime on black: it stays plain
              * (lime on pink would be 1.41:1).
              */}
            <span className="tab-label">
              {current ? label : <LitWord text={label} />}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

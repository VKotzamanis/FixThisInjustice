// src/ui/views/train/RestGameSheet.tsx
//
// The rest-game host (P6, R10; audit C14). A NON-MODAL bottom sheet fixed over Train: the page
// under it keeps its layout and its controls, so the next set logs with a game open. Its height
// is capped at 100svh - 12rem (472 px at 390 x 664, plan D1), and Hide collapses it to a bar with
// one tap. It opens on the picker; one pick starts one round. Back, Escape, Not Now and Exit close
// it; RestTimerPanel unmounts it when the rest ends, is skipped or is replaced.
//
// INTERFACE CONTRACT WITH P1: `timer`, `priorWins` and `units` arrive as props from
// RestTimerPanel. Nothing here reads the store or timer storage, and nothing writes the timer.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CopyKey } from '../../../content/copy';
import { REST_GAME_FAMILIES, seededFamily, type RestGameFamily } from '../../../domain/fun/restGames';
import type { RestTimer } from '../../../domain/training/restTimer';
import type { UnitSystem } from '../../../domain/types';
import { REST_GAME_CATALOG } from './restGameCatalog';
import { rememberRestGameChoice, rememberedRestGameChoice } from './restGameChoice';
import { RestGameHostContext, type RestGameHost } from './restGameHost';
import { RestGamePicker, type RestGamePickerTag } from './RestGamePicker';
import { gameContext } from './restGameProps';
import { useSheetDismiss } from './useSheetDismiss';
import '../../styles/restGames.css';

export interface RestGameSheetProps {
  /** Read only: startedAt and endsAt [ms] epoch UTC, durationS [s]. */
  timer: RestTimer;
  priorWins: number; // [rounds] won earlier in this lifting day
  soundsEnabled: boolean; // ui.sounds
  units: UnitSystem; // the active profile's units
  t: (key: CopyKey) => string;
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
  /** played: true once a round was started, so the rest's one offer is spent. */
  onClose: (played: boolean) => void;
  onWin: () => void;
  /**
   * The remaining rest as the panel formats it ("1:30"), shown in the minimised bar, which sits
   * exactly over the rest bar (brief 5.1). Not repeated in the open sheet: the 30 px [px] row
   * made the 390 x 664 sheet scroll inside its 472 px cap (e2e/p6-rest-sheet.spec.ts), and the
   * round clock above the board never outlasts the rest (restRoundClockS).
   */
  clock?: string;
}

/** Classes on <body> that pad the Train page under the sheet (restGames.css, sheet section). */
export const REST_SHEET_BODY_CLASS = { open: 'rest-sheet-open', minimised: 'rest-sheet-min' } as const;

interface PickerOpening {
  order: readonly RestGameFamily[];
  tag: RestGamePickerTag;
}

export function RestGameSheet(props: RestGameSheetProps): ReactElement {
  const { timer, priorWins, soundsEnabled, units, t, overrides, onClose, onWin, clock } = props;
  const context = gameContext(timer, 'RestGameSheet');
  // Read once when the sheet opens, so the list never reorders under the user's thumb.
  const [opening] = useState<PickerOpening>(() => {
    const remembered = rememberedRestGameChoice(context.sessionId);
    const first = remembered ?? seededFamily(context);
    const tag: RestGamePickerTag = remembered === null ? 'suggested' : 'lastPlayed';
    return { order: [first, ...REST_GAME_FAMILIES.filter((family) => family !== first)], tag };
  });
  const [family, setFamily] = useState<RestGameFamily | null>(null);
  const [minimised, setMinimised] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);

  const close = useCallback((): void => {
    onClose(family !== null);
  }, [onClose, family]);
  useSheetDismiss(close);

  useEffect(() => {
    const name = minimised ? REST_SHEET_BODY_CLASS.minimised : REST_SHEET_BODY_CLASS.open;
    document.body.classList.add(name);
    return () => {
      document.body.classList.remove(name);
    };
  }, [minimised]);

  // Focus moves into the sheet so a screen reader announces it and hardware keys reach the game
  // (RestWordGame accepts keys whose target is inside `.rest-sheet`); it goes back on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus();
    return () => {
      if (opener?.isConnected === true) opener.focus();
    };
  }, []);

  const host = useMemo<RestGameHost>(
    () => ({
      units,
      hidden: minimised,
      onHide: () => {
        setMinimised(true);
      },
    }),
    [units, minimised],
  );
  const entry = family === null ? null : REST_GAME_CATALOG[family];

  return (
    <section
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={t('label.restGameSheet')}
      className={minimised ? 'rest-sheet is-minimised' : 'rest-sheet'}
    >
      {minimised && entry !== null && (
        <div className="rest-sheet-bar">
          {clock !== undefined && <span className="rest-sheet-clock">{clock}</span>}
          <span className="rest-sheet-bar-name">{t(entry.titleKey)}</span>
          <button
            type="button"
            className="rest-sheet-show"
            onClick={() => {
              setMinimised(false);
            }}
          >
            {t('button.restGameShow')}
          </button>
        </div>
      )}
      {/* Hidden, not unmounted: the round, its clock and its board survive Hide. */}
      <div className="rest-sheet-body" hidden={minimised}>
        {entry === null ? (
          <RestGamePicker
            families={opening.order}
            tag={opening.tag}
            t={t}
            onPick={(picked) => {
              rememberRestGameChoice(context.sessionId, picked);
              setFamily(picked);
            }}
            onClose={close}
          />
        ) : (
          <RestGameHostContext value={host}>
            <entry.Component
              timer={timer}
              priorWins={priorWins}
              soundsEnabled={soundsEnabled}
              t={t}
              overrides={overrides}
              onExit={close}
              onWin={onWin}
            />
          </RestGameHostContext>
        )}
      </div>
    </section>
  );
}

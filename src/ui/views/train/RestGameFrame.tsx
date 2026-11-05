// src/ui/views/train/RestGameFrame.tsx
//
// The chrome every rest game is drawn in (P6, R10): the game's name, its round clock, Hide (when
// the sheet can hide it) and Exit on one row; the rule line; the board while the round runs; a
// clear end state after it (won, lost, out of time) with the owner's sprite, the answer on a loss
// and an optional note. Exit is always enabled (rest-games.md constraint 2).
import { useId, type ReactElement, type ReactNode, type Ref } from 'react';
import { FORMAT, type CopyKey } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { Echo } from '../../components/Echo';
import { OwnerSprite } from '../../components/OwnerSprite';
import { LossChomp } from './PixelMascot';
import { useRestGameHost } from './restGameHost';
import type { RoundClock } from './useRoundClock';
import '../../styles/restGames.css';

export type RestGameResult = 'won' | 'lost' | 'timeUp' | null;

export interface RestGameFrameProps {
  /** The game's own class on the section, e.g. 'rest-word'. */
  variant: string;
  titleKey: CopyKey;
  ruleKey: CopyKey;
  t: (key: CopyKey) => string;
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
  clock: RoundClock;
  result: RestGameResult;
  /** Revealed when the round is lost or runs out; null for a game with no single answer. */
  answer: string | null;
  /** Shown in every end state (a best time, a reached length); null for none. */
  endNote: string | null;
  /** The live line during play (progress); '' for none. */
  status: string;
  onExit: () => void;
  sectionRef?: Ref<HTMLElement>;
  children: ReactNode;
}

/* "Round won." and "Round lost." are the Rest Word strings; they say nothing word-specific, so
   every family reads them rather than carrying a copy (AGENTS rule 2). */
const RESULT_KEY: Readonly<Record<Exclude<RestGameResult, null>, CopyKey>> = {
  won: 'status.restWordWon',
  lost: 'status.restWordLost',
  timeUp: 'status.restGameTimeUp',
};

export function RestGameFrame(props: RestGameFrameProps): ReactElement {
  const { t, overrides, clock, result } = props;
  const host = useRestGameHost();
  const titleId = useId();

  return (
    <section
      ref={props.sectionRef}
      className={`rest-game ${props.variant} result-${result ?? 'active'}`}
      aria-labelledby={titleId}
    >
      <div className="rest-game-topline">
        <div className="rest-game-heading">
          {/* AM-4a-7 effect 2: the game's name is a word on the black sheet, so it echoes. */}
          <h3 id={titleId}>
            <Echo text={t(props.titleKey)} />
          </h3>
          <span className="rest-game-clock" role="timer">
            {FORMAT.restRemaining(clock.minutes, clock.seconds, overrides)}
          </span>
        </div>
        <div className="rest-game-actions">
          {/* Ruling R2: the rest's remaining time, right-aligned in this row (no row of its own). */}
          {host.restClock !== null && <span className="rest-sheet-rest-clock">{host.restClock}</span>}
          {host.onHide !== null && (
            <button type="button" className="rest-game-hide" onClick={host.onHide}>
              {t('button.restGameHide')}
            </button>
          )}
          {/* Always enabled: the round can be left at any moment, won, lost or mid-move. */}
          <button type="button" className="rest-game-exit" onClick={props.onExit}>
            {t('button.restWordExit')}
          </button>
        </div>
      </div>

      {result === null ? (
        <>
          <p className="rest-game-rule">{t(props.ruleKey)}</p>
          {props.children}
        </>
      ) : (
        <div className="rest-game-end">
          {/* The owner's sprite (stylize survey item 7): one play on a win, still otherwise. */}
          <span className={`rest-game-mascot rest-game-mascot-${result === 'won' ? 'win' : 'lose'}`}>
            <OwnerSprite play={result === 'won'} />
          </span>
          {result !== 'won' && <LossChomp />}
          {result !== 'won' && props.answer !== null && (
            <p className="rest-game-answer">{REST_GAME_FORMAT.answer(props.answer, overrides)}</p>
          )}
          {props.endNote !== null && <p className="rest-game-note">{props.endNote}</p>}
        </div>
      )}

      <p className="rest-game-result" aria-live="polite">
        {result === null ? props.status : t(RESULT_KEY[result])}
      </p>
    </section>
  );
}

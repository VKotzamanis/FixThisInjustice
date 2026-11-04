// src/ui/views/train/restGameProps.ts
//
// The one props contract every rest game takes (docs/design/rest-games.md, "Adding a game family").
//
// INTERFACE CONTRACT WITH P1. `timer` is handed in by RestTimerPanel and is read-only here. No game
// and no game host reads timer storage (the store, the session mirror or the persisted document)
// itself, so moving where the running timer lives changes RestTimerPanel only.
import type { CopyKey } from '../../../content/copy';
import type { RestGameContext, RestTimer } from '../../../domain/training/restTimer';

export interface RestGameProps {
  /** Read only: startedAt and endsAt [ms] epoch UTC, durationS [s]. Never written by a game. */
  timer: RestTimer;
  priorWins: number; // [rounds] won earlier in this lifting day, before this round begins
  /** ui.sounds; passed to every cue, which is silent when it is false. */
  soundsEnabled: boolean;
  t: (key: CopyKey) => string;
  overrides: Readonly<Partial<Record<CopyKey, string>>>;
  onExit: () => void;
  /** Called once per won round; RestTimerPanel routes it to recordRestGameWin. */
  onWin: () => void;
}

/** The two keys that name a game: its title and its one-line rule (picker and frame). */
export interface RestGameCopy {
  titleKey: CopyKey;
  ruleKey: CopyKey;
}

/** The game identity a rest carries; a game is mounted only for a timer that has one. */
export function gameContext(timer: RestTimer, mountedBy: string): RestGameContext {
  if (timer.game === undefined) {
    throw new Error(
      `${mountedBy} was mounted for a rest timer with no game identity. Mount it only when timer.game is set (RestTimerPanel does).`,
    );
  }
  return timer.game;
}

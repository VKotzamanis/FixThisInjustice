// src/ui/views/train/RestTimerPanel.tsx
//
// The countdown is a function of Date.now() and the timer's endsAt. The interval only forces a
// re-render; it never holds the value (code review A31: the legacy interval froze while
// backgrounded and chimed a minute late).
//
// Units: instants are epoch ms UTC [ms]; every rest quantity is seconds [s]; the ring's
// strip is a percentage of the bar's width (C05: the ring is gone).
//
// The rest game (ROADMAP F1, P6, docs/design/rest-games.md) belongs to this panel because it lives
// inside the rest: offered when a rest that carries a game identity starts, played in a bottom
// sheet (RestGameSheet) fixed over Train, closed when that rest ends, is skipped or is replaced by
// the next set's rest. This panel is the ONLY reader of the timer and of the wins count; it hands
// both to the sheet as props (the P1 interface contract) and no game writes either.
//
// The rest-over CUES are not here: src/app/RestController.tsx fires them on any view (C06).
import { useEffect, useId, useState, type ReactElement } from 'react';
import { FORMAT } from '../../../content/copy';
import { useCopy, useCopyOverrides } from '../../../content/useCopy';
import { restRoundClockS } from '../../../domain/fun/restGames';
import { extend, remainingS, totalS } from '../../../domain/training/restTimer';
import type { EpochMs } from '../../../domain/types';
import { Icon, SkinLabel } from '../../../skins/limelight/Icon';
import { useAppStore } from '../../../store';
import { useRestGameWins, useRestTimer } from '../../../store/selectors';
import { unlockAudio } from '../../audio/chime';
import { prefersReducedMotion } from '../../hooks/reducedMotion';
import { RestGameSheet } from './RestGameSheet';
import { REST_OVER_GRACE_MS } from '../../../app/RestController';
import { BurnWord } from '../../effects/BurnWord';
import { restOverWordOf, START_DELAY_REST_MS } from '../../effects/burnMoments';
import '../../styles/train.css';
import '../../styles/restGames.css';

const EXTEND_S = 30; // [s], the fixed extension `button.extendRest` names
const TICK_MS = 1000; // [ms]
const S_PER_MIN = 60; // [s/min]

/**
 * The game's phase for ONE rest interval, keyed by that interval's `startedAt`. Any other
 * interval (the next set's rest) reads as 'ready', so a new rest offers a fresh round and an old
 * board can never carry over. An extension keeps `startedAt`, so it keeps the phase.
 */
interface RestGamePhase {
  startedAt: EpochMs; // [ms] epoch UTC, the interval the phase belongs to
  phase: 'open' | 'closed';
}

export function RestTimerPanel(): ReactElement | null {
  const timer = useRestTimer();
  // Above the `timer === null` return below, so the hooks run on every render of this component
  // whether or not a rest is under way.
  const c = useCopy();
  const overrides = useCopyOverrides();
  const [now, setNow] = useState<number>(() => Date.now()); // [ms] epoch UTC
  const restGameWins = useRestGameWins(); // [rounds]
  const sounds = useAppStore((s) => s.ui.sounds);
  // The active profile's units, for Plate Math; read here so no game reads the store.
  const units = useAppStore((s) =>
    s.activeProfileId === null ? 'metric' : (s.profiles[s.activeProfileId]?.units ?? 'metric'),
  );
  const [game, setGame] = useState<RestGamePhase | null>(null);
  // Read once at mount, as Boot and PhaseTransition read it: it picks the rest-over sign's pulse.
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const tooLateId = useId(); // the too-late message the disabled game button points at
  const phase = timer !== null && game?.startedAt === timer.startedAt ? game.phase : 'ready';
  const restOver = timer !== null && remainingS(timer, now) <= 0;

  /*
   * The game ends with the rest. The render below already hides an open board at zero; this makes
   * it final, so an extension tapped after the end adds rest time, not a revived round.
   */
  useEffect(() => {
    if (restOver) setGame((g) => (g?.phase === 'open' ? { ...g, phase: 'closed' } : g));
  }, [restOver]);

  /*
   * Tick once per second only while the document is visible, and recompute immediately on
   * visibilitychange so a backgrounded return is not stale. Background tabs are throttled to
   * >= 1 s and suspended outright on iOS, so the interval is a repaint trigger and never the
   * source of the value: remainingS is recomputed from endsAt on every render.
   */
  useEffect(() => {
    if (timer === null) return;
    let id: number | undefined;
    const tick = (): void => {
      setNow(Date.now()); // [ms] epoch UTC
    };
    const start = (): void => {
      if (id === undefined) id = window.setInterval(tick, TICK_MS);
    };
    const stop = (): void => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const onVisibility = (): void => {
      tick();
      if (document.hidden) stop();
      else start();
    };
    tick();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timer]);

  if (timer === null) return null;

  const remaining = remainingS(timer, now); // [s]
  // Floored at 1 so the ring's fraction cannot divide by zero on a timer extended to nothing.
  const total = Math.max(1, totalS(timer)); // [s]
  const elapsedFraction = Math.min(1, (total - remaining) / total); // dimensionless
  const minutes = Math.floor(remaining / S_PER_MIN); // [min]
  const seconds = remaining % S_PER_MIN; // [s]
  // A timer restored from an older build carries no game identity, and then no game is offered.
  // Every family runs on one round clock (restRoundClockS), so one check covers the whole picker.
  const roundS = timer.game === undefined ? null : restRoundClockS(timer.durationS); // [s]
  // Offered only while the whole round fits in the rest still to run: a round never outlasts it.
  const offerGame = roundS !== null && phase === 'ready' && !restOver;
  const gameFits = roundS !== null && remaining >= roundS; // [s] vs [s]
  const startedAt = timer.startedAt; // [ms] epoch UTC, the interval a phase is keyed to
  const clock = FORMAT.restRemaining(minutes, seconds, overrides); // one formatted clock: bar and sheet
  const restOverWord = restOverWordOf(c('notification.restOver'));
  /*
   * THE LIT SIGN (stylize survey item 3). The ring, the clock and the controls sit on the black
   * `.ll-panel`, which is where the lime `stopwatchPanel` icon was drawn to sit. At zero the sign
   * turns pink and its label says the rest is over, so the state is a word as well as a colour
   * (WCAG 1.4.1) and a screen reader hears it through the label's live region. `rest-over-pulse`
   * adds 3 pulses at 2 Hz (train.css); reduced motion gets the steady state alone. The clock, the
   * cues and the game are untouched: this is a class on the sign and nothing else.
   */
  const signClass = restOver
    ? `rest-summary ll-panel rest-over${reduced ? '' : ' rest-over-pulse'}`
    : 'rest-summary ll-panel';

  return (
    <div className="rest-panel">
      {/*
        * C05, brief 4.2: one 56 px bar docked above the tab bar. The digits are the signal; the
        * strip on the top edge shows the elapsed fraction and never tweens (limelight.css: no
        * quantity animates). The label stays a polite live region, visually hidden: the state is
        * in the digits (0:00) and the pink flip, and a screen reader hears the words.
        */}
      <div className={signClass} role="group" aria-label={c('status.rest')}>
        <span className="rest-progress" aria-hidden="true" style={{ width: `${String(elapsedFraction * 100)}%` }} />
        {/*
          * AM-4a-9: at zero the digits give way to the rest-over WORD on its own plate (the
          * first sentence of notification.restOver), which burns once after the pulse. Numerals
          * never burn. A rest that ended long ago (the app was closed through it) shows the word
          * without the burn, as it gets no cue (REST_OVER_GRACE_MS).
          */}
        {restOver && restOverWord !== null ? (
          <BurnWord
            key={timer.endsAt}
            className="rest-over-word"
            text={restOverWord}
            delayMs={reduced ? 0 : START_DELAY_REST_MS}
            burn={now - timer.endsAt <= REST_OVER_GRACE_MS}
          />
        ) : (
          <span className="rest-time">{clock}</span>
        )}
        <div className="rest-label visually-hidden" aria-live="polite">
          {restOver ? <span className="ll-label">{c('notification.restOver')}</span> : <SkinLabel copyKey="status.rest" />}
        </div>
        <div className="rest-controls">
          <button
            type="button"
            onClick={() => {
              // C07: every Extend tap is a gesture; with sounds off the context is left alone.
              if (sounds) void unlockAudio();
              useAppStore.getState().setRestTimer(extend(timer, EXTEND_S));
            }}
          >
            {c('button.extendRest')}
          </button>
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().setRestTimer(null);
            }}
          >
            <SkinLabel copyKey="button.skipRest" />
          </button>
          {offerGame && (
            <button
              type="button"
              className="rest-game-launch"
              aria-label={c('button.restGameLaunch')}
              aria-describedby={gameFits ? undefined : tooLateId}
              disabled={!gameFits}
              onClick={() => {
                // The tap is a user gesture, so it may wake the shared audio context for the
                // game's cues; with sounds off it is left alone.
                if (sounds) void unlockAudio();
                setGame({ startedAt, phase: 'open' });
              }}
            >
              <Icon name="sparklePanel" width={32} height={32} />
            </button>
          )}
        </div>
      </div>
      {offerGame && !gameFits && (
        <p id={tooLateId} className="rest-game-unavailable visually-hidden">
          {c('status.restWordTooLate')}
        </p>
      )}
      {phase === 'open' && !restOver && (
        <RestGameSheet
          key={startedAt}
          timer={timer}
          priorWins={restGameWins}
          soundsEnabled={sounds}
          units={units}
          t={c}
          overrides={overrides}
          clock={clock}
          onClose={(played) => {
            // A round played spends this rest's one offer; a picker closed unplayed leaves it.
            setGame(played ? { startedAt, phase: 'closed' } : null);
          }}
          onWin={() => {
            useAppStore.getState().recordRestGameWin();
          }}
        />
      )}
    </div>
  );
}

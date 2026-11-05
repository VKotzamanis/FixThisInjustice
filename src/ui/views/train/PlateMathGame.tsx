// src/ui/views/train/PlateMathGame.tsx
//
// Plate Math (P6, R10): tap plates onto one side of the bar until the whole bar matches the
// target; three targets a round. Arithmetic only, in the profile's units (RestGameHostContext);
// no health number. It reads the rest timer and never writes it. Over the target, a line says by
// how much in the profile's unit; a loaded plate is a button that takes that plate off (lead
// ruling R-G2), and Remove Plate takes off the last one.
//
// Units: loads [kg] for a metric profile, [lb] for an imperial one, both sides included; a plate
// button names ONE plate; instants [ms] epoch UTC; durations [s].
import { useEffect, useState, type ReactElement } from 'react';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import {
  PLATE_MATH_MAX_PER_SIDE,
  plateMathLoad,
  plateMathMatches,
  plateMathRound,
  type PlateMathRound,
} from '../../../domain/fun/plateMath';
import { UNIT_LABEL } from '../../../domain/units';
import { playRestGameCue } from '../../audio/restGameAudio';
import { RestGameFrame, type RestGameResult } from './RestGameFrame';
import { useRestGameHost } from './restGameHost';
import { gameContext, type RestGameCopy, type RestGameProps } from './restGameProps';
import { useRoundClock } from './useRoundClock';
import '../../styles/restGames.css';

export const PLATE_MATH_COPY = {
  titleKey: 'hero.restGamePlateMath',
  ruleKey: 'advice.restGamePlateMathRule',
} as const satisfies RestGameCopy;

/** "62.5 kg": at most two decimals, the 1.25 kg plate's precision. */
function formatLoad(value: number, unit: string): string {
  return `${String(Math.round(value * 100) / 100)} ${unit}`;
}

export function PlateMathGame(props: RestGameProps): ReactElement {
  const { timer, priorWins, soundsEnabled, t, overrides, onExit, onWin } = props;
  const host = useRestGameHost();
  const context = gameContext(timer, 'PlateMathGame');
  // Frozen for the life of this board, units included: a profile edit mid-rest changes nothing.
  const [round] = useState<PlateMathRound>(() =>
    plateMathRound(context, timer.durationS, priorWins, host.units),
  );
  const clock = useRoundClock(timer, round.durationS);
  const [solved, setSolved] = useState(0); // [targets]
  const [side, setSide] = useState<readonly number[]>([]); // [kg] or [lb] per plate, in tap order
  const [result, setResult] = useState<RestGameResult>(null);
  const unit = UNIT_LABEL[round.units].load;
  const target = round.targets[solved] ?? round.targets[round.targets.length - 1] ?? round.bar; // [kg] or [lb]
  const onBar = plateMathLoad(round.bar, side); // [kg] or [lb]
  const canPlay = result === null && clock.remainingS > 0;

  useEffect(() => {
    if (result !== null || clock.remainingS > 0) return;
    setResult('timeUp');
    playRestGameCue('lose', soundsEnabled);
  }, [clock.remainingS, result, soundsEnabled]);

  const addPlate = (plate: number): void => {
    if (!canPlay || side.length >= PLATE_MATH_MAX_PER_SIDE) return;
    const next = [...side, plate];
    if (!plateMathMatches(target, round.bar, next)) {
      setSide(next);
      return;
    }
    const done = solved + 1; // [targets]
    if (done >= round.targets.length) {
      setSide(next);
      setSolved(done);
      setResult('won');
      playRestGameCue('win', soundsEnabled);
      onWin();
      return;
    }
    playRestGameCue('submit', soundsEnabled);
    setSolved(done);
    setSide([]);
  };

  const removePlate = (): void => {
    if (!canPlay) return;
    setSide((value) => value.slice(0, -1));
  };

  /** Takes off the plate at `index` in tap order (R-G2). */
  const takeOff = (index: number): void => {
    if (!canPlay) return;
    setSide((value) => value.filter((_, i) => i !== index));
  };

  const over = onBar - target; // [kg] or [lb], > 0 when the bar is past the target

  return (
    <RestGameFrame
      variant="rest-plate"
      {...PLATE_MATH_COPY}
      t={t}
      overrides={overrides}
      clock={clock}
      result={result}
      answer={null}
      endNote={null}
      status={REST_GAME_FORMAT.progress(solved, round.targets.length, overrides)}
      onExit={onExit}
    >
      <dl className="rest-plate-readout">
        <div>
          <dt>{t('label.restGamePlateTarget')}</dt>
          <dd>{formatLoad(target, unit)}</dd>
        </div>
        <div>
          <dt>{t('label.restGamePlateOnBar')}</dt>
          {/* Over the target reads as a wavy underline as well as by its number (WCAG 1.4.1). */}
          <dd className={onBar > target ? 'rest-plate-over' : undefined}>{formatLoad(onBar, unit)}</dd>
        </div>
      </dl>
      {over > 0 && <p className="rest-plate-over-note">{REST_GAME_FORMAT.plateOver(formatLoad(over, unit), overrides)}</p>}

      <div className="rest-plate-side" role="group" aria-label={t('label.restGamePlateSide')}>
        {side.map((plate, index) => (
          <button
            type="button"
            className="rest-plate-chip"
            // Tap order is the identity: two plates of one size are two chips.
            key={index}
            aria-label={REST_GAME_FORMAT.plateTakeOff(formatLoad(plate, unit), overrides)}
            disabled={!canPlay}
            onClick={() => {
              takeOff(index);
            }}
          >
            {formatLoad(plate, unit)}
          </button>
        ))}
      </div>

      <div className="rest-plate-rack" role="group" aria-label={t('label.restGamePlates')}>
        {round.plates.map((plate) => (
          <button
            type="button"
            className="rest-plate-add"
            key={plate}
            disabled={!canPlay}
            onClick={() => {
              addPlate(plate);
            }}
          >
            {formatLoad(plate, unit)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="rest-plate-remove"
        disabled={!canPlay || side.length === 0}
        onClick={removePlate}
      >
        {t('button.restGamePlateRemove')}
      </button>
    </RestGameFrame>
  );
}

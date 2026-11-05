// src/ui/components/SessionNumber.tsx
//
// The session counter (owner answer to review item 10, 2026-11-05: "Just change the "EP.12" to
// just the number and use the font shade and burn effect from 9"). The visible form is the bare
// number (FORMAT.planPosition), in the burn's face on its ink plate, resting as the lit still
// frame (LitWord, review item 8); it burns ONCE when the plan cursor advances, which it does only
// on a completed session (burnMoments.claimSessionAdvance: never on a first look, a re-render or
// a reload, and in one renderer only). Its accessible name is "Session 12"
// (FORMAT.planPositionLabel), because a bare number read aloud says nothing.
//
// The number is the one numeral that burns, on the owner's instruction; set-entry numerals never
// do (burnMoments.ts).
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopyOverrides } from '../../content/useCopy';
import { claimSessionAdvance } from '../effects/burnMoments';
import { BurnWord } from '../effects/BurnWord';
import './sessionNumber.css';

export interface SessionNumberProps {
  /** The plan the cursor belongs to: a new programme starts a new count. */
  planId: string;
  /** [sessions] 1-based position, already clamped by the caller. */
  shown: number;
  /** A status word after the number ("wrapped" once the programme is complete), not burnt. */
  suffix?: string;
}

/** Laid out and not inside a view kept mounted but hidden (the marquee's track is aria-hidden). */
function rendered(el: Element | null): boolean {
  return el !== null && el.closest('[hidden]') === null && el.getClientRects().length > 0;
}

export function SessionNumber(props: SessionNumberProps): ReactElement {
  const { planId, shown, suffix } = props;
  const overrides = useCopyOverrides();
  const ref = useRef<HTMLSpanElement>(null);
  // The number whose advance this renderer claimed; it keys the burn, so it burns once.
  const [burnt, setBurnt] = useState<number | null>(null);

  useEffect(() => {
    if (rendered(ref.current) && claimSessionAdvance(planId, shown)) setBurnt(shown);
  }, [planId, shown]);

  const text = FORMAT.planPosition(shown, '');
  return (
    <span className="session-number-wrap">
      <span
        ref={ref}
        className="session-number"
        role="img"
        aria-label={FORMAT.planPositionLabel(shown, '', overrides)}
      >
        <BurnWord
          key={burnt === shown ? `burn-${String(shown)}` : 'rest'}
          className="session-number-word"
          text={text}
          rest="lit"
          burn={burnt === shown}
        />
      </span>
      {suffix !== undefined && suffix !== '' && <span className="session-number-suffix"> {suffix}</span>}
    </span>
  );
}

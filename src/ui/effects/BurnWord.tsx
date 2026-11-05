// src/ui/effects/BurnWord.tsx
//
// One word that burns ONCE per mount (AM-4a-9): the caller mounts it at the moment (rest end,
// stamp landing, a set finished well) and keys it by that moment, so a new moment burns again
// and a re-render does not.
//
// The DOM text is the word and its accessible name at all times. While the canvas (aria-hidden)
// is live, the text is painted transparent (not hidden: it keeps its place and its name); when
// the burn ends the canvas and its WebGL context are released and the text shows again, so no
// context stays open. No WebGL, a lost context or a refused shader: the text simply stays.
//
// Never during set entry: a burn does not start while a text field has focus, and stops the
// moment one gains it. Reduced motion: burnText draws one still frame and runs no frame loop.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { prefersReducedMotion } from '../hooks/reducedMotion';
import { createBurn, type BurnHandle } from './burnText';
import './burnWord.css';

export interface BurnWordProps {
  text: string;
  /** [ms] Wait before the burn starts (after a pulse or a landing). */
  delayMs?: number;
  /** false: the word shows on its plate and never burns (a moment that is already stale). */
  burn?: boolean;
  className?: string;
}

/** True while the user is typing into a field: a set being entered, or any other. */
export function enteringText(target: EventTarget | null = document.activeElement): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function BurnWord(props: BurnWordProps): ReactElement {
  const { text, delayMs = 0, burn = true, className } = props;
  const hostRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const word = textRef.current;
    if (!burn || host === null || word === null) return;
    let handle: BurnHandle | null = null;
    let cancelled = false;
    const stop = (): void => {
      handle?.dispose();
      handle = null;
      setLive(false);
    };
    const onFocus = (e: FocusEvent): void => {
      if (enteringText(e.target)) stop();
    };
    const start = (): void => {
      if (cancelled || enteringText()) return;
      const style = getComputedStyle(word);
      const upper = style.textTransform === 'uppercase';
      handle = createBurn(host, upper ? text.toLocaleUpperCase() : text, {
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSizePx: parseFloat(style.fontSize) || 16, // [CSS px]
        fontFamily: style.fontFamily,
        fontStretch: style.fontStretch,
        letterSpacingPx: parseFloat(style.letterSpacing) || 0, // [CSS px]; 'normal' -> 0
        reduced: prefersReducedMotion(),
      });
      if (handle === null) return; // no WebGL: the plain styled word stays
      setLive(true);
      document.addEventListener('focusin', onFocus);
      void handle.burn().then(() => {
        if (!cancelled) stop();
      });
    };
    const id = window.setTimeout(start, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      document.removeEventListener('focusin', onFocus);
      handle?.dispose();
      handle = null;
    };
  }, [text, delayMs, burn]);

  return (
    <span ref={hostRef} className={`burn-word${live ? ' is-burning' : ''}${className === undefined ? '' : ` ${className}`}`}>
      <span ref={textRef} className="burn-word-text">
        {text}
      </span>
    </span>
  );
}

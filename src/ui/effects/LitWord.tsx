// src/ui/effects/LitWord.tsx
//
// A lime word on a black lit-sign panel, drawn as the burn shader's still frame in lime accents
// (owner answer to review item 8, 2026-11-05; renderer src/ui/effects/litText.ts). No animation:
// the frame is drawn once per word, font and size, and redrawn only when the word changes or the
// window is resized (a cached copy, not a GPU draw).
//
// The DOM word stays in place and is the accessible name at all times. While the canvas
// (aria-hidden) is up, the word's glyph fill is transparent (-webkit-text-fill-color) and its
// `color` is untouched, so the contrast sweep still reads the lime the frame rests on.
//
// Plain text, never a guess: the switch off (--panel-glow none), no WebGL, a token that does not
// resolve, or a word that does not fit its box (an ellipsised title) keep the CSS text.
// Never a numeral of set entry: callers pass words (the session counter uses BurnWord).
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { litSwitchOn, renderLit } from './litText';
import './litWord.css';

export interface LitWordProps {
  /** The word as the canvas draws it; the DOM shows `children` when given, else `text`. */
  text: string;
  children?: ReactNode;
  className?: string;
}

/** The box the word sits in clips it (an ellipsis or a clipped brand): the frame would lie. */
function overflows(host: HTMLElement): boolean {
  const box = host.parentElement;
  return box !== null && box.scrollWidth > box.clientWidth + 1; // [CSS px]
}

export function LitWord(props: LitWordProps): ReactElement {
  const { text, children, className } = props;
  const hostRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const word = textRef.current;
    if (host === null || word === null) return;
    let canvas: HTMLCanvasElement | null = null;
    let cancelled = false;
    const paint = (): void => {
      if (cancelled) return;
      canvas?.remove();
      canvas = null;
      if (!litSwitchOn(getComputedStyle(host).getPropertyValue('--panel-glow')) || overflows(host)) {
        setLit(false);
        return;
      }
      const style = getComputedStyle(word);
      const upper = style.textTransform === 'uppercase';
      canvas = renderLit(host, upper ? text.toLocaleUpperCase() : text, {
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSizePx: parseFloat(style.fontSize) || 16, // [CSS px]
        fontFamily: style.fontFamily,
        fontStretch: style.fontStretch,
        letterSpacingPx: parseFloat(style.letterSpacing) || 0, // [CSS px]; 'normal' -> 0
      }, word.getBoundingClientRect().width); // [CSS px] a frame of another width is refused
      if (canvas === null) {
        setLit(false);
        return;
      }
      host.appendChild(canvas);
      setLit(true);
    };
    // The canvas rasterises the web font: wait for it, or the frame is drawn in a fallback face.
    const fonts = 'fonts' in document ? document.fonts : null;
    if (fonts === null) paint();
    else void fonts.ready.then(paint);
    window.addEventListener('resize', paint);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', paint);
      canvas?.remove();
      canvas = null;
    };
  }, [text]);

  return (
    <span ref={hostRef} className={`lit-word${lit ? ' is-lit' : ''}${className === undefined ? '' : ` ${className}`}`}>
      <span ref={textRef} className="lit-word-text">
        {children ?? text}
      </span>
    </span>
  );
}

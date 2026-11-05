// src/ui/components/Echo.tsx
//
// The echo (plan AM-4a-7 effect 2): a word on a black panel with a hard, offset hollow copy
// behind it (panelEffects.css). The copy is aria-hidden, so assistive technology reads the word
// once and an accessible name built from the parent is unchanged. Text only: a caller passes a
// WORD, never a number (a numeral takes no shadow or echo, DESIGN.md).
import type { ReactElement } from 'react';
import './panelEffects.css';

export function Echo({ text }: { text: string }): ReactElement {
  return (
    <span className="ll-echo">
      {/* The copy first: the positioned fill after it paints on top (no z-index, one ladder). */}
      <span className="ll-echo-ghost" aria-hidden="true">
        {text}
      </span>
      <span className="ll-echo-fill">{text}</span>
    </span>
  );
}

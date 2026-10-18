import type { ReactElement } from 'react';

export type PixelMascotMood = 'idle' | 'win' | 'lose';

/*
 * An original ASCII reinterpretation of the owner's 32 px SpriteAI mascot (asset manifest §10):
 * dark fringe, bright glasses and a pink face are conveyed with characters, not image pixels.
 * No source asset is imported or embedded, so this remains a code-native, CSS-coloured sprite.
 */
const MASCOT_ART: Readonly<Record<PixelMascotMood, string>> = {
  idle: [
    '  .^^^^.  ',
    ' /#o--o#\\ ',
    '|  /\\  | ',
    '|  \\_/  | ',
    ' \\_==_/  ',
  ].join('\n'),
  win: [
    '  .^^^^.  ',
    ' /#^--^#\\ ',
    '|  /\\  | ',
    '| \\==/ | ',
    ' \\_**_/  ',
  ].join('\n'),
  lose: [
    '  .^^^^.  ',
    ' /#x--x#\\ ',
    '|  /\\  | ',
    '|  \\__  | ',
    ' \\_--_/  ',
  ].join('\n'),
};

/** Decorative pixel mascot; result text beside it carries the accessible game outcome. */
export function PixelMascot({ mood }: { mood: PixelMascotMood }): ReactElement {
  return <pre className={`rest-game-mascot rest-game-mascot-${mood}`} aria-hidden="true">{MASCOT_ART[mood]}</pre>;
}

/**
 * A tiny original two-frame ASCII chomp loop for a lost stage. It is deliberately made from
 * text and CSS animation rather than a GIF, so failure feedback keeps the same offline asset
 * budget as the mascot and can honour the user's reduced-motion preference.
 */
export function LossChomp(): ReactElement {
  return (
    <div className="rest-loss-chomp" aria-hidden="true">
      <pre className="rest-loss-chomp-open">{' C  . . .'}</pre>
      <pre className="rest-loss-chomp-closed">{' O  . . .'}</pre>
    </div>
  );
}

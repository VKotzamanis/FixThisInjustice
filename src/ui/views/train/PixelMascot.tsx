import type { ReactElement } from 'react';

/*
 * The ASCII reinterpretation of the owner's SpriteAI mascot that lived here (idle, win and lose
 * faces in characters) is gone: the game now shows his own sprite sheet through
 * src/ui/components/OwnerSprite.tsx (stylize survey item 7). The loss loop below stays.
 */

/**
 * A tiny original two-frame ASCII chomp loop for a lost stage. It is deliberately made from
 * text and CSS animation rather than a GIF, so failure feedback keeps the same offline asset
 * budget as the rest of the game and can honour the user's reduced-motion preference. The two
 * frames take `ll-ascii` (tokens.css), the one monospace stack, so they overlay column for column.
 */
export function LossChomp(): ReactElement {
  return (
    <div className="rest-loss-chomp" aria-hidden="true">
      <pre className="rest-loss-chomp-open ll-ascii">{' C  . . .'}</pre>
      <pre className="rest-loss-chomp-closed ll-ascii">{' O  . . .'}</pre>
    </div>
  );
}

/**
 * True when the user has asked for reduced motion.
 *
 * The typeof guard is not defensive noise: jsdom implements no matchMedia at all, and neither do
 * some embedded webviews, so an unguarded call throws rather than returning false.
 *
 * ONE PLACE FOR THE QUERY (AGENTS rule 2). Boot, PhaseTransition and IntroSequence carried
 * private copies written before this module existed; all three import this one now, as do the
 * rest sign, the owner's sprite and the dither wipe.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

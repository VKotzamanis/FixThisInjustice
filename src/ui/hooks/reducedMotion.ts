/**
 * True when the user has asked for reduced motion.
 *
 * The typeof guard is not defensive noise: jsdom implements no matchMedia at all, and neither do
 * some embedded webviews, so an unguarded call throws rather than returning false.
 *
 * ONE PLACE FOR THE QUERY. src/ui/components/Boot.tsx and src/ui/components/PhaseTransition.tsx
 * each still carry a private copy of this function (written before this module existed); they
 * should import this one instead (AGENTS rule 2). They were left untouched here because the
 * change that added this module was scoped to the Atlas view.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

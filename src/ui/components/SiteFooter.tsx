// src/ui/components/SiteFooter.tsx
//
// The quiet footer at the foot of the app shell (P10 Brief D), mounted once and visible from
// every view: setup, the tab views and the two full-screen gates all sit above it in the tree,
// none inside it, so it never appears twice and never needs its own routing.
//
// SEVEN LINES, IN THE ORDER THE BRIEF STATES THEM, plus the hydration status displaced here from
// the top bar (Brief D part 1): the author, a link to the repository, the version and build
// commit, the date of the last update, the hydration status, the on-device promise, the
// disclaimer, and the licence.
//
// THE REPOSITORY URL IS A PLAIN CONSTANT, NEVER A COPY STRING. copy.test.ts asserts no copy()
// value carries a URL, and the brief states the same rule for this file by name. The version,
// the build commit and the build date are the other three constants a copy string may not hold:
// each is compiled in by vite.config.ts's `define` block (declared in src/config/build.d.ts)
// rather than read at runtime, so the footer needs no fetch to know its own version.
//
// THE DISCLAIMER IS REUSED, NEVER REWORDED. 00-CONTEXT rule 2 bans a new safety statement with
// no source handed down for it. `INTRO_SLIDES[4]` is the disclaimer slide the owner wrote for
// the one-time intro sequence (src/ui/intro/IntroSequence.tsx names the same index
// DISCLAIMER_INDEX); this file reads it character for character so the sentence stays reachable
// once that sequence has run once and is gone for good ("so it is reachable after the intro has
// gone", the brief's own words). It is R10 reference text, already checked against R5, R6 and
// R11 by introSlides.test.ts, and exempt from R1-R4 for the same reason every other R10 module
// is: it is prose a screen shows once, not a control label a skin retunes.
import type { ReactElement } from 'react';
import './siteFooter.css';
import { INTRO_SLIDES } from '../../content/introSlides';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { useHydrated } from '../../store/selectors';

/** The brief's own constant, verbatim. Never a copy() value: copy.test.ts bans a URL in one. */
const REPOSITORY_URL = 'https://github.com/VKotzamanis/FixThisInjustice';

/**
 * Slide index 4 (0-based) is the disclaimer, the same slide IntroSequence.tsx's own
 * DISCLAIMER_INDEX names. Read here rather than duplicated: a change to the owner's wording
 * changes both places it appears from the one array literal in introSlides.ts.
 */
const DISCLAIMER = INTRO_SLIDES[4]?.body ?? '';

export function SiteFooter(): ReactElement {
  const t = useCopy();
  const overrides = useCopyOverrides();
  const hydrated = useHydrated();

  return (
    <footer className="site-footer">
      <p>{t('footer.builtBy')}</p>
      <p>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          {t('footer.repository')}
        </a>
      </p>
      <p>{FORMAT.footerVersion(__APP_VERSION__, __BUILD_COMMIT__, overrides)}</p>
      <p>{FORMAT.footerUpdated(__BUILD_DATE__, overrides)}</p>
      {/*
       * Displaced from the top bar (Brief D part 1): worth knowing once, at the foot, not worth
       * a permanent word at the top of every screen.
       */}
      <p>{t(hydrated ? 'shell.status.loaded' : 'shell.status.loading')}</p>
      <p>{t('advice.dataOnDevice')}</p>
      <p>{DISCLAIMER}</p>
      <p>{t('footer.licence')}</p>
    </footer>
  );
}

// src/ui/intro/IntroSequence.tsx
//
// The intro sequence (P10 Brief C, alpha round 1 claims C1.01.2 to C1.01.15): four caveat
// slides, a disclaimer and a final slide naming what setup collects, shown once before "Setup,
// step 1 of 9" and before the app's own boot sequence (src/ui/components/Boot.tsx).
//
// Modelled closely on Boot.tsx, which already solves the same three problems this file has:
// a per-character (there: per-line) timed reveal scheduled at absolute offsets from mount so a
// slow commit cannot stretch it, an any-key-or-tap skip, and a `prefers-reduced-motion` branch
// that shows everything at once. Two things are genuinely different from Boot, both from the
// brief:
//
//   ADVANCE IS NOT FINISH. Boot's tap and its Skip control do the same thing: end the whole
//   sequence. Here the brief calls the tap behaviour "advanced by a click or tap anywhere, or by
//   any key" -- one slide at a time -- and separately gives every slide "A Skip control...
//   matching button.skipBoot's treatment", which is a DIFFERENT action: it ends the whole
//   sequence immediately, from any slide. `advance()` and `finish()` are therefore two
//   functions, not one, and the Skip button stops the click from also bubbling into `advance()`.
//
//   THE FADE IS CSS, NOT STATE. Boot's lines accumulate (each stays once printed); these slides
//   REPLACE one another, so `key={index}` on the slide element remounts a fresh DOM node on
//   every change, and a plain CSS animation (`intro-fade`, intro.css) re-triggers itself with no
//   timer in this file at all. Only the character-by-character type-out needs a timer.
//
// Three exports, three concerns, exactly Boot's shape:
//   IntroSequence  the six slides, their typing and their controls;
//   IntroGate      the one-line mount, which reads UiPrefs.introSeen and unmounts the sequence
//                  the moment it records itself as seen;
//   INTRO_CHAR_INTERVAL_MS  the one timing constant, exported so the test file can drive it.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import './intro.css';
import { INTRO_FIGURE, INTRO_SLIDES } from '../../content/introSlides';
import { useCopy } from '../../content/useCopy';
import { useAppStore } from '../../store';

/** [ms] per character of the typed body text. The brief: "Roughly 18 ms per character." */
export const INTRO_CHAR_INTERVAL_MS = 18; // [ms] per character

/**
 * Slides 1 to 4 (indices 0 to 3) carry the ASCII figure and the "Click to continue" line at
 * their foot; the brief states the split by slide NUMBER ("At the foot of slides 1 to 4"), and
 * introSlides.ts documents the same split by array position.
 */
const FIGURE_SLIDE_COUNT = 4;

/** Slide 5 (index 4, 0-based) is the disclaimer: "emphasised by a slow pulse, not a flash." */
const DISCLAIMER_INDEX = 4;

const LAST_INDEX = INTRO_SLIDES.length - 1;

/**
 * True when the user has asked for reduced motion.
 *
 * The typeof guard is not defensive noise: jsdom implements no matchMedia at all, so an
 * unguarded call throws rather than returning false (Boot.tsx makes the same argument, quoting
 * src/domain/reminders/client.ts for the display-mode case).
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function IntroSequence(): ReactElement {
  const t = useCopy();

  /*
   * The motion preference, read once at mount and never again, for the reason Boot.tsx's own
   * comment gives: a user who changes the setting mid-sequence has changed it for the NEXT
   * sequence, and this one lasts under a minute either way.
   */
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const [index, setIndex] = useState(0); // [slides] 0-based, the slide on screen
  const slide = INTRO_SLIDES[index] ?? INTRO_SLIDES[0];

  // Lazy initializer, exactly as Boot.tsx's `shown` state: under reduced motion the FIRST paint
  // must already show the whole slide, or the user sees one empty frame before the effect below
  // corrects it.
  const [shown, setShown] = useState<number>(() => (reduced ? (slide?.body.length ?? 0) : 0)); // [characters]

  const finishedRef = useRef(false);

  /*
   * Idempotent by the ref, exactly as Boot.tsx's `finish`: the tap handler, the Skip button and
   * the last slide's own advance can all reach this in the same commit.
   */
  const finish = useCallback((): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Through getState() rather than through a selector: a bound action read as a hook trips
    // @typescript-eslint/unbound-method, the repo's convention for calling one (Boot.tsx does
    // the same for the identical reason).
    useAppStore.getState().setUi({ introSeen: true });
  }, []);

  /**
   * One slide forward, or finish on the last one. THIS is "advanced by a click or tap anywhere,
   * or by any key" -- the brief's word is "advanced", not "skipped", so a tap moves the sequence
   * one step rather than ending it (that is what the separate Skip control below does).
   */
  const advance = useCallback((): void => {
    setIndex((i) => {
      if (i >= LAST_INDEX) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  /*
   * The typing effect, scheduled at ABSOLUTE offsets from the slide's own mount -- Boot.tsx's
   * comment on its own line-scheduling effect gives the reason: a chain that schedules
   * character n + 1 from inside character n's callback measures every delay from the previous
   * RENDER rather than from the slide's start, and the reveal stretches by however long each
   * commit took. Re-runs on every `index` change because `key={index}` on the slide element
   * (below) means each slide is functionally a fresh mount, and the cleanup below tears down
   * whatever of the PREVIOUS slide's timers a tap interrupted.
   */
  useEffect(() => {
    const body = slide?.body ?? '';
    if (reduced) {
      setShown(body.length);
      return undefined;
    }
    setShown(0);
    const handles: number[] = [];
    for (let i = 0; i < body.length; i += 1) {
      handles.push(
        window.setTimeout(
          () => {
            setShown(i + 1); // [characters], absolute
          },
          (i + 1) * INTRO_CHAR_INTERVAL_MS, // [ms] from this slide's mount
        ),
      );
    }
    return () => {
      for (const handle of handles) window.clearTimeout(handle);
    };
  }, [index, reduced, slide]);

  /*
   * Any key advances -- not finishes, unlike Boot's any-key skip -- which is the keyboard
   * equivalent of the tap handler on the section below.
   */
  useEffect(() => {
    const onKey = (): void => {
      advance();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [advance]);

  if (slide === undefined) return <></>;

  const showFigure = index < FIGURE_SLIDE_COUNT;
  const isDisclaimer = index === DISCLAIMER_INDEX;

  return (
    <section className="intro" onClick={advance}>
      <div className={isDisclaimer ? 'intro-slide intro-pulse' : 'intro-slide'} key={index}>
        {slide.heading !== null && <h2 className="intro-heading">{slide.heading}</h2>}
        <p className="intro-body" data-testid="intro-body">
          {slide.body.slice(0, shown)}
        </p>
        {showFigure && (
          <>
            <pre className="intro-figure" aria-hidden="true">
              {INTRO_FIGURE}
            </pre>
            <p className="intro-continue">{t('advice.clickToContinue')}...</p>
          </>
        )}
      </div>
      <button
        type="button"
        className="intro-skip"
        onClick={(event) => {
          // Stops the tap from ALSO reaching the section's onClick above: Skip and advance are
          // different actions here (unlike Boot, where the tap and the Skip button do the same
          // thing), so the two must not both fire from one press.
          event.stopPropagation();
          finish();
        }}
      >
        {t('button.skipIntro')}
      </button>
    </section>
  );
}

/**
 * The mount point: `<IntroGate />`, once, ahead of `<BootGate />` in the shell.
 *
 * It is the piece that reads `UiPrefs.introSeen` reactively, so the sequence disappears the
 * moment it records itself as seen and never comes back on a later mount -- IntroSequence itself
 * must not do this, for the reason Boot.tsx's identical comment about `bootSeen` gives.
 */
export function IntroGate(): ReactElement | null {
  const introSeen = useAppStore((s) => s.ui.introSeen);
  return introSeen ? null : <IntroSequence />;
}

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import './intro.css';
import { INTRO_ACKNOWLEDGEMENT, INTRO_DISCLAIMER, INTRO_DISCLAIMER_HEADING, INTRO_FIGURE, INTRO_SLIDES } from '../../content/introSlides';
import { useCopy } from '../../content/useCopy';
import { ModalShell } from '../components/ModalShell';
import { useAppStore } from '../../store';

/** [ms] per character of the typed body text. */
export const INTRO_CHAR_INTERVAL_MS = 18;
const INTRO_FADE_OUT_MS = 180;

const FIGURE_SLIDE_COUNT = 4;
const ACKNOWLEDGEMENT_INDEX = 3;
const LAST_INDEX = INTRO_SLIDES.length - 1;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function bodyText(index: number): string {
  const slide = INTRO_SLIDES[index] ?? INTRO_SLIDES[0];
  if (slide === undefined) return '';
  return [
    ...(slide.lead === null ? [] : [slide.lead]),
    ...slide.bullets.map((bullet) => bullet.rest === null ? bullet.lead : `${bullet.lead}: ${bullet.rest}`),
  ].join('\n');
}

export function IntroSequence(): ReactElement {
  const t = useCopy();
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const [index, setIndex] = useState(0);
  const [acknowledgementOpen, setAcknowledgementOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const slide = INTRO_SLIDES[index] ?? INTRO_SLIDES[0];
  const text = bodyText(index);
  const [shown, setShown] = useState<number>(() => (reduced ? text.length : 0));
  const finishedRef = useRef(false);
  const acknowledgementId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const keepAcknowledgementOpen = useCallback((): void => undefined, []);

  const finish = useCallback((): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    useAppStore.getState().setUi({ introSeen: true });
  }, []);

  const advance = useCallback((): void => {
    if (acknowledgementOpen || leaving) return;
    if (index === ACKNOWLEDGEMENT_INDEX) {
      setAcknowledgementOpen(true);
      return;
    }
    if (index >= LAST_INDEX) {
      finish();
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setIndex(index + 1);
      setLeaving(false);
    }, INTRO_FADE_OUT_MS);
  }, [acknowledgementOpen, finish, index, leaving]);

  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return undefined;
    }
    setShown(0);
    const handles: number[] = [];
    for (let character = 0; character < text.length; character += 1) {
      handles.push(window.setTimeout(() => setShown(character + 1), (character + 1) * INTRO_CHAR_INTERVAL_MS));
    }
    return () => {
      for (const handle of handles) window.clearTimeout(handle);
    };
  }, [index, reduced, text]);

  useEffect(() => {
    const onKey = (): void => advance();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  if (slide === undefined) return <></>;

  let offset = 0;
  const reveal = (value: string): string => {
    const visible = text.slice(offset, Math.min(offset + value.length, shown));
    offset += value.length + 1;
    return visible;
  };
  const showFigure = index < FIGURE_SLIDE_COUNT;

  return (
    <section
      className="intro"
      onClick={advance}
      /*
       * THE POINTER NEEDS THE CONTROL VISIBLE, or it points at nothing. The topbar is z-index 30
       * (appShell.css) and this overlay is 56, so the skin control the arrow indicates is COVERED
       * for the whole intro. An arrow aimed at blank space teaches a location the user cannot see,
       * which is worse than no arrow. This attribute lets appShell.css lift the topbar above the
       * overlay for the one slide that draws the pointer, and only that slide.
       */
      data-pointing-at-settings={index === LAST_INDEX ? 'true' : undefined}
    >
      <div className={reduced ? 'intro-slide intro-no-motion' : leaving ? 'intro-slide intro-fade-out' : 'intro-slide'} key={index}>
        {slide.heading !== null && <h2 className="intro-heading intro-subsection-title intro-highlight">{slide.heading}</h2>}
        {slide.lead !== null && <p className="intro-body" data-testid="intro-body">{reveal(slide.lead)}</p>}
        {slide.bullets.length > 0 && (
          <ul className="intro-bullets" data-testid={slide.lead === null ? 'intro-body' : undefined}>
            {slide.bullets.map((bullet) => {
              const bulletText = bullet.rest === null ? bullet.lead : `${bullet.lead}: ${bullet.rest}`;
              const visible = reveal(bulletText);
              const lead = visible.slice(0, bullet.lead.length);
              const rest = visible.slice(bullet.lead.length);
              return <li key={bullet.lead}><span className="intro-lead-phrase">{lead}</span>{rest}</li>;
            })}
          </ul>
        )}
        {showFigure && <><pre className="intro-figure" aria-hidden="true">{INTRO_FIGURE}</pre><p className="intro-continue">{t('advice.clickToContinue')}...</p></>}
      </div>
      {/*
       * The shell's skin-and-preferences control (TopbarSkinPicker, src/app/App.tsx) sits at the
       * top right of the app and nothing pointed at it; the owner never found it. Drawn once, on
       * this the LAST slide only ("What Setup Collects"), and never again: it is a sibling of
       * `.intro-slide` rather than a child of it, so `position: absolute` in intro.css resolves
       * against `.intro` -- the fixed, full-viewport shell stand-in -- and lands in the shell's
       * own top-right corner, not against the slide's centred text column. Static: the brief
       * calls a still arrow the safer choice, and a still element needs no
       * `prefers-reduced-motion` branch. Colour is `--text` throughout, never `--accent`: this
       * app's own tokens.css records `--accent` at 1.41:1 on limelight, effectively invisible,
       * against `--text` at 10.91:1 there.
       */}
      {index === LAST_INDEX && (
        <div className="intro-settings-pointer" data-testid="intro-settings-pointer">
          <svg
            className="intro-settings-pointer-arrow"
            viewBox="0 0 64 64"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <marker
                id="introSettingsArrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="4"
                orient="auto-start-reverse"
              >
                <path className="intro-settings-pointer-head" d="M0 0 L8 4 L0 8 Z" />
              </marker>
            </defs>
            <path
              className="intro-settings-pointer-shaft"
              d="M6 56 C 20 56, 42 44, 54 10"
              markerEnd="url(#introSettingsArrowhead)"
            />
          </svg>
          <p className="intro-settings-pointer-label">{t('label.changeVisualSettings')}</p>
        </div>
      )}
      {acknowledgementOpen && (
        <ModalShell labelledBy={acknowledgementId} className="intro-modal" backdropClassName="intro-modal-bg" testId="intro-acknowledgement-backdrop" onClose={keepAcknowledgementOpen}>
          <h2 id={acknowledgementId} className="intro-modal-title">{INTRO_DISCLAIMER_HEADING}</h2>
          <p className="intro-modal-warning">{INTRO_DISCLAIMER}</p>
          <label className="intro-acknowledgement">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            {INTRO_ACKNOWLEDGEMENT}
          </label>
          <button type="button" className="intro-acknowledgement-continue" disabled={!acknowledged} onClick={() => { setAcknowledgementOpen(false); setIndex((current) => current + 1); }}>
            {t('button.introContinue')}
          </button>
        </ModalShell>
      )}
    </section>
  );
}

export function IntroGate(): ReactElement | null {
  const introSeen = useAppStore((s) => s.ui.introSeen);
  return introSeen ? null : <IntroSequence />;
}

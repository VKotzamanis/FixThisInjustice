import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import './intro.css';
import { emphasise } from './emphasis';
import { INTRO_ACKNOWLEDGEMENT, INTRO_DISCLAIMER, INTRO_DISCLAIMER_HEADING, INTRO_SLIDES } from '../../content/introSlides';
import { useCopy } from '../../content/useCopy';
import { ModalShell } from '../components/ModalShell';
import { OwnerSprite } from '../components/OwnerSprite';
import { prefersReducedMotion } from '../hooks/reducedMotion';
import { useAppStore } from '../../store';

/** [ms] per character of the typed body text. */
export const INTRO_CHAR_INTERVAL_MS = 18;
const INTRO_FADE_OUT_MS = 180;

/**
 * Between a bullet's lead phrase and the rest of its sentence. Declared once because both the
 * typing budget in `bodyText` and the render below have to agree on its length to the character:
 * a mismatch shifts every reveal offset after it.
 */
const BULLET_SEPARATOR = ': ';

/*
 * THE REVEAL STILL COUNTS RAW CHARACTERS, MARKS INCLUDED, so each of the owner's marks costs one
 * silent tick of the typewriter: 18 ms in which nothing new appears. Accepted rather than
 * corrected. The fix would be a second length for every field, the marked one for the typing
 * budget and the shown one for the slice, and `bodyText`, `reveal`'s running offset and
 * BULLET_SEPARATOR all have to agree to the character or every later offset shifts. A pair of
 * marks is two ticks, 36 ms, in a paragraph that types for several seconds. `emphasise` and the
 * mark rules live in src/ui/intro/emphasis.ts.
 */

const FIGURE_SLIDE_COUNT = 4;
const ACKNOWLEDGEMENT_INDEX = 3;
const LAST_INDEX = INTRO_SLIDES.length - 1;

function bodyText(index: number): string {
  const slide = INTRO_SLIDES[index] ?? INTRO_SLIDES[0];
  if (slide === undefined) return '';
  return [
    ...(slide.lead === null ? [] : [slide.lead]),
    ...slide.bullets.map((bullet) => bullet.rest === null ? bullet.lead : `${bullet.lead}${BULLET_SEPARATOR}${bullet.rest}`),
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
    >
      <div className={reduced ? 'intro-slide intro-no-motion' : leaving ? 'intro-slide intro-fade-out' : 'intro-slide'} key={index}>
        {slide.heading !== null && <h2 className="intro-heading intro-subsection-title intro-highlight">{slide.heading}</h2>}
        {slide.lead !== null && <p className="intro-body" data-testid="intro-body">{emphasise(reveal(slide.lead))}</p>}
        {slide.bullets.length > 0 && (
          <ul className="intro-bullets" data-testid={slide.lead === null ? 'intro-body' : undefined}>
            {slide.bullets.map((bullet) => {
              const bulletText = bullet.rest === null ? bullet.lead : `${bullet.lead}${BULLET_SEPARATOR}${bullet.rest}`;
              const visible = reveal(bulletText);
              const lead = visible.slice(0, bullet.lead.length);
              const afterLead = visible.slice(bullet.lead.length);
              /*
               * THE REST GETS ITS OWN ELEMENT, and the separator sits between the two rather than
               * at the head of the rest. The rendered characters are unchanged: this splits one
               * text node into `<span>lead</span>`, `": "`, `<span>rest</span>`, which reads the
               * same and measures the same.
               *
               * WHY. Design Mode recognises long-form text by matching an element's WHOLE text
               * against src/content/r10Text.ts. With
               * the rest living loose in the `<li>`, the only element whose text was ever exactly
               * one stored field was the lead phrase, so the sentence AFTER the colon - which is
               * most of what the owner wrote - could not be tapped and edited. One span buys it.
               */
              const separator = afterLead.slice(0, BULLET_SEPARATOR.length);
              const rest = afterLead.slice(BULLET_SEPARATOR.length);
              return (
                <li key={bullet.lead}>
                  <span className="intro-lead-phrase">{emphasise(lead)}</span>
                  {separator}
                  {bullet.rest === null ? null : <span className="intro-bullet-rest">{emphasise(rest)}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {/*
          * The owner's own sprite where the ASCII stick figure was (stylize survey item 7). It
          * plays once per slide: the slide remounts on every advance (`key={index}` above), so
          * each figure slide gets a fresh element and one 1.43 s play, then rests on frame 0.
          * INTRO_FIGURE stays in introSlides.ts, the owner's file, unedited and now unrendered.
          */}
        {showFigure && <><OwnerSprite play /><p className="intro-continue">{t('advice.clickToContinue')}...</p></>}
      </div>
      {acknowledgementOpen && (
        <ModalShell labelledBy={acknowledgementId} className="intro-modal" backdropClassName="intro-modal-bg" testId="intro-acknowledgement-backdrop" onClose={keepAcknowledgementOpen}>
          <h2 id={acknowledgementId} className="intro-modal-title">{INTRO_DISCLAIMER_HEADING}</h2>
          <p className="intro-modal-warning">{emphasise(INTRO_DISCLAIMER)}</p>
          <label className="intro-acknowledgement">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            {emphasise(INTRO_ACKNOWLEDGEMENT)}
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

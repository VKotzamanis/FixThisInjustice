// src/ui/components/VideoModal.tsx
//
// The Invidious form-reference modal. Master plan section 8 keeps both the modal and the
// search-query design; the security review requires the hardening below.
//
// What changed from legacy/console-video.jsx:
//   - Reached through React context, never through `window.__videoModal` (code review A53).
//   - The preferred host goes through `setUi({ videoInstanceHost })`, not localStorage: the
//     lint gate reserves Web Storage for src/store/persistence.ts.
//   - The host is recorded when the frame LOADS, not only when the user clicks out (A71).
//   - The iframe carries `sandbox="allow-scripts allow-same-origin"` and
//     `referrerPolicy="no-referrer"` (master plan section 8; security review M2 and
//     constraint 20). The sandbox is the master plan's exact pair, which omits
//     `allow-top-navigation` and `allow-popups` as M2 requires.
//   - The host list is src/config/videoInstances.ts, the same module build/cspPlugin.ts reads
//     to generate `frame-src`, so the modal can never offer a host the CSP would block.
//
// The URLs are not injectable: the host comes from that frozen list, the video id is gated by
// VIDEO_ID_RE below, and the search term goes through encodeURIComponent.

import { createContext, useContext, useId, useState } from 'react';
import type { ReactElement } from 'react';
import { ModalShell } from './ModalShell';
import { VIDEO_INSTANCES } from '../../config/videoInstances';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { useAppStore } from '../../store';
import '../styles/train.css';

/** 11 URL-safe base64 characters is a YouTube id; anything else is a search query. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface VideoRequest {
  /**
   * `Exercise.videoQuery`: a search string, an 11-character clip id, or null for an exercise
   * that carries neither. Null is a normal case, not an error (nine library entries).
   */
  query: string | null;
  /** The exercise name, used as the frame's accessible title and as the search fallback. */
  title: string;
}

export interface VideoModalApi {
  open(request: VideoRequest): void;
  close(): void;
}

export const VideoModalContext = createContext<VideoModalApi | null>(null);

export function useVideoModal(): VideoModalApi {
  const api = useContext(VideoModalContext);
  if (api === null) throw new Error('useVideoModal used outside TrainingModalsProvider');
  return api;
}

/**
 * Where the rotation starts. A persisted host that is no longer in the allowlist (dropped
 * after a compromise, per security constraint 21) falls back to the first entry rather than
 * framing a host the CSP would now refuse.
 */
function startIndex(preferredHost: string | null): number {
  if (preferredHost === null) return 0;
  const found = VIDEO_INSTANCES.findIndex((instance) => instance.host === preferredHost);
  return found >= 0 ? found : 0;
}

export function VideoModal(props: { request: VideoRequest; onClose: () => void }): ReactElement | null {
  const preferredHost = useAppStore((s) => s.ui.videoInstanceHost);
  // Seeded once per open: the point of persisting a host is that the NEXT exercise opens
  // straight to it, and re-seeding mid-session would undo a rotation the user just made.
  const [index, setIndex] = useState(() => startIndex(preferredHost));
  const [reloadKey, setReloadKey] = useState(0);
  const headingId = useId();
  const t = useCopy();
  const overrides = useCopyOverrides();

  const instance = VIDEO_INSTANCES[index];
  // Every hook above this line, so the guard cannot change the hook order. Unreachable while
  // the list is non-empty; it is here because noUncheckedIndexedAccess is on and an empty
  // list would otherwise be an `as` cast.
  if (instance === undefined) return null;

  const videoId =
    props.request.query !== null && VIDEO_ID_RE.test(props.request.query)
      ? props.request.query
      : null;
  // The legacy branch: with a clip id the search falls back to the exercise name, and with no
  // query at all it does the same, so the outbound control is never dead.
  const searchTerm = videoId === null ? (props.request.query ?? props.request.title) : props.request.title;

  const embedUrl = `https://${instance.host}/embed/${videoId ?? ''}?autoplay=1`;
  const watchUrl = `https://${instance.host}/watch?v=${videoId ?? ''}`;
  const searchUrl = `https://${instance.host}/search?q=${encodeURIComponent(searchTerm)}`;

  /*
   * HONEST LIMITATION. An iframe `load` event also fires for the instance's own error page,
   * so this records "the host answered", not "the clip played". It is still strictly better
   * than the legacy behaviour, which recorded a host only when the user clicked the outbound
   * link, so a user for whom the embed worked re-tried instance 1 every time (A71).
   */
  const onFrameLoad = (): void => {
    if (instance.host === preferredHost) return;
    // getState(), like every other action call in this codebase: the actions are created once
    // and never replace themselves, so subscribing to one buys nothing.
    useAppStore.getState().setUi({ videoInstanceHost: instance.host });
  };

  const nextInstance = (): void => {
    setIndex((i) => (i + 1) % VIDEO_INSTANCES.length);
    // Bumped with the index so a rotation back to a host already tried still remounts the
    // frame instead of reusing the failed document.
    setReloadKey((k) => k + 1);
  };

  return (
    <ModalShell
      labelledBy={headingId}
      className="vmod"
      backdropClassName="vmod-bg"
      testId="video-modal-backdrop"
      onClose={props.onClose}
    >
      <div className="vmod-head">
        <div id={headingId}>
          <div className="vmod-eyebrow">{t('label.formReference')}</div>
          <h2 className="vmod-name">{props.request.title}</h2>
        </div>
        <button
          type="button"
          className="vmod-close"
          onClick={props.onClose}
          aria-label={t('button.closeModal')}
        >
          {/* Copy contract R6: a mark from the token set, not an emoji. */}
          {'✕'}
        </button>
      </div>

      <div className="vmod-instance">
        <span className="vmod-inst-host">{instance.host}</span>
        <span className="vmod-inst-meta">
          {FORMAT.videoInstanceOf(index + 1, VIDEO_INSTANCES.length, overrides)}
        </span>
        <button type="button" onClick={nextInstance}>
          {t('button.nextInstance')}
        </button>
      </div>

      {videoId === null ? (
        <div className="vmod-search">
          <h3 className="vmod-search-eyebrow">{t('label.videoSearch')}</h3>
          <p className="vmod-search-q">{searchTerm}</p>
          <p className="vmod-search-note">{t('advice.noClipRecorded')}</p>
        </div>
      ) : (
        <div className="vmod-frame">
          <iframe
            key={`${String(index)}-${String(reloadKey)}`}
            src={embedUrl}
            title={props.request.title}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            loading="lazy"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={onFrameLoad}
          />
        </div>
      )}

      <div className="vmod-foot">
        {videoId !== null && (
          <a className="vmod-link" href={watchUrl} target="_blank" rel="noopener noreferrer">
            {t('button.openClip')}
          </a>
        )}
        <a className="vmod-link" href={searchUrl} target="_blank" rel="noopener noreferrer">
          {t('button.searchInstance')}
        </a>
      </div>
    </ModalShell>
  );
}

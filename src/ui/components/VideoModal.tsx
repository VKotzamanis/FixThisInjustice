// src/ui/components/VideoModal.tsx
//
// The form-reference modal: one curated clip per exercise (ROADMAP L9, audit E05), framed from
// YouTube's privacy-enhanced player, with the Invidious hosts as "Other Mirror" fallbacks.
//
// What it guarantees:
//   - Nothing is framed until the user opens the modal; the clip itself starts only on a tap
//     inside the player (no autoplay, `playsinline=1`; src/config/videoInstances.ts).
//   - Offline, or for an exercise with no verified clip, it frames nothing and shows the form
//     cues with a plain line saying why: never a broken iframe.
//   - The host list is src/config/videoInstances.ts, the module build/cspPlugin.ts reads to
//     generate `frame-src`, so the modal can never frame a host the CSP would block.
//   - Every frame carries `sandbox="allow-scripts allow-same-origin"` (master plan section 8;
//     security review M2: no top navigation, no popups). Its referrer policy is the source's
//     own: origin-only for YouTube, which requires a Referer, `no-referrer` for the mirrors.
//   - The preferred source goes through `setUi({ videoInstanceHost })`, never Web Storage, and
//     is recorded when the frame LOADS (A71).
//
// The URL is not injectable: the host comes from that frozen list and the id is gated by
// VIDEO_ID_RE inside embedUrl.

import { createContext, useContext, useId, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ModalShell } from './ModalShell';
import { FormCueBody } from './FormCuesModal';
import { VIDEO_INSTANCES, embedUrl } from '../../config/videoInstances';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import { useAppStore } from '../../store';
import '../styles/train.css';

export interface VideoRequest {
  /** `Exercise.videoId`: an 11-character YouTube id, or null when no clip has been verified. */
  videoId: string | null;
  /** `Exercise.formCueId`: the cues shown when the clip cannot play. */
  cueId: string | null;
  /** The exercise name: the modal heading and the frame's accessible title. */
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

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * The browser's own connectivity flag, live. `navigator.onLine === false` means no network at
 * all; `true` only means some network exists, so a network that cannot reach the host still
 * frames the player, which then shows its own error inside the frame.
 */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function VideoModal(props: { request: VideoRequest; onClose: () => void }): ReactElement | null {
  const preferredHost = useAppStore((s) => s.ui.videoInstanceHost);
  // Seeded once per open: the point of persisting a host is that the NEXT exercise opens
  // straight to it, and re-seeding mid-session would undo a rotation the user just made.
  const [index, setIndex] = useState(() => startIndex(preferredHost));
  const [reloadKey, setReloadKey] = useState(0);
  const online = useOnline();
  const headingId = useId();
  const t = useCopy();
  const overrides = useCopyOverrides();

  const instance = VIDEO_INSTANCES[index];
  // Every hook above this line, so the guard cannot change the hook order. Unreachable while
  // the list is non-empty; it is here because noUncheckedIndexedAccess is on and an empty
  // list would otherwise be an `as` cast.
  if (instance === undefined) return null;

  const src = props.request.videoId === null ? null : embedUrl(instance, props.request.videoId);

  /*
   * HONEST LIMITATION. An iframe `load` event also fires for a host's own error page, so this
   * records "the host answered", not "the clip played" (A71).
   */
  const onFrameLoad = (): void => {
    if (instance.host === preferredHost) return;
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
      sheet="reading"
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

      {src !== null && online ? (
        <>
          <div className="vmod-instance">
            <span className="vmod-inst-host">{instance.label}</span>
            <span className="vmod-inst-meta">
              {FORMAT.videoInstanceOf(index + 1, VIDEO_INSTANCES.length, overrides)}
            </span>
            <button type="button" onClick={nextInstance}>
              {t('button.otherMirror')}
            </button>
          </div>
          <div className="vmod-frame">
            <iframe
              key={`${String(index)}-${String(reloadKey)}`}
              src={src}
              title={props.request.title}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy={instance.referrerPolicy}
              loading="lazy"
              allow="fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              onLoad={onFrameLoad}
            />
          </div>
        </>
      ) : (
        <div className="vmod-fallback">
          <p className="vmod-state" role="status">
            {src === null ? t('advice.noClipRecorded') : t('advice.videoOffline')}
          </p>
          {props.request.cueId !== null && (
            <div className="fcm-body">
              <FormCueBody cueId={props.request.cueId} />
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

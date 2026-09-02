// src/ui/motivation/MotivationModal.tsx
//
// The weekly-miss popup (P6 Task 4, master plan sections 6.7 and 10.2). It states the week that
// was missed, plays the motivation clip, and carries ONE control.
//
// Why one control. Master plan section 10.2 (decision `motivation-single-dismiss`) adopted a
// single `Dismiss`: the rejected second button ("Mute this week") called the same store action,
// because `MotivationState` has no field that could make the two behave differently. Escape and
// a backdrop click are the same dismissal by another route, and every route records the week.
//
// Why the clip autoplays muted, against the draft in the P6 plan. WebKit's iOS video policy
// (REFERENCES.md, https://webkit.org/blog/6784/new-video-policies-for-ios/) permits autoplay
// only for a muted element, requires `playsinline` or iPhone Safari takes the video fullscreen,
// and requires a user gesture before playback carries sound. The plan's draft answered this with
// a `Play` button; a second button is exactly what section 10.2 removed, so the gesture is a tap
// on the clip itself and the element autoplays muted until it arrives. The clip is optional
// throughout: with no source, a source that fails to load, or a source still resolving, the
// popup still states the miss and still offers Dismiss, because the message is the feature.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { ModalShell } from '../components/ModalShell';
import {
  BUNDLED_VIDEO_SRC,
  probeBundledVideo,
  resolveVideoSrc,
  type VideoSource,
} from '../../domain/motivation/assets';
import { copy } from '../../content/copy';
import { describeMiss } from '../../domain/motivation/trigger';
import { useAppStore } from '../../store';
import type { WeeklyReview } from '../../domain/types';
import './motivation.css';

/**
 * A flat near-black 16:9 frame, held inline so a poster exists whether or not a clip was ever
 * shipped. The CSP admits it: `img-src 'self' data: blob:`.
 */
export const POSTER_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%209'%3E%3Crect%20width='16'%20height='9'%20fill='%230a0b0c'/%3E%3C/svg%3E";

export interface MotivationModalProps {
  /**
   * The closed week being reported, or null for Settings' preview. In preview nothing is
   * recorded: the modal is being shown on request, not because a week was missed.
   */
  review: WeeklyReview | null;
  /** The profile the clip and the dismissal belong to. */
  profileId: string;
  /** Closes the modal. The caller owns the mount; this component owns what the dismissal writes. */
  onDismiss: () => void;
}

export function MotivationModal(props: MotivationModalProps): ReactElement {
  const { review, profileId, onDismiss } = props;
  const headingId = useId();
  const dismissRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [source, setSource] = useState<VideoSource | null>(null);
  /** False once the element has reported that it cannot play what it was given. */
  const [playable, setPlayable] = useState(true);
  const [muted, setMuted] = useState(true);
  // Subscribed rather than read once: choosing a clip in Settings while the preview is open has
  // to re-resolve, and the effect's cleanup is what releases the URL the old one held.
  const customVideoAssetId = useAppStore(
    (s) => s.motivation[profileId]?.customVideoAssetId ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    let held: VideoSource | null = null;
    const resolve = async (): Promise<void> => {
      const resolved = await resolveVideoSrc(useAppStore.getState(), profileId);
      // resolveVideoSrc returns the bundled path whenever no custom asset is stored, which is a
      // fallback, not a promise that the file was deployed (the repository ships no clip by
      // default). The HEAD probe is the only thing that knows, and it caches a definite answer.
      const present = resolved.src !== BUNDLED_VIDEO_SRC || (await probeBundledVideo());
      if (cancelled || !present) {
        resolved.revoke(); // exactly one revoke per resolution, including the ones never shown
        return;
      }
      held = resolved;
      setSource(resolved);
      setPlayable(true);
      setMuted(true);
    };
    void resolve();
    return () => {
      cancelled = true;
      held?.revoke();
      // Drops the stale src in the same tick as the revoke, so no frame renders a released URL.
      setSource(null);
    };
  }, [profileId, customVideoAssetId]);

  useEffect(() => {
    // ModalShell focuses the panel so the dialog's name is read first; this runs after it (child
    // effects before parent effects) and moves focus on to the only control the dialog has.
    dismissRef.current?.focus();
  }, []);

  const dismiss = useCallback((): void => {
    if (review !== null) {
      // Date.now() at the call site, as everywhere else in the UI: the store action takes the
      // clock reading as an argument and never takes one of its own. [ms] epoch, UTC.
      useAppStore.getState().markMotivationShown(profileId, review.weekStart, Date.now());
    }
    onDismiss();
  }, [review, profileId, onDismiss]);

  const attachVideo = useCallback((node: HTMLVideoElement | null): void => {
    videoRef.current = node;
    // Muted is set on the element as well as through the prop: an engine that began loading
    // before the property landed would autoplay with sound, which iOS refuses outright and
    // which every other engine would deliver as an ambush.
    if (node !== null) node.muted = true;
  }, []);

  const toggleSound = useCallback((): void => {
    const video = videoRef.current;
    if (video === null) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    if (next) return;
    // This tap is the user gesture iOS requires before sound, and it is also the gesture that
    // starts playback at all where muted autoplay was refused.
    void video.play().catch(() => {
      /* a refused play leaves the poster and the copy, which is the whole message anyway */
    });
  }, []);

  const onVideoKey = useCallback(
    (event: KeyboardEvent<HTMLVideoElement>): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // Space would otherwise scroll the page the shell has locked.
      event.preventDefault();
      toggleSound();
    },
    [toggleSound],
  );

  const showVideo = source !== null && playable;

  return (
    <ModalShell
      labelledBy={headingId}
      className="mmod"
      backdropClassName="mmod-bg"
      testId="motivation-backdrop"
      onClose={dismiss}
    >
      <h2 id={headingId} className="mmod-title">
        {review === null ? copy('hero.motivationPreview') : copy('hero.weeklyTargetMissed')}
      </h2>
      <p className="mmod-detail">
        {review === null ? copy('advice.motivationPreview') : describeMiss(review)}
      </p>
      {showVideo && source !== null && (
        <video
          ref={attachVideo}
          className="mmod-video"
          src={source.src}
          poster={POSTER_DATA_URI}
          playsInline
          autoPlay
          loop
          muted={muted}
          preload="metadata"
          tabIndex={0}
          aria-label={muted ? copy('advice.tapForSound') : undefined}
          data-testid="motivation-video"
          onClick={toggleSound}
          onKeyDown={onVideoKey}
          onError={() => {
            setPlayable(false);
          }}
        />
      )}
      {showVideo && muted && <p className="mmod-hint">{copy('advice.tapForSound')}</p>}
      <div className="mmod-actions">
        <button type="button" className="mmod-dismiss" ref={dismissRef} onClick={dismiss}>
          {copy('button.dismiss')}
        </button>
      </div>
    </ModalShell>
  );
}

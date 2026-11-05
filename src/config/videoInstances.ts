/** A YouTube clip id: 11 URL-safe base64 characters. The one gate for every stored or framed id. */
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** One front-end that may be framed for exercise-form video. */
export interface VideoInstance {
  /** Bare hostname, no scheme, no trailing slash. */
  host: string;
  /** What the source line shows the user. */
  label: string;
  /**
   * Referrer policy for the frame. YouTube's Required Minimum Functionality page (read
   * 2026-11-05, developers.google.com/youtube/terms/required-minimum-functionality) requires an
   * embedded player to receive an HTTP Referer and recommends strict-origin-when-cross-origin,
   * which sends the app's origin only, never the path. The page-wide `no-referrer` meta would
   * suppress it, so the YouTube frame overrides it; the Invidious mirrors keep `no-referrer`
   * (security review constraint 20).
   */
  referrerPolicy: 'strict-origin-when-cross-origin' | 'no-referrer';
  /**
   * Query string for /embed/<id>, without the `?`. `playsinline=1` keeps playback inline in a
   * mobile browser (YouTube player parameters page, read 2026-11-05). No autoplay: the clip
   * starts on the user's own tap inside the player, never with sound when the modal opens.
   */
  embedQuery: string;
}

const MIRROR = { referrerPolicy: 'no-referrer', embedQuery: '' } as const;

/**
 * Hosts allowed in the CSP frame-src directive and offered by the video modal, in the order its
 * "Other Mirror" control steps through them. Changing this list changes the built CSP:
 * build/cspPlugin.ts reads frameSrcList() at build time, so the policy and the runtime list
 * cannot drift (security review constraint 21; master plan section 3).
 *
 * First: YouTube's privacy-enhanced player (ROADMAP L9, audit E05). Its help page (support
 * answer 171780, read 2026-11-05) says a view there is not used to personalise the viewer's
 * YouTube experience. It does not say no data reaches YouTube; docs/ARCHITECTURE.md (Privacy)
 * records that the frame loads only on the user's tap.
 *
 * Then the legacy Invidious list in the legacy order (legacy/console-video.jsx, master plan
 * section 10 amendment P1 A9), as mirrors for a network that blocks YouTube. Their liveness is
 * not tested (audit E05). The legacy per-host flag emoji is dropped: user-visible copy carries
 * no emoji (master plan section 3, tone), so a mirror's label is its host.
 */
export const VIDEO_INSTANCES: readonly VideoInstance[] = [
  {
    host: 'www.youtube-nocookie.com',
    label: 'YouTube, privacy-enhanced',
    referrerPolicy: 'strict-origin-when-cross-origin',
    embedQuery: 'playsinline=1',
  },
  { host: 'invidious.nerdvpn.de', label: 'invidious.nerdvpn.de', ...MIRROR },
  { host: 'inv.nadeko.net', label: 'inv.nadeko.net', ...MIRROR },
  { host: 'invidious.tiekoetter.com', label: 'invidious.tiekoetter.com', ...MIRROR },
  { host: 'yt.chocolatemoo53.com', label: 'yt.chocolatemoo53.com', ...MIRROR },
  { host: 'inv.thepixora.com', label: 'inv.thepixora.com', ...MIRROR },
  { host: 'invidious.f5.si', label: 'invidious.f5.si', ...MIRROR },
];

/**
 * The frame URL for a clip on one source, or null for anything that is not an 11-character id,
 * so no caller can put free text into a framed URL.
 */
export function embedUrl(instance: VideoInstance, videoId: string): string | null {
  if (!VIDEO_ID_RE.test(videoId)) return null;
  const query = instance.embedQuery === '' ? '' : `?${instance.embedQuery}`;
  return `https://${instance.host}/embed/${videoId}${query}`;
}

/** Space-separated https origins for the CSP frame-src directive. */
export function frameSrcList(): string {
  return VIDEO_INSTANCES.map((i) => `https://${i.host}`).join(' ');
}

/** One Invidious front-end that may be framed for exercise-form video. */
export interface VideoInstance {
  /** Bare hostname, no scheme, no trailing slash. */
  host: string;
  /** What the instance switcher shows the user. */
  label: string;
}

/**
 * Hosts allowed in the CSP frame-src directive and offered by the video modal.
 * Changing this list changes the built CSP: build/cspPlugin.ts reads
 * frameSrcList() at build time, so the policy and the runtime list cannot drift
 * (security review constraint 21; master plan section 3).
 *
 * The list and its order are the legacy INSTANCES list in
 * legacy/console-video.jsx, as the master plan section 10 amendment P1 A9
 * requires. The legacy per-host flag emoji is dropped: user-visible copy carries
 * no emoji (master plan section 3, tone), so the label is the host itself.
 */
export const VIDEO_INSTANCES: readonly VideoInstance[] = [
  { host: 'invidious.nerdvpn.de', label: 'invidious.nerdvpn.de' },
  { host: 'inv.nadeko.net', label: 'inv.nadeko.net' },
  { host: 'invidious.tiekoetter.com', label: 'invidious.tiekoetter.com' },
  { host: 'yt.chocolatemoo53.com', label: 'yt.chocolatemoo53.com' },
  { host: 'inv.thepixora.com', label: 'inv.thepixora.com' },
  { host: 'invidious.f5.si', label: 'invidious.f5.si' },
];

/** Space-separated https origins for the CSP frame-src directive. */
export function frameSrcList(): string {
  return VIDEO_INSTANCES.map((i) => `https://${i.host}`).join(' ');
}

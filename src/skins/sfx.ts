import { useEffect } from 'react';

import { useAppStore } from '../store';
import { getAudioContext, unlockAudio } from '../ui/audio/chime';
import type { SkinId } from '../domain/types';

/**
 * Per-skin sound effects. NO AUDIO SHIPS IN THIS REPOSITORY: public/sfx/ holds a .gitkeep and
 * nothing else, and the app is correct with it empty. A moment whose file is absent is silent and
 * nothing else changes. docs/sfx.md says where the files go and what they must be.
 *
 * The four moments a skin may score (round-three plan section 6.1). Four, and no more: a fifth
 * sound turns a training app into a slot machine.
 *
 *   session_done       the last set is logged and the completion line renders   1.2 to 2.0 s
 *   pr_stamp           the MOTHER stamp lands, timed to the 700 ms landing      0.8 to 1.2 s
 *   rest_over          the rest countdown reaches 0; the only functional one    1.0 to 1.5 s
 *   intervention_open  the missed-week modal opens; soft and low, not a sting   1.0 to 1.5 s
 */
export type SfxName = 'session_done' | 'pr_stamp' | 'rest_over' | 'intervention_open';

export const SFX_NAMES: readonly SfxName[] = [
  'session_done',
  'pr_stamp',
  'rest_over',
  'intervention_open',
];

/**
 * One file per skin per moment, under public/.
 *
 * AAC in an .m4a (MP4) container is the format, with MP3 as the other accepted extension; master
 * plan section 10.10 records the decision and the reason. Ogg is never shipped alone, because
 * Vorbis is unsupported in Safari and this PWA is most likely installed on an iPhone.
 *
 * The files are not precached: master plan section 3 excludes media from injectManifest, so they
 * are fetched on the first unlock rather than riding in the app shell.
 */
export function sfxUrl(skin: SkinId, name: SfxName): string {
  return `${import.meta.env.BASE_URL}sfx/${skin}/${name}.m4a`;
}

/** The whole map for one skin: every moment keyed by name, pointing at its asset path. */
export function sfxMap(skin: SkinId): Readonly<Record<SfxName, string>> {
  return {
    session_done: sfxUrl(skin, 'session_done'),
    pr_stamp: sfxUrl(skin, 'pr_stamp'),
    rest_over: sfxUrl(skin, 'rest_over'),
    intervention_open: sfxUrl(skin, 'intervention_open'),
  };
}

/** The slice of AudioBuffer this module uses. A real AudioBuffer satisfies it structurally. */
export interface SfxBuffer {
  readonly duration: number; // [s]
}

/** The slice of AudioBufferSourceNode this module uses. */
export interface SfxSource {
  buffer: SfxBuffer | null;
  connect(destination: unknown): unknown;
  start(): void;
  stop(): void;
}

/**
 * The slice of AudioContext this module uses. Declaring the structural minimum rather than taking
 * `AudioContext` is what lets the test supply a double without an `as` cast: jsdom implements no
 * Web Audio at all, so a real context cannot exist in the suite.
 */
export interface SfxContext {
  /*
   * Four states, not three. 'interrupted' is WebKit's, and the DOM lib this project compiles
   * against carries it in AudioContextState, so omitting it makes a real AudioContext unassignable
   * to this interface. It is also the state that matters on the target device: iOS moves the
   * context there for a phone call or a Siri invocation, and play() gates on state === 'running',
   * so an interrupted context is silent rather than scheduling nodes that never sound.
   */
  readonly state: 'suspended' | 'running' | 'closed' | 'interrupted';
  readonly destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<SfxBuffer>;
  createBufferSource(): SfxSource;
}

export interface SfxDeps {
  skin(): SkinId;
  /** ui.sounds. The only thing that silences a skin; prefers-reduced-motion is not consulted. */
  enabled(): boolean;
  context(): SfxContext | null;
  fetchAudio(url: string): Promise<ArrayBuffer>;
  isVisible(): boolean;
}

export interface SfxPlayer {
  /** Must be called from inside a user gesture. Idempotent per (context, skin) pair. */
  unlock(): Promise<void>;
  play(name: SfxName): void;
  dispose(): void;
}

export function createSfxPlayer(deps: SfxDeps): SfxPlayer {
  let buffers: Map<SfxName, SfxBuffer> | null = null;
  let decodedFor: SfxContext | null = null;
  let decodedSkin: SkinId | null = null;
  let inFlight: Promise<void> | null = null;
  let current: SfxSource | null = null;

  async function decodeAll(context: SfxContext, skin: SkinId): Promise<void> {
    const urls = sfxMap(skin);
    const next = new Map<SfxName, SfxBuffer>();
    for (const name of SFX_NAMES) {
      try {
        const data = await deps.fetchAudio(urls[name]);
        next.set(name, await context.decodeAudioData(data));
      } catch {
        /*
         * A missing or undecodable file silences that one moment and nothing else, and it says so
         * nowhere: public/sfx/ ships empty on purpose (docs/sfx.md), so "not there yet" is the
         * normal state rather than an error, and a console line per moment per unlock would be
         * four lines of noise on every install that has added no sounds. It must also never throw
         * into a gesture handler.
         */
      }
    }
    buffers = next;
    decodedFor = context;
    decodedSkin = skin;
  }

  return {
    async unlock(): Promise<void> {
      // The first gate, and the one that keeps the promise in docs/sfx.md: with sounds off nothing
      // is fetched, so an install that never turns them on never asks the network for audio.
      if (!deps.enabled()) return;
      const context = deps.context();
      if (context === null) return;
      if (context.state === 'suspended') await context.resume();
      const skin = deps.skin();
      if (decodedFor === context && decodedSkin === skin && buffers !== null) return;
      // Decoding at fire time costs a variable delay, and a stamp sound arriving 300 ms after the
      // stamp is worse than no sound. Everything is decoded here, once, and held.
      inFlight ??= decodeAll(context, skin).finally(() => {
        inFlight = null;
      });
      await inFlight;
    },

    play(name: SfxName): void {
      if (!deps.enabled()) return;
      if (!deps.isVisible()) return;
      const context = deps.context();
      if (context === null || context.state !== 'running') return;
      if (decodedFor !== context) return; // the context was closed and rebuilt; wait for a re-unlock
      const buffer = buffers?.get(name);
      if (buffer === undefined) return;
      // One-shot, never looped, never overlapping: a new fire stops the previous source.
      if (current !== null) current.stop();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
      current = source;
    },

    dispose(): void {
      if (current !== null) current.stop();
      current = null;
      buffers = null;
      decodedFor = null;
      decodedSkin = null;
    },
  };
}

/**
 * The application-wide player. It reads the store through getState() rather than a hook, because
 * it is called from event handlers and effects, never during a render.
 *
 * getAudioContext() is P4's one long-lived context (src/ui/audio/chime.ts). A second context would
 * double the audio hardware claim for no benefit; the identity re-check inside the player is there
 * because P4's releaseAudio() closes this one at the end of a session.
 */
export const sfxPlayer: SfxPlayer = createSfxPlayer({
  skin: () => useAppStore.getState().ui.skin,
  enabled: () => useAppStore.getState().ui.sounds,
  context: () => getAudioContext(),
  isVisible: () => document.visibilityState === 'visible',
  fetchAudio: async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`sfx ${url}: HTTP ${response.status}`);
    return response.arrayBuffer();
  },
});

/** Fire one moment on the application-wide player. A no-op unless every gate above is open. */
export function playSfx(name: SfxName): void {
  sfxPlayer.play(name);
}

/**
 * Unlock audio on the first user gesture of any kind, then stop listening.
 *
 * Mobile Safari and Chrome both start an AudioContext suspended and resume it only inside a user
 * gesture, so this listens for the first gesture of any kind rather than for one particular button.
 * Binding it to "start session" instead would leave rest_over silent on a PWA resumed from the home
 * screen straight back into a session already in progress, which is the one path where it is the
 * only useful sound in the set.
 *
 * This is not autoplay: nothing plays until the user touches the screen, and even then only if
 * ui.sounds is on.
 *
 * Both calls are needed and neither is redundant. unlockAudio() resumes the context for P4's rest
 * chime, which sounds whatever ui.sounds says; sfxPlayer.unlock() returns immediately while sounds
 * are off, so it cannot stand in for the first. Both are started synchronously inside the handler,
 * because resume() must be called from the gesture task and not from a promise continuation.
 *
 * The two listeners are removed together rather than registered with { once: true }, which removes
 * only the one that fired and would leave the other armed for the life of the document.
 */
export function useFirstGestureUnlock(): void {
  useEffect(() => {
    const onFirstGesture = (): void => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      void unlockAudio();
      void sfxPlayer.unlock();
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);
}

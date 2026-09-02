import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  SFX_NAMES,
  createSfxPlayer,
  playSfx,
  sfxMap,
  sfxUrl,
  useFirstGestureUnlock,
} from './sfx';
import type { SfxBuffer, SfxContext, SfxDeps, SfxSource } from './sfx';
import type { SkinId } from '../domain/types';
import { getAudioContext, unlockAudio } from '../ui/audio/chime';

/*
 * chime.ts is mocked for the whole file. Two reasons, and neither is convenience: jsdom ships no
 * Web Audio at all, so getAudioContext() would return null and the module-level sfxPlayer could
 * never be observed doing anything; and useFirstGestureUnlock's contract is "calls unlockAudio
 * once, then stops listening", which is a statement about that function's call count.
 */
vi.mock('../ui/audio/chime', () => ({
  getAudioContext: vi.fn(() => null),
  unlockAudio: vi.fn(),
}));

/*
 * vitest runs with restoreMocks: true. Measured 2026-09-02: on a vi.fn() created inside a module
 * factory that restores neither the implementation nor the call history, so both are re-established
 * here rather than assumed. Without the reset the second hook test inherits the first one's call.
 */
beforeEach(() => {
  vi.mocked(unlockAudio).mockReset();
  vi.mocked(unlockAudio).mockResolvedValue(false);
  vi.mocked(getAudioContext).mockReset();
  vi.mocked(getAudioContext).mockReturnValue(null);
});

class FakeSource implements SfxSource {
  buffer: SfxBuffer | null = null;
  started = 0;
  stopped = 0;
  connect(): unknown {
    return null;
  }
  start(): void {
    this.started += 1;
  }
  stop(): void {
    this.stopped += 1;
  }
}

class FakeContext implements SfxContext {
  /*
   * Four states, not three. 'interrupted' is WebKit's, and it is the one an iPhone enters for an
   * incoming call or a Siri invocation. A three-state fake would leave the state play() has to
   * survive on the target device as the one state this suite could not express.
   */
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
  destination: unknown = {};
  decoded = 0;
  sources: FakeSource[] = [];
  resumeCalls = 0;
  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  decodeAudioData(data: ArrayBuffer): Promise<SfxBuffer> {
    this.decoded += 1;
    return Promise.resolve({ duration: data.byteLength / 1000 }); // [s] a stand-in, not a real decode
  }
  createBufferSource(): SfxSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

/*
 * The byte length of a fetched file carries the skin it belongs to, and FakeContext turns bytes
 * into the stand-in `duration`, so a decoded buffer names its own skin. That is what lets a test
 * assert that the board buffer played rather than only that some buffer was set, which is the
 * difference between catching the limelight-plays-under-board bug and missing it.
 */
const SKIN_BYTES: Readonly<Record<SkinId, number>> = {
  clinical: 1100,
  limelight: 1200,
  board: 2400,
};

function skinOfUrl(url: string): SkinId {
  for (const id of ['clinical', 'limelight', 'board'] as const) {
    if (url.includes(`/sfx/${id}/`)) return id;
  }
  throw new Error(`no skin segment in ${url}`);
}

interface Harness {
  context: FakeContext;
  fetched: string[];
  deps: SfxDeps;
  setSkin(skin: SkinId): void;
  setEnabled(enabled: boolean): void;
  setVisible(visible: boolean): void;
}

function harness(
  over: {
    skin?: SkinId;
    enabled?: boolean;
    visible?: boolean;
    failing?: ReadonlySet<string>;
  } = {},
): Harness {
  const context = new FakeContext();
  const fetched: string[] = [];
  let skin: SkinId = over.skin ?? 'limelight';
  let enabled = over.enabled ?? true;
  let visible = over.visible ?? true;
  const failing = over.failing ?? new Set<string>();
  const deps: SfxDeps = {
    skin: () => skin,
    enabled: () => enabled,
    context: () => context,
    isVisible: () => visible,
    fetchAudio: (url: string) => {
      fetched.push(url);
      if (failing.has(url)) return Promise.reject(new Error('404'));
      return Promise.resolve(new ArrayBuffer(SKIN_BYTES[skinOfUrl(url)]));
    },
  };
  return {
    context,
    fetched,
    deps,
    setSkin: (next) => {
      skin = next;
    },
    setEnabled: (next) => {
      enabled = next;
    },
    setVisible: (next) => {
      visible = next;
    },
  };
}

describe('sfxUrl', () => {
  it('points at one file per skin per moment', () => {
    expect(sfxUrl('limelight', 'pr_stamp').endsWith('sfx/limelight/pr_stamp.m4a')).toBe(true);
    expect(sfxUrl('board', 'rest_over').endsWith('sfx/board/rest_over.m4a')).toBe(true);
  });

  it('names the four moments and no fifth', () => {
    expect([...SFX_NAMES]).toEqual([
      'session_done',
      'pr_stamp',
      'rest_over',
      'intervention_open',
    ]);
  });
});

describe('sfxMap', () => {
  it('is the four moments keyed by name, under the skin that is asked for', () => {
    const map = sfxMap('board');
    expect(Object.keys(map).sort()).toEqual([...SFX_NAMES].sort());
    expect(Object.values(map).every((url) => url.includes('/sfx/board/'))).toBe(true);
  });

  it('changes every entry when the skin changes', () => {
    expect(sfxMap('limelight').rest_over).not.toBe(sfxMap('clinical').rest_over);
  });
});

describe('createSfxPlayer', () => {
  it('plays nothing before the first unlock', () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(0);
    expect(h.fetched).toHaveLength(0);
  });

  it('fetches nothing while sounds are off', async () => {
    const h = harness({ enabled: false });
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    player.play('rest_over');
    expect(h.fetched).toHaveLength(0);
    expect(h.context.decoded).toBe(0);
    expect(h.context.sources).toHaveLength(0);
  });

  it('resumes the context and decodes each file exactly once', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    expect(h.context.state).toBe('running');
    expect(h.fetched).toHaveLength(4);
    expect(h.fetched.every((url) => url.includes('/sfx/limelight/'))).toBe(true);
    expect(h.context.decoded).toBe(4);
    await player.unlock();
    expect(h.fetched).toHaveLength(4);
    expect(h.context.decoded).toBe(4);
  });

  it('re-decodes when the skin changes', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    h.setSkin('board');
    await player.unlock();
    expect(h.fetched).toHaveLength(8);
    expect(h.fetched.slice(4).every((url) => url.includes('/sfx/board/'))).toBe(true);
  });

  it('starts one source and sets its buffer', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    player.play('session_done');
    expect(h.context.sources).toHaveLength(1);
    expect(h.context.sources[0]?.started).toBe(1);
    expect(h.context.sources[0]?.buffer).not.toBeNull();
  });

  it('stops the previous source rather than overlapping', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    player.play('session_done');
    player.play('pr_stamp');
    expect(h.context.sources).toHaveLength(2);
    expect(h.context.sources[0]?.stopped).toBe(1);
    expect(h.context.sources[1]?.started).toBe(1);
  });

  it('stays silent while the tab is hidden', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    h.setVisible(false);
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(0);
  });

  it('stays silent once sounds are turned off again', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    h.setEnabled(false);
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(0);
  });

  it('silences only the moment whose file is missing', async () => {
    const failing = new Set([sfxUrl('limelight', 'rest_over')]);
    const h = harness({ failing });
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    expect(h.context.decoded).toBe(3);
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(0);
    player.play('pr_stamp');
    expect(h.context.sources).toHaveLength(1);
  });

  it('says nothing on the console about a missing file', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const h = harness({ failing: new Set([sfxUrl('limelight', 'rest_over')]) });
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    player.play('rest_over');
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    expect(logs).not.toHaveBeenCalled();
  });

  it('stays silent after a skin change until the next unlock', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    h.setSkin('board');
    /*
     * No re-unlock has happened, so the only buffers held are limelight's. docs/sfx.md promises
     * that sounds under limelight never play under board, and the only way to keep that promise
     * here is silence: playing the held buffer would play the wrong skin's sound.
     */
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(0);
  });

  it('plays the new skin set once the skin change has been unlocked', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    h.setSkin('board');
    await player.unlock();

    expect(h.fetched).toHaveLength(8);
    expect(h.fetched.slice(4)).toEqual(SFX_NAMES.map((name) => sfxUrl('board', name)));
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(1);
    // The stand-in duration carries the skin, so this is board's buffer and not limelight's.
    expect(h.context.sources[0]?.buffer?.duration).toBe(SKIN_BYTES.board / 1000); // [s]
  });

  it('decodes the skin that is current when the change beats the first decode', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    const first = player.unlock();
    // One microtask is enough for that unlock to clear resume() and start fetching limelight; the
    // assertion states that precondition rather than trusting the tick count to stay put.
    await Promise.resolve();
    expect(h.fetched).toEqual([sfxUrl('limelight', 'session_done')]);

    h.setSkin('board');
    const second = player.unlock();
    await Promise.all([first, second]);

    player.play('rest_over');
    expect(h.context.sources).toHaveLength(1);
    expect(h.context.sources[0]?.buffer?.duration).toBe(SKIN_BYTES.board / 1000); // [s]
  });

  it('stays silent while the context is interrupted', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    // WebKit parks the context here for an incoming call or a Siri invocation. A source scheduled
    // on an interrupted context is a node that never sounds, so the gate is state === 'running'.
    h.context.state = 'interrupted';
    player.play('rest_over');
    expect(h.context.sources).toHaveLength(0);
  });

  it('plays nothing after dispose', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    player.dispose();
    player.play('pr_stamp');
    expect(h.context.sources).toHaveLength(0);
  });

  /*
   * P8 close-out defect: P4's releaseAudio() (src/ui/audio/chime.ts) now suspends the shared
   * context rather than closing it while ui.sounds is on, so a moment fired after a session
   * ends lands on a context that is alive but not running. resume() must be called from inside
   * this call (the session-complete tap is a user gesture already on the stack; every browser
   * refuses resume() called later, from a promise continuation with no gesture on it), and the
   * scheduled playback follows once the browser grants it.
   */
  describe('play() against a suspended context', () => {
    it('resumes the context and starts the source once resume settles', async () => {
      const h = harness();
      const player = createSfxPlayer(h.deps);
      await player.unlock(); // unlock's own resume(), against the initial suspended state
      h.context.state = 'suspended'; // what releaseAudio({ sounds: true }) leaves behind
      const resumeCallsBeforePlay = h.context.resumeCalls;

      player.play('session_done');

      // resume() is called synchronously, inside this call - the same call chain a gesture
      // handler (TrainView's finish tap) started - never deferred to a later microtask.
      expect(h.context.resumeCalls).toBe(resumeCallsBeforePlay + 1);
      await vi.waitFor(() => {
        expect(h.context.sources).toHaveLength(1);
      });
      expect(h.context.state).toBe('running');
      expect(h.context.sources[0]?.started).toBe(1);
      expect(h.context.sources[0]?.buffer).not.toBeNull();
    });

    it('keeps the decodedFor identity across the suspend/resume cycle, so nothing is re-decoded', async () => {
      const h = harness();
      const player = createSfxPlayer(h.deps);
      await player.unlock();
      expect(h.context.decoded).toBe(4);
      h.context.state = 'suspended';

      player.play('pr_stamp');
      await vi.waitFor(() => {
        expect(h.context.sources).toHaveLength(1);
      });

      expect(h.context.decoded).toBe(4); // same context object, same decoded buffers - no re-decode
    });

    it('skips silently, never logging, when the browser refuses to resume', async () => {
      const h = harness();
      const player = createSfxPlayer(h.deps);
      await player.unlock();
      h.context.state = 'suspended';
      h.context.resume = () => Promise.reject(new Error('resume requires a user gesture'));
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      player.play('session_done');
      // Flush the rejected promise's microtasks without asserting a positive outcome, since the
      // point under test is that NOTHING happens.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(h.context.sources).toHaveLength(0);
      expect(errors).not.toHaveBeenCalled();
      expect(warnings).not.toHaveBeenCalled();
      expect(logs).not.toHaveBeenCalled();
    });
  });
});

describe('playSfx', () => {
  it('is silent with no Web Audio implementation, which is every test environment', () => {
    expect(() => {
      playSfx('rest_over');
    }).not.toThrow();
  });
});

describe('useFirstGestureUnlock', () => {
  it('unlocks on the first gesture and then stops listening', () => {
    renderHook(() => {
      useFirstGestureUnlock();
    });
    expect(unlockAudio).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pointerdown'));
    expect(unlockAudio).toHaveBeenCalledTimes(1);

    // The second pointerdown proves the pointer listener went; the keydown proves the other one
    // went with it, which a per-listener { once: true } would not have done.
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });

  it('unlocks on a keyboard gesture too', () => {
    renderHook(() => {
      useFirstGestureUnlock();
    });
    window.dispatchEvent(new Event('keydown'));
    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });

  it('leaves no listener behind on unmount', () => {
    const { unmount } = renderHook(() => {
      useFirstGestureUnlock();
    });
    unmount();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(unlockAudio).not.toHaveBeenCalled();
  });
});

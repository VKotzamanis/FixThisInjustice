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
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination: unknown = {};
  decoded = 0;
  sources: FakeSource[] = [];
  resume(): Promise<void> {
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
      return Promise.resolve(new ArrayBuffer(1200));
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

  it('plays nothing after dispose', async () => {
    const h = harness();
    const player = createSfxPlayer(h.deps);
    await player.unlock();
    player.dispose();
    player.play('pr_stamp');
    expect(h.context.sources).toHaveLength(0);
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

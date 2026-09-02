import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Web Audio does not exist in jsdom, so the constructor is stubbed here. The module holds ONE
 * context in module scope (master plan section 6.5: the context is unlocked by the "start
 * session" tap and reused by P8's sound-effects player), so each test loads the module through
 * a reset registry rather than sharing one context across tests.
 */

interface RampPoint {
  gain: number; // [-] linear amplitude
  atS: number; // [s] on the context clock
}

class FakeAudioParam {
  value = 0;
  readonly ramps: RampPoint[] = [];
  setValueAtTime(gain: number, atS: number): this {
    this.ramps.push({ gain, atS });
    return this;
  }
  exponentialRampToValueAtTime(gain: number, atS: number): this {
    this.ramps.push({ gain, atS });
    return this;
  }
}

class FakeOscillator {
  type = '';
  readonly frequency = new FakeAudioParam();
  connectedTo: unknown = null;
  startedAtS: number | null = null; // [s]
  stoppedAtS: number | null = null; // [s]
  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }
  start(atS: number): void {
    this.startedAtS = atS;
  }
  stop(atS: number): void {
    this.stoppedAtS = atS;
  }
}

class FakeGainNode {
  readonly gain = new FakeAudioParam();
  connectedTo: unknown = null;
  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  /** Arbitrary non-zero context clock reading, so an "at t0 + d" assertion cannot pass on zero. */
  currentTime = 12.5; // [s]
  readonly destination = { name: 'destination' };
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGainNode[] = [];
  closeCalls = 0;
  resumeCalls = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }
}

/** A context whose resume() rejects, as Chrome does outside a user gesture. */
class RefusingAudioContext extends FakeAudioContext {
  override resume(): Promise<void> {
    this.resumeCalls += 1;
    return Promise.reject(new Error('resume requires a user gesture'));
  }
}

async function loadChime(): Promise<typeof import('./chime')> {
  vi.resetModules();
  return await import('./chime');
}

function onlyContext(): FakeAudioContext {
  const context = FakeAudioContext.instances[0];
  if (context === undefined) throw new Error('no AudioContext was constructed');
  return context;
}

beforeEach(() => {
  FakeAudioContext.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('chime with a Web Audio implementation present', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('plays nothing before the audio is unlocked', async () => {
    const { chime, getAudioContext } = await loadChime();
    expect(chime()).toBe(false);
    expect(FakeAudioContext.instances).toHaveLength(0); // chime never constructs a context

    // A context created outside a gesture starts suspended, and a suspended context is silent.
    expect(getAudioContext()).not.toBeNull();
    expect(onlyContext().state).toBe('suspended');
    expect(chime()).toBe(false);
    expect(onlyContext().oscillators).toHaveLength(0);
  });

  it('plays a sine with a gain envelope once the context is unlocked', async () => {
    const { chime, unlockAudio } = await loadChime();
    expect(await unlockAudio()).toBe(true);
    expect(onlyContext().state).toBe('running');

    expect(chime()).toBe(true);
    const context = onlyContext();
    expect(context.oscillators).toHaveLength(1);
    const oscillator = context.oscillators[0];
    const gain = context.gains[0];
    if (oscillator === undefined || gain === undefined) throw new Error('no oscillator was scheduled');
    expect(oscillator.type).toBe('sine');
    expect(oscillator.frequency.value).toBe(880); // [Hz] default, A5
    expect(oscillator.connectedTo).toBe(gain);
    expect(gain.connectedTo).toBe(context.destination);
    expect(oscillator.startedAtS).toBe(12.5); // [s] the context clock at scheduling
    expect(oscillator.stoppedAtS).toBe(12.75); // [s] 12.5 s + the 250 ms default duration
    // Envelope: silent, up to the peak, back down. Three points, monotone in time.
    expect(gain.gain.ramps).toHaveLength(3);
    expect(gain.gain.ramps.map((r) => r.atS)).toEqual([12.5, 12.51, 12.75]); // [s]
    const peak = gain.gain.ramps[1];
    if (peak === undefined) throw new Error('no peak in the envelope');
    expect(peak.gain).toBeGreaterThan(0);
    expect(peak.gain).toBeLessThanOrEqual(1); // [-] linear amplitude stays inside full scale
  });

  it('honours an explicit frequency and duration', async () => {
    const { chime, unlockAudio } = await loadChime();
    await unlockAudio();
    expect(chime(440, 500)).toBe(true); // [Hz], [ms]
    const oscillator = onlyContext().oscillators[0];
    if (oscillator === undefined) throw new Error('no oscillator was scheduled');
    expect(oscillator.frequency.value).toBe(440); // [Hz]
    expect(oscillator.stoppedAtS).toBe(13); // [s] 12.5 s + 0.5 s
  });

  it('reuses one shared context across unlocks, chimes and getAudioContext', async () => {
    const { chime, getAudioContext, unlockAudio } = await loadChime();
    const first = getAudioContext();
    await unlockAudio();
    await unlockAudio();
    chime();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(getAudioContext()).toBe(first);
    expect(onlyContext().resumeCalls).toBe(1); // a running context is not resumed again
  });

  it('closes the context on release and builds a fresh one afterwards', async () => {
    const { chime, getAudioContext, releaseAudio, unlockAudio } = await loadChime();
    await unlockAudio();
    releaseAudio();
    expect(onlyContext().closeCalls).toBe(1);
    expect(chime()).toBe(false); // the released context cannot be chimed through
    expect(getAudioContext()).not.toBe(FakeAudioContext.instances[0]);
    expect(FakeAudioContext.instances).toHaveLength(2);
  });

  it('releases nothing when no context was ever built', async () => {
    const { releaseAudio } = await loadChime();
    expect(() => {
      releaseAudio();
    }).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});

describe('chime on the webkit-prefixed constructor', () => {
  it('falls back to webkitAudioContext when AudioContext is absent', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    const { chime, getAudioContext, unlockAudio } = await loadChime();
    expect(getAudioContext()).not.toBeNull();
    expect(await unlockAudio()).toBe(true);
    expect(chime()).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});

describe('chime with no Web Audio implementation', () => {
  it('reports a failed unlock instead of throwing', async () => {
    expect(typeof AudioContext).toBe('undefined'); // jsdom has no Web Audio
    const { chime, getAudioContext, releaseAudio, unlockAudio } = await loadChime();
    expect(getAudioContext()).toBeNull();
    await expect(unlockAudio()).resolves.toBe(false);
    expect(chime()).toBe(false);
    expect(() => {
      releaseAudio();
    }).not.toThrow();
  });
});

describe('unlockAudio when the browser refuses to resume', () => {
  it('reports false and stays silent', async () => {
    vi.stubGlobal('AudioContext', RefusingAudioContext);
    const { chime, unlockAudio } = await loadChime();
    await expect(unlockAudio()).resolves.toBe(false);
    expect(onlyContext().resumeCalls).toBe(1);
    expect(chime()).toBe(false);
  });
});

describe('vibrate', () => {
  it('reports false where the API is absent, as it is on every iOS version', async () => {
    expect('vibrate' in navigator).toBe(false);
    const { vibrate } = await loadChime();
    expect(vibrate([180, 80, 180])).toBe(false); // [ms] on/off/on
  });

  it('passes the pattern through where the API exists', async () => {
    const spy = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: spy, configurable: true });
    const { vibrate } = await loadChime();
    expect(vibrate([180, 80, 180])).toBe(true); // [ms] on/off/on
    expect(spy).toHaveBeenCalledWith([180, 80, 180]);
  });
});

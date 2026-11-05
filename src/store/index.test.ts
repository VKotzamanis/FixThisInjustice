import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { defaultState, selectState, useAppStore } from './index';
import { STORAGE_KEY, exportJson } from './persistence';
import { useActiveProfile, useHydrated, useLoadError, useSaveError } from './selectors';
import { bootMemoryStore } from './testBackend';
import { installFakeStorage } from './testStorage';
import type { AppState, Profile } from '../domain/types';

function profile(id: string): Profile {
  return {
    id,
    displayName: 'Test',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: 1_756_000_000_000,
    body: {
      sex: 'female',
      birthYear: 1995,
      heightCm: 170, // [cm]
      baselineMassKg: 70, // [kg]
      baselineAt: '2026-09-01',
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'novice',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5, // [kg] total on the bar
      dumbbellPairKg: 5, // [kg] per pair
      stackKg: 5, // [kg] per pin
    },
    gymCommute: { walks: false, minutesEachWay: null },
    homeEquipment: [],
    bodyweightEquipment: [],
    goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
    supplements: { creatine: false },
    hydration: { dailyTargetML: 2200, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: null, flagged: false },
  };
}

beforeEach(() => {
  useAppStore.setState({
    ...defaultState(),
    status: {
      lastSaveError: null,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: false,
      lastActionError: null,
    },
  });
});

describe('the persisted surface', () => {
  it('carries exactly the fields of a default document, and no store-only field', () => {
    const picked = selectState(useAppStore.getState());
    expect(Object.keys(picked).sort()).toEqual(Object.keys(defaultState()).sort());
    expect(picked).toEqual(defaultState());
    expect(Object.keys(picked)).not.toContain('status');
  });
});

describe('import and export', () => {
  it('exports the current state and imports it back through the store', () => {
    installFakeStorage();
    const next = { ...defaultState(), activeProfileId: 'p', profiles: { p: profile('p') } };
    useAppStore.getState().replaceState(next);

    const text = useAppStore.getState().exportJson();
    expect(text).toBe(exportJson(next));

    useAppStore.getState().replaceState(defaultState());
    expect(useAppStore.getState().importJson(text)).toEqual({ ok: true, quarantine: [] });
    expect(useAppStore.getState().activeProfileId).toBe('p');
  });

  it('refuses an invalid import and leaves the state untouched', () => {
    installFakeStorage();
    useAppStore.getState().replaceState({
      ...defaultState(),
      activeProfileId: 'p',
      profiles: { p: profile('p') },
    });
    const before = selectState(useAppStore.getState());

    const result = useAppStore.getState().importJson('{"week":999}');

    expect(result).toEqual({ ok: false, error: 'missing or non-integer schemaVersion' });
    expect(selectState(useAppStore.getState())).toEqual(before);
    // Reference identity, not just deep equality: nothing was rebuilt either.
    expect(useAppStore.getState().profiles).toBe(before.profiles);
  });

  it('routes an accepted import through replaceState, so there is one write path', () => {
    installFakeStorage();
    // Detached with bind(): the recorder has to call the original action, not
    // the stand-in about to be installed over it.
    const real = useAppStore.getState().replaceState.bind(null);
    const seen: AppState[] = [];
    try {
      useAppStore.setState({
        replaceState: (next: AppState) => {
          seen.push(next);
          real(next);
        },
      });
      const text = exportJson({ ...defaultState(), activeProfileId: null });
      expect(useAppStore.getState().importJson(text)).toEqual({ ok: true, quarantine: [] });
      expect(seen).toHaveLength(1);
    } finally {
      useAppStore.setState({ replaceState: real });
    }
  });

  it('clears a load error when replaceState installs a document', async () => {
    await bootMemoryStore({ legacy: '{"week":999}' });
    expect(useAppStore.getState().status.lastLoadError).not.toBeNull();

    useAppStore.getState().replaceState(defaultState());
    expect(useAppStore.getState().status.lastLoadError).toBeNull();
  });
});

describe('setUi', () => {
  it('patches the named preferences and leaves the rest of the document alone', () => {
    const before = selectState(useAppStore.getState());
    useAppStore.getState().setUi({ lastView: 'train', bootSeen: true });
    const ui = useAppStore.getState().ui;
    expect(ui.lastView).toBe('train');
    expect(ui.bootSeen).toBe(true);
    // Untouched preferences survive the shallow patch.
    expect(ui.scanlines).toBe(before.ui.scanlines);
    expect(ui.density).toBe(before.ui.density);
    // Nothing outside ui moved.
    expect(useAppStore.getState().profiles).toBe(before.profiles);
  });
});

describe('wipeAll', () => {
  it('clears storage and resets to the default document', () => {
    const data = installFakeStorage({ [STORAGE_KEY]: 'anything', 'other.owner': 'keep me' });
    useAppStore.getState().replaceState({
      ...defaultState(),
      activeProfileId: 'p',
      profiles: { p: profile('p') },
    });
    useAppStore.getState().wipeAll();
    expect(data.has(STORAGE_KEY)).toBe(false);
    // Only fti.v3 is this module's to clear; the asset store is cleared by the
    // caller in P7.
    expect(data.get('other.owner')).toBe('keep me');
    expect(selectState(useAppStore.getState())).toEqual(defaultState());
  });

});

describe('selectors', () => {
  it('returns null when no profile is active', () => {
    const { result } = renderHook(() => useActiveProfile());
    expect(result.current).toBeNull();
  });

  it('returns the active profile object itself, so the snapshot is stable', () => {
    const p = profile('p');
    useAppStore.getState().replaceState({
      ...defaultState(),
      activeProfileId: 'p',
      profiles: { p },
    });
    const { result, rerender } = renderHook(() => useActiveProfile());
    expect(result.current).toBe(p);
    rerender();
    expect(result.current).toBe(p);
  });

  it('returns null when activeProfileId points at a missing profile', () => {
    useAppStore.getState().replaceState({ ...defaultState(), activeProfileId: 'ghost' });
    const { result } = renderHook(() => useActiveProfile());
    expect(result.current).toBeNull();
  });

  it('exposes hydration and error status', () => {
    useAppStore.setState({
      status: {
        lastSaveError: { reason: 'quota', error: 'full' },
        lastLoadError: 'bad document',
        lastLoadRaw: '{"week":999}',
        hydrated: true,
        lastActionError: null,
      },
    });
    expect(renderHook(() => useHydrated()).result.current).toBe(true);
    expect(renderHook(() => useSaveError()).result.current).toEqual({
      reason: 'quota',
      error: 'full',
    });
    expect(renderHook(() => useLoadError()).result.current).toBe('bad document');
  });
});

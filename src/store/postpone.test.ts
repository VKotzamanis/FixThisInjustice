import { beforeEach, describe, expect, it } from 'vitest';
import { FORMAT } from '../content/copy';
import { refusalLine } from '../ui/format/refusal';
import { defaultState, useAppStore } from './index';
import { isDomainMinted } from './scheduleActions';
import { installFakeStorage } from './testStorage';
import { MONDAY, NOW_MS, PROFILE_ID, seedState } from '../test/scheduleFixtures';

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    ...seedState({ labels: ['Push', 'Legs', 'Pull'], weekdays: [1, 3, 5] }),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
});

describe('postponeSession through the store (R2)', () => {
  it('records the postponed day and keeps the cursor', () => {
    useAppStore.getState().postponeSession(PROFILE_ID, MONDAY);
    const s = useAppStore.getState();
    expect(s.cursors[PROFILE_ID]?.postponed).toEqual([MONDAY]);
    expect(s.cursors[PROFILE_ID]?.nextSessionIndex).toBe(0);
    expect(s.status.lastActionError).toBeNull();
  });

  it('refuses a started day as a user-facing refusal and writes nothing', () => {
    useAppStore.getState().startSession(PROFILE_ID, MONDAY, NOW_MS);
    const before = useAppStore.getState().cursors;
    useAppStore.getState().postponeSession(PROFILE_ID, MONDAY);
    const s = useAppStore.getState();
    expect(s.status.lastActionError).toBe(`postponeSession: session already started on ${MONDAY}`);
    expect(s.cursors).toBe(before);
    expect(refusalLine(s.status.lastActionError ?? '')).toBe(
      FORMAT.withSlots('status.refusalAlreadyStarted', { date: MONDAY }),
    );
  });

  it('treats the postpone prefix as domain-minted', () => {
    expect(isDomainMinted(new Error(`postponeSession: session already started on ${MONDAY}`))).toBe(true);
  });
});

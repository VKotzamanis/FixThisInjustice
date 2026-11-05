import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import type { BodyMassEntry } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ToastProvider, ToastQueue } from '../components/ToastQueue';
import { BODY_MASS_ROWS_SHOWN, BodyMassLog } from './BodyMassLog';
import { MeasurementsPanel } from './MeasurementsPanel';

const P = 'profile-1';
const TODAY = '2026-03-03';
const NOW = Date.UTC(2026, 2, 3, 6, 0); // [ms] epoch UTC, 08:00 in Athens
const Q = `${copy('quantity.bodyMass')} (kg)`;

function entry(id: string, date: string, massKg: number): BodyMassEntry {
  return { id, profileId: P, date, massKg, enteredUnit: 'metric', bodyFatPct: null, loggedAt: NOW - 1 }; // [kg]
}

function seed(bodyMass: BodyMassEntry[] = []): void {
  installFakeStorage();
  const profile = makeProfile();
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: profile },
    bodyMass: { [P]: bodyMass },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

function withToasts(ui: ReactElement): void {
  render(
    <ToastProvider>
      {ui}
      <ToastQueue />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('MeasurementsPanel (spec R9, audit G02)', () => {
  it('logs a morning weigh-in on any day, then Undo takes it back', () => {
    seed();
    withToasts(<MeasurementsPanel profile={makeProfile()} today={TODAY} />);
    fireEvent.change(screen.getByLabelText(Q), { target: { value: '94,6' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyMass') }));
    expect(useAppStore.getState().bodyMass[P]).toMatchObject([{ date: TODAY, massKg: 94.6, role: 'morning' }]);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().bodyMass[P]).toEqual([]);
  });
});

describe('BodyMassLog (spec R9, audit G03)', () => {
  it('corrects a typo in place: same id, same date, the stored loggedAt', () => {
    seed([entry('a', '2026-03-01', 94), entry('typo', '2026-03-02', 9.4)]);
    withToasts(<BodyMassLog profile={makeProfile()} />);
    const row = screen.getAllByTestId('mass-entry').find((r) => r.textContent?.includes('2026-03-02'));
    if (row === undefined) throw new Error('no row for the typo');
    fireEvent.click(within(row).getByRole('button', { name: copy('button.editEntry') }));
    fireEvent.change(within(row).getByLabelText(Q), { target: { value: '94.2' } });
    fireEvent.click(within(row).getByRole('button', { name: copy('button.saveEntry') }));
    expect(useAppStore.getState().bodyMass[P]?.find((e) => e.id === 'typo')).toMatchObject({
      massKg: 94.2, // [kg]
      date: '2026-03-02',
      loggedAt: NOW - 1,
    });
  });

  it('deletes with a 6 s Undo that restores the identical record', () => {
    const typo = entry('typo', '2026-03-02', 9.4);
    seed([entry('a', '2026-03-01', 94), typo]);
    withToasts(<BodyMassLog profile={makeProfile()} />);
    const row = screen.getAllByTestId('mass-entry').find((r) => r.textContent?.includes('2026-03-02'));
    if (row === undefined) throw new Error('no row for the typo');
    fireEvent.click(within(row).getByRole('button', { name: copy('button.deleteEntry') }));
    expect(useAppStore.getState().bodyMass[P]?.map((e) => e.id)).toEqual(['a']);
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().bodyMass[P]?.find((e) => e.id === 'typo')).toEqual(typo);
  });

  it('shows the newest entries first and the rest behind Show All', () => {
    const many = Array.from({ length: BODY_MASS_ROWS_SHOWN + 1 }, (_, i) =>
      entry(`m${String(i)}`, `2026-02-${String(i + 1).padStart(2, '0')}`, 90 + i / 10),
    );
    seed(many);
    withToasts(<BodyMassLog profile={makeProfile()} />);
    expect(screen.getAllByTestId('mass-entry')).toHaveLength(BODY_MASS_ROWS_SHOWN);
    expect(screen.getAllByTestId('mass-entry')[0]?.textContent).toContain('2026-02-15');
    fireEvent.click(screen.getByRole('button', { name: copy('button.showAllEntries') }));
    expect(screen.getAllByTestId('mass-entry')).toHaveLength(BODY_MASS_ROWS_SHOWN + 1);
  });
});

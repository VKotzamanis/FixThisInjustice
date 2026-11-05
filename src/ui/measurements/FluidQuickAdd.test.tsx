import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copy, copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import type { Profile } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ToastProvider, ToastQueue } from '../components/ToastQueue';
import { FluidQuickAdd } from './FluidQuickAdd';

const P = 'profile-1';
const TODAY = '2026-03-03';
const NOW = Date.UTC(2026, 2, 3, 8, 0); // [ms] epoch UTC, 10:00 in Athens: no cue is showing

function mount(profile: Profile): void {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: profile },
    hydration: { [P]: [] },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
  render(
    <ToastProvider>
      <FluidQuickAdd profile={profile} today={TODAY} />
      <ToastQueue />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('FluidQuickAdd (spec R9, audit G07)', () => {
  it('logs one cup at 10:00, with no cue showing, and shows progress against the stored target', () => {
    mount(makeProfile());
    fireEvent.click(screen.getByRole('button', { name: FORMAT.logVolume('250 mL', SKIN_COPY.limelight) }));
    expect(useAppStore.getState().hydration[P]?.[0]).toMatchObject({ date: TODAY, volumeML: 250 }); // [mL]
    expect(screen.getByTestId('fluid-progress')).toHaveTextContent(FORMAT.valueOfTarget('250 mL', '3000 mL'));
  });

  it('logs a custom volume typed in fl oz as whole mL, and Undo takes it back', () => {
    mount(makeProfile({ units: 'imperial' }));
    fireEvent.change(screen.getByLabelText(`${copy('quantity.drinkVolume')} (fl oz)`), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logDrink') }));
    expect(useAppStore.getState().hydration[P]?.[0]?.volumeML).toBe(355); // [mL] 12 x 29.5735
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.undo') }));
    expect(useAppStore.getState().hydration[P]?.[0]?.volumeML).toBe(0);
  });

  it('refuses an empty or non-positive custom volume in words', () => {
    mount(makeProfile());
    fireEvent.click(screen.getByRole('button', { name: copy('button.logDrink') }));
    // The ToastQueue's live region is an alert too, so match the form's own message.
    expect(screen.getAllByRole('alert').map((e) => e.textContent)).toContain(copy('error.valueRequired'));
    fireEvent.change(screen.getByLabelText(`${copy('quantity.drinkVolume')} (mL)`), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logDrink') }));
    // The ToastQueue's live region is an alert too, so match the form's own message.
    expect(screen.getAllByRole('alert').map((e) => e.textContent)).toContain(copy('error.positive'));
    expect(useAppStore.getState().hydration[P]).toEqual([]);
  });
});

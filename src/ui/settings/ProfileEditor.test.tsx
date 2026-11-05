import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { NUTRITION_DOMAIN } from '../../domain/nutrition';
import { defaultState } from '../../domain/schema';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ProfileEditor } from './ProfileEditor';

const P = 'profile-1';
const NOW = Date.UTC(2026, 8, 7, 9, 0); // [ms] epoch UTC; 2026-09-07 in Athens

function mount(patch: Parameters<typeof makeProfile>[0] = {}): void {
  installFakeStorage();
  const profile = makeProfile(patch);
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: profile },
    bodyMass: { [P]: [] },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
  render(<ProfileEditor profile={profile} />);
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function save(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.saveProfile') }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('ProfileEditor (spec R9, audit G06)', () => {
  it('corrects a setup height typo and a birth year', () => {
    mount({ body: { ...makeProfile().body, heightCm: 108 } }); // [cm] 180 typed as 108
    fireEvent.change(field(copyFor('limelight', 'label.centimetres')), { target: { value: '80' } });
    fireEvent.change(field(copy('quantity.birthYear')), { target: { value: '1990' } });
    save();
    const stored = useAppStore.getState().profiles[P]?.body;
    expect(stored?.heightCm).toBe(180); // [cm]
    expect(stored?.birthYear).toBe(1990); // [year]
    expect(screen.getByRole('status')).toHaveTextContent(copy('status.profileSaved'));
  });

  it('keeps an untouched height exactly (no display rounding)', () => {
    mount({ body: { ...makeProfile().body, heightCm: 180.34 } }); // [cm] 5 ft 11 in
    fireEvent.change(field(copy('quantity.birthYear')), { target: { value: '1991' } });
    save();
    expect(useAppStore.getState().profiles[P]?.body.heightCm).toBe(180.34);
  });

  it('refuses what setup refuses, naming the bound, and writes nothing', () => {
    mount();
    const before = useAppStore.getState().profiles[P];
    fireEvent.change(field(copy('quantity.birthYear')), { target: { value: '2015' } }); // age 11
    fireEvent.change(field(copyFor('limelight', 'label.metres')), { target: { value: '3' } });
    save();
    const bound = { lo: 2026 - NUTRITION_DOMAIN.ageYears.hi, hi: 2026 - NUTRITION_DOMAIN.ageYears.lo };
    expect(screen.getByText(FORMAT.outOfRange(copy('quantity.birthYear'), bound.lo, bound.hi))).toBeTruthy();
    expect(screen.getByText(FORMAT.outOfRange(copy('quantity.height'), 120, 230, 'cm'))).toBeTruthy();
    expect(useAppStore.getState().profiles[P]).toBe(before);
  });

  it('requires body fat once the sex is not disclosed (decision A1)', () => {
    mount();
    fireEvent.change(field(copyFor('limelight', 'label.sex')), { target: { value: 'nd' } });
    save();
    expect(screen.getByText(copy('error.valueRequired'))).toBeTruthy();
    // Two fields carry "Body fat (%)": the setup value here, the re-measure below.
    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyFat')} (%)`, { selector: '#profile-bodyfat' }), {
      target: { value: '22' },
    });
    save();
    expect(useAppStore.getState().profiles[P]?.body).toMatchObject({ sex: 'nd', baselineBodyFatPct: 22 });
  });

  it('edits the target mass and date, and clears them when emptied', () => {
    mount();
    fireEvent.change(field(`${copy('quantity.targetBodyMass')} (kg)`), { target: { value: '85' } });
    fireEvent.change(field(copyFor('limelight', 'label.targetDate')), { target: { value: '2026-12-31' } });
    save();
    expect(useAppStore.getState().profiles[P]?.goal).toMatchObject({ targetMassKg: 85, targetDate: '2026-12-31' });
    fireEvent.change(field(`${copy('quantity.targetBodyMass')} (kg)`), { target: { value: '' } });
    fireEvent.change(field(copyFor('limelight', 'label.targetDate')), { target: { value: '' } });
    save();
    expect(useAppStore.getState().profiles[P]?.goal).toMatchObject({ targetMassKg: null, targetDate: null });
  });
});

describe('body-fat re-measure (audit G05, ROADMAP L10)', () => {
  it('stores a dated morning entry carrying the body fat, which targets then read', () => {
    mount();
    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyFat')} (%)`, { selector: '#bodyfat-remeasure-pct' }), {
      target: { value: '21,5' },
    });
    fireEvent.change(screen.getByLabelText(`${copy('quantity.bodyMass')} (kg)`), { target: { value: '93' } });
    fireEvent.click(screen.getByRole('button', { name: copy('button.logBodyFat') }));
    expect(useAppStore.getState().bodyMass[P]).toMatchObject([
      { date: '2026-09-07', massKg: 93, bodyFatPct: 21.5, role: 'morning' }, // [kg], [%]
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from './SettingsView';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import type { Profile } from '../../domain/types';
import type { SkinId } from '../../domain/types';

/**
 * The same fixture the targets view is tested against. Nothing here depends on the clock:
 * every assertion is about what a keystroke does or does not write to the profile.
 */
const PROFILE: Profile = {
  id: 'p1',
  displayName: 'Test subject',
  timezone: 'Europe/Athens',
  units: 'metric',
  createdAt: 1_756_684_800_000, // [ms]
  body: {
    sex: 'male',
    birthYear: 1996,
    heightCm: 180, // [cm]
    baselineMassKg: 80, // [kg]
    baselineAt: '2026-09-01',
    baselineBodyFatPct: null,
  },
  activity: 'moderate',
  experience: 'intermediate',
  equipment: 'full-gym',
  equipmentSteps: {
    barbellKg: 2.5, // [kg] total on the bar
    dumbbellPairKg: 5, // [kg] per pair
    stackKg: 5, // [kg] per pin
    hasMicroPlates: false,
    microPlateKg: 0.5, // [kg] total on the bar
  },
  goal: { kind: 'fat-loss', targetMassKg: null, targetBodyFatPct: null, targetDate: null },
  supplements: { creatine: true },
  hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
  readiness: { screenedAt: null, flagged: false },
};

/** The stored beverage target, in mL/day. The number every test below guards. */
const STORED_FLUID_ML = 3000; // [mL/day]

/**
 * The store's own action, reached through the state object as it was BEFORE any test put a
 * counter in front of it. Called through that object rather than captured off it: the method
 * is invoked, never passed around detached, so nothing here depends on how `this` is bound —
 * and going through `getState()` instead would call whichever mock is currently installed and
 * recurse when this is reinstalled in afterEach.
 */
const PRISTINE_STATE = useAppStore.getState();

const REAL_UPDATE_PROFILE = (id: string, patch: Partial<Profile>): void => {
  PRISTINE_STATE.updateProfile(id, patch);
};

/**
 * Counts the writes the view makes, and forwards each one to the real action so the tests
 * still assert against the document rather than against a stub.
 *
 * Reinstalled per test rather than left to `restoreMocks`: zustand builds each next state by
 * copying the previous one, so a spy installed on the object `getState()` returned is carried
 * forward onto every later state object, and restoring the original on the object it was
 * installed on removes nothing. The previous test's counter would still be in the store.
 */
let updateProfile: ReturnType<typeof vi.fn<typeof REAL_UPDATE_PROFILE>>;

beforeEach(() => {
  useAppStore.getState().wipeAll();
  useAppStore.getState().createProfile(PROFILE);
  updateProfile = vi.fn(REAL_UPDATE_PROFILE);
  useAppStore.setState({ updateProfile });
});

afterEach(() => {
  useAppStore.setState({ updateProfile: REAL_UPDATE_PROFILE });
});

function fluidField(): HTMLElement {
  return screen.getByLabelText('Daily beverage target (mL)');
}

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('SettingsView numeric settings', () => {
  /*
   * Commit-on-keystroke wrote every PREFIX of what the user was typing. Typing "2500" into
   * the beverage target stored 2, then 25, then 250, then 2500: four writes, three of them
   * values the user never meant, each one a debounced save and each one a target other
   * screens would have read had the user stopped typing there.
   */
  it('commits a typed setting once, on blur, and never an intermediate value', async () => {
    render(<SettingsView />);

    await userEvent.clear(fluidField());
    await userEvent.type(fluidField(), '2500');

    expect(updateProfile).not.toHaveBeenCalled();
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(STORED_FLUID_ML);

    await userEvent.tab();

    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith('p1', {
      hydration: { dailyTargetML: 2500, cupSizeML: 250, weighInOptIn: false }, // [mL]
    });
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(2500);
  });

  it('commits on Enter, and the blur that follows does not write the same value again', async () => {
    render(<SettingsView />);

    await userEvent.clear(fluidField());
    await userEvent.type(fluidField(), '2800{Enter}');
    expect(updateProfile).toHaveBeenCalledTimes(1);

    await userEvent.tab();

    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(2800);
  });

  /*
   * The refusal is a view message, so it carries the view's class. .wiz-error is scoped to
   * the setup wizard's stylesheet and is not loaded here, which made the refusal unstyled
   * text the same colour as the note above it.
   */
  it('shows an invalid draft as a view error and leaves the stored value alone', async () => {
    const { container } = render(<SettingsView />);

    await userEvent.clear(fluidField());
    // Above MAX_ML (20 000 mL/day), so ProfileSchema.shape.hydration refuses it.
    await userEvent.type(fluidField(), '99999');
    await userEvent.tab();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(STORED_FLUID_ML);

    const message = container.querySelector('.view-error');
    expect(message).toHaveTextContent('Outside the accepted range.');
    expect(container.querySelector('.wiz-error')).toBeNull();
    expect(fluidField()).toHaveAttribute('aria-invalid', 'true');
    expect(fluidField().getAttribute('aria-describedby')?.split(' ')).toContain(message?.id);
  });

  it('holds the same commit contract for the equipment step field', async () => {
    render(<SettingsView />);
    const step = screen.getByLabelText('Barbell step (kg)');

    await userEvent.clear(step);
    await userEvent.type(step, '1.25');

    expect(updateProfile).not.toHaveBeenCalled();

    await userEvent.tab();

    expect(updateProfile).toHaveBeenCalledTimes(1);
    // [kg] total on the bar; metric profile, so the display value is the stored value.
    expect(useAppStore.getState().profiles['p1']?.equipmentSteps.barbellKg).toBe(1.25);
  });
});

/**
 * The readiness row (P2 Task 9). It is a SETTINGS_ROWS entry, so it renders after every field
 * above it and reaches the store through `recordReadiness`, which is the action master plan
 * section 6.7 names for a screening that happens once a profile already exists. The wizard's
 * path is the other one and is tested in SetupWizard.test.tsx.
 */
describe('readiness row in Settings', () => {
  /** Replace the fixture with one whose screening state is the case under test. */
  function seed(readiness: Profile['readiness']): void {
    PRISTINE_STATE.wipeAll();
    PRISTINE_STATE.createProfile({ ...PROFILE, readiness });
    // `wipeAll` puts the shipped `ui` back, skin included, so the pin is reapplied here.
    pinSkin();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z')); // 2026-09-01 in Europe/Athens
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the screen when the profile has never been screened', () => {
    seed({ screenedAt: null, flagged: false });
    render(<SettingsView />);
    expect(screen.getByText(copy('status.notScreened'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy('button.startReadiness') })).toBeInTheDocument();
  });

  it('reports a clear screening and offers to redo it', () => {
    seed({ screenedAt: '2026-08-01', flagged: false });
    render(<SettingsView />);
    expect(
      screen.getByText(FORMAT.screenedOn('2026-08-01', copy('status.readinessNoFlags'))),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy('button.redoReadiness') })).toBeInTheDocument();
  });

  it('reports a flagged screening as a physician consult', () => {
    seed({ screenedAt: '2026-08-01', flagged: true });
    render(<SettingsView />);
    expect(
      screen.getByText(FORMAT.screenedOn('2026-08-01', copy('status.readinessConsult'))),
    ).toBeInTheDocument();
  });

  it('records a redo that turns a clear profile into a flagged one', () => {
    seed({ screenedAt: '2026-08-01', flagged: false });
    render(<SettingsView />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.redoReadiness') }));

    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const answer = id === 3 ? copy('label.yes') : copy('label.no');
      fireEvent.click(within(screen.getByTestId(`readiness-q${id}`)).getByLabelText(answer));
    }
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));

    expect(useAppStore.getState().profiles['p1']?.readiness).toEqual({
      screenedAt: '2026-09-01', // today in the profile's zone, Europe/Athens
      flagged: true,
    });
    expect(
      screen.getByText(FORMAT.screenedOn('2026-09-01', copy('status.readinessConsult'))),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('readiness-screen')).toBeNull();
  });
});

/**
 * The reminders row (P5 Task 8). Like the readiness row it is a SETTINGS_ROWS entry, so all
 * this file has to hold is that Settings mounts it; what the panel then decides is
 * ReminderSettingsPanel.test.tsx's subject.
 *
 * The test build carries neither VITE_REMINDER_API nor VITE_VAPID_PUBLIC_KEY, so the panel
 * renders its unconfigured state here. That is the point of asserting on the heading rather
 * than on a control: the heading is present in every one of the panel's states.
 */
describe('reminders row in Settings', () => {
  it('mounts the reminder settings panel', () => {
    render(<SettingsView />);
    expect(screen.getByRole('heading', { name: copy('hero.reminders') })).toBeInTheDocument();
  });
});

/**
 * The motivation clip row (P6 Task 6). Same shape as the two rows above: this file holds only
 * that Settings mounts it, and MotivationSettings.test.tsx owns what it then does with a file.
 */
describe('motivation clip row in Settings', () => {
  it('mounts the motivation clip section', () => {
    render(<SettingsView />);
    expect(
      screen.getByRole('heading', { name: copy('hero.motivationVideo') }),
    ).toBeInTheDocument();
  });
});

/**
 * The skin row (P8 Task 12). Same shape as the three rows above: this file holds only that
 * Settings mounts it, and SkinSettings.test.tsx owns what the picker then writes.
 */
describe('skin row in Settings', () => {
  it('mounts the skin picker', () => {
    render(<SettingsView />);
    expect(
      screen.getByRole('group', { name: copy('label.settingsSkin') }),
    ).toBeInTheDocument();
  });

  it('stands above the data section, and the wipe is still the last control', () => {
    /*
     * ORDER IS THE ARGUMENT. The data section holds the two destructive controls, and a screen
     * that puts a wipe between the profile fields and a look-and-sound preference asks the user
     * to walk past it to reach a checkbox. The data section stays last of the rows for exactly
     * the reason its own comment gives; what moves is the skin row, from below it to above it.
     *
     * Asserted on DOM order rather than on the array, because the array is an implementation
     * detail and the position on the screen is the fact.
     */
    render(<SettingsView />);
    const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent);
    const skin = headings.indexOf(copy('hero.skin'));
    const data = headings.indexOf(copy('hero.dataOnDevice'));
    expect(skin).toBeGreaterThan(-1);
    expect(data).toBeGreaterThan(-1);
    expect(skin).toBeLessThan(data);

    // Nothing the user can press comes after the wipe.
    const buttons = [...document.querySelectorAll('button')];
    const wipe = buttons.findIndex((b) => b.textContent === copy('button.wipeAll'));
    expect(wipe).toBe(buttons.length - 1);
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. This screen names no row either override table carries, so what the pair below asserts
 * is the OTHER half of the contract: a key a skin does not name renders the clinical sentence,
 * on every skin. Both sides are read by key through `copyFor`, never as a literal.
 */
describe('SettingsView under a skin', () => {
  it('reads its heading through the skin, and falls back to the default table', () => {
    pinSkin('limelight');
    const view = render(<SettingsView />);
    expect(screen.getByText(copyFor('limelight', 'hero.profile'))).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    render(<SettingsView />);
    expect(screen.getByText(copyFor('clinical', 'hero.profile'))).toBeInTheDocument();
  });
});

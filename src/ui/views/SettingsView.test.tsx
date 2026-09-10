import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from './SettingsView';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { displayLoad, toStoredLoad } from '../../domain/units';
import { groupTimeZones } from '../../domain/dates';
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
  },
  gymCommute: { walks: false, minutesEachWay: null },
  homeEquipment: [],
  bodyweightEquipment: [],
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
    // Round 3 Task 8 renamed this quantity to the owner's own word, `Plates`, in the one place
    // the name is written (src/content/copy.ts). Settings edits the same stored increment as the
    // wizard, so it takes the same name: R11 wants one name per quantity, not one per screen.
    const step = screen.getByLabelText('Plates (kg)');

    await userEvent.clear(step);
    await userEvent.type(step, '1.25');

    expect(updateProfile).not.toHaveBeenCalled();

    await userEvent.tab();

    expect(updateProfile).toHaveBeenCalledTimes(1);
    // [kg] total on the bar; metric profile, so the display value is the stored value.
    expect(useAppStore.getState().profiles['p1']?.equipmentSteps.barbellKg).toBe(1.25);
  });

  /*
   * ROUND 3 TASK 9, the half of it that is not the owner's feedback. Before this there was NO
   * post-setup route to `hydration.weighInOptIn`: it was set once in the wizard and frozen. The
   * flag is load-bearing -- src/ui/views/TrainView.tsx gates the pre- and post-session mass
   * prompts on it, and src/domain/training/hydration.ts computes Sawka 2007's "> 2 % body mass"
   * comparison only from those two entries -- so being unable to turn it back on meant being
   * unable to reach the check at all.
   */
  it('offers the weigh-in opt-in after setup, and writes it to the profile', async () => {
    render(<SettingsView />);
    const optIn = screen.getByLabelText('Weigh in');
    expect(optIn).not.toBeChecked(); // the fixture profile declined

    await userEvent.click(optIn);

    expect(useAppStore.getState().profiles['p1']?.hydration.weighInOptIn).toBe(true);
    // The rest of the sub-object survives the shallow merge.
    expect(useAppStore.getState().profiles['p1']?.hydration.dailyTargetML).toBe(3000);
    expect(useAppStore.getState().profiles['p1']?.hydration.cupSizeML).toBe(250);
  });
});

/**
 * The reminders row (P5 Task 8). It is a SETTINGS_ROWS entry, so all
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
 * them. P9 Task 12 gave the limelight table three of this screen's headings, `hero.profile`
 * among them, so the pair below now asserts the merge in both directions: the skin's own words
 * under limelight, and the clinical sentence under clinical. Every heading whose section the
 * limelight table leaves alone still falls through, which the copy suite decides by key. Both
 * sides here are read by key through `copyFor`, never as a literal.
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

/**
 * C1.04.3: the units toggle. It writes `Profile.units` and NOTHING ELSE - storage stays
 * canonical kg and mL, formatted at render, so the toggle costs nothing to be free. Dual-unit
 * storage was considered and rejected (00-CONTEXT / the brief): two sources of truth that can
 * disagree, plus round-trip drift.
 */
describe('the units toggle in Settings (C1.04.3)', () => {
  it('changes only Profile.units: a set logged in lb keeps its exact stored kg both ways', async () => {
    useAppStore.getState().updateProfile('p1', { units: 'imperial' });
    const enteredLb = 100;
    const loadKg = toStoredLoad(enteredLb, 'imperial'); // [kg] 45.359237, exact by KG_PER_LB
    useAppStore.getState().logSet(
      {
        profileId: 'p1',
        assignmentDate: '2026-09-01',
        sessionId: 'session-1',
        exerciseId: 'barbell-bench-press',
        setNumber: 1,
        isBonus: false,
        loadKg,
        enteredUnit: 'imperial',
        reps: 5,
        durationS: null,
        rpe: null,
      },
      Date.UTC(2026, 8, 1, 10, 0), // [ms] epoch, UTC
    );
    const setId = Object.keys(useAppStore.getState().sets)[0];
    expect(setId).toBeDefined();

    render(<SettingsView />);
    const unitsSelect = screen.getByLabelText(copy('label.displayUnit'));

    await userEvent.selectOptions(unitsSelect, 'metric');
    expect(useAppStore.getState().profiles['p1']?.units).toBe('metric');
    const afterMetric = useAppStore.getState().sets[setId ?? '']?.loadKg;
    expect(afterMetric).toBe(45.359237); // exact: no conversion happened, the stored kg is unchanged
    expect(displayLoad(afterMetric ?? 0, 'metric')).toBe(45.4); // [kg], 0.1 resolution

    await userEvent.selectOptions(unitsSelect, 'imperial');
    expect(useAppStore.getState().profiles['p1']?.units).toBe('imperial');
    const afterImperial = useAppStore.getState().sets[setId ?? '']?.loadKg;
    expect(afterImperial).toBe(45.359237); // still exact; switching back rewrote nothing either
    expect(displayLoad(afterImperial ?? 0, 'imperial')).toBe(100); // [lb], back to the entered value
  });
});

/**
 * C1.04.3: "those static settings" (plural) - the owner asked for the time zone reachable from
 * Settings too, beside the display unit. Same closed-choice-with-fallback shape as
 * SetupWizard.tsx's own timezone step.
 */
describe('the time zone control in Settings (C1.04.3)', () => {
  it('offers the platform zone list as a select, beside the display-unit toggle', () => {
    render(<SettingsView />);
    const control = screen.getByLabelText(copy('label.timezone'));
    expect(control.tagName.toLowerCase()).toBe('select');
    const options = [...control.querySelectorAll('option')] as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toContain('America/New_York');
    expect(control).toHaveValue(PROFILE.timezone);
  });

  it('uses the setup picker label construction for the selected zone', () => {
    render(<SettingsView />);
    /*
     * SCOPED to the time-zone control. This screen renders several selects (units, activity,
     * experience, goal) and each has a selected option, so an unscoped
     * getByRole('option', { selected: true }) matches all of them and throws.
     */
    const control = screen.getByLabelText(copy('label.timezone'));
    const option = within(control).getByRole('option', { selected: true });
    const group = groupTimeZones(Intl.supportedValuesOf('timeZone'), Date.now()).find((candidate) =>
      candidate.members.includes(PROFILE.timezone),
    );
    expect(group).toBeDefined();
    if (group === undefined) return;
    expect(option).toHaveTextContent(
      FORMAT.timeZoneOption(
        group.offsetLabel,
        PROFILE.timezone,
        FORMAT.timeZoneAlso(group.members.length - 1),
      ),
    );
  });

  it('writes Profile.timezone and nothing else', async () => {
    render(<SettingsView />);
    const control = screen.getByLabelText(copy('label.timezone'));
    await userEvent.selectOptions(control, 'America/New_York');
    expect(useAppStore.getState().profiles['p1']?.timezone).toBe('America/New_York');
    expect(useAppStore.getState().profiles['p1']?.units).toBe(PROFILE.units);
  });

  it('falls back to a validated free-text field when the platform has no zone list', async () => {
    const original = Intl.supportedValuesOf;
    // @ts-expect-error -- deliberately undoing the ES2022 API for this one test
    delete Intl.supportedValuesOf;
    try {
      render(<SettingsView />);
      const control = screen.getByLabelText(copy('label.timezone'));
      expect(control.tagName.toLowerCase()).toBe('input');

      await userEvent.clear(control);
      await userEvent.type(control, 'Not/AZone');
      expect(screen.getByText(copy('advice.timezoneInvalid'))).toBeInTheDocument();
      // Refused: updateProfile is never asked to store an IANA string TimeZoneSchema rejects.
      expect(useAppStore.getState().profiles['p1']?.timezone).toBe(PROFILE.timezone);

      await userEvent.clear(control);
      await userEvent.type(control, 'America/New_York');
      expect(screen.queryByText(copy('advice.timezoneInvalid'))).toBeNull();
      expect(useAppStore.getState().profiles['p1']?.timezone).toBe('America/New_York');
    } finally {
      Intl.supportedValuesOf = original;
    }
  });
});

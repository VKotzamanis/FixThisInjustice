import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../ui/styles/crt.css';
import { App } from './App';
import { defaultState, useAppStore } from '../store';
import { STORAGE_KEY } from '../store/persistence';
import { installFakeStorage } from '../store/testStorage';
import { downloadText } from './download';
import { FORMAT, copy } from '../content/copy';
import type { Profile } from '../domain/types';
import { MONDAY, NOW_MS, seedState } from '../test/scheduleFixtures';

/**
 * The download helper is the seam. It is the one thing in these tests that
 * touches the platform (an object URL and a synthetic click), and what matters
 * here is *which text* each banner hands it, not that jsdom can download.
 */
vi.mock('./download', () => ({ downloadText: vi.fn() }));

/** A save failure as the store records it: the reason plus the thrown message. */
const SERIALIZE_FAILURE = { reason: 'serialize' as const, error: 'BigInt' };

function seedSaveError(): void {
  useAppStore.setState({
    status: {
      lastSaveError: SERIALIZE_FAILURE,
      lastLoadError: null,
      lastLoadRaw: null,
      hydrated: true,
      lastActionError: null,
    },
  });
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

describe('SaveErrorBanner', () => {
  it('says the change could not be saved and that the stored copy is unchanged', () => {
    installFakeStorage();
    seedSaveError();

    render(<App />);

    // Not "storage is full" and not "storage is unavailable": the store was
    // never touched, so advice about the store would send the user nowhere.
    expect(screen.getByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByText(/stored copy is unchanged/i)).toBeInTheDocument();
    expect(screen.queryByText(/Storage is full/i)).toBeNull();
    expect(screen.queryByText(/Storage is unavailable/i)).toBeNull();
  });

  it('offers the last stored document, not the in-memory one, and does not throw', async () => {
    installFakeStorage({ [STORAGE_KEY]: '{"stored":"document"}' });
    seedSaveError();

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Export stored copy' }));

    // exportJson() would have produced a pretty-printed AppState. The raw
    // stored text proves this branch never went near it: a document that
    // JSON.stringify refused is exactly the document an export cannot carry.
    expect(downloadText).toHaveBeenCalledWith(
      'fixthisinjustice-recovery.json',
      '{"stored":"document"}',
    );
  });

  it('re-runs the persistence save when Retry save is used', async () => {
    const data = installFakeStorage();
    seedSaveError();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry save' }));

    expect(data.get(STORAGE_KEY)).toContain('"schemaVersion":3');
    // A write that now succeeds clears the banner, through the same
    // reportSaveResult path the debounced subscription uses.
    expect(useAppStore.getState().status.lastSaveError).toBeNull();
  });

  it('keeps the quota branch on the in-memory export', async () => {
    installFakeStorage();
    useAppStore.setState({
      status: {
        lastSaveError: { reason: 'quota', error: 'full' },
        lastLoadError: null,
        lastLoadRaw: null,
        hydrated: true,
        lastActionError: null,
      },
    });

    render(<App />);
    expect(screen.getByText(/Storage is full/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));

    // The in-memory document, pretty-printed by exportJson().
    expect(downloadText).toHaveBeenCalledWith(
      'fixthisinjustice-export.json',
      expect.stringContaining('"schemaVersion": 3'),
    );
  });
});

describe('LoadErrorBanner', () => {
  it('offers the original corrupt text after storage has moved on underneath it', async () => {
    const data = installFakeStorage({ [STORAGE_KEY]: '{"week":999}' });

    render(<App />);
    expect(screen.getByText(/did not validate/i)).toBeInTheDocument();

    // Another tab, or this app's own wipeAll(), removes the key. The snapshot
    // taken at hydrate time is now the user's only copy.
    data.delete(STORAGE_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Export stored data' }));

    expect(downloadText).toHaveBeenCalledWith('fixthisinjustice-recovery.json', '{"week":999}');
  });
});

describe('CRT presentation preferences', () => {
  it('paints neither layer when both preferences are off', () => {
    installFakeStorage();
    useAppStore.setState({ ui: { ...defaultState().ui, scanlines: false, flicker: false } });

    const { container } = render(<App />);
    expect(container.querySelector('.crt')?.className).toBe('crt');
  });

  it('paints both layers when the preferences ask for them', () => {
    installFakeStorage();
    useAppStore.setState({ ui: { ...defaultState().ui, scanlines: true, flicker: true } });

    const { container } = render(<App />);
    expect(container.querySelector('.crt')).toHaveClass('crt', 'sc', 'fl');
  });

  it('disables the flicker under prefers-reduced-motion', () => {
    // A full-viewport opacity animation is exactly what that setting exists to
    // stop, and the class this component now applies is what makes the rule
    // reachable. jsdom does not evaluate media queries, so the guarantee is
    // asserted in the injected stylesheet text rather than a computed style.
    const stylesheet = [...document.querySelectorAll('style')]
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.crt\.fl\s*\{\s*animation:\s*none/,
    );
  });
});

/**
 * The pre-participation screening gate (P2 Task 9, master plan section 10.4).
 *
 * A profile whose `readiness.screenedAt` is null has NOT been screened: it was created before
 * the screen existed, or imported by P7. Master plan section 10.4 says such a profile is shown
 * the screen on its next app open rather than being treated as clear, so the gate lives here,
 * between the wizard branch and the view shell, and clears itself as soon as the result is
 * recorded. It is gated on `hydrated` as well: before the stored document has been read there
 * is no profile to judge, and an unscreened-looking empty store would flash the screen.
 */
describe('readiness gate', () => {
  const PROFILE: Profile = {
    id: 'p1',
    displayName: 'Test subject',
    timezone: 'Europe/Athens',
    units: 'metric',
    createdAt: 1_756_684_800_000, // [ms] epoch
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
    supplements: { creatine: false },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: false }, // [mL]
    readiness: { screenedAt: null, flagged: false },
  };

  beforeEach(() => {
    // Writes stay in an in-memory map: a document left in jsdom storage would be hydrated by
    // the next test in this file.
    installFakeStorage();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z')); // 2026-09-01 in Europe/Athens
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function seed(readiness: Profile['readiness']): void {
    useAppStore.getState().createProfile({ ...PROFILE, readiness });
  }

  it('shows the screening to a profile that has never been screened', () => {
    seed({ screenedAt: null, flagged: false });
    render(<App />);
    expect(screen.getByTestId('readiness-screen')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: copy('nav.label') })).toBeNull();
  });

  it('opens the app for a profile that has been screened', () => {
    seed({ screenedAt: '2026-08-01', flagged: false });
    render(<App />);
    expect(screen.queryByTestId('readiness-screen')).toBeNull();
    expect(screen.getByRole('navigation', { name: copy('nav.label') })).toBeInTheDocument();
  });

  it('records the answers and opens the app on the same interaction', () => {
    seed({ screenedAt: null, flagged: false });
    render(<App />);
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const answer = id === 2 ? copy('label.yes') : copy('label.no');
      fireEvent.click(within(screen.getByTestId(`readiness-q${id}`)).getByLabelText(answer));
    }
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));

    expect(useAppStore.getState().profiles['p1']?.readiness).toEqual({
      screenedAt: '2026-09-01',
      flagged: true,
    });
    expect(screen.queryByTestId('readiness-screen')).toBeNull();
    expect(screen.getByRole('navigation', { name: copy('nav.label') })).toBeInTheDocument();
  });
});

/**
 * The top bar's plan position (P3 Task 7, wiring deferred to Task 6).
 *
 * The indicator itself is covered by SessionIndicator.test.tsx; what is asserted here is that
 * it is MOUNTED in the header, because a component nobody renders reports nothing.
 */
describe('top bar', () => {
  const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];

  beforeEach(() => {
    // Writes stay in an in-memory map, and the empty store makes hydrate() take its "absent"
    // branch, which keeps the seeded document in memory instead of replacing it.
    installFakeStorage();
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  });

  it('reports the cursor position in the header once a plan exists', () => {
    useAppStore.setState(seedState({ labels: LABELS, weekdays: [1, 3, 5], startedOn: MONDAY }));

    render(<App />);

    const indicator = within(screen.getByRole('banner')).getByTestId('session-indicator');
    // Session 1 of 6, from the cursor: never a calendar day (code review A11).
    expect(indicator.textContent).toBe(FORMAT.planPosition(1, LABELS.length, ''));
  });

  it('shows no position before a plan exists', () => {
    render(<App />);

    expect(screen.queryByTestId('session-indicator')).toBeNull();
  });
});

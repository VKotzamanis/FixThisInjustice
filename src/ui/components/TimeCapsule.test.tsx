// src/ui/components/TimeCapsule.test.tsx
//
// The time capsule: write, seal, wait, open once, re-read.
//
// Every instant below is a WALL CLOCK IN THE PROFILE'S ZONE (Europe/Athens), built with
// instantOf, and the suite is run under TZ=UTC and TZ=Pacific/Kiritimati. Two of the cases are
// there only to catch a zone leak: 23:30 Athens on the day before the open date is already the
// open date in Kiritimati (UTC+14), and 00:30 Athens on the open date is still the day before
// in UTC. A component that read the process zone rather than profile.timezone would open one
// of them early and refuse the other.
//
// Deviations from the P8 plan's Task 7 draft, recorded here and in the task report:
//
//  1. The draft's fixture comment says the plan runs 6 weeks from 2026-09-07 and ends
//     2026-10-18. The SHIPPED fixture (src/test/migrationFactories.ts makePlan) runs 12 weeks,
//     so the plan's last day is 2026-11-29. The expectation below is checked against GNU date
//     (2026-09-07 + 83 d), not against the helper under test.
//  2. The draft renders the form and the note inline. This version puts both behind a
//     ModalShell, as the task requires, so the note reaches the DOM only inside the reading
//     dialog and only after the capsule has been opened.
//  3. The draft has no bound on the open date and no upper bound on the note. Both are
//     asserted here: the date must be between CAPSULE_MIN_DAYS_AHEAD and CAPSULE_MAX_DAYS_AHEAD
//     days ahead, and the note may not exceed the schema's own note bound.
//  4. Assertions quote src/content/copy.ts rather than literals (copy contract), so a reworded
//     string fails here instead of shipping a view and a test that disagree.

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FORMAT, copy } from '../../content/copy';
import { addDays, instantOf } from '../../domain/dates';
import type { EpochMs, LocalDate, LocalTime, TimeCapsule as CapsuleRecord } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { FUN_PROFILE_ID, makeAppState } from '../../test/funFixtures';
import {
  CAPSULE_MAX_CHARS,
  CAPSULE_MAX_DAYS_AHEAD,
  CAPSULE_MIN_CHARS,
  CAPSULE_MIN_DAYS_AHEAD,
  TimeCapsule,
  defaultOpensOn,
} from './TimeCapsule';

/** The fixture profile's zone. The process zone is deliberately never this. */
const TZ = 'Europe/Athens';
/** The fixture cursor's start date. */
const STARTED_ON: LocalDate = '2026-09-07';
/** [weeks] The shipped fixture plan's length (src/test/migrationFactories.ts). */
const PLAN_WEEKS = 12;
/** The fixture plan's last day: 2026-09-07 + 12 x 7 - 1 = + 83 d. Checked with GNU date. */
const PLAN_END: LocalDate = '2026-11-29';

const NOTE = 'I am starting because I want to finish what I said I would finish.';

/** A wall clock in the PROFILE's zone as an instant. [ms] epoch UTC. */
function at(date: LocalDate, time: LocalTime): EpochMs {
  return instantOf(date, time, TZ);
}

/** Writes a capsule straight into the store, bypassing the form. */
function seedCapsule(patch: { opensOn: LocalDate; opened: boolean }): void {
  useAppStore.getState().setCapsule(FUN_PROFILE_ID, {
    note: NOTE,
    writtenAt: at(STARTED_ON, '09:00'), // [ms]
    opensOn: patch.opensOn,
    opened: patch.opened,
  });
}

/** The stored capsule. An absent key and a stored null are the same state: nothing written. */
function capsuleInStore(): CapsuleRecord | null {
  return useAppStore.getState().capsules[FUN_PROFILE_ID] ?? null;
}

/** Opens the write dialog from the card. */
function openWriteDialog(): void {
  fireEvent.click(screen.getByRole('button', { name: copy('button.writeCapsule') }));
}

function noteField(): HTMLElement {
  return screen.getByLabelText(copy('label.capsuleNote'));
}

function dateField(): HTMLElement {
  return screen.getByLabelText(copy('label.capsuleOpensOn'));
}

function sealButton(): HTMLElement {
  return screen.getByRole('button', { name: copy('button.sealCapsule') });
}

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState(makeAppState());
});

describe('defaultOpensOn', () => {
  it("returns the plan's last day", () => {
    expect(defaultOpensOn(STARTED_ON, PLAN_WEEKS)).toBe(PLAN_END);
  });

  it('handles a one-week plan', () => {
    expect(defaultOpensOn(STARTED_ON, 1)).toBe('2026-09-13');
  });
});

describe('TimeCapsule, writing', () => {
  it('renders nothing without an active profile', () => {
    useAppStore.setState(makeAppState({ activeProfileId: null }));
    const { container } = render(<TimeCapsule now={at(STARTED_ON, '09:00')} />);
    expect(container.firstChild).toBeNull();
  });

  it("offers the plan's last day as the default open date", () => {
    render(<TimeCapsule now={at(STARTED_ON, '09:00')} />);
    openWriteDialog();
    expect(dateField()).toHaveValue(PLAN_END);
  });

  it('moves the default forward when the plan ends sooner than the minimum', () => {
    // Two days before the plan's last day: the default would otherwise be inside the bound.
    render(<TimeCapsule now={at('2026-11-27', '09:00')} />);
    openWriteDialog();
    expect(dateField()).toHaveValue(addDays('2026-11-27', CAPSULE_MIN_DAYS_AHEAD));
  });

  it('seals the note with the chosen date and shows the sealed card', () => {
    const now = at(STARTED_ON, '09:00');
    render(<TimeCapsule now={now} />);
    openWriteDialog();
    fireEvent.change(noteField(), { target: { value: NOTE } });
    fireEvent.change(dateField(), { target: { value: '2026-10-12' } });
    fireEvent.click(sealButton());

    const capsule = capsuleInStore();
    expect(capsule?.note).toBe(NOTE);
    expect(capsule?.opensOn).toBe('2026-10-12');
    expect(capsule?.opened).toBe(false);
    expect(capsule?.writtenAt).toBe(now);

    // The sealed card states the open date and how far off it is, and nothing else.
    expect(screen.getByText(FORMAT.capsuleSealed('2026-10-12', 35))).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TimeCapsule, bounds', () => {
  it('refuses a note shorter than the minimum, with the reason', () => {
    render(<TimeCapsule now={at(STARTED_ON, '09:00')} />);
    openWriteDialog();
    fireEvent.change(noteField(), { target: { value: 'too short' } });
    expect(screen.getByText(FORMAT.capsuleNoteShort(CAPSULE_MIN_CHARS))).toBeInTheDocument();
    expect(sealButton()).toBeDisabled();
    expect(screen.getByTestId('capsule-count')).toHaveTextContent(
      FORMAT.capsuleCount('too short'.length, CAPSULE_MAX_CHARS),
    );
    fireEvent.click(sealButton());
    expect(capsuleInStore()).toBeNull();
  });

  it('refuses a note longer than the schema bound, with the reason', () => {
    render(<TimeCapsule now={at(STARTED_ON, '09:00')} />);
    openWriteDialog();
    // The attribute stops typing and pasting; the check below covers a value set another way.
    expect(noteField()).toHaveAttribute('maxlength', String(CAPSULE_MAX_CHARS));
    fireEvent.change(noteField(), { target: { value: 'a'.repeat(CAPSULE_MAX_CHARS + 1) } });
    expect(screen.getByText(FORMAT.capsuleNoteLong(CAPSULE_MAX_CHARS))).toBeInTheDocument();
    expect(sealButton()).toBeDisabled();
    fireEvent.click(sealButton());
    expect(capsuleInStore()).toBeNull();
  });

  it('refuses an open date closer than the minimum, with the range', () => {
    const today = STARTED_ON;
    const from = addDays(today, CAPSULE_MIN_DAYS_AHEAD);
    const to = addDays(today, CAPSULE_MAX_DAYS_AHEAD);
    render(<TimeCapsule now={at(today, '09:00')} />);
    openWriteDialog();
    expect(dateField()).toHaveAttribute('min', from);
    expect(dateField()).toHaveAttribute('max', to);

    fireEvent.change(noteField(), { target: { value: NOTE } });
    fireEvent.change(dateField(), { target: { value: addDays(today, 1) } });
    expect(screen.getByText(FORMAT.capsuleDateRange(from, to))).toBeInTheDocument();
    expect(sealButton()).toBeDisabled();
    fireEvent.click(sealButton());
    expect(capsuleInStore()).toBeNull();
  });

  it('refuses an open date beyond the maximum, with the range', () => {
    const today = STARTED_ON;
    const from = addDays(today, CAPSULE_MIN_DAYS_AHEAD);
    const to = addDays(today, CAPSULE_MAX_DAYS_AHEAD);
    render(<TimeCapsule now={at(today, '09:00')} />);
    openWriteDialog();
    fireEvent.change(noteField(), { target: { value: NOTE } });
    fireEvent.change(dateField(), { target: { value: addDays(today, CAPSULE_MAX_DAYS_AHEAD + 1) } });
    expect(screen.getByText(FORMAT.capsuleDateRange(from, to))).toBeInTheDocument();
    expect(sealButton()).toBeDisabled();
    expect(capsuleInStore()).toBeNull();
  });
});

describe('TimeCapsule, sealed and opened', () => {
  it('shows the open date and hides the note before the date', () => {
    seedCapsule({ opensOn: PLAN_END, opened: false });
    render(<TimeCapsule now={at('2026-10-30', '12:00')} />);
    expect(screen.getByText(FORMAT.capsuleSealed(PLAN_END, 30))).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByRole('button', { name: copy('button.openCapsule') })).toBeNull();
    expect(screen.queryByRole('button', { name: copy('button.writeCapsule') })).toBeNull();
  });

  it('stays sealed at 23:30 on the day before, in the profile zone', () => {
    // 2026-11-28 23:30 Athens is already 2026-11-29 in Pacific/Kiritimati (UTC+14).
    seedCapsule({ opensOn: PLAN_END, opened: false });
    render(<TimeCapsule now={at('2026-11-28', '23:30')} />);
    expect(screen.getByText(FORMAT.capsuleSealed(PLAN_END, 1))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy('button.openCapsule') })).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('opens at 00:30 on the open date, in the profile zone', () => {
    // 2026-11-29 00:30 Athens is still 2026-11-28 in UTC.
    seedCapsule({ opensOn: PLAN_END, opened: false });
    render(<TimeCapsule now={at(PLAN_END, '00:30')} />);
    expect(screen.getByText(copy('advice.capsuleOpenDatePassed'))).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy('button.openCapsule') }));
    expect(capsuleInStore()?.opened).toBe(true);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(NOTE)).toBeInTheDocument();
    expect(within(dialog).getByText(FORMAT.capsuleWritten(STARTED_ON))).toBeInTheDocument();
  });

  it('stays opened, and re-reads without a second open', () => {
    seedCapsule({ opensOn: PLAN_END, opened: true });
    render(<TimeCapsule now={at('2026-11-30', '12:00')} />);
    expect(screen.queryByRole('button', { name: copy('button.openCapsule') })).toBeNull();
    expect(screen.queryByRole('button', { name: copy('button.writeCapsule') })).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy('button.readCapsule') }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(NOTE)).toBeInTheDocument();
    expect(capsuleInStore()?.opened).toBe(true);
  });
});

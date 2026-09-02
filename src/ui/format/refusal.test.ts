// src/ui/format/refusal.test.ts
//
// P4 review item 4. Every message the schedule domain mints as a REFUSAL is asserted here
// against the domain module that mints it, so a reworded throw fails this suite rather than
// reaching the banner as an unrecognised string. The messages are produced by CALLING the
// domain wherever a call is cheaper than a literal; where a literal is used it is the exact
// template from the module named in the comment beside it.
import { describe, expect, it } from 'vitest';
import { FORMAT, copy } from '../../content/copy';
import { refusalLine } from './refusal';

const DATE = '2026-03-02'; // LocalDate, the day the refusal names
const OTHER = '2026-02-27'; // LocalDate, the day already open

describe('refusalLine maps a domain refusal onto copy', () => {
  it('names no domain function, whatever the prefix', () => {
    for (const fn of [
      'startSession',
      'completeSession',
      'skipSession',
      'pausePlan',
      'resumePlan',
      'assignToday',
      'closeWeeks',
    ]) {
      const line = refusalLine(`${fn}: the plan is paused on ${DATE}`);
      expect(line).not.toContain(fn);
      expect(line).not.toContain(':');
    }
  });

  // src/domain/schedule/cursor.ts assignmentFor(), gate 1.
  it('maps the paused-day refusal, keeping the date', () => {
    expect(refusalLine(`startSession: the plan is paused on ${DATE}`)).toBe(
      FORMAT.withSlots('status.refusalPaused', { date: DATE }),
    );
    expect(refusalLine(`startSession: the plan is paused on ${DATE}`)).toContain(DATE);
  });

  // src/domain/schedule/cursor.ts assignmentFor(), gate 2.
  it('maps the second-open-day refusal, keeping the day it names', () => {
    expect(refusalLine(`completeSession: a session is already in progress on ${OTHER}`)).toBe(
      FORMAT.withSlots('status.refusalSessionOpen', { date: OTHER }),
    );
  });

  // src/domain/schedule/calendar.ts gateReason(), all four branches, through assignToday.
  it('maps every assignToday gate', () => {
    expect(refusalLine(`assignToday: the plan is paused on ${DATE}`)).toBe(
      FORMAT.withSlots('status.refusalPaused', { date: DATE }),
    );
    expect(refusalLine(`assignToday: session already started on ${DATE}`)).toBe(
      FORMAT.withSlots('status.refusalAlreadyStarted', { date: DATE }),
    );
    // calendar.ts says "open" where cursor.ts says "in progress"; both name the same state and
    // the user reads one sentence for it.
    expect(refusalLine(`assignToday: a session is already open on ${OTHER}`)).toBe(
      FORMAT.withSlots('status.refusalSessionOpen', { date: OTHER }),
    );
    expect(refusalLine(`assignToday: ${DATE} is not the next session day`)).toBe(
      FORMAT.withSlots('status.refusalNotNextDay', { date: DATE }),
    );
  });

  // src/domain/schedule/calendar.ts notOffered(). The label is JSON-quoted in the throw and is
  // unquoted here: the sentence already sets it off, and a quoted label inside a rendered
  // sentence reads as part of the copy.
  it('maps a label the week no longer offers, dropping the offered list', () => {
    const raw = `assignToday: "Legs" is not among the sessions remaining on ${DATE} (Push, Pull)`;
    expect(refusalLine(raw)).toBe(
      FORMAT.withSlots('status.refusalLabelNotOffered', { label: 'Legs', date: DATE }),
    );
    // The list of what IS offered is on screen as the controls themselves, so repeating it in
    // the banner would be the same information twice.
    expect(refusalLine(raw)).not.toContain('Push, Pull');
  });

  it('falls back to one generic line for anything it does not recognise', () => {
    for (const raw of [
      'assignToday: window [4, 2] is outside the plan',
      'assignToday: no session at index 7',
      'startSession: "profile-9" is not a known profile',
      'TypeError: cannot read properties of undefined',
      '',
    ]) {
      expect(refusalLine(raw)).toBe(copy('status.refusalUnrecognised'));
    }
  });

  it('leaves no slot unfilled in any branch', () => {
    for (const raw of [
      `startSession: the plan is paused on ${DATE}`,
      `startSession: a session is already in progress on ${OTHER}`,
      `assignToday: session already started on ${DATE}`,
      `assignToday: a session is already open on ${OTHER}`,
      `assignToday: ${DATE} is not the next session day`,
      `assignToday: "Legs" is not among the sessions remaining on ${DATE} (Push)`,
      'nothing recognisable',
    ]) {
      expect(refusalLine(raw)).not.toMatch(/\{\w+\}/);
    }
  });

  it('takes a skin overlay, so the banner is not outside the skin system', () => {
    const line = refusalLine(`startSession: the plan is paused on ${DATE}`, {
      'status.refusalPaused': 'On hold since {date}.',
    });
    expect(line).toBe(`On hold since ${DATE}.`);
  });
});

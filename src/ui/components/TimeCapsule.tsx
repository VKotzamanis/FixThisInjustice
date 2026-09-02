// src/ui/components/TimeCapsule.tsx
//
// A note to the profile's future self, sealed until a civil date the user picks.
//
// The legacy capsule (legacy/console-fun.jsx TimeCapsule) hard-coded "week 24" in five places
// and unlocked on a scrub position rather than a date (code review A11). This version stores
// an explicit opensOn LocalDate, defaulting to the plan's last day, and compares it with
// todayLocal(profile.timezone) - the profile's zone, never the device's and never UTC. A
// capsule sealed in Athens opens on the Athens calendar wherever the device happens to be.
//
// Units and conventions:
//  - `now` and TimeCapsule.writtenAt are [ms] epoch UTC.
//  - opensOn, and every date rendered here, are civil dates "YYYY-MM-DD" in profile.timezone,
//    produced only by src/domain/dates.ts. Nothing here calls toISOString or Date arithmetic.
//  - The days-remaining count is [d], whole calendar days from daysBetween, never a difference
//    of wall clocks: across a DST transition the second would be off by an hour and could
//    round to the wrong day.
//
// Nothing here throws on user input. Both bounds - the note length the schema enforces and the
// window the open date must fall in - are stated as copy and gate the seal control, because a
// thrown RangeError from a keystroke would reach the error boundary and lose the draft.

import { useCallback, useId, useState } from 'react';
import type { ReactElement } from 'react';
import { ModalShell } from './ModalShell';
import { FORMAT, copy } from '../../content/copy';
import {
  addDays,
  compareLocalDate,
  daysBetween,
  isValidLocalDate,
  localDateOf,
  todayLocal,
} from '../../domain/dates';
import type { EpochMs, LocalDate } from '../../domain/types';
import { useAppStore } from '../../store';
import './timeCapsule.css';

/**
 * [characters] The shortest note that is worth sealing. Carried over from the legacy check: a
 * capsule shorter than this is a shrug rather than a letter, and the whole mechanic is that
 * the writer meets a sentence they no longer remember writing.
 */
export const CAPSULE_MIN_CHARS = 20;

/**
 * [characters] The longest note the document can hold.
 *
 * Mirrors MAX_NOTE_CHARS in src/domain/schema.ts, which is module-private there; the same
 * mirror-with-a-comment src/domain/migrations/v2.ts:130 keeps. A note over this bound would
 * pass through the store and fail Zod at the next save, so it is refused at the control.
 */
export const CAPSULE_MAX_CHARS = 5_000;

/**
 * [d] The nearest open date the form accepts, counted from today in the profile's zone.
 *
 * A week, because the shortest plan this app generates is one week long and a capsule that
 * opens tomorrow is a note rather than a capsule: nothing has happened in between for the
 * writer to have forgotten.
 */
export const CAPSULE_MIN_DAYS_AHEAD = 7;

/**
 * [d] The furthest open date the form accepts: two years.
 *
 * The bound is a promise, not a preference. Everything this app stores lives in one browser's
 * storage on one device, with no account and no server copy (master plan section 3), so a
 * capsule dated beyond the life of that storage would be a commitment the app cannot keep.
 * Two years is also longer than any plan the generator produces, so no plan's last day is ever
 * refused by it.
 */
export const CAPSULE_MAX_DAYS_AHEAD = 730;

/**
 * The last day of a plan: start + weeks x 7 - 1 days.
 *
 * Pure calendar arithmetic on the UTC line inside addDays, so no zone and no DST transition
 * reaches it. `weeks` is truncated and floored at 1 because addDays refuses a fractional day
 * count with a RangeError, and this is exported: a caller outside the validated PlanTemplate
 * must not be able to turn a bad number into a thrown error inside a render.
 */
export function defaultOpensOn(startedOn: LocalDate, weeks: number): LocalDate {
  const wholeWeeks = Number.isFinite(weeks) ? Math.max(1, Math.trunc(weeks)) : 1; // [weeks]
  return addDays(startedOn, wholeWeeks * 7 - 1); // [d]
}

/** Which bound a draft is failing, or null when it is ready to seal. */
type CapsuleRefusal = 'noteShort' | 'noteLong' | 'dateRange' | null;

/** Neither dialog is open, the writing one is, or the reading one is. */
type CapsuleDialog = 'none' | 'write' | 'read';

export function TimeCapsule({ now = Date.now() }: { now?: EpochMs }): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) => (profileId === null ? undefined : s.profiles[profileId]));
  const stored = useAppStore((s) => (profileId === null ? undefined : s.capsules[profileId]));
  const cursor = useAppStore((s) => (profileId === null ? undefined : s.cursors[profileId]));
  const planId = cursor?.planId;
  const plan = useAppStore((s) => (planId === undefined ? undefined : s.plans[planId]));

  const [note, setNote] = useState('');
  // null means "the default the plan implies"; a string is the date the user chose. Holding
  // the default in state instead would freeze the value computed on the first render, and the
  // form is mounted long before it is opened.
  const [chosenDate, setChosenDate] = useState<LocalDate | null>(null);
  const [dialog, setDialog] = useState<CapsuleDialog>('none');

  const headingId = useId();
  const dialogHeadingId = useId();
  const noteId = useId();
  const dateId = useId();
  const refusalId = useId();

  // Referentially stable, as ModalShell's contract requires: an unstable handler re-runs its
  // key and scroll-lock effect on every render.
  const closeDialog = useCallback(() => {
    setDialog('none');
  }, []);

  // An absent key and a stored null are the same state: no capsule written.
  const capsule = stored ?? null;
  if (profileId === null || profile === undefined) return null;

  const today = todayLocal(profile.timezone, now);
  const earliest = addDays(today, CAPSULE_MIN_DAYS_AHEAD);
  const latest = addDays(today, CAPSULE_MAX_DAYS_AHEAD);

  // The plan's last day, clamped into the window the seal control accepts. Without the clamp a
  // capsule written in the plan's final week would open its form on a date it then refuses.
  const planEnd =
    cursor === undefined || plan === undefined
      ? earliest
      : defaultOpensOn(cursor.startedOn, plan.weeks);
  const suggested =
    compareLocalDate(planEnd, earliest) < 0
      ? earliest
      : compareLocalDate(planEnd, latest) > 0
        ? latest
        : planEnd;
  const opensOn = chosenDate ?? suggested;

  const trimmed = note.trim();
  const dateInWindow =
    isValidLocalDate(opensOn) &&
    compareLocalDate(opensOn, earliest) >= 0 &&
    compareLocalDate(opensOn, latest) <= 0;
  const refusal: CapsuleRefusal =
    trimmed.length > CAPSULE_MAX_CHARS
      ? 'noteLong'
      : trimmed.length < CAPSULE_MIN_CHARS
        ? 'noteShort'
        : !dateInWindow
          ? 'dateRange'
          : null;
  const refusalLine =
    refusal === 'noteLong'
      ? FORMAT.capsuleNoteLong(CAPSULE_MAX_CHARS)
      : refusal === 'noteShort'
        ? FORMAT.capsuleNoteShort(CAPSULE_MIN_CHARS)
        : refusal === 'dateRange'
          ? FORMAT.capsuleDateRange(earliest, latest)
          : null;

  const seal = (): void => {
    // The control is disabled while a bound is unmet; this is the second gate, and it returns
    // rather than throwing so a draft is never lost to an error boundary.
    if (refusal !== null) return;
    // The action is read from the store at the call site rather than selected into a
    // variable, which is the pattern src/ui/views/TrainView.tsx uses: an action is stable, so
    // subscribing a component to it buys nothing, and selecting a method trips
    // @typescript-eslint/unbound-method.
    useAppStore.getState().setCapsule(profileId, {
      note: trimmed,
      writtenAt: now, // [ms] epoch UTC
      opensOn,
      opened: false,
    });
    setNote('');
    setChosenDate(null);
    setDialog('none');
  };

  const open = (): void => {
    if (capsule === null) return;
    useAppStore.getState().setCapsule(profileId, { ...capsule, opened: true });
    setDialog('read');
  };

  const heading = (
    <h3 className="capsule-h" id={headingId}>
      {copy('hero.timeCapsule')}
    </h3>
  );

  // ---- no capsule: the writing dialog ------------------------------------------------
  if (capsule === null) {
    return (
      <section className="capsule" aria-labelledby={headingId}>
        {heading}
        <p className="capsule-advice">{copy('advice.timeCapsule')}</p>
        <button
          type="button"
          className="capsule-action"
          onClick={() => {
            setDialog('write');
          }}
        >
          {copy('button.writeCapsule')}
        </button>

        {dialog === 'write' && (
          <ModalShell
            labelledBy={dialogHeadingId}
            className="capsule-panel"
            backdropClassName="capsule-panel-bg"
            testId="capsule-write-backdrop"
            onClose={closeDialog}
          >
            <h2 className="capsule-panel-h" id={dialogHeadingId}>
              {copy('hero.timeCapsule')}
            </h2>

            <label className="capsule-label" htmlFor={noteId}>
              {copy('label.capsuleNote')}
            </label>
            <textarea
              id={noteId}
              className="capsule-note-field"
              rows={6}
              maxLength={CAPSULE_MAX_CHARS}
              value={note}
              aria-describedby={refusal === null ? undefined : refusalId}
              aria-invalid={refusal === 'noteShort' || refusal === 'noteLong'}
              onChange={(e) => {
                setNote(e.currentTarget.value);
              }}
            />
            <span className="capsule-count" data-testid="capsule-count">
              {FORMAT.capsuleCount(trimmed.length, CAPSULE_MAX_CHARS)}
            </span>

            <label className="capsule-label" htmlFor={dateId}>
              {copy('label.capsuleOpensOn')}
            </label>
            <input
              id={dateId}
              className="capsule-date-field"
              type="date"
              value={opensOn}
              min={earliest}
              max={latest}
              aria-describedby={refusal === null ? undefined : refusalId}
              aria-invalid={refusal === 'dateRange'}
              onChange={(e) => {
                setChosenDate(e.currentTarget.value);
              }}
            />

            {/* One line, whichever bound is unmet. role="status" so it is announced when it
                appears rather than only when the field is next read. */}
            {refusalLine !== null && (
              <p className="capsule-refusal" id={refusalId} role="status">
                {refusalLine}
              </p>
            )}

            <div className="capsule-panel-actions">
              <button type="button" className="capsule-action" onClick={closeDialog}>
                {copy('button.closeModal')}
              </button>
              <button
                type="button"
                className="capsule-action capsule-seal"
                disabled={refusal !== null}
                onClick={seal}
              >
                {copy('button.sealCapsule')}
              </button>
            </div>
          </ModalShell>
        )}
      </section>
    );
  }

  const sealedOn = localDateOf(capsule.writtenAt, profile.timezone);

  // ---- sealed, before the open date ----------------------------------------------------
  if (!capsule.opened && compareLocalDate(today, capsule.opensOn) < 0) {
    return (
      <section className="capsule capsule-sealed" aria-labelledby={headingId}>
        {heading}
        {/* The open date and the wait, and nothing else. The note is not rendered, not hidden
            with CSS: a sealed capsule whose text sits in the DOM is not sealed. */}
        <p className="capsule-status">
          {FORMAT.capsuleSealed(capsule.opensOn, daysBetween(today, capsule.opensOn) /* [d] */)}
        </p>
      </section>
    );
  }

  // ---- on or after the open date, not yet opened ---------------------------------------
  if (!capsule.opened) {
    return (
      <section className="capsule capsule-openable" aria-labelledby={headingId}>
        {heading}
        <p className="capsule-status">{copy('advice.capsuleOpenDatePassed')}</p>
        <button type="button" className="capsule-action" onClick={open}>
          {copy('button.openCapsule')}
        </button>
      </section>
    );
  }

  // ---- opened: the reading dialog ------------------------------------------------------
  return (
    <section className="capsule capsule-opened" aria-labelledby={headingId}>
      {heading}
      <p className="capsule-status">{FORMAT.capsuleWritten(sealedOn)}</p>
      <button
        type="button"
        className="capsule-action"
        onClick={() => {
          setDialog('read');
        }}
      >
        {copy('button.readCapsule')}
      </button>

      {dialog === 'read' && (
        <ModalShell
          labelledBy={dialogHeadingId}
          className="capsule-panel"
          backdropClassName="capsule-panel-bg"
          testId="capsule-read-backdrop"
          onClose={closeDialog}
        >
          <h2 className="capsule-panel-h" id={dialogHeadingId}>
            {copy('hero.timeCapsule')}
          </h2>
          <p className="capsule-status">{FORMAT.capsuleWritten(sealedOn)}</p>
          {/* The note keeps the writer's own line breaks (white-space: pre-wrap in the sheet)
              rather than being re-flowed into one paragraph. */}
          <p className="capsule-note">{capsule.note}</p>
          <div className="capsule-panel-actions">
            <button type="button" className="capsule-action" onClick={closeDialog}>
              {copy('button.closeModal')}
            </button>
          </div>
        </ModalShell>
      )}
    </section>
  );
}

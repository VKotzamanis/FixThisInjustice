// src/ui/setup/steps/TimezoneStep.tsx
//
// Step 2: the IANA zone, picked from the platform's list grouped by year-round behaviour and
// sorted by offset (round 2, r2.09), or typed where the platform has no list.
import { useMemo, type JSX } from 'react';
import { FORMAT } from '../../../content/copy';
import { useCopy, useCopyOverrides } from '../../../content/useCopy';
import {
  groupTimeZones,
  isValidTimeZone,
  matchedZoneCities,
  matchedZoneMembers,
  promoteSelectedZone,
  zoneGroupMatches,
} from '../../../domain/dates';
import { errorOf } from '../model/fields';
import { STEP_TITLE_KEY, StepHeading, type ValidatedStepProps } from './shared';

/**
 * How many matched member zones a row names beside its own (r2.09). A search for "st" matches
 * thirty of western Europe's thirty-three zones; two is enough to say "your city is in this row".
 */
const MATCHED_ZONES_SHOWN = 2;

export type TimeZoneGroups = ReturnType<typeof groupTimeZones>;

/**
 * The platform's zone list and its grouping, computed ONCE per wizard mount (the shell calls
 * this), not per visit to the step.
 *
 * Intl.supportedValuesOf is ES2022 and absent or throwing on older or locked-down engines; both
 * are "no list", and the field becomes a plain text entry checked by isValidTimeZone.
 *
 * The 418 zones reduce to their distinct year-round behaviours, sorted by offset (src/domain/
 * dates.ts carries the measurement that refuses one row per offset). The zone held at mount is
 * appended when the platform does not list it, so a zone restored from another build still has a
 * row of its own. `timezone` is deliberately read only at mount: re-grouping on every selection
 * would run 5016 offset lookups per keystroke; `promoteSelectedZone` names the row cheaply.
 */
export function useTimeZoneCatalogue(timezone: string): { hasList: boolean; groups: TimeZoneGroups } {
  const options = useMemo((): readonly string[] => {
    if (typeof Intl.supportedValuesOf !== 'function') return [];
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);
  const groups = useMemo(() => {
    if (options.length === 0) return [];
    const known = isValidTimeZone(timezone) && !options.includes(timezone);
    const zones = known ? [...options, timezone] : options;
    return groupTimeZones(zones, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);
  return { hasList: options.length > 0, groups };
}

interface TimezoneStepProps extends ValidatedStepProps {
  catalogue: { hasList: boolean; groups: TimeZoneGroups };
  /** The search box: a view of the list, not an answer, so the shell keeps it outside the draft. */
  zoneQuery: string;
  setZoneQuery: (q: string) => void;
}

export function TimezoneStep(props: TimezoneStepProps): JSX.Element {
  const { answers, patch, headingRef, validation, catalogue, zoneQuery, setZoneQuery } = props;
  const t = useCopy();
  const overrides = useCopyOverrides();
  const timezoneError = errorOf(validation, 'timezone');

  /**
   * The rows as drawn: the chosen zone naming its own row, the search applied, and the chosen
   * row always present. Search reads all 418 zones while the list shows the groups, so a search
   * for a member the row is not named after still finds it, and the row says so.
   */
  const shownTimeZoneRows = useMemo(() => {
    const promoted = promoteSelectedZone(catalogue.groups, answers.timezone);
    const query = zoneQuery.trim();
    return promoted
      .filter((group) => group.representative === answers.timezone || zoneGroupMatches(group, query))
      .map((group) => {
        // Members first, so an existing zone-id match keeps its position before city matches.
        const matched = [...matchedZoneMembers(group, query), ...matchedZoneCities(group, query)];
        const also =
          matched.length > 0
            ? matched.slice(0, MATCHED_ZONES_SHOWN).join(', ')
            : group.members.length > 1
              ? FORMAT.timeZoneAlso(group.members.length - 1, overrides)
              : '';
        return {
          zone: group.representative,
          label: FORMAT.timeZoneOption(group.offsetLabel, group.representative, also),
        };
      });
  }, [catalogue.groups, answers.timezone, zoneQuery, overrides]);

  return (
    <fieldset>
      <StepHeading title={t(STEP_TITLE_KEY.timezone)} headingRef={headingRef} />
      <p className="wiz-note">{t('advice.timezoneDetected')}</p>
      <div className="wiz-field">
        {catalogue.hasList ? (
          <>
            {/*
             * The search box sits above the list. An IANA id is case-sensitive and contains no
             * words, so no autocapitalising, autocorrect or spell-check; type="search" gets a
             * phone's clear control and search keyboard.
             */}
            <label htmlFor="f-timezone-search">{t('label.timezoneSearch')}</label>
            <input
              id="f-timezone-search"
              type="search"
              value={zoneQuery}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setZoneQuery(e.target.value);
              }}
            />
            <p className="wiz-note">{t('advice.timezoneGrouped')}</p>
            <p className="wiz-label">{t('advice.timezonePick')}</p>
            <label htmlFor="f-timezone">{t('label.timezone')}</label>
            {/*
             * A closed choice from the platform's own list (C1.06.2). The VALUE is the
             * representative's IANA id, never an offset: the offset is a property a zone has
             * today, not its identity.
             */}
            <select
              id="f-timezone"
              value={answers.timezone}
              aria-invalid={timezoneError !== null}
              aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
              onChange={(e) => {
                patch({ timezone: e.target.value });
              }}
            >
              {shownTimeZoneRows.map((row) => (
                <option key={row.zone} value={row.zone}>
                  {row.label}
                </option>
              ))}
            </select>
            {/* The chosen row is never filtered out, so one row left means the search matched nothing else. */}
            {shownTimeZoneRows.length === 1 && zoneQuery.trim() !== '' && (
              <p className="wiz-note">{t('advice.timezoneNoMatch')}</p>
            )}
          </>
        ) : (
          /* No platform list: a plain IANA entry, never autocorrected. */
          <>
            <p className="wiz-label">{t('advice.timezonePick')}</p>
            <label htmlFor="f-timezone">{t('label.timezone')}</label>
            <input
              id="f-timezone"
              type="text"
              value={answers.timezone}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={timezoneError !== null}
              aria-describedby={timezoneError === null ? undefined : 'f-timezone-error'}
              onChange={(e) => {
                patch({ timezone: e.target.value });
              }}
            />
          </>
        )}
        {timezoneError !== null && (
          <p className="wiz-error" id="f-timezone-error">
            {timezoneError}
          </p>
        )}
      </div>

      {/*
       * r2.09: a separate bordered box below the field saying where the zone is used. The first
       * bullet stands out through `.wiz-tz-primary` (tokens), never a mark in the copy string.
       */}
      <div className="wiz-box wiz-tz-why">
        <h3 className="wiz-box-title">{t('hero.timezoneWhy')}</h3>
        <ul className="wiz-tz-why-list">
          <li className="wiz-tz-primary">
            <strong>{t('label.timezoneDayBoundary')}</strong> {t('advice.timezoneDayBoundary')}
          </li>
          <li>
            <strong>{t('label.timezoneReminders')}</strong> {t('advice.timezoneReminders')}
          </li>
        </ul>
      </div>
    </fieldset>
  );
}

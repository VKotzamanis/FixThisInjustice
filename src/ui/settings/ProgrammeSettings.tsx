import { useMemo, useState, type JSX } from 'react';
import { displayClass } from '../format/display';
import { useCopy } from '../../content/useCopy';
import { generatePlan } from '../../domain/plan/generator';
import {
  SESSIONS_PER_WEEK_CHOICES,
  programmeInput,
  sameProgramme,
  sessionInProgress,
} from '../../domain/plan/lifecycle';
import { EXERCISES } from '../../domain/plan/library';
import type { SessionsPerWeek } from '../../domain/plan/templates';
import type { Availability, PlanTemplate, Profile } from '../../domain/types';
import { useAppStore } from '../../store';
import { usePlan, useTodayDate } from '../../store/scheduleSelectors';
import { RestartProgramme } from '../components/RestartProgramme';
import { EQUIPMENT_ACCESS_OPTIONS } from '../setup/SetupWizard';

/**
 * The Programme group in Settings (ROADMAP L5, docs/design/programme-lifecycle.md).
 *
 * Equipment is a profile field and is written at once, as Goal and Experience above it are. The
 * split and the conditioning option are not profile fields: they are the running plan's, so they
 * are local choices here, seeded from the plan and applied only by Update Programme. Whenever the
 * plan built from all of these would differ from the running one, the group says so and offers
 * Update Programme; nothing regenerates without that tap and its confirmation.
 */
export function ProgrammeSettings(props: { profile: Profile }): JSX.Element {
  const t = useCopy();
  const { profile } = props;
  const plan = usePlan();
  const availability = useAppStore((s) => s.availability[profile.id] ?? null);

  return (
    <>
      <h2 className={displayClass(t('hero.programme'))}>{t('hero.programme')}</h2>
      <div className="view-field">
        <label htmlFor="settings-equipment">{t('label.equipmentAccess')}</label>
        <select
          id="settings-equipment"
          value={profile.equipment}
          onChange={(e) => {
            const next = EQUIPMENT_ACCESS_OPTIONS.find((o) => o.value === e.target.value);
            if (next !== undefined) {
              useAppStore.getState().updateProfile(profile.id, { equipment: next.value });
            }
          }}
        >
          {EQUIPMENT_ACCESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>
      {/* Keyed by the plan, so a restart reseeds the local choices from the plan it stored. */}
      {plan !== null && (
        <PlanChoices key={plan.id} profile={profile} plan={plan} availability={availability} />
      )}
    </>
  );
}

function PlanChoices(props: {
  profile: Profile;
  plan: PlanTemplate;
  availability: Availability | null;
}): JSX.Element {
  const t = useCopy();
  const { profile, plan, availability } = props;
  const today = useTodayDate();
  const live = useAppStore((s) => sessionInProgress(s, profile.id));
  const seeded = programmeInput(profile, plan);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<SessionsPerWeek>(seeded.sessionsPerWeek);
  const [includeCardio, setIncludeCardio] = useState(seeded.includeCardio);
  const [confirming, setConfirming] = useState(false);

  // [days/week] distinct ISO weekdays: the calendar serves one session per weekday, so a split
  // above this would leave sessions that are never scheduled (the wizard blocks the same).
  const trainingDays = new Set((availability?.slots ?? []).map((s) => s.weekday)).size;
  const splitOptions = SESSIONS_PER_WEEK_CHOICES.filter(
    (n) => n <= trainingDays || n === seeded.sessionsPerWeek,
  );

  const choice = { sessionsPerWeek, includeCardio };
  const differs = useMemo(
    () =>
      !sameProgramme(
        plan,
        generatePlan(programmeInput(profile, plan, { sessionsPerWeek, includeCardio }), EXERCISES),
      ),
    [plan, profile, sessionsPerWeek, includeCardio],
  );

  return (
    <>
      <div className="view-field">
        <label htmlFor="settings-sessions">{t('label.sessionsPerWeek')}</label>
        <select
          id="settings-sessions"
          value={String(sessionsPerWeek)}
          onChange={(e) => {
            const next = splitOptions.find((n) => String(n) === e.target.value);
            if (next !== undefined) setSessionsPerWeek(next);
          }}
        >
          {splitOptions.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <label className="view-inline">
        <input
          type="checkbox"
          checked={includeCardio}
          onChange={(e) => {
            setIncludeCardio(e.target.checked);
          }}
        />
        {t('label.includeCardio')}
      </label>
      {differs &&
        (live ? (
          <p className="view-note">{t('advice.programmeLockedInSession')}</p>
        ) : confirming ? (
          <RestartProgramme
            titleKey="button.updateProgramme"
            profileId={profile.id}
            today={today}
            choice={choice}
            onClose={() => {
              setConfirming(false);
            }}
          />
        ) : (
          <>
            <p className="view-note">{t('advice.programmeDiffers')}</p>
            <button
              type="button"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t('button.updateProgramme')}
            </button>
          </>
        ))}
    </>
  );
}

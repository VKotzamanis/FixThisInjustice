// src/ui/measurements/MeasurementsPanel.tsx
//
// Spec R9 / audit G02: a weigh-in from Today on ANY day, not only inside a session. Logs today's
// civil date with the chosen role and offers a 6 s Undo, so an immediate slip is one tap.
import { useId, type ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { latestBodyMassEntry } from '../../domain/measurements';
import type { BodyMassRole, Kg, LocalDate, Profile } from '../../domain/types';
import { useAppStore } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { useToastActions } from '../components/ToastQueue';
import { BodyMassForm } from './BodyMassForm';
import './measurements.css';

export function MeasurementsPanel(props: { profile: Profile; today: LocalDate }): ReactElement {
  const { profile, today } = props;
  const c = useCopy();
  const { push } = useToastActions();
  const headingId = useId();
  // The stored entry (stable identity), so the subscription cannot loop.
  const latest = useAppStore((s) => latestBodyMassEntry(s, profile.id));
  // [kg] Spec R4: the plausibility reference, the newest trend mass, else the setup baseline.
  const referenceKg = latest?.massKg ?? profile.body.baselineMassKg;

  const onSubmit = (massKg: Kg, role: BodyMassRole | null): boolean => {
    const now = Date.now(); // [ms] epoch UTC
    let id: string;
    try {
      id = useAppStore.getState().logBodyMass(
        {
          profileId: profile.id,
          date: today,
          massKg, // [kg]
          enteredUnit: profile.units,
          bodyFatPct: null,
          ...(role === null ? {} : { role }),
        },
        now,
      );
    } catch {
      // The store refused (spec R5); the form says so on its error line.
      return false;
    }
    push({
      kind: 'undo',
      message: c('status.massLogged'),
      deadlineAt: now + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        useAppStore.getState().deleteBodyMass(profile.id, id);
      },
    });
    return true;
  };

  return (
    <section className="measurements" aria-labelledby={headingId}>
      <h3 id={headingId}>{c('hero.bodyMass')}</h3>
      <BodyMassForm
        profile={profile}
        idPrefix="today-mass"
        quantity={c('quantity.bodyMass')}
        role="choose"
        referenceKg={referenceKg}
        submitLabel={c('button.logBodyMass')}
        onSubmit={onSubmit}
      />
    </section>
  );
}

import { useState, type JSX, type ReactNode } from 'react';
import type { CopyKey } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import type { ProgrammeChoice } from '../../domain/plan/lifecycle';
import type { LocalDate } from '../../domain/types';
import { useAppStore } from '../../store';

/**
 * The confirmation in front of restartProgramme (ROADMAP L5 and B1b,
 * docs/design/programme-lifecycle.md). Settings' Update Programme and Today's Start Next
 * Programme both open this, so the sentence that says what a restart keeps, and the one control
 * that performs it, exist once.
 *
 * A named group, like the session-editing bars: two of these never share a screen today, but
 * the group's name is the control that opened it, so a screen reader hears what it confirms.
 * `children` sits above the sentence: Today puts its goal picker there.
 */
export function RestartProgramme(props: {
  titleKey: CopyKey;
  profileId: string;
  today: LocalDate;
  choice: ProgrammeChoice;
  onClose: () => void;
  children?: ReactNode;
}): JSX.Element {
  const t = useCopy();
  const [refused, setRefused] = useState(false);

  const onStart = (): void => {
    try {
      useAppStore.getState().restartProgramme(props.profileId, props.choice, props.today);
    } catch {
      /*
       * The entry points hide this panel during a live session and offer only splits the
       * schedule can hold, so a refusal here means the document moved under the screen: a
       * session started in another tab. Nothing was written; the line says to reload.
       */
      setRefused(true);
      return;
    }
    props.onClose();
  };

  return (
    <div role="group" aria-label={t(props.titleKey)} className="view-field">
      {props.children}
      <p className="view-note">{t('advice.programmeRestart')}</p>
      {refused && (
        <p className="view-error" role="alert">
          {t('status.sessionEditRefused')}
        </p>
      )}
      <button type="button" onClick={onStart}>
        {t('button.startProgramme')}
      </button>
      <button type="button" onClick={props.onClose}>
        {t('button.cancel')}
      </button>
    </div>
  );
}

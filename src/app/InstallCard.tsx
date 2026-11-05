// src/app/InstallCard.tsx
//
// Spec R8 (audit E04): install guidance for everyone who has not installed, not only for a build
// with reminders. Mounted once in App.tsx's <main>, so it reaches every view. Shown after setup,
// while not standalone, with no session open (it must not push the set rows down mid-workout),
// until dismissed (ui.installNudgeDismissed, stored in the document).
import { type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';
import { useAppStore } from '../store';
import { useActiveProfile, useOpenAssignment } from '../store/selectors';
import { InstallGuide } from '../ui/components/InstallGuide';
import { promptInstall, useInstallState } from './installPrompt';

export function InstallCard(): ReactElement | null {
  const t = useCopy();
  const profile = useActiveProfile();
  const open = useOpenAssignment();
  const dismissed = useAppStore((s) => s.ui.installNudgeDismissed === true);
  const { standalone, canPrompt } = useInstallState();
  if (profile === null || open !== null || dismissed || standalone) return null;

  return (
    <section className="install-card">
      {canPrompt ? (
        <>
          <h3>{t('hero.installHomeScreen')}</h3>
          <button
            type="button"
            onClick={() => {
              void promptInstall();
            }}
          >
            {t('button.installApp')}
          </button>
        </>
      ) : (
        <InstallGuide reason={null} />
      )}
      <button
        type="button"
        onClick={() => {
          useAppStore.getState().setUi({ installNudgeDismissed: true });
        }}
      >
        {t('button.dismiss')}
      </button>
    </section>
  );
}

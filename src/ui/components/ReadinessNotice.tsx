import { useState, type JSX } from 'react';
import './readinessNotice.css';
import { copy } from '../../content/copy';

/**
 * Key for the per-session dismissal.
 *
 * sessionStorage, not localStorage and not the persisted document: master plan section 10.4
 * requires the notice at every session start, so the dismissal must die with the browser
 * session. localStorage would silence it for good, and the store would persist a UI preference
 * that is not a preference. This file and src/store/sessionMirror.ts are the only two
 * sanctioned sessionStorage users in the app, and eslint.config.js exempts exactly those two
 * from the `no-restricted-globals` / `no-restricted-syntax` ban (P4 polish item 5). The
 * localStorage ban still applies here: this dismissal must not outlive the browser session.
 */
export const READINESS_NOTICE_KEY = 'fti.readinessNoticeDismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(READINESS_NOTICE_KEY) === '1';
  } catch (error) {
    /*
     * Storage can be unavailable (private mode, blocked site data) and reading it can throw
     * rather than return null. Fail SAFE, which here means showing the notice: a health warning
     * suppressed by a storage failure is the one outcome this component must not produce.
     */
    void error;
    return false;
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(READINESS_NOTICE_KEY, '1');
  } catch (error) {
    // Nothing to recover: the notice still closes for this mount through component state, and
    // it comes back on the next mount, which is the safe direction to fail in.
    void error;
  }
}

/**
 * Physician-consult notice for a profile whose screening was flagged.
 *
 * Master plan section 10.4 requires it at every session start. This is the exact export and the
 * exact prop P3 and P4 wire there: `<ReadinessNotice flagged={profile.readiness.flagged} />`. It
 * reads no store state, so a caller with no active profile renders nothing by passing false.
 *
 * Dismissable once per browser session, never for good: the state it reports is a standing one.
 */
export function ReadinessNotice(props: { flagged: boolean }): JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  if (!props.flagged || dismissed) return null;

  return (
    <div className="readiness-notice" role="status">
      <p>{copy('advice.readinessConsult')}</p>
      <button
        type="button"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
      >
        {copy('button.dismiss')}
      </button>
    </div>
  );
}

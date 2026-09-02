// src/ui/views/train/SessionToast.tsx
//
// The Train view's own self-dismissing toast list.
//
// Master plan amendment 13 (P4 item 13): P8 delivers the global toast queue and should absorb
// this one when it lands, rather than run alongside it. Until then this is deliberately local
// state: nothing here is persisted, and a toast that outlived a reload would report a set
// logged in a session the user has since left.
//
// `expiresAt` is an absolute instant rather than a countdown for the same reason the rest
// timer is (code review A31): a backgrounded tab throttles the sweeping interval, and a toast
// holding a decremented counter would come back with time still on it.
import type { ReactElement } from 'react';
import type { EpochMs } from '../../../domain/types';
import '../../styles/train.css';

export interface ToastItem {
  id: string;
  text: string;
  /** "telemetry" = a measured readout; "coach" = an instruction; "undo" = an offer to revert. */
  tone: 'coach' | 'telemetry' | 'undo';
  expiresAt: EpochMs; // [ms] epoch UTC
  actionLabel: string | null;
  onAction: (() => void) | null;
}

/**
 * `role="status"` with `aria-live="polite"`, not `alert`: a coach line reports what was just
 * logged, and interrupting a screen reader mid-sentence for it would be wrong. The undo offer
 * rides the same region because it is the same event, seen from the other side.
 */
export function SessionToast(props: { items: readonly ToastItem[] }): ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <div className="session-toast" role="status" aria-live="polite">
      {props.items.map((t) => (
        <div key={t.id} className={t.tone}>
          <span>{t.text}</span>
          {t.actionLabel !== null && t.onAction !== null && (
            <button type="button" onClick={t.onAction}>
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

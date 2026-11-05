// src/app/UnreadableNotice.tsx
//
// Spec R13 / audit B01: one toast per launch when the load quarantined or repaired anything;
// Settings > Data lists them (src/ui/settings/UnreadableRecords.tsx). Renders nothing itself.
import { useEffect, useRef, type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';
import { useAppStore } from '../store';
import { useToastActions } from '../ui/components/ToastQueue';

export function UnreadableNotice(): ReactElement | null {
  const count = useAppStore((s) => (s.status.quarantine?.length ?? 0) + (s.status.repairs?.length ?? 0));
  const t = useCopy();
  const { push } = useToastActions();
  const shown = useRef(false);
  useEffect(() => {
    if (count === 0 || shown.current) return;
    shown.current = true;
    push({ kind: 'telemetry', message: t('status.recordsUnreadable') });
  }, [count, push, t]);
  return null;
}

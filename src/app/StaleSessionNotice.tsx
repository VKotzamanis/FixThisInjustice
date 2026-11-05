// src/app/StaleSessionNotice.tsx
//
// Spec R1: the user is told, once, that a session left open on an earlier day was closed.
// Audit B03 / AM-10: the same path tells them, once, that another window's save replaced a
// change this window still had queued.
// Mounted inside ToastProvider by App.tsx; renders nothing itself.
import { useEffect, type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';
import { useAppStore } from '../store';
import { useToastActions } from '../ui/components/ToastQueue';

export function StaleSessionNotice(): ReactElement | null {
  const closures = useAppStore((s) => s.status.staleClosures);
  const externalWriteReplaced = useAppStore((s) => s.status.externalWriteReplaced === true);
  const t = useCopy();
  const { push } = useToastActions();
  useEffect(() => {
    if (closures === undefined || closures.length === 0) return;
    for (const closure of closures) {
      push({
        kind: 'telemetry',
        message: t(
          closure.outcome === 'completed' ? 'status.staleSessionCompleted' : 'status.staleSessionReleased',
        ),
      });
    }
    useAppStore.getState().acknowledgeStaleClosures();
  }, [closures, push, t]);
  useEffect(() => {
    if (!externalWriteReplaced) return;
    push({ kind: 'telemetry', message: t('status.externalWriteReplaced') });
    useAppStore.getState().acknowledgeExternalWrite();
  }, [externalWriteReplaced, push, t]);
  return null;
}

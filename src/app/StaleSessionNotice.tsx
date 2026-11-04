// src/app/StaleSessionNotice.tsx
//
// Spec R1: the user is told, once, that a session left open on an earlier day was closed.
// Mounted inside ToastProvider by App.tsx; renders nothing itself.
import { useEffect, type ReactElement } from 'react';
import { useCopy } from '../content/useCopy';
import { useAppStore } from '../store';
import { useToasts } from '../ui/components/ToastQueue';

export function StaleSessionNotice(): ReactElement | null {
  const closures = useAppStore((s) => s.status.staleClosures);
  const t = useCopy();
  const { push } = useToasts();
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
  return null;
}

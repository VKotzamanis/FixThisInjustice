// src/app/useStorageEstimate.ts
//
// Audit B05: the storage estimate is read when the app mounts and each time it becomes visible.
import { useEffect } from 'react';
import { checkStorageEstimate } from '../store';

export function useStorageEstimate(): void {
  useEffect(() => {
    void checkStorageEstimate();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void checkStorageEstimate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

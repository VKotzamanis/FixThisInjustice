// src/ui/components/TrainingModalsProvider.tsx
//
// One provider for both P4 modals, mounted once in App. It owns the open request for each and
// renders the modal only while there is one, so a closed modal costs nothing and no handle is
// written to `window` (code review A53).
//
// Both APIs are memoised and both callbacks are stable: ModalShell's effect depends on
// `onClose`, and an object literal rebuilt every render is exactly the churn A53 found in the
// legacy `window.__videoModal` wiring.

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { FormCuesModal, FormCuesModalContext } from './FormCuesModal';
import type { CueRequest, FormCuesModalApi } from './FormCuesModal';
import { VideoModal, VideoModalContext } from './VideoModal';
import type { VideoModalApi, VideoRequest } from './VideoModal';

export function TrainingModalsProvider(props: { children: ReactNode }): ReactElement {
  const [videoRequest, setVideoRequest] = useState<VideoRequest | null>(null);
  const [cueRequest, setCueRequest] = useState<CueRequest | null>(null);

  const closeVideo = useCallback(() => {
    setVideoRequest(null);
  }, []);
  const closeCues = useCallback(() => {
    setCueRequest(null);
  }, []);

  const videoApi = useMemo<VideoModalApi>(
    () => ({
      open: (request: VideoRequest) => {
        setVideoRequest(request);
      },
      close: closeVideo,
    }),
    [closeVideo],
  );

  const cuesApi = useMemo<FormCuesModalApi>(
    () => ({
      open: (request: CueRequest) => {
        setCueRequest(request);
      },
      close: closeCues,
    }),
    [closeCues],
  );

  return (
    <VideoModalContext.Provider value={videoApi}>
      <FormCuesModalContext.Provider value={cuesApi}>
        {props.children}
        {videoRequest !== null && <VideoModal request={videoRequest} onClose={closeVideo} />}
        {cueRequest !== null && <FormCuesModal request={cueRequest} onClose={closeCues} />}
      </FormCuesModalContext.Provider>
    </VideoModalContext.Provider>
  );
}

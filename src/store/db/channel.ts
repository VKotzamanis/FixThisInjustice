// src/store/db/channel.ts
//
// Audit B03 / spec R13: every instance of the app on this origin (tabs, the installed app beside
// a browser tab) hears each committed revision, so a stale instance reloads its records instead
// of writing over newer ones. BroadcastChannel never delivers to the sender. Where it does not
// exist, nothing is announced; the revision check inside every commit still refuses a stale
// write (src/store/db/idb.ts).

export const REVISION_CHANNEL_NAME = 'fti.revision';

export interface RevisionChannel {
  announce(revision: number): void;
  subscribe(listener: (revision: number) => void): () => void;
}

function revisionIn(data: unknown): number | null {
  const revision: unknown = typeof data === 'object' && data !== null ? Reflect.get(data, 'revision') : undefined;
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 0 ? revision : null;
}

export function broadcastRevisionChannel(name: string = REVISION_CHANNEL_NAME): RevisionChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { announce: () => undefined, subscribe: () => () => undefined };
  }
  // Opened on first use: a backend that only reads (recovery export, tests) holds no channel.
  let channel: BroadcastChannel | null = null;
  const open = (): BroadcastChannel => (channel ??= new BroadcastChannel(name));
  return {
    announce(revision: number): void {
      open().postMessage({ revision });
    },
    subscribe(listener: (revision: number) => void): () => void {
      const channel = open();
      const handler = (e: MessageEvent): void => {
        const revision = revisionIn(e.data);
        if (revision !== null) listener(revision);
      };
      channel.addEventListener('message', handler);
      return () => {
        channel.removeEventListener('message', handler);
      };
    },
  };
}

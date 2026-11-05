// src/app/saveFile.ts
//
// Audit B07: how a backup leaves the device. Two paths, decided synchronously inside the tap
// (navigator.share requires user activation):
//
//  - SHARE (files). Where the browser says it can share this exact file
//    (`navigator.canShare({ files })`), the system share sheet opens: on an installed iPhone app
//    this is the route to Save to Files, where an `<a download>` may open a preview with no way
//    back [U: iOS not tested]. Chromium shares only an allow-list of file types and is reported
//    to refuse application/json [community], so Android falls through to the download.
//  - DOWNLOAD. `downloadText` (src/app/download.ts), everywhere else.
//
// Neither path proves a file was kept. A resolved share means a share target accepted it; a
// download that returned means only that the browser was asked. ConfirmDestructive therefore
// treats only 'shared' as done and asks the user to confirm a download.
import { downloadText } from './download';

export type ShareOutcome = 'shared' | 'cancelled' | 'failed';

/** The file to share, or null when this browser cannot share it (then: download). */
export function shareableFile(filename: string, text: string, mime: string): File | null {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null;
  const file = new File([text], filename, { type: mime });
  try {
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

/** Opens the share sheet. AbortError is the user closing it; anything else is a failure. */
export async function shareFile(file: File): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/**
 * Starts saving `text` from inside a tap: shares when it can, else downloads. Returns the route
 * taken and, for a share, its outcome. A failed share (not a cancel) falls back to the download.
 */
export function saveFile(
  filename: string,
  text: string,
  mime: string = 'application/json',
): { route: 'download' } | { route: 'share'; outcome: Promise<ShareOutcome> } {
  const file = shareableFile(filename, text, mime);
  if (file === null) {
    downloadText(filename, text, mime);
    return { route: 'download' };
  }
  const outcome = shareFile(file).then((result) => {
    if (result === 'failed') downloadText(filename, text, mime);
    return result;
  });
  return { route: 'share', outcome };
}

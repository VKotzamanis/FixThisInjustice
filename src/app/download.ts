/**
 * Hands a text document to the browser's download machinery.
 *
 * Shared by the recovery UI (RootErrorBoundary) and the save-failure banner
 * (App): both offer an export, and an export that behaves differently in the
 * two places is a bug waiting to happen.
 *
 * An object URL rather than a `data:` URI because the exported document has no
 * size bound, and it is revoked immediately after the synthetic click: the
 * click has already been dispatched by then, so the download is committed.
 * CSP note (master plan section 3): `blob:` appears in img-src and media-src,
 * not in default-src. A download triggered by `<a download>` is not a fetch the
 * policy governs, so no directive has to be widened for this.
 */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Hands a text document to the browser's download machinery.
 *
 * Shared by the recovery UI (RootErrorBoundary) and the save-failure banner
 * (App): both offer an export, and an export that behaves differently in the
 * two places is a bug waiting to happen.
 *
 * An object URL rather than a `data:` URI because the exported document has no
 * size bound, and it is revoked DOWNLOAD_URL_LIFETIME_MS after the synthetic click (audit B07).
 * CSP note (master plan section 3): `blob:` appears in img-src and media-src,
 * not in default-src. A download triggered by `<a download>` is not a fetch the
 * policy governs, so no directive has to be widened for this.
 *
 * `mime` defaults to `application/json` so every existing two-argument call keeps its old
 * behaviour; a caller exporting a non-JSON document (plain text, `.ics`) passes its real type,
 * so a browser that dispatches on Blob.type rather than the filename extension offers the
 * right handler for it.
 */
/**
 * [ms] How long the object URL outlives the click (audit B07). Revoking it synchronously, as
 * this helper did, can cancel a download a browser starts asynchronously [U: reported for
 * Safari, not tested here]. The cost is the blob held in memory for this long.
 */
export const DOWNLOAD_URL_LIFETIME_MS = 60_000;

export function downloadText(
  filename: string,
  text: string,
  mime: string = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_LIFETIME_MS);
}

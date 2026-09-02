// src/ui/motivation/MotivationSettings.tsx
//
// The Settings section for the motivation clip (P6 Task 6, master plan section 6.7). It is one
// SETTINGS_ROWS entry: it picks, replaces, removes and previews the clip, and it owns nothing
// else. What the popup then plays is MotivationModal's business, and where the bytes live is
// src/domain/motivation/assets.ts's.
//
// THE ORDER A REPLACEMENT RUNS IN, which is the only thing here that can lose data:
//
//   1. saveCustomVideo(file)      the new asset is written and its id comes back
//   2. setCustomVideo(profileId, newId)   the profile names the new asset
//   3. deleteCustomVideo(oldId)   the asset nothing names any more is released
//
// Any other order has a failure that costs the user their clip. Deleting first and then saving
// leaves nothing at all if the save is refused; deleting before the id moves leaves the profile
// naming an asset that is gone. A refused save therefore writes nothing: the old id stays where
// it is and the section reports the refusal, which is why the id move lives in the fulfilled
// branch alone. Step 3 is a no-op when the id is already gone (assets.ts guarantees that), and
// saveCustomVideo's own sweep will have removed the old record inside the transaction that
// wrote the new one; the call is still made because the profile's id, not that sweep, is what
// this component is responsible for keeping true.
//
// WHAT THE SECTION CAN AND CANNOT SAY ABOUT A STORED CLIP. The name and the size come from the
// File the user picked, held for the life of this panel. The asset module exports no metadata
// reader (only getCustomVideoUrl, which yields an object URL and no record), so after a reload
// the section reports that a clip is stored without naming or measuring it. Reading the object
// store directly from here was rejected: a second openDB would have to restate the schema and
// its upgrade, and a connection opened at the same version WITHOUT that upgrade creates the
// database with no object store, which would break every later save. Nothing here creates an
// object URL, so there is none to revoke on unmount; the preview's URL belongs to
// MotivationModal, whose effect already releases it.

import { useCallback, useState, type ChangeEvent, type ReactElement } from 'react';
import { MotivationModal } from './MotivationModal';
import {
  MAX_VIDEO_BYTES,
  deleteCustomVideo,
  saveCustomVideo,
} from '../../domain/motivation/assets';
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import { useAppStore } from '../../store';

/** 1 MiB = 2^20 bytes. The size readout and the limit are both binary megabytes. */
const BYTES_PER_MIB = 1_048_576; // [bytes/MiB]

/** What the picked File reported about itself, kept so the section can name what it stored. */
interface PickedClip {
  name: string;
  size: number; // bytes
}

/** A byte count as one number in MiB, to one decimal. */
function mibOf(bytes: number): string {
  return (bytes / BYTES_PER_MIB).toFixed(1); // [MiB]
}

/**
 * The copy key for a refusal thrown by saveCustomVideo.
 *
 * The thrown text never reaches the screen. It names the browser's MIME type and the limit in
 * bytes, neither of which the user can act on, and an Error message is not an interface: the
 * two sentences matched here are minted in src/domain/motivation/assets.ts and read nowhere
 * else, so a reworded one falls through to the generic key rather than appearing verbatim in
 * a banner. The match is on the opening words for the same reason the asset suite asserts on
 * them: both messages interpolate a value after that point.
 */
function refusalCopy(cause: unknown): CopyKey {
  if (cause instanceof Error) {
    if (cause.message.startsWith('Not a video file')) return 'status.motivationClipNotVideo';
    if (cause.message.startsWith('File is too large')) return 'status.motivationClipTooLarge';
  }
  return 'status.motivationClipNotStored';
}

/**
 * Choose, replace, remove and preview the clip the weekly-miss popup plays.
 *
 * Store-wired and prop-free, like ReminderSettingsPanel: SettingsView mounts it as one row.
 * It renders nothing without an active profile, because setCustomVideo throws on a profile
 * nobody owns and a picker that cannot store anything is worse than no picker.
 *
 * The preview passes `review={null}`, which is MotivationModal's documented preview mode: it
 * records no week, so opening the preview never consumes a real pending miss and never marks
 * one handled.
 */
export function MotivationSettings(): ReactElement | null {
  const profileId = useAppStore((s) => s.activeProfileId);
  const storedAssetId = useAppStore((s) =>
    s.activeProfileId === null
      ? null
      : (s.motivation[s.activeProfileId]?.customVideoAssetId ?? null),
  );

  const [picked, setPicked] = useState<PickedClip | null>(null);
  const [error, setError] = useState<CopyKey | null>(null);
  /** True while a save or a delete is in flight, so a second pick cannot race the first. */
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const onPick = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      // Cleared here so the SAME file can be picked again after a refusal: an input whose value
      // has not changed fires no second change event.
      event.target.value = '';
      if (file === undefined || profileId === null || busy) return;
      const replaced = storedAssetId;
      setBusy(true);
      // Date.now() at the call site, as everywhere else in the UI. [ms] epoch, UTC.
      void saveCustomVideo(file, Date.now())
        .then(async (id) => {
          useAppStore.getState().setCustomVideo(profileId, id);
          setPicked({ name: file.name, size: file.size }); // bytes
          setError(null);
          if (replaced !== null && replaced !== id) await deleteCustomVideo(replaced);
        })
        .catch((cause: unknown) => {
          // A refused save leaves the stored id exactly where it was, so the previous clip
          // still plays and the section still names it.
          setError(refusalCopy(cause));
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [busy, profileId, storedAssetId],
  );

  const onRemove = useCallback((): void => {
    if (profileId === null || storedAssetId === null || busy) return;
    setBusy(true);
    // The id is dropped first and the asset released after, which is the opposite of the
    // replacement order above and for the opposite reason: there is no new asset to fall back
    // on, so a delete that fails must not leave the user looking at a section that says the
    // clip is gone. What it can leave is one unreferenced record, and the next saveCustomVideo
    // sweeps every key but its own inside its transaction, so the orphan is self-clearing.
    useAppStore.getState().setCustomVideo(profileId, null);
    setPicked(null);
    setError(null);
    void deleteCustomVideo(storedAssetId)
      .catch(() => {
        // Nothing to report: the profile no longer names this asset, so the removal the user
        // asked for has happened whatever IndexedDB did with the bytes.
      })
      .finally(() => {
        setBusy(false);
      });
  }, [busy, profileId, storedAssetId]);

  const openPreview = useCallback((): void => {
    setPreviewing(true);
  }, []);

  const closePreview = useCallback((): void => {
    setPreviewing(false);
  }, []);

  if (profileId === null) return null;

  return (
    <section className="fti-motivation-clip" aria-labelledby="fti-motivation-clip-heading">
      <h2 id="fti-motivation-clip-heading">{copy('hero.motivationVideo')}</h2>
      <p className="view-note">
        {picked !== null
          ? FORMAT.motivationClipName(picked.name)
          : storedAssetId === null
            ? copy('status.motivationClipNone')
            : copy('status.motivationClipStored')}
      </p>
      {picked !== null && (
        <p className="view-note">{FORMAT.motivationClipSize(mibOf(picked.size))}</p>
      )}

      <div className="view-field">
        <label htmlFor="motivation-clip-file">
          {storedAssetId === null
            ? copy('label.motivationClipChoose')
            : copy('label.motivationClipReplace')}
        </label>
        <input
          id="motivation-clip-file"
          type="file"
          accept="video/*"
          disabled={busy}
          onChange={onPick}
        />
      </div>
      <p className="view-note">{copy('advice.motivationClipStorage')}</p>
      {/* R9: the exact limit and the unit the size line uses, both read from the constants
          that enforce them rather than restated in the copy table. */}
      <details>
        <summary>{copy('disclosure.why')}</summary>
        <p className="view-note">
          {FORMAT.withSlots('advice.motivationClipLimit', {
            bytes: MAX_VIDEO_BYTES, // bytes
            mib: BYTES_PER_MIB, // [bytes/MiB]
          })}
        </p>
      </details>
      {error !== null && (
        <p className="view-error" role="alert">
          {copy(error)}
        </p>
      )}

      <div>
        <button type="button" onClick={openPreview}>
          {copy('button.motivationClipPreview')}
        </button>
        {storedAssetId !== null && (
          <button type="button" disabled={busy} onClick={onRemove}>
            {copy('button.motivationClipRemove')}
          </button>
        )}
      </div>

      {previewing && (
        <MotivationModal review={null} profileId={profileId} onDismiss={closePreview} />
      )}
    </section>
  );
}

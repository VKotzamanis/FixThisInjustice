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
// it is the step that actually releases the replaced record, because the sweep inside
// saveCustomVideo is told to spare every id state still names (see `keep` below) and the id
// being replaced is still one of them at the moment the save runs.
//
// WHY THE SAVE IS TOLD WHAT TO KEEP. One videos object store backs every profile while
// MotivationState.customVideoAssetId is per profile, so a sweep that keeps only the record it
// just wrote deletes the other profiles' clips: profile A's section would go on reporting a
// stored clip that no longer resolves. This section therefore hands saveCustomVideo the set of
// every asset id state names, minus the one this pick replaces.
//
// WHAT THE SECTION SAYS ABOUT A STORED CLIP. Immediately after a pick, the name and the size
// come from the File itself. After a reload there is no File, so an effect keyed on the stored
// id reads the record's own name and size through getCustomVideoMeta, which goes through the
// asset module's single cached connection. Opening a second connection from here was rejected:
// it would have to restate the schema and its upgrade, and a connection opened at the same
// version WITHOUT that upgrade creates the database with no object store, which would break
// every later save. Nothing here creates an object URL, so there is none to revoke on unmount;
// the preview's URL belongs to MotivationModal, whose effect already releases it.

import { useCallback, useEffect, useState, type ChangeEvent, type ReactElement } from 'react';
import { MotivationModal } from './MotivationModal';
import {
  MAX_VIDEO_BYTES,
  deleteCustomVideo,
  getCustomVideoMeta,
  saveCustomVideo,
} from '../../domain/motivation/assets';
import { FORMAT, copy, type CopyKey } from '../../content/copy';
import { useAppStore } from '../../store';

/** 1 MiB = 2^20 bytes. The size readout and the limit are both binary megabytes. */
const BYTES_PER_MIB = 1_048_576; // [bytes/MiB]

/** What the section can say about the clip it holds, from a File or from the stored record. */
interface ClipMeta {
  name: string;
  size: number; // bytes
}

/**
 * A File this session picked, tagged with the asset id it was stored as.
 *
 * The tag is what keeps the readout honest when the active profile changes under a mounted
 * section: the picked name is shown only while the profile still names that very asset.
 */
interface PickedClip extends ClipMeta {
  assetId: string;
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
  /** What the stored record says about itself, which is all a reload has to go on. */
  const [stored, setStored] = useState<ClipMeta | null>(null);
  const [error, setError] = useState<CopyKey | null>(null);
  /** True while a save or a delete is in flight, so a second pick cannot race the first. */
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Keyed on the stored id alone, so it runs on mount, on a replacement and on a profile
  // change, and never in between. `stored` is cleared first because the id it described is no
  // longer the id in state; `live` drops a read whose id was replaced while it was in flight.
  useEffect(() => {
    let live = true;
    setStored(null);
    if (storedAssetId !== null) {
      void getCustomVideoMeta(storedAssetId)
        .then((meta) => {
          if (live && meta !== null) setStored(meta);
        })
        .catch(() => {
          // A database that will not open leaves the section on 'a clip is stored', which is
          // still true: the id is in the document whatever IndexedDB did with the bytes.
        });
    }
    return () => {
      live = false;
    };
  }, [storedAssetId]);

  const onPick = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      // Cleared here so the SAME file can be picked again after a refusal: an input whose value
      // has not changed fires no second change event.
      event.target.value = '';
      if (file === undefined || profileId === null || busy) return;
      const replaced = storedAssetId;
      // Every asset id state still names, minus the one this pick replaces, which step 3 below
      // releases explicitly. Read from the store rather than subscribed to: this section must
      // not re-render because another profile's clip changed, and the set that matters is the
      // one true at the moment the save runs.
      const keep = new Set<string>();
      for (const entry of Object.values(useAppStore.getState().motivation)) {
        if (entry.customVideoAssetId !== null) keep.add(entry.customVideoAssetId);
      }
      if (replaced !== null) keep.delete(replaced);
      setBusy(true);
      // Date.now() at the call site, as everywhere else in the UI. [ms] epoch, UTC.
      void saveCustomVideo(file, Date.now(), { keep })
        .then((id) => {
          useAppStore.getState().setCustomVideo(profileId, id);
          setPicked({ assetId: id, name: file.name, size: file.size }); // bytes
          setError(null);
          if (replaced !== null && replaced !== id) {
            // Its own catch, and outside the guarded chain on purpose. The new clip is stored
            // and named by the profile, so a refused delete is not a refused save: routing it
            // to the catch below would paint 'the clip was not stored' over a clip that was,
            // and the only action that line invites is picking the same file again. What the
            // failure leaves is one record nothing names, which the next save sweeps.
            void deleteCustomVideo(replaced).catch(() => {
              /* nothing to report and nothing to log: the profile has moved on already */
            });
          }
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
    // sweeps every key that is neither its own nor named by state, so the orphan is
    // self-clearing on this profile's next pick or on any other profile's.
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

  // The File this session picked wins over the record, because it is the answer to the action
  // the user just took; it is dropped the moment the profile stops naming that asset.
  const shown: ClipMeta | null =
    picked !== null && picked.assetId === storedAssetId ? picked : stored;

  if (profileId === null) return null;

  return (
    <section className="fti-motivation-clip" aria-labelledby="fti-motivation-clip-heading">
      <h2 id="fti-motivation-clip-heading">{copy('hero.motivationVideo')}</h2>
      <p className="view-note">
        {shown !== null
          ? FORMAT.motivationClipName(shown.name)
          : storedAssetId === null
            ? copy('status.motivationClipNone')
            : copy('status.motivationClipStored')}
      </p>
      {shown !== null && (
        <p className="view-note">{FORMAT.motivationClipSize(mibOf(shown.size))}</p>
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

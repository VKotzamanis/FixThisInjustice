// src/content/reviewDataNotes.ts
//
// The review step's "Your Data" block (Brief M, claim r2.19): three facts about the profile
// about to be written, read on the last screen before Confirm commits it. He asked for the
// screen to teach the user how their own data actually works, because nothing earlier in the
// wizard says where an answer ends up, how to carry it to a second device, or what "starting
// over" destroys.
//
// WHY THIS IS NOT A COPY TABLE. Copy contract R10: reference text a user reads rather than a
// control they operate lives in its own module, exempt from R1 to R4 and from R9, but not from
// R5, R6 or R11. Modelled on `src/content/bodyEquations.ts`.
//
// THE MIDDLE FACT NAMES REAL CONTROLS, NOT GUESSED ONES. Brief M's own draft read "Settings,
// then Data, then export the JSON backup", which matches no control `src/ui/views/ExportView.tsx`
// renders (verified 2026-09-09). The words below are the same words `DEFAULT_COPY` in
// `src/content/copy.ts` gives the keys ExportView actually calls: `hero.exportImport`
// ("Export and import"), `label.downloads` ("Downloads"), `button.downloadJson`
// ("Download JSON") and `label.importSection` ("Import"). None of the four carries a per-skin
// override today (copy.limelight.ts names `hero.exportImport` among the keys every skin keeps
// clinical, "a control whose misreading costs data"), and `reviewDataNotes.test.ts` imports
// `DEFAULT_COPY` and asserts this module still quotes it, so a renamed control fails a test
// here instead of silently going stale.
//
// THE THIRD FACT IS DELIBERATELY BLUNT. He asked for the sentence stating plainly that clearing
// the browser's cookies and site data cannot be undone: it is the one destructive action a user
// can take from OUTSIDE the app, so nothing here can gate it behind an export first the way
// `ConfirmDestructive` gates the two wipes reachable from inside Settings.
//
// THE ICON BESIDE THE THIRD FACT IS THE OWNER'S. `docs/design/2026-09-04-icon-register.csv` row
// `reset-cookies-icon` is marked owner-supplied on every column; SetupWizard.tsx renders a
// placeholder frame naming that row and draws nothing.

/** Fact 1: where the document lives. */
import { DEFAULT_COPY } from './copy';

export const REVIEW_DATA_WHERE_IT_LIVES =
  'Everything stays in this browser, on this device. Nothing is sent anywhere.';

/**
 * Fact 2: how to carry the document to another device. Names the controls
 * `src/ui/views/ExportView.tsx` actually renders (`hero.exportImport`, `label.downloads`,
 * `button.downloadJson`, `label.importSection`), not the guessed "Settings, then Data" path.
 */
/*
 * DERIVED FROM THE TABLE, not transcribed from it. This sentence held the four control names as
 * literals and broke within hours: the Title Case sweep renamed `hero.exportImport` from
 * "Export and import" to "Export and Import", and a sentence that quotes a control by copying
 * its words is stale the moment anyone edits that control. Reading DEFAULT_COPY at module load
 * makes the drift impossible rather than merely detectable.
 *
 * The contract suite still asserts the four names appear here verbatim; it now cannot fail for
 * a rename, only for a key that stopped being referenced at all, which is the thing worth
 * catching.
 */
export const REVIEW_DATA_HOW_TO_MOVE =
  `To move it to another device: on this one, open Settings, then ${DEFAULT_COPY['hero.exportImport']}, ` +
  `then ${DEFAULT_COPY['label.downloads']}, and press ${DEFAULT_COPY['button.downloadJson']}. ` +
  `On the other device, open Settings, then ${DEFAULT_COPY['hero.exportImport']}, then ` +
  `${DEFAULT_COPY['label.importSection']}, and load that file there.`;

/**
 * Fact 3: what clearing the browser's cookies and site data does, stated plainly as
 * irreversible. The one destructive action reachable from outside the app, per the module
 * header above.
 */
export const REVIEW_DATA_HOW_TO_RESET =
  "To start over: clearing this browser's cookies and site data for this site erases " +
  'everything above, and there is no way back afterwards.';

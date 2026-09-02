// src/config/env.d.ts
//
// Augmentation only. `vite/client` already declares ImportMeta.env; interface merging adds
// these two members to ImportMetaEnv, so this file must stay a global script (no top-level
// import or export) or the merge silently becomes a module-local redeclaration.

interface ImportMetaEnv {
  /** Base URL of the deployed reminders Worker, e.g. "https://fti-reminders.<sub>.workers.dev". */
  readonly VITE_REMINDER_API?: string;
  /** VAPID public key (base64url) matching the Worker's VAPID_PRIVATE_JWK secret. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

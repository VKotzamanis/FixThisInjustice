// build/sfxManifest.ts
//
// Audit E15: the sound files that ship, read from public/sfx at config time. public/sfx ships
// empty by design (src/skins/sfx.ts), and the player used to fetch all four moments on every
// unlock with sounds on: 4 x 404 per launch. vite.config.ts and vitest.config.ts both define
// `__SFX_FILES__` from this one function (rule 2); src/skins/sfx.ts fetches only listed files.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every `.m4a` under `<publicDir>/sfx`, as `'<skin>/<name>.m4a'`, sorted; [] when absent. */
export function shippedSfx(publicDir: string): string[] {
  const root = join(publicDir, 'sfx');
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.m4a')) found.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return found.sort();
}

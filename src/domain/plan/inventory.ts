// src/domain/plan/inventory.ts
//
// What an exercise needs beyond its access tier, and what the user's setup answers say they
// have (audit D07, spec R11). Pure; no store, no React.
import { ACCESS_UNLOCKS } from '../types';
import type {
  BodyweightEquipmentItem,
  EquipmentAccess,
  Exercise,
  HomeEquipmentItem,
} from '../types';

/**
 * An item an exercise cannot be done without, inside a tier that does not guarantee it. Each one
 * maps onto a setup inventory answer (inventoryOf). A full gym is assumed to hold all four, so
 * the filter never runs there.
 */
export type RequiredItem = 'dumbbells' | 'bench' | 'pull-up-bar' | 'resistance-bands';

/** What the user can use. `null` = no filter: a full gym holds everything. */
export type Inventory = ReadonlySet<RequiredItem> | null;

/**
 * Required items per library id. Every library id has an entry (inventory.test.ts asserts the
 * key set equals the library's), so a new exercise cannot skip the decision. An id not in the
 * table (a user's custom exercise) needs nothing.
 *
 * RULINGS. A setup constraint any home has (a chair for a bench dip or a Bulgarian rear foot, a
 * stair for a bodyweight step-up, a table edge for an incline push-up, an anchor for the Nordic
 * curl) is not an item. A dumbbell lift needs `dumbbells`; one that lies or steps on a bench
 * needs `bench` too. A bar hang or bar row needs `pull-up-bar`. Full-gym-only rows need nothing
 * here because the filter never runs in a full gym.
 */
export const EXERCISE_REQUIREMENTS: Readonly<Record<string, readonly RequiredItem[]>> = {
  // pressing
  'barbell-bench-press': [],
  'close-grip-bench-press': [],
  'overhead-press-barbell': [],
  'push-press': [],
  'db-overhead-press': ['dumbbells'],
  'incline-db-press': ['dumbbells', 'bench'],
  'push-up': [],
  'pike-push-up': [],
  'bench-dip': [],
  'db-bench-press': ['dumbbells', 'bench'],
  'db-floor-press': ['dumbbells'],
  'incline-push-up': [],
  // shoulder and arm isolation
  'lateral-raise': ['dumbbells'],
  'db-rear-delt-fly': ['dumbbells'],
  'triceps-overhead-extension': ['dumbbells'],
  'barbell-curl': [],
  'hammer-curl': ['dumbbells'],
  'cable-triceps-pushdown': [],
  'cable-lateral-raise': [],
  'band-lateral-raise': ['resistance-bands'],
  'band-curl': ['resistance-bands'],
  // pulling
  'pull-up': ['pull-up-bar'],
  'chin-up': ['pull-up-bar'],
  'lat-pulldown': [],
  'weighted-pull-up': [],
  'barbell-row-pendlay': [],
  'barbell-row': [],
  'db-single-arm-row': ['dumbbells'],
  'inverted-row': ['pull-up-bar'],
  'face-pull': [],
  'seated-cable-row': [],
  'band-row': ['resistance-bands'],
  'band-pull-apart': ['resistance-bands'],
  'prone-t-raise': [],
  'door-frame-row': [],
  // lower body
  'barbell-back-squat': [],
  'leg-press': [],
  'goblet-squat': ['dumbbells'],
  'bulgarian-split-squat': [],
  'romanian-deadlift': [],
  'db-romanian-deadlift': ['dumbbells'],
  'trap-bar-deadlift': [],
  'conventional-deadlift': [],
  'leg-curl-machine': [],
  'nordic-hamstring-curl': [],
  'calf-raise': [],
  'db-reverse-lunge': ['dumbbells'],
  'db-walking-lunge': ['dumbbells'],
  'db-step-up': ['dumbbells', 'bench'],
  'db-single-leg-rdl': ['dumbbells'],
  'bw-reverse-lunge': [],
  'bw-forward-lunge': [],
  'bw-split-squat': [],
  'bw-step-up': [],
  'bw-squat': [],
  'bw-single-leg-rdl': [],
  'barbell-hip-thrust': [],
  'glute-bridge': [],
  'leg-extension': [],
  // trunk and carry
  plank: [],
  'ab-wheel-rollout': [],
  'hanging-knee-raise': ['pull-up-bar'],
  'dead-bug': [],
  'side-plank': [],
  'farmer-carry': ['dumbbells'],
  // conditioning
  'rower-intervals': [],
  'stair-climber': [],
  walk: [],
};

/**
 * The items the app assumed before it read the inventory: dumbbells and a bench in a home gym, a
 * bar in every tier (library.ts pull-up row: "needs only a bar, which every tier assumes"). Bands
 * were never assumed. Used for every answer the profile does not hold (rule 7: a profile that
 * never answered keeps resolving every pre-P3a exercise exactly as before; inventory.test.ts
 * asserts it).
 */
export const LEGACY_ASSUMED_ITEMS: ReadonlySet<RequiredItem> = new Set<RequiredItem>([
  'dumbbells',
  'bench',
  'pull-up-bar',
]);

/** Setup shows the home-gym list (dumbbells, bench, machines) for these access levels. */
export function showsHomeEquipment(access: EquipmentAccess): boolean {
  return access === 'home' || access === 'home-and-bodyweight' || access === 'full-and-home';
}

/**
 * Setup shows the portable list (mat, rope, pull-up bar, bands) for every access level that
 * trains outside a full gym, home gyms included: a home gym's bar and bands are what decide its
 * pulling work.
 */
export function showsPortableEquipment(access: EquipmentAccess): boolean {
  return access !== 'full-gym';
}

const DUMBBELL_BANDS: readonly HomeEquipmentItem[] = [
  'dumbbells-5-20',
  'dumbbells-20-40',
  'dumbbells-40-plus',
];

export interface InventoryAnswers {
  equipment: EquipmentAccess;
  homeEquipment: readonly HomeEquipmentItem[];
  bodyweightEquipment: readonly BodyweightEquipmentItem[];
  /** The access level setup asked the lists at; null or absent = never asked (Profile field). */
  inventoryAnsweredFor?: EquipmentAccess | null | undefined;
}

/**
 * The inventory the generator and the pickers filter by.
 *
 * null when the access level includes a full gym. Otherwise each item comes from the list that
 * was shown at `inventoryAnsweredFor`, and an item from a list that was never shown falls back to
 * LEGACY_ASSUMED_ITEMS. So an old profile (no answers) resolves exactly as before, and a profile
 * whose access level was changed in Settings after setup keeps only the answers that still apply.
 */
export function inventoryOf(a: InventoryAnswers): Inventory {
  if (ACCESS_UNLOCKS[a.equipment].includes('full-gym')) return null;
  const askedAt = a.inventoryAnsweredFor ?? null;
  const homeAsked = askedAt !== null && showsHomeEquipment(askedAt);
  const portableAsked = askedAt !== null && showsPortableEquipment(askedAt);
  const items = new Set<RequiredItem>();
  const pick = (item: RequiredItem, asked: boolean, has: boolean): void => {
    if (asked ? has : LEGACY_ASSUMED_ITEMS.has(item)) items.add(item);
  };
  pick('dumbbells', homeAsked, a.homeEquipment.some((i) => DUMBBELL_BANDS.includes(i)));
  pick('bench', homeAsked, a.homeEquipment.includes('bench'));
  pick('pull-up-bar', portableAsked, a.bodyweightEquipment.includes('pull-up-bar'));
  pick('resistance-bands', portableAsked, a.bodyweightEquipment.includes('resistance-bands'));
  return items;
}

/**
 * True when the user can do `ex` with what they have: always with a full gym in the access level
 * (or a null inventory), otherwise only when the inventory holds every item the exercise needs.
 * A custom exercise (no table entry) needs nothing.
 */
export function fitsInventory(ex: Exercise, access: EquipmentAccess, inventory: Inventory): boolean {
  if (inventory === null || ACCESS_UNLOCKS[access].includes('full-gym')) return true;
  return (EXERCISE_REQUIREMENTS[ex.id] ?? []).every((item) => inventory.has(item));
}

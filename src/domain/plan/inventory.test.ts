import { describe, expect, it } from 'vitest';
import type { EquipmentAccess, Exercise } from '../types';
import { EXERCISES, EXERCISE_BY_ID } from './library';
import {
  EXERCISE_REQUIREMENTS,
  LEGACY_ASSUMED_ITEMS,
  fitsInventory,
  inventoryOf,
  showsHomeEquipment,
  showsPortableEquipment,
  type RequiredItem,
} from './inventory';

/** The 40 ids that existed before P3a (library.test.ts CANONICAL_IDS). */
const PRE_P3A_IDS = [
  'barbell-bench-press', 'overhead-press-barbell', 'incline-db-press', 'lateral-raise',
  'triceps-overhead-extension', 'pull-up', 'lat-pulldown', 'barbell-row-pendlay', 'barbell-row',
  'db-single-arm-row', 'face-pull', 'barbell-curl', 'hammer-curl', 'barbell-back-squat',
  'romanian-deadlift', 'leg-press', 'bulgarian-split-squat', 'leg-curl-machine', 'calf-raise',
  'push-up', 'trap-bar-deadlift', 'conventional-deadlift', 'weighted-pull-up',
  'close-grip-bench-press', 'push-press', 'rower-intervals', 'plank', 'ab-wheel-rollout',
  'hanging-knee-raise', 'walk', 'stair-climber', 'db-overhead-press', 'db-romanian-deadlift',
  'db-rear-delt-fly', 'goblet-squat', 'inverted-row', 'pike-push-up', 'nordic-hamstring-curl',
  'chin-up', 'bench-dip',
];

const ACCESS: EquipmentAccess[] = [
  'bodyweight',
  'home-and-bodyweight',
  'home',
  'full-and-home',
  'full-gym',
];

function ex(id: string): Exercise {
  const e = EXERCISE_BY_ID[id];
  if (!e) throw new Error(`missing exercise: ${id}`);
  return e;
}

const set = (...items: RequiredItem[]): ReadonlySet<RequiredItem> => new Set(items);

describe('EXERCISE_REQUIREMENTS', () => {
  it('has exactly one entry per library id, so a new exercise cannot skip the decision', () => {
    expect(Object.keys(EXERCISE_REQUIREMENTS).sort()).toEqual(EXERCISES.map((e) => e.id).sort());
  });

  it('names an item only where the filter can run: never on a full-gym-only row', () => {
    for (const e of EXERCISES) {
      if (e.equipment.length === 1 && e.equipment[0] === 'full-gym') {
        expect({ id: e.id, needs: EXERCISE_REQUIREMENTS[e.id] }).toEqual({ id: e.id, needs: [] });
      }
    }
  });

  it('asks a bodyweight-tier row only for what the bodyweight setup list asks about', () => {
    // Setup step 4 never asks a body-weight-only user about dumbbells or a bench, so a
    // bodyweight-tagged row needing either would vanish for every such user.
    for (const e of EXERCISES) {
      if (!e.equipment.includes('bodyweight')) continue;
      for (const item of EXERCISE_REQUIREMENTS[e.id] ?? []) {
        expect({ id: e.id, item }).toEqual({
          id: e.id,
          item: ['pull-up-bar', 'resistance-bands'].includes(item) ? item : 'not asked in tier',
        });
      }
    }
  });

  it('makes every loaded dumbbell row need dumbbells, and the bench lifts a bench', () => {
    for (const e of EXERCISES) {
      if (e.modality !== 'dumbbell' || e.equipment.includes('bodyweight')) continue;
      expect({ id: e.id, dumbbells: EXERCISE_REQUIREMENTS[e.id]?.includes('dumbbells') }).toEqual({
        id: e.id,
        dumbbells: true,
      });
    }
    for (const id of ['incline-db-press', 'db-bench-press', 'db-step-up']) {
      expect(EXERCISE_REQUIREMENTS[id]).toContain('bench');
    }
  });

  it('makes the bar and band movements need the bar and the bands', () => {
    for (const id of ['pull-up', 'chin-up', 'inverted-row', 'hanging-knee-raise']) {
      expect(EXERCISE_REQUIREMENTS[id]).toEqual(['pull-up-bar']);
    }
    for (const id of ['band-row', 'band-pull-apart', 'band-lateral-raise', 'band-curl']) {
      expect(EXERCISE_REQUIREMENTS[id]).toEqual(['resistance-bands']);
    }
  });
});

describe('inventoryOf', () => {
  const answers = {
    homeEquipment: [] as const,
    bodyweightEquipment: [] as const,
  };

  it('applies no filter when the access level includes a full gym', () => {
    expect(inventoryOf({ ...answers, equipment: 'full-gym', inventoryAnsweredFor: 'full-gym' })).toBeNull();
    expect(inventoryOf({ ...answers, equipment: 'full-and-home', inventoryAnsweredFor: 'full-and-home' })).toBeNull();
  });

  it('assumes the pre-P3a items for a profile that never answered (rule 7)', () => {
    for (const equipment of ['home', 'home-and-bodyweight', 'bodyweight'] as const) {
      expect(inventoryOf({ ...answers, equipment })).toEqual(LEGACY_ASSUMED_ITEMS);
      expect(inventoryOf({ ...answers, equipment, inventoryAnsweredFor: null })).toEqual(
        LEGACY_ASSUMED_ITEMS,
      );
    }
  });

  it('reads the home list and the portable list when both were asked', () => {
    expect(
      inventoryOf({
        equipment: 'home',
        inventoryAnsweredFor: 'home',
        homeEquipment: ['dumbbells-20-40', 'treadmill'],
        bodyweightEquipment: ['resistance-bands'],
      }),
    ).toEqual(set('dumbbells', 'resistance-bands'));
  });

  it('takes an empty answer as "have none", not as "never asked"', () => {
    expect(
      inventoryOf({ ...answers, equipment: 'bodyweight', inventoryAnsweredFor: 'bodyweight' }),
    ).toEqual(set('dumbbells', 'bench')); // the bodyweight setup never asks about either
  });

  it('keeps only the answers that still apply after Settings changes the access level', () => {
    // Answered at bodyweight (portable list only), then moved to home: the home list was never
    // asked, so dumbbells and bench fall back to the pre-P3a assumption.
    expect(
      inventoryOf({
        equipment: 'home',
        inventoryAnsweredFor: 'bodyweight',
        homeEquipment: [],
        bodyweightEquipment: ['pull-up-bar'],
      }),
    ).toEqual(set('dumbbells', 'bench', 'pull-up-bar'));
    // Answered at full gym (no list shown), then moved to bodyweight: nothing was asked.
    expect(
      inventoryOf({ ...answers, equipment: 'bodyweight', inventoryAnsweredFor: 'full-gym' }),
    ).toEqual(LEGACY_ASSUMED_ITEMS);
  });

  it('shows the lists exactly where setup asks them', () => {
    expect(ACCESS.filter(showsHomeEquipment)).toEqual(['home-and-bodyweight', 'home', 'full-and-home']);
    expect(ACCESS.filter(showsPortableEquipment)).toEqual([
      'bodyweight',
      'home-and-bodyweight',
      'home',
      'full-and-home',
    ]);
  });
});

describe('fitsInventory', () => {
  it('lets every pre-P3a exercise through the legacy assumption, in every access level (rule 7)', () => {
    for (const id of PRE_P3A_IDS) {
      for (const access of ACCESS) {
        expect({ id, access, fits: fitsInventory(ex(id), access, LEGACY_ASSUMED_ITEMS) }).toEqual({
          id,
          access,
          fits: true,
        });
      }
    }
  });

  it('never filters with a full gym in the access level, whatever the inventory says', () => {
    for (const e of EXERCISES) {
      expect(fitsInventory(e, 'full-gym', set())).toBe(true);
      expect(fitsInventory(e, 'full-and-home', set())).toBe(true);
    }
  });

  it('filters by the items an exercise needs', () => {
    expect(fitsInventory(ex('pull-up'), 'bodyweight', set())).toBe(false);
    expect(fitsInventory(ex('pull-up'), 'bodyweight', set('pull-up-bar'))).toBe(true);
    expect(fitsInventory(ex('incline-db-press'), 'home', set('dumbbells'))).toBe(false);
    expect(fitsInventory(ex('db-floor-press'), 'home', set('dumbbells'))).toBe(true);
    expect(fitsInventory(ex('band-row'), 'home', LEGACY_ASSUMED_ITEMS)).toBe(false);
    expect(fitsInventory(ex('push-up'), 'bodyweight', set())).toBe(true);
  });

  it('lets a custom exercise through: it has no table entry and needs nothing', () => {
    const custom: Exercise = { ...ex('push-up'), id: 'custom-7', name: 'Sled push' };
    expect(fitsInventory(custom, 'bodyweight', set())).toBe(true);
  });
});

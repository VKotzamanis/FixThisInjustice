/**
 * Ordered migration chain for the persisted document.
 *
 * Security review constraint 4: an explicit schemaVersion, an ordered chain, a
 * captured fixture per version, and a refusal to load a version newer than the
 * code. The refusal lives in parseState; this module only walks the chain.
 *
 * Version 3 is the current schema and needs no migration, so the chain is empty.
 * P7 adds the { from: 2, to: 3 } step that converts the legacy fti.console.v2
 * document, including the one-off prompt for whether historical loads were
 * entered in kg or lb.
 */
/*
 * The legacy v2 store lives under a DIFFERENT localStorage key ("fti.console.v2"), so it is
 * not a step of the ordered chain below: the chain walks one `fti.v3` document from an older
 * schemaVersion to the current one, and the v2 import is invoked by the migration wizard with
 * the unit the user names at the prompt. It is re-exported here so this module stays the
 * single entry point for migration code.
 */
export { CUP_ML, applyMigration, migrateV2 } from './v2';
export type {
  ApplyMigrationResult,
  LegacyUnit,
  MigrateV2Options,
  MigrateV2Result,
  MigrationReport,
  MigrationSkip,
} from './v2';

export interface Migration {
  /** Schema version this step accepts. */
  readonly from: number;
  /** Schema version this step produces. Must be from + 1. */
  readonly to: number;
  /** Structural transform only. Never validates; parseState does that after. */
  run(raw: unknown): unknown;
}

export const MIGRATIONS: readonly Migration[] = [];

export type MigrateResult =
  | { ok: true; value: unknown; applied: readonly number[] }
  | { ok: false; error: string };

/**
 * Walks raw from fromVersion up to targetVersion, one step at a time.
 * A gap in the chain is an error, never a silent pass-through: an unmigrated
 * document reaching the validator would be reported as a schema failure and the
 * real cause — a missing migration — would be invisible.
 */
export function migrate(raw: unknown, fromVersion: number, targetVersion: number): MigrateResult {
  if (fromVersion === targetVersion) {
    return { ok: true, value: raw, applied: [] };
  }
  if (fromVersion > targetVersion) {
    return {
      ok: false,
      error: `saved by a newer version of the app (schema ${fromVersion}, this build understands ${targetVersion})`,
    };
  }

  let value = raw;
  const applied: number[] = [];
  for (let v = fromVersion; v < targetVersion; v += 1) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (step === undefined) {
      return { ok: false, error: `no migration from schema version ${v} to ${v + 1}` };
    }
    value = step.run(value);
    applied.push(step.to);
  }
  return { ok: true, value, applied };
}

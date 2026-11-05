// src/store/validate.ts
//
// The one copy of the store's boundary check (spec R5, AGENTS.md rule 2). Every action that
// stores user input parses it with the schema the loader uses, so a value the document could
// not be reloaded with is refused where it is entered, not at the next launch (audit B02).
import type { z } from '../domain/zod';

/**
 * Validates against a schema or throws, naming the field that failed. The message is assembled
 * the way parseState assembles its own (first issue, path then reason) rather than from
 * `error.message`, which in Zod 4 is the serialised issue array.
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const where = first === undefined ? '(root)' : first.path.join('.') || '(root)';
  const why = first === undefined ? 'unknown validation failure' : first.message;
  throw new Error(`${what}: ${where}: ${why}`);
}

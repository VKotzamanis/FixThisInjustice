// src/domain/numberInput.ts
//
// Spec R4 (audit C02/A03): numeric fields are text the app parses, so a decimal comma is never
// dropped by the browser. Pure; no locale lookup: the user's mark is read from what they typed.

/** An optional sign, a whole part, and at most one decimal mark (`.` or `,`) with digits after. */
const DECIMAL = /^([+-]?)(\d*)(?:([.,])(\d*))?$/;

/**
 * The number typed, or null when the text is empty, not a number, or ambiguous. Ambiguous: both
 * marks, more than one mark, or one mark followed by exactly three digits after a non-zero whole
 * part ("1,234", "2.100"): half the locales read that as a thousands group, the other half as a
 * decimal, and a guess there is a 1000x error. "0,125" is accepted: a zero whole part cannot be
 * a group.
 */
export function parseDecimalInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const m = DECIMAL.exec(trimmed);
  if (m === null) return null;
  const sign = m[1] ?? '';
  const whole = m[2] ?? '';
  const mark = m[3];
  const fraction = m[4] ?? '';
  if (whole === '' && fraction === '') return null;
  if (mark !== undefined && fraction.length === 3 && whole !== '' && Number(whole) !== 0) return null;
  const value = Number(`${sign}${whole === '' ? '0' : whole}.${fraction === '' ? '0' : fraction}`);
  return Number.isFinite(value) ? value : null;
}

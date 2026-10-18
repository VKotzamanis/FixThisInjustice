import { describe, expect, it } from 'vitest';
import resolvedAtHead from './__fixtures__/limelight-resolved.json';
import { DEFAULT_COPY, copyFor, type CopyKey } from './copy';

const REMOVED_PICKER_KEYS = [
  'advice.skinChanges',
  'disclosure.skin',
  'hero.skin',
  'label.settingsSkin',
  'option.skinBoard',
  'option.skinClinical',
  'option.skinLimelight',
] as const;

const head = resolvedAtHead as Readonly<Record<string, string>>;

describe('limelight copy parity', () => {
  it('matches every pre-change limelight string except the removed picker-only keys', () => {
    const expectedKeys = Object.keys(head)
      .filter((key) => !REMOVED_PICKER_KEYS.includes(key as (typeof REMOVED_PICKER_KEYS)[number]))
      .sort();
    const currentKeys = Object.keys(DEFAULT_COPY).sort();

    expect(currentKeys).toEqual(expectedKeys);
    for (const key of currentKeys as CopyKey[]) {
      expect({ key, resolved: copyFor('limelight', key) }).toEqual({
        key,
        resolved: head[key],
      });
    }
  });

  it('lists every intentionally removed key explicitly', () => {
    for (const key of REMOVED_PICKER_KEYS) {
      expect({ key, fixture: head[key], current: key in DEFAULT_COPY }).toEqual({
        key,
        fixture: expect.any(String),
        current: false,
      });
    }
  });
});

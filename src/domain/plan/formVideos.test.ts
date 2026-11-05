// ROADMAP L9, audit E05. The clip ids live in two places on purpose: library.ts (what ships) and
// docs/design/form-videos.md (the oEmbed record that proves each id is a real clip of that
// exercise). AGENTS rule 2: this test reads both and holds them equal, so an id cannot be added,
// changed or dropped in one without the other.
import { describe, expect, it } from 'vitest';
import doc from '../../../docs/design/form-videos.md?raw';
import { EXERCISES } from './library';
import { VIDEO_ID_RE } from '../../config/videoInstances';

interface DocRow {
  exercise: string;
  videoId: string | null;
  verified: string;
}

/** Rows of the doc's table: `| \`exercise\` | \`id\` or null | title | channel | length | date |`. */
function docRows(): DocRow[] {
  const rows: DocRow[] = [];
  const row = /^\| `([a-z0-9-]+)` \| (?:`([^`]+)`|null) \|.*\| ([0-9-]+|-) \|$/;
  for (const line of doc.split('\n')) {
    const m = row.exec(line);
    if (m === null) continue;
    rows.push({ exercise: m[1] ?? '', videoId: m[2] ?? null, verified: m[3] ?? '' });
  }
  return rows;
}

describe('form video ids', () => {
  it('gives every non-null library id the 11-character YouTube shape', () => {
    for (const e of EXERCISES) {
      if (e.videoId === null) continue;
      expect({ id: e.id, ok: VIDEO_ID_RE.test(e.videoId) }).toEqual({ id: e.id, ok: true });
    }
  });

  it('agrees with docs/design/form-videos.md row for row', () => {
    const rows = docRows();
    expect(rows.map((r) => r.exercise)).toEqual(EXERCISES.map((e) => e.id));
    expect(Object.fromEntries(rows.map((r) => [r.exercise, r.videoId]))).toEqual(
      Object.fromEntries(EXERCISES.map((e) => [e.id, e.videoId])),
    );
  });

  it('dates every recorded id and explains every null one', () => {
    const rows = docRows();
    for (const r of rows.filter((x) => x.videoId !== null)) {
      expect({ exercise: r.exercise, dated: /^\d{4}-\d{2}-\d{2}$/.test(r.verified) }).toEqual({
        exercise: r.exercise,
        dated: true,
      });
    }
    const nullSection = doc.split('## Null ids')[1]?.split('\n## ')[0] ?? '';
    for (const r of rows.filter((x) => x.videoId === null)) {
      expect({ exercise: r.exercise, explained: nullSection.includes(`\`${r.exercise}\``) }).toEqual({
        exercise: r.exercise,
        explained: true,
      });
    }
  });
});

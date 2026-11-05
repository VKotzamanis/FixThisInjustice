// ROADMAP L6 (owner: "one training ends -> create the next one based on the data logged"): a user
// who finishes the last session of a 12-week plan finds the next block on Today the next day,
// not "Programme Complete". docs/design/programme-engine.md.
import { expect, test } from '@playwright/test';
import type { PlanBlock, PlannedSession } from '../src/domain/types';
import { PROFILE_ID } from './support/constants';
import { chicago, flushWrites, openApp, readDocument, seedDocument, setClock, startFromToday } from './support/app';
import { LABEL } from './support/constants';
import { MONDAY, PLAN_ID, TUESDAY, e2eDocument } from './support/document';

const WEEKS = 12; // [weeks] the old fixed length
const SPW = 3; // [sessions/week]
const LABELS = ['Full body A', 'Full body B', 'Full body C'] as const;

/** A 12-week, 3-a-week plan in the generator's shape: three cycles of 3 training weeks + 1 deload. */
function twelveWeekPlan(): { sessions: PlannedSession[]; blocks: PlanBlock[] } {
  const sessions: PlannedSession[] = [];
  for (let i = 0; i < WEEKS * SPW; i += 1) {
    const label = LABELS[i % SPW] ?? 'Full body A';
    sessions.push({
      id: `l6-s${String(i + 1)}`,
      ordinal: i + 1, // invariant: sessions[i].ordinal === i + 1
      name: `Week ${String(Math.floor(i / SPW) + 1)} ${label}`,
      kind: 'lift',
      label,
      exercises: [
        {
          exerciseId: i % 2 === 0 ? 'barbell-back-squat' : 'barbell-bench-press',
          setsLo: 3, // [sets]
          setsHi: 3, // [sets]
          prescription: { kind: 'reps', lo: 5, hi: 8 }, // [repetitions]
          restS: 120, // [s]
        },
      ],
    });
  }
  const blocks: PlanBlock[] = [];
  for (let c = 0; c < WEEKS / 4; c += 1) {
    const first = c * 4 * SPW; // [sessions]
    blocks.push({ index: 2 * c, firstSessionIndex: first, sessionCount: 3 * SPW, setModifier: 1, loadModifier: 1, isDeload: false });
    blocks.push({ index: 2 * c + 1, firstSessionIndex: first + 3 * SPW, sessionCount: SPW, setModifier: 0.5, loadModifier: 1, isDeload: true });
  }
  return { sessions, blocks };
}

test('L6: finishing the last session of a 12-week plan leaves the next block on Today the next day', async ({ context }) => {
  const base = e2eDocument({ nextSessionIndex: WEEKS * SPW - 1 });
  const { sessions, blocks } = twelveWeekPlan();
  const plan = base.plans[PLAN_ID];
  if (plan === undefined) throw new Error('fixture: plan');
  const availability = base.availability[PROFILE_ID];
  if (availability === undefined) throw new Error('fixture: availability');
  // A user standing at session 36 has already passed every earlier block boundary; without this
  // the fixture's "seen block 0" opens the block-6 cutscene at launch, covering the tab bar.
  const lastBlock = blocks[blocks.length - 1]?.index ?? 0; // [blocks] 0-based PlanBlock.index
  await seedDocument(context, {
    ...base,
    ui: {
      ...base.ui,
      lastBlockSeenByProfile: { [PROFILE_ID]: lastBlock },
      lastBlockSeenByPlan: { [PLAN_ID]: lastBlock },
    },
    plans: { [PLAN_ID]: { ...plan, name: 'Full body x3, 12 weeks, maintenance', sessionsPerWeek: SPW, weeks: WEEKS, sessions, blocks } },
    // Monday, Tuesday, Wednesday, Friday preferred, three a week: Monday's session leaves Tuesday
    // with quota, so the next block's first session is served the next day.
    availability: {
      [PROFILE_ID]: {
        ...availability,
        slots: [1, 2, 3, 5].map((weekday) => ({ weekday: weekday as 1 | 2 | 3 | 5, startTime: '18:00', expectedDurationS: 3600 })),
        weeklySessionTarget: SPW,
      },
    },
  });

  await setClock(context, chicago(MONDAY, '18:00'));
  const monday = await openApp(context);
  await startFromToday(monday);
  await monday.getByRole('button', { name: LABEL.finish }).click({ timeout: 10_000 });
  await monday.getByRole('button', { name: LABEL.finishAnyway, exact: true }).click({ timeout: 10_000 });
  await flushWrites(monday);
  await monday.close();

  await setClock(context, chicago(TUESDAY, '10:00'));
  const tuesday = await openApp(context);
  // The cursor now stands in the appended next block, so the block-boundary cutscene is due
  // (PhaseTransitionGate); a user closes it with its own button before reaching Today.
  const cutscene = tuesday.getByTestId('phase-transition');
  await cutscene.getByRole('button', { name: 'Next', exact: true }).click({ timeout: 10_000 }); // copy.ts button.continue
  await expect(cutscene).toHaveCount(0);
  await tuesday.getByRole('navigation').getByRole('button', { name: LABEL.todayTab, exact: true }).click({ timeout: 10_000 });
  // Session 37 is week 13's first session; the hero names it by position (rotation.ts sessionTitle).
  await expect(tuesday.getByRole('heading', { level: 1, name: /Week 13 Full body A/ })).toBeVisible();
  await expect(tuesday.getByRole('button', { name: LABEL.start })).toBeVisible();
  // hero.programmeComplete, base and limelight words: the finished branch must not render.
  await expect(tuesday.getByText(/Programme Complete\.|the whole run\. done\./)).toHaveCount(0);

  await flushWrites(tuesday);
  const doc = await readDocument(tuesday);
  const cursor = doc.cursors[PROFILE_ID];
  const stored = doc.plans[PLAN_ID];
  expect(cursor?.nextSessionIndex).toBe(WEEKS * SPW);
  expect(cursor?.completedOn).toBeNull();
  expect((stored?.sessions.length ?? 0) - WEEKS * SPW).toBeGreaterThanOrEqual(28); // RUNWAY_SESSIONS
  expect(stored?.sessions.slice(0, WEEKS * SPW).map((s) => s.id)).toEqual(sessions.map((s) => s.id)); // ids kept
  expect(stored?.name).toBe('Full body x3, maintenance'); // the stale length is gone
});

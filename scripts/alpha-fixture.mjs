// scripts/alpha-fixture.mjs
//
// Builds one synthetic fti.v3 document for the alpha walkthrough, and writes it to
// docs/feedback/alpha-fixture.json for import through Settings -> Data -> Export and import.
//
// WHY IT EXISTS. Alpha round 1, claim C0.2. Twenty-two of the walkthrough's eighty-nine steps
// need a state a fresh install cannot reach -- a missed week, a block that has ended, a deload
// under way, an Atlas with cards in it -- so those steps were unreviewable. The owner asked for
// data that need not be realistic but must cover the cases.
//
// WHY IT DRIVES THE STORE INSTEAD OF SPELLING OUT JSON. Cursors, assignments and weekly reviews
// are DERIVED: a hand-written document can be schema-valid and still describe a state the app
// can never produce, and reviewing screens against an impossible state teaches nothing. Every
// fact here is written by the same action the app calls, then exported through the same
// exportJson the user's own backup uses, so the document is reachable by construction.
//
// Units: mass kg, load kg, volume mL, time epoch ms. Dates are LocalDate in the profile's zone.

import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}docs/feedback/alpha-fixture.json`;

const PROFILE_ID = 'alpha-demo';
const TZ = 'America/Chicago';
/** The fixture's "today". Fixed, so two runs of this script produce the same document. */
const TODAY = '2026-09-04';
const NOW_MS = Date.UTC(2026, 8, 4, 15, 0); // [ms] 2026-09-04T15:00Z

const DAY_MS = 86_400_000; // [ms/day]

/** LocalDate n days before TODAY. Plain UTC arithmetic: the fixture's zone has no DST here. */
function daysBefore(n) {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
}

async function main() {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  const { useAppStore } = await server.ssrLoadModule('/src/store/index.ts');
  const { generatePlan } = await server.ssrLoadModule('/src/domain/plan/generator.ts');
  const { EXERCISES } = await server.ssrLoadModule('/src/domain/plan/library.ts');
  const { parseState } = await server.ssrLoadModule('/src/domain/schema.ts');
  const { SPECIMEN_CARDS, SPECIMEN_RARITIES } = await server.ssrLoadModule(
    '/src/content/specimenCards.ts',
  );

  const store = () => useAppStore.getState();

  /*
   * The profile. IMPERIAL on purpose: it is the unit system the round-1 girth defect corrupted,
   * so a reviewer looking at the Log and Targets screens is looking at the path that was wrong.
   * baselineBodyFatPct is null, which is the branch that routes RMR to Mifflin-St Jeor and
   * protein to the body-mass rule -- the fallback the walkthrough never otherwise shows.
   */
  store().createProfile({
    id: PROFILE_ID,
    displayName: 'Alpha',
    timezone: TZ,
    units: 'imperial',
    createdAt: NOW_MS - 70 * DAY_MS,
    body: {
      sex: 'male',
      birthYear: 1996,
      heightCm: 178,
      baselineMassKg: 84,
      baselineAt: daysBefore(70),
      baselineBodyFatPct: null,
    },
    activity: 'moderate',
    experience: 'intermediate',
    equipment: 'full-gym',
    equipmentSteps: {
      barbellKg: 2.5,
      dumbbellPairKg: 5,
      stackKg: 5,
      hasMicroPlates: false,
      microPlateKg: 0.5,
    },
    goal: { kind: 'fat-loss', targetMassKg: 78, targetBodyFatPct: null, targetDate: '2026-12-01' },
    supplements: { creatine: true },
    hydration: { dailyTargetML: 3000, cupSizeML: 250, weighInOptIn: true },
    readiness: { screenedAt: daysBefore(70), flagged: false },
  });
  store().setActiveProfile(PROFILE_ID);

  store().setAvailability(PROFILE_ID, {
    slots: [
      { weekday: 1, startTime: '18:00', expectedDurationS: 3600 },
      { weekday: 3, startTime: '18:00', expectedDurationS: 3600 },
      { weekday: 5, startTime: '18:00', expectedDurationS: 3600 },
    ],
    weeklySessionTarget: 3,
  });

  /*
   * Twelve weeks at three sessions a week. Twelve rather than the eight-week minimum because
   * BLOCK_WEEKS is 4: twelve weeks is three cycles, so the document carries a block that has
   * ENDED, a deload that has been through, and a block under way -- the three block states the
   * Plan view distinguishes and a fresh install shows none of.
   */
  const plan = generatePlan(
    {
      sessionsPerWeek: 3,
      weeks: 12,
      goal: 'fat-loss',
      experience: 'intermediate',
      equipment: 'full-gym',
      includeCardio: true,
    },
    EXERCISES,
  );
  store().setPlan(PROFILE_ID, plan, daysBefore(63));

  /*
   * Nine weeks of history, walked forward one assigned day at a time.
   *
   * Week 6 counted from the start is deliberately left with ONE completed session against a
   * target of three, so closeWeeks writes a WeeklyReview with delta -2. That is the missed week
   * the intervention, the motivation clip and the Today verdict all key off, and it is the state
   * the walkthrough marks skippable in four separate steps.
   */
  const MISSED_WEEK_INDEX = 5; // 0-based; the sixth week of the plan
  let logged = 0; // [sets]
  for (let week = 0; week < 9; week += 1) {
    for (let day = 0; day < 3; day += 1) {
      const date = daysBefore(63 - (week * 7 + day * 2));
      const skipThis = week === MISSED_WEEK_INDEX && day > 0;
      if (skipThis) {
        store().skipSession(PROFILE_ID, date, 'travel');
        continue;
      }
      store().startSession(PROFILE_ID, date, NOW_MS);
      const assignment = store()
        .assignments[PROFILE_ID]?.find((a) => a.date === date);
      const session = plan.sessions.find((s) => s.id === assignment?.sessionId);
      for (const ex of session?.exercises.slice(0, 3) ?? []) {
        for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
          store().logSet(
            {
              profileId: PROFILE_ID,
              assignmentDate: date,
              sessionId: session.id,
              exerciseId: ex.exerciseId,
              setNumber,
              isBonus: false,
              loadKg: 40 + week * 2.5, // [kg]
              enteredUnit: 'imperial',
              reps: 8,
              durationS: null,
              rpe: 8,
            },
            NOW_MS - (63 - week * 7) * DAY_MS,
          );
          logged += 1;
        }
      }
      store().completeSession(PROFILE_ID, date, NOW_MS - (63 - week * 7) * DAY_MS);
    }
    // A body mass entry per week, so the Log view's projection chart has a real series.
    store().logBodyMass(
      {
        profileId: PROFILE_ID,
        date: daysBefore(63 - week * 7),
        massKg: 84 - week * 0.55, // [kg], about 0.65 %BW/week, inside the Garthe band
        enteredUnit: 'imperial',
        bodyFatPct: null,
      },
      NOW_MS - (63 - week * 7) * DAY_MS,
    );
  }

  // Hydration for the last three days, so the Today ring is neither empty nor full.
  for (const [n, ml] of [[2, 2100], [1, 2600], [0, 900]]) {
    store().addHydration(PROFILE_ID, daysBefore(n), ml, NOW_MS - n * DAY_MS);
  }

  /*
   * The Atlas. Logging sets already draws cards at random, but a random draw does not guarantee
   * one of each rarity, and the walkthrough has a step per rarity band plus a locked-slot step.
   * One card of each rarity is recorded explicitly so all four states are on screen, and the
   * rest of the set stays locked, which is the state the locked slot exists to show.
   */
  const firstOfEachRarity = SPECIMEN_RARITIES.map((rarity) =>
    SPECIMEN_CARDS.find((card) => card.rarity === rarity),
  ).filter((card) => card !== undefined);
  if (firstOfEachRarity.length !== SPECIMEN_RARITIES.length) {
    throw new Error('fixture: a rarity band has no card, so the Atlas steps cannot be covered');
  }
  firstOfEachRarity.forEach((card, i) => {
    // Ordinals below the live set count, so they cannot collide with a draw already recorded.
    store().recordSpecimen(PROFILE_ID, i + 1, card.id, null, NOW_MS);
  });

  /*
   * Reminders. Stored settings only: the panel's seven states are mostly BROWSER facts --
   * permission denied, push unsupported, no subscription -- and no document can set them. What
   * a document can carry is the enabled setting and its lead times, which is the state a
   * reviewer needs to read the panel's copy at all.
   */
  store().setReminderSettings(PROFILE_ID, {
    enabled: true,
    dayOfTime: '08:00',
    leadMinutes: [120, 60],
  });

  /*
   * A time capsule that is already open-able, so the Extras step shows the opened branch rather
   * than the empty one.
   */
  store().setCapsule(PROFILE_ID, {
    note: 'Started at 84 kg and a bar that felt heavy.',
    writtenAt: NOW_MS - 63 * DAY_MS,
    opensOn: daysBefore(7),
    opened: false,
  });

  // Close every elapsed week. This is what writes the WeeklyReview rows, the missed ones included.
  store().closeWeeks(PROFILE_ID, NOW_MS);

  const state = store().exportJson();
  const parsed = parseState(JSON.parse(state));
  if (!parsed.ok) throw new Error(`fixture failed its own schema: ${parsed.error}`);

  const doc = parsed.state;
  const reviews = doc.weeklyReviews[PROFILE_ID] ?? [];
  const missed = reviews.filter((r) => r.delta < 0 && !r.paused);
  const cursor = doc.cursors[PROFILE_ID];

  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
  await server.close();

  console.log(`sets ${logged}`);
  console.log(`weeks closed ${reviews.length} missed ${missed.length}`);
  console.log(`cursor at session ${cursor?.nextSessionIndex ?? 0} of ${plan.sessions.length}`);
  console.log(`blocks ${plan.blocks.length} deloads ${plan.blocks.filter((b) => b.isDeload).length}`);
  console.log(`body mass entries ${(doc.bodyMass[PROFILE_ID] ?? []).length}`);
  const acquired = Object.keys(doc.specimens[PROFILE_ID]?.acquired ?? {});
  const rarities = new Set(
    acquired.map((id) => SPECIMEN_CARDS.find((c) => c.id === id)?.rarity).filter(Boolean),
  );
  console.log(`atlas ${acquired.length} of ${SPECIMEN_CARDS.length} cards, rarities ${[...rarities].sort().join(' ')}`);
  console.log(`reminders ${doc.reminderSettings[PROFILE_ID]?.enabled === true ? 'on' : 'off'}`);
  console.log(`capsule ${doc.capsules[PROFILE_ID] === null || doc.capsules[PROFILE_ID] === undefined ? 'none' : 'written'}`);
  console.log(`wrote ${OUT.replace(ROOT, '')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

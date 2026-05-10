// Shared plan data — single source of truth for all three prototypes.
// All numbers come from the user's measured baseline.

window.PLAN = {
  subject: {
    weight_kg: 95.3,
    weight_lb: 210,
    bf_pct: 27,
    fat_kg: 25.7,
    lean_kg: 69.6,
    target_bf: 12,
    target_kg: 79,
    target_lb: 174,
    fat_to_lose_kg: 16,
    fat_to_lose_lb: 36,
    protein_g: 190,
    creatine_g: 5,
  },

  phases: [
    {
      n: 1,
      key: "reactivation",
      name: "Reactivation",
      weeks: [1, 8],
      kcal: "2,000 → 2,200",
      kcal_range: [2000, 2200],
      summary: "Build the habit above all else. Conservative loads. 2→3 sets. Trap bar deadlift only — connective tissue catches up to muscle memory.",
      milestones: {
        weight_lb: 202,
        bench_kg: 80,
        bench_reps: 8,
        pushups: 20,
      },
    },
    {
      n: 2,
      key: "building",
      name: "Building",
      weeks: [9, 16],
      kcal: "2,350",
      kcal_range: [2350, 2350],
      summary: "Full training volume. Conventional deadlift reintroduced. Bulgarian split squats active. Progressive overload is the entire job.",
      milestones: {
        weight_lb: 192,
        bench_kg: 100,
        bench_reps: 8,
        pushups: 35,
      },
    },
    {
      n: 3,
      key: "peak",
      name: "Peak",
      weeks: [17, 24],
      kcal: "2,350",
      kcal_range: [2350, 2350],
      summary: "Intensity rises. Body composition refinement. Graduation — different person.",
      milestones: {
        weight_lb: 183,
        bench_kg: 110,
        bench_reps: 8,
        pushups: 50,
      },
    },
  ],

  // Weekly weight projection (lb), 24 weeks. Start 210, end ~183.
  // Curve: faster early loss in deficit, tapers as TDEE rises.
  weight_curve_lb: [
    210, 208.4, 207.0, 205.7, 204.5, 203.3, 202.0, 201.1,  // P1
    199.8, 198.4, 197.0, 195.7, 194.4, 193.2, 192.0, 191.0, // P2
    190.0, 189.0, 187.9, 186.8, 185.8, 184.9, 184.0, 183.2, // P3
  ],

  // Volume schedule: deload weeks marked.
  volume: [
    { wk: 1, sets: 2, note: "Baseline — establish form" },
    { wk: 2, sets: 2, note: "Same loads, refine technique" },
    { wk: 3, sets: 3, note: "Add a working set" },
    { wk: 4, sets: 3 },
    { wk: 5, sets: 3, note: "Bulgarian split squats introduced" },
    { wk: 6, sets: 2, deload: true, note: "Deload — 40% load reduction" },
    { wk: 7, sets: 3 },
    { wk: 8, sets: 4, note: "Body fat re-measure" },
    { wk: 9, sets: 4, note: "Conventional deadlift reintroduced" },
    { wk: 10, sets: 4 },
    { wk: 11, sets: 4 },
    { wk: 12, sets: 2, deload: true, note: "Deload" },
    { wk: 13, sets: 4 },
    { wk: 14, sets: 4 },
    { wk: 15, sets: 4 },
    { wk: 16, sets: 4, note: "Body fat re-measure" },
    { wk: 17, sets: 4, note: "Intensity phase begins" },
    { wk: 18, sets: 2, deload: true, note: "Deload" },
    { wk: 19, sets: 4 },
    { wk: 20, sets: 4 },
    { wk: 21, sets: 4 },
    { wk: 22, sets: 4 },
    { wk: 23, sets: 4 },
    { wk: 24, sets: 2, deload: true, note: "Deload — graduation week" },
  ],

  pushup_progression: [
    { week: 1, target: 8 }, { week: 2, target: 10 }, { week: 3, target: 11 },
    { week: 4, target: 12 }, { week: 5, target: 14 }, { week: 6, target: 15 },
    { week: 7, target: 17 }, { week: 8, target: 20 }, { week: 9, target: 22 },
    { week: 10, target: 24 }, { week: 11, target: 26 }, { week: 12, target: 28 },
    { week: 13, target: 30 }, { week: 14, target: 32 }, { week: 15, target: 33 },
    { week: 16, target: 35 }, { week: 17, target: 37 }, { week: 18, target: 39 },
    { week: 19, target: 42 }, { week: 20, target: 44 }, { week: 21, target: 46 },
    { week: 22, target: 48 }, { week: 23, target: 49 }, { week: 24, target: 50 },
  ],

  days: [
    {
      n: 1,
      name: "Push",
      sub: "Chest · Shoulders · Triceps",
      kind: "lift",
      pushups: false,
      exercises: [
        { name: "Barbell bench press",     sets: "2→4", reps: "6–8",   note: "Start at 65 kg", video: "vcBig73ojpE" },
        { name: "Overhead press (barbell)", sets: "2→4", reps: "8–10", video: "5yWaNOvgFCM" },
        { name: "Incline DB press",         sets: "2→3", reps: "10–12", video: "5CECBjd7HLQ" },
        { name: "Lateral raises",           sets: "2→3", reps: "12–15", video: "OuGcjY1Z8Cg" },
        { name: "Tricep overhead extension",sets: "2→3", reps: "12", video: "_gsUck-7M9Y" },
      ],
    },
    {
      n: 2,
      name: "Pull",
      sub: "Back · Biceps",
      kind: "lift",
      pushups: true,
      exercises: [
        { name: "Pull-ups (or lat pulldown)",sets: "2→4", reps: "max", video: "eGo4IYlbE5g" },
        { name: "Barbell row (Pendlay)",    sets: "2→4", reps: "6–8", video: "FWJR5Ve8bnQ" },
        { name: "DB single-arm row",        sets: "2→3", reps: "10–12", video: "pYcpY20QaE8" },
        { name: "Face pulls",               sets: "3",   reps: "15–20", note: "Mandatory — every Pull day, forever", video: "V8dZ3pyiCBo" },
        { name: "Barbell bicep curl",       sets: "2→3", reps: "10–12", video: "kwG2ipFRgfo" },
        { name: "Hammer curl",              sets: "2",   reps: "12", video: "TwD-YGVP4Bk" },
      ],
    },
    {
      n: 3,
      name: "Legs",
      sub: "Squat-focused",
      kind: "lift",
      pushups: true,
      exercises: [
        { name: "Barbell back squat",        sets: "2→4", reps: "6–8",   note: "60% of previous max", video: "SW_C1A-rejs" },
        { name: "Romanian deadlift",         sets: "2→3", reps: "10–12", video: "FQ_xVGuMQX0" },
        { name: "Leg press → Bulgarian split", sets: "2→3", reps: "10–12", note: "Bulgarian from wk 5", video: "2C-uNgKwPLE" },
        { name: "Leg curl (machine)",        sets: "2→3", reps: "12–15", video: "1Tq3QdYUuHs" },
        { name: "Calf raise",                sets: "3→4", reps: "15–20", video: "-M4-G8p8fmc" },
      ],
    },
    {
      n: 4,
      name: "Rest",
      sub: "Active recovery · Thesis day",
      kind: "rest",
      pushups: true,
      exercises: [
        { name: "Push-ups (3 × max)", sets: "3", reps: "max", note: "Daily push-up sets only", video: "IODxDxX7oi4" },
        { name: "Light walk", sets: "—", reps: "20–30 min", note: "Optional" },
      ],
    },
    {
      n: 5,
      name: "Upper Power",
      sub: "Heavy compound day",
      kind: "lift",
      pushups: false,
      exercises: [
        { name: "Trap bar DL → conventional", sets: "4", reps: "4–5", note: "Conventional from wk 9. Always first.", video: "r4MzxtBKyNE" },
        { name: "Weighted pull-ups",         sets: "3", reps: "6–8", video: "eGo4IYlbE5g" },
        { name: "Close-grip bench press",    sets: "3", reps: "6–8", video: "nEF0bv2FW94" },
        { name: "Barbell row (heavier)",     sets: "3", reps: "5–6", video: "FWJR5Ve8bnQ" },
        { name: "Push press",                sets: "3", reps: "6", video: "iaBVSJm78ko" },
      ],
    },
    {
      n: 6,
      name: "Cardio + Core",
      sub: "Conditioning",
      kind: "cardio",
      pushups: true,
      exercises: [
        { name: "Rower intervals", sets: "—", reps: "20 min", note: "1 min hard / 2 min easy", video: "H0r_ZPXJLtg" },
        { name: "Stair climber",   sets: "—", reps: "20 min", note: "Steady moderate" },
        { name: "Plank",           sets: "3", reps: "60 s", video: "pSHjTRCQxIw" },
        { name: "Ab wheel rollout",sets: "3", reps: "10", video: "_yflEa9PV4w" },
        { name: "Hanging knee raise", sets: "3", reps: "12–15", video: "hdng3Nm1x_E" },
      ],
    },
    {
      n: 7,
      name: "Full Rest",
      sub: "Structural recovery",
      kind: "rest",
      pushups: false,
      exercises: [
        { name: "No training", sets: "—", reps: "—", note: "Muscle is built during recovery, not the session" },
      ],
    },
  ],

  schedule: [
    { time: "08:30", what: "Wake. Vyvanse 40 mg. Vietnamese coffee (1–2 sticks).", tag: "stim" },
    { time: "09:00", what: "Gym. Fasted. YMCA empty.", tag: "train" },
    { time: "10:15", what: "Shower at YMCA.", tag: "—" },
    { time: "10:45", what: "Desk. Egg wrap (made night before).", tag: "feed" },
    { time: "10:45", what: "Creatine 5 g · Vit D3 2,000 IU · Fish oil 2–3 g (with food).", tag: "supp" },
    { time: "12:30", what: "Vyvanse peak. Whey + whole milk. Thesis.", tag: "feed" },
    { time: "15:30", what: "Chicken pita + 20 g almonds. Greek yogurt if possible.", tag: "feed" },
    { time: "19:30", what: "Big dinner. Salmon bowl or chicken rice.", tag: "feed" },
    { time: "22:30", what: "Magnesium glycinate 200–400 mg before bed.", tag: "supp" },
  ],

  meals: [
    { meal: "Fasted gym",       what: "Vyvanse + Vietnamese coffee", kcal: 70,  p: 1  },
    { meal: "Post-workout",     what: "4 eggs + 2 cheese + wrap + spinach + lemon", kcal: 590, p: 42 },
    { meal: "Work shake (12)",  what: "Kirkland whey + 250 ml whole milk", kcal: 250, p: 33 },
    { meal: "Afternoon",        what: "150 g rotisserie chicken + pita + tzatziki + spinach + 20 g almonds", kcal: 560, p: 52 },
    { meal: "Snack",            what: "200 g plain Greek yogurt", kcal: 120, p: 20 },
    { meal: "Dinner",           what: "180 g salmon + 130 g rice + frozen veg + seaweed", kcal: 680, p: 48 },
    { meal: "Sweet tooth",      what: "80 g frozen mango (Costco)", kcal: 70, p: 1 },
  ],

  macros: { kcal: 2350, protein: 190, carbs: 248, fat: 66 },

  supplements: [
    { name: "Creatine monohydrate", dose: "5 g/day",       note: "With post-workout egg wrap" },
    { name: "Kirkland whey",        dose: "1–2 scoops/day", note: "Mix with whole milk" },
    { name: "Vitamin D3",           dose: "2,000 IU/day",   note: "Indoor PhD deficiency risk" },
    { name: "Fish oil (EPA+DHA)",   dose: "2–3 g/day",      note: "Joint + inflammation" },
    { name: "Magnesium glycinate",  dose: "200–400 mg PM",  note: "Sleep depth" },
  ],

  protocols: {
    deload: {
      title: "Deload",
      cadence: "Weeks 6, 12, 18, 24",
      rules: [
        "Reduce all sets to 2",
        "Reduce weight by 40%",
        "No cardio",
        "Eat 200 kcal more than usual",
        "One week only — non-negotiable",
      ],
      note: "You will almost always feel stronger the week after a deload. Accumulated fatigue masks fitness.",
    },
    plateau: {
      title: "Plateau",
      cadence: "Scale stalls 2+ weeks",
      rules: [
        "Verify tracking accuracy first — hidden oils are the most common phantom plateau",
        "If accurate: reduce kcal by 150 only. Add one rowing session. Wait 2 weeks.",
        "Past 4 weeks of stall: take a deload before any other adjustment",
      ],
    },
    fallback: {
      title: "Fallback (Thesis crunch)",
      cadence: "Triggers: deadline ≤ 72 h OR sleep < 5.5 h × 3 nights",
      rules: [
        "Max duration: 2 consecutive weeks",
        "Return when sleep > 6 h average",
        "3 sessions/wk — Push, Pull, Legs only",
        "Eat 2,500 kcal — more, not less",
        "Protein still 190 g — non-negotiable",
        "Cannot enter because you are tired. Only the two triggers activate it.",
      ],
    },
  },

  rules: [
    "Vietnamese coffee — stays, every morning",
    "Homemade bread — stays, makes you full, use it",
    "No Biscoff in the house — purchasing rule, not willpower",
    "Face pulls — every Pull day, forever, no exceptions",
    "Sleep — 7 h minimum, YMCA shower routine makes this possible",
    "Track everything for the first 4 weeks — especially cooking oils",
    "On compound sets: RPE 7–8 max. Vyvanse + caffeine elevate HR.",
    "Drink 3.5 L water daily — Vyvanse causes mild dehydration",
  ],
};

#!/usr/bin/env python3
"""Remove named-individual health data from the legacy tree before the first commit.

Each entry is (path, exact_old_text, new_text). Every replacement must match
exactly once; a miss aborts before any file is written, so a partial scrub is
impossible. Sources: docs/review/2026-09-01-content-peer-review.md section 7
(lines 193-223) and docs/review/2026-09-01-security-review.md finding H1.
"""
import sys

EDITS = [
    # --- security H1: body-composition profile (data.js:2, 5-18) ---
    ("data.js",
     """// All numbers come from the user's measured baseline.""",
     """// Subject figures are placeholders; real values are per-user state (H1)."""),
    ("data.js",
     """  subject: {
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
  },""",
     """  // Placeholder template values. The real figures are per-user state entered
  // at setup and never ship in source (security review H1).
  subject: {
    weight_kg: 0,
    weight_lb: 0,
    bf_pct: 0,
    fat_kg: 0,
    lean_kg: 0,
    target_bf: 0,
    target_kg: 0,
    target_lb: 0,
    fat_to_lose_kg: 0,
    fat_to_lose_lb: 0,
    protein_g: 0,
    creatine_g: 0,
  },"""),

    # --- content review section 7 items 1-3: schedule and meal medication lines ---
    ("data.js",
     """    { time: "08:30", what: "Wake. Vyvanse 40 mg. Vietnamese coffee (1–2 sticks).", tag: "stim" },
    { time: "09:00", what: "Gym. Fasted. YMCA empty.", tag: "train" },
    { time: "10:15", what: "Shower at YMCA.", tag: "—" },""",
     """    { time: "08:30", what: "Wake.", tag: "wake" },
    { time: "09:00", what: "Training session. Fasted.", tag: "train" },"""),
    ("data.js",
     """    { time: "12:30", what: "Vyvanse peak. Whey + whole milk. Thesis.", tag: "feed" },""",
     """    { time: "12:30", what: "Whey + whole milk.", tag: "feed" },"""),
    ("data.js",
     """    { time: "22:30", what: "Magnesium glycinate 200–400 mg before bed.", tag: "supp" },
""",
     ""),
    ("data.js",
     """    { meal: "Fasted gym",       what: "Vyvanse + Vietnamese coffee", kcal: 70,  p: 1  },""",
     """    { meal: "Pre-training",     what: "Black coffee", kcal: 5,   p: 0  },"""),
    ("data.js",
     """    { meal: "Work shake (12)",  what: "Kirkland whey + 250 ml whole milk", kcal: 250, p: 33 },""",
     """    { meal: "Work shake (12)",  what: "Whey + 250 ml whole milk", kcal: 250, p: 33 },"""),
    ("data.js",
     """    { name: "Kirkland whey",        dose: "1–2 scoops/day", note: "Mix with whole milk" },""",
     """    { name: "Whey protein",         dose: "1–2 scoops/day", note: "Mix with whole milk" },"""),
    ("data.js",
     """    { name: "Vitamin D3",           dose: "2,000 IU/day",   note: "Indoor PhD deficiency risk" },""",
     """    { name: "Vitamin D3",           dose: "2,000 IU/day",   note: "Low sun exposure" },"""),
    ("data.js",
     """    { name: "Magnesium glycinate",  dose: "200–400 mg PM",  note: "Sleep depth" },
""",
     ""),
    ("data.js",
     """      title: "Fallback (Thesis crunch)",""",
     """      title: "Fallback (high-load period)","""),
    # --- content review section 7 items 4-5 plus the personal purchasing rules ---
    ("data.js",
     """  rules: [
    "Vietnamese coffee — stays, every morning",
    "Homemade bread — stays, makes you full, use it",
    "No Biscoff in the house — purchasing rule, not willpower",
    "Face pulls — every Pull day, forever, no exceptions",
    "Sleep — 7 h minimum, YMCA shower routine makes this possible",
    "Track everything for the first 4 weeks — especially cooking oils",
    "On compound sets: RPE 7–8 max. Vyvanse + caffeine elevate HR.",
    "Drink 3.5 L water daily — Vyvanse causes mild dehydration",
  ],""",
     """  rules: [
    "Face pulls — every Pull day, forever, no exceptions",
    "Sleep — 7 h minimum",
    "Track everything for the first 4 weeks — especially cooking oils",
    "On compound sets: RPE 7–8 max.",
    "Drink to thirst; check daily total against the profile target",
  ],"""),
    ("data.js",
     """      sub: "Active recovery · Thesis day",""",
     """      sub: "Active recovery day","""),

    # --- content review section 7 items 6-7: specimen cards c007 and c013 ---
    ("console-content.js",
     """  { id: "c007", rarity: "common", title: "Vyvanse and the heart", category: "supplements",
    body: "Lisdexamfetamine raises resting heart rate by 5-15 bpm and systolic BP by 3-7 mmHg. Combined with caffeine and the cardiovascular load of heavy lifting, training RPE feels artificially elevated. Cap working sets at RPE 8, not RPE 10.",
    source: "Coghill et al. (2014), CNS Drugs." },
""",
     ""),
    ("console-content.js",
     """  { id: "c013", rarity: "common", title: "Hydration and Vyvanse", category: "supplements",
    body: "Amphetamines reduce thirst sensitivity and mildly increase urination via vasoconstriction. Daily fluid intake should be 3-4 L for someone on 40 mg lisdexamfetamine plus training. Dehydration is the single most common cause of 'amphetamine headaches'.",
    source: "Boellner et al. (2010), Pediatrics." },
""",
     ""),

    # --- content review section 7 item 8: store comment ---
    ("console-store.jsx",
     """// Vyvanse + caffeine RPE warning applies on Push/Pull/Legs/UpperPower compound primary lifts.""",
     """// RPE cap applies on Push/Pull/Legs/UpperPower compound primary lifts."""),

    # --- content review section 7 items 9-10: train view tooltip and hint ---
    ("console-train.jsx",
     """title="Vyvanse + caffeine elevate HR. Cap at RPE 7-8.">""",
     """title="Cap working sets at RPE 7-8.">"""),
    ("console-train.jsx",
     """                ⚠ heavy compound — water 500ml between sets · keep RPE ≤ 8""",
     """                ⚠ heavy compound — keep RPE ≤ 8"""),

    # --- content review section 7 scope note: independent copies ---
    ("console-shared.jsx",
     """    "  · mass        95.3 kg / 210 lb",
    "  · bf%         27.0 %",
    "  · lean        69.6 kg",
    "  · target      79.0 kg / 12 % bf",
""",
     ""),
    ("console-shared.jsx",
     """    "Calibrating Vyvanse curve .................... OK",
""",
     ""),
    ("console-shared.jsx",
     """  CRT, TopBar, Nav, Boot, Setup, Spotlight, AsciiBar, ComplianceGrid, VyvanseCurve, VIEWS,""",
     """  CRT, TopBar, Nav, Boot, Setup, Spotlight, AsciiBar, ComplianceGrid, VIEWS,"""),
    ("console-views.jsx",
     """              <div className="card-eyebrow">SCHEDULE · VYVANSE-AWARE</div>""",
     """              <div className="card-eyebrow">SCHEDULE</div>"""),
    ("console-views.jsx",
     """            <div className="card-meta">8:30 dose</div>
          </div>
          <VyvanseCurve height={70} />
""",
     """          </div>
"""),
    ("console-views.jsx",
     """            tap to fill / unfill · Vyvanse causes mild dehydration — compounds with training sweat""",
     """            tap to fill / unfill"""),
    ("console-views.jsx",
     """        <div>1. Thesis deadline within 72 h?</div>""",
     """        <div>1. Hard deadline within 72 h?</div>"""),
    ("console-today-extras.jsx",
     """<span className="meal-crit" title="Vyvanse-fragile — protein at risk if skipped">!</span>""",
     """<span className="meal-crit" title="Protein at risk if skipped">!</span>"""),
    ("console-today-extras.jsx",
     """          Add a second whey scoop to recover. Liquid protein survives Vyvanse appetite suppression.""",
     """          Add a second whey scoop to recover."""),
    ("console-content.js",
     """    body: "Detraining studies show ONE hard set per muscle group per week, taken to within 2 reps of failure, maintains ~95% of strength for 8-12 weeks. The 'use it or lose it' threshold is much lower than people fear during travel/illness/thesis crunches.",""",
     """    body: "Detraining studies show ONE hard set per muscle group per week, taken to within 2 reps of failure, maintains ~95% of strength for 8-12 weeks. The 'use it or lose it' threshold is much lower than people fear during travel or illness.","""),
]

# (path, first line of the block to delete, first line that must survive, sentinel)
BLOCK_DELETIONS = [
    ("console-shared.jsx",
     "// ============ Vyvanse curve (drawn through schedule) ============",
     "Object.assign(window, {",
     "VyvanseCurve"),
]


def main() -> int:
    texts = {}
    for path, old, new in EDITS:
        if path not in texts:
            with open(path, encoding="utf-8") as fh:
                texts[path] = fh.read()
        count = texts[path].count(old)
        if count != 1:
            print(f"ABORT: {path}: expected 1 match, found {count} for:\n{old[:120]!r}", file=sys.stderr)
            return 1
        texts[path] = texts[path].replace(old, new, 1)
    for path, start_marker, end_marker, sentinel in BLOCK_DELETIONS:
        if path not in texts:
            with open(path, encoding="utf-8") as fh:
                texts[path] = fh.read()
        text = texts[path]
        if text.count(start_marker) != 1 or text.count(end_marker) != 1:
            print(f"ABORT: {path}: block markers are not unique", file=sys.stderr)
            return 1
        start = text.index(start_marker)
        end = text.index(end_marker)
        if not start < end:
            print(f"ABORT: {path}: end marker precedes start marker", file=sys.stderr)
            return 1
        block = text[start:end]
        if sentinel not in block:
            print(f"ABORT: {path}: block does not contain {sentinel!r}", file=sys.stderr)
            return 1
        texts[path] = text[:start] + text[end:]

    for path, text in texts.items():
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"scrubbed {path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

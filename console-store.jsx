// console-store.jsx — state + selectors for the Console app.
// Single source of truth. Persists to localStorage.

const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } = React;

const STORE_KEY_V2 = "fti.console.v2";

function loadV2() {
  try {
    const raw = localStorage.getItem(STORE_KEY_V2);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function saveV2(s) {
  try { localStorage.setItem(STORE_KEY_V2, JSON.stringify(s)); } catch (e) {}
}

const todayISO = () => new Date().toISOString().slice(0, 10);
function isoDaysBetween(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.floor((db - da) / 86400000);
}
function isoOffset(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Derive (week, day-of-week 1-7) from start date and today.
// Day of week here = day in the 7-day program rotation, NOT calendar weekday.
// Day 1 of program is the start date.
function programPosition(startDate) {
  if (!startDate) return { day_idx: 0, week: 1, doW: 1 };
  const days = isoDaysBetween(startDate, todayISO());
  if (days < 0) return { day_idx: 0, week: 1, doW: 1, future: true };
  if (days >= 168) return { day_idx: 167, week: 24, doW: 7, past: true };
  const day_idx = days; // 0..167
  const week = Math.floor(day_idx / 7) + 1;
  const doW = (day_idx % 7) + 1;
  return { day_idx, week, doW };
}

// Default factory.
function defaultState() {
  return {
    // setup
    startDate: null,         // null = not started; user picks a Monday in setup
    bootSeen: false,         // boot sequence already played
    // navigation
    view: "today",           // today | train | plan | log | protocols
    week: 1,                 // currently SELECTED week (plan/log can scrub)
    day: 1,                  // currently SELECTED day
    // logged data
    sets: {},                // key `${week}-${day}-${exIdx}-${setN}` -> { weight, reps, ts }
    completed: {},           // key `${week}-${day}-${exIdx}` -> bool (whole exercise done)
    weightLog: [],           // [{ wk, lb, ts }]
    pushupLog: {},           // wk -> max
    water: {},               // ISO date -> int (cups consumed today)
    waterTarget: 7,          // 500 ml × 7 = 3.5 L
    notes: {},               // ISO date -> string
    mealSwaps: {},           // mealIndex -> swap text
    mealOutNote: "",         // single planned-meal-out note
    streak: { last: null, count: 0 },
    // tweaks
    tweaks: { accent: "#a3e635", scanlines: true, flicker: true, density: "comfortable" },
  };
}

function usePlanStore() {
  const [s, setS] = useState(() => {
    const persisted = loadV2();
    return { ...defaultState(), ...(persisted || {}) };
  });
  useEffect(() => { saveV2(s); }, [s]);

  // Auto-sync week/day to today's position whenever startDate is set
  // and view becomes "today" (or on first load).
  useEffect(() => {
    if (!s.startDate) return;
    const pos = programPosition(s.startDate);
    if (pos.week !== s.week || pos.doW !== s.day) {
      // Only auto-sync if we're on the today view OR haven't manually scrubbed.
      // Always sync on first interaction.
      if (s.view === "today" || s.view === "train") {
        setS((p) => ({ ...p, week: pos.week, day: pos.doW }));
      }
    }
    // eslint-disable-next-line
  }, [s.startDate, s.view]);

  const update = useCallback((patch) => {
    setS((p) => (typeof patch === "function" ? patch(p) : { ...p, ...patch }));
  }, []);

  const setView = (v) => update({ view: v });
  const setWeek = (w) => update({ week: Math.max(1, Math.min(24, w)) });
  const setDay = (d) => update({ day: Math.max(1, Math.min(7, d)) });
  const setStart = (iso) => update({ startDate: iso });
  const completeBoot = () => update({ bootSeen: true });
  const setTweak = (k, v) => update((p) => ({ ...p, tweaks: { ...p.tweaks, [k]: v } }));
  const goToday = () => {
    if (!s.startDate) return;
    const pos = programPosition(s.startDate);
    update({ week: pos.week, day: pos.doW, view: "today" });
  };

  // Per-set log: weight (kg) and actual reps.
  const setKey = (wk, day, exIdx, setN) => `${wk}-${day}-${exIdx}-${setN}`;
  const logSet = (wk, day, exIdx, setN, payload) => {
    const k = setKey(wk, day, exIdx, setN);
    update((p) => ({ ...p, sets: { ...p.sets, [k]: { ...payload, ts: Date.now() } } }));
  };
  const clearSet = (wk, day, exIdx, setN) => {
    const k = setKey(wk, day, exIdx, setN);
    update((p) => {
      const next = { ...p.sets };
      delete next[k];
      return { ...p, sets: next };
    });
  };

  // Mark an exercise complete (separately from per-set logging).
  const toggleExercise = (wk, day, exIdx) => {
    const k = `${wk}-${day}-${exIdx}`;
    update((p) => ({ ...p, completed: { ...p.completed, [k]: !p.completed[k] } }));
  };

  // Find last logged set for an exercise across all prior weeks (by name).
  const lastLoggedSet = useCallback((exName, beforeWeek, beforeDay) => {
    let best = null;
    Object.entries(s.sets).forEach(([k, v]) => {
      if (!v.exName || v.exName !== exName) return;
      const [wk, d] = k.split("-").map(Number);
      if (wk > beforeWeek) return;
      if (wk === beforeWeek && d >= beforeDay) return;
      if (!best || v.ts > best.ts) best = { ...v, wk, d };
    });
    return best;
  }, [s.sets]);

  // Suggested next load: if the last 2 sessions hit the top of the rep range, +2.5 kg.
  const suggestedLoad = useCallback((exName, currentTopRep) => {
    const matches = [];
    Object.entries(s.sets).forEach(([k, v]) => {
      if (v.exName !== exName) return;
      matches.push({ ...v, k });
    });
    matches.sort((a, b) => b.ts - a.ts);
    if (matches.length === 0) return null;
    const last = matches[0];
    if (matches.length < 2) return { weight: last.weight, hint: "match last" };
    const hitTop = matches.slice(0, 2).every((m) => m.reps >= currentTopRep && m.weight === last.weight);
    if (hitTop) return { weight: last.weight + 2.5, hint: "+2.5 kg — top reps × 2" };
    return { weight: last.weight, hint: "match last" };
  }, [s.sets]);

  const logWeight = (wk, lb) => update((p) => {
    const filtered = p.weightLog.filter((e) => e.wk !== wk);
    return { ...p, weightLog: [...filtered, { wk, lb, ts: Date.now() }].sort((a, b) => a.wk - b.wk) };
  });
  const removeWeight = (wk) => update((p) => ({ ...p, weightLog: p.weightLog.filter((e) => e.wk !== wk) }));
  const logPushups = (wk, n) => update((p) => ({ ...p, pushupLog: { ...p.pushupLog, [wk]: n } }));
  const setWaterToday = (n) => update((p) => ({ ...p, water: { ...p.water, [todayISO()]: n } }));
  const setNoteToday = (text) => update((p) => ({ ...p, notes: { ...p.notes, [todayISO()]: text } }));
  const setMealSwap = (i, text) => update((p) => ({ ...p, mealSwaps: { ...(p.mealSwaps || {}), [i]: text } }));
  const setMealOutNote = (text) => update({ mealOutNote: text });

  const reset = () => {
    if (confirm("Reset ALL logged data? This cannot be undone.")) {
      const fresh = defaultState();
      fresh.bootSeen = true;  // don't replay boot after reset
      saveV2(fresh);
      setS(fresh);
    }
  };

  // ---------- DERIVED ----------
  const derived = useMemo(() => {
    const phase = s.week <= 8 ? PLAN.phases[0] : (s.week <= 16 ? PLAN.phases[1] : PLAN.phases[2]);
    const day = PLAN.days[s.day - 1];
    const vol = PLAN.volume[s.week - 1];
    const projWeight = PLAN.weight_curve_lb[s.week - 1];
    const pos = s.startDate ? programPosition(s.startDate) : null;
    const onTrack = pos && pos.week === s.week && pos.doW === s.day;

    // exercise completion progress for selected day
    const exCount = day.exercises.length;
    let exDone = 0;
    for (let i = 0; i < exCount; i++) {
      if (s.completed[`${s.week}-${s.day}-${i}`]) exDone++;
    }

    // setCount progress for selected day
    let setsLogged = 0, setsTarget = 0;
    day.exercises.forEach((ex, i) => {
      const target = setsForWeek(ex, s.week);
      setsTarget += target;
      for (let n = 1; n <= target; n++) {
        if (s.sets[`${s.week}-${s.day}-${i}-${n}`]) setsLogged++;
      }
    });

    // plateau detection: if last 3 logged weight points span 2+ weeks and all within 1 lb of each other.
    let plateau = false;
    const log = [...s.weightLog].sort((a, b) => a.wk - b.wk);
    if (log.length >= 3) {
      const recent = log.slice(-3);
      const wkSpan = recent[2].wk - recent[0].wk;
      const lbSpan = Math.max(...recent.map(r => r.lb)) - Math.min(...recent.map(r => r.lb));
      plateau = wkSpan >= 2 && lbSpan <= 1.0;
    }

    // deload banner if current week is a deload week
    const isDeload = !!vol.deload;

    // streak: number of consecutive past days (in program) with at least 1 logged set or completed pushup.
    let streakCount = 0;
    if (pos) {
      for (let back = 0; back < 30; back++) {
        const idx = pos.day_idx - back;
        if (idx < 0) break;
        const wk = Math.floor(idx / 7) + 1;
        const dy = (idx % 7) + 1;
        const dayDef = PLAN.days[dy - 1];
        // count if any set logged or any exercise completed for that day
        let any = false;
        for (let ei = 0; ei < dayDef.exercises.length; ei++) {
          if (s.completed[`${wk}-${dy}-${ei}`]) { any = true; break; }
          for (let n = 1; n <= 4; n++) {
            if (s.sets[`${wk}-${dy}-${ei}-${n}`]) { any = true; break; }
          }
          if (any) break;
        }
        // rest days (4, 7) count as compliance if pushup logged or implicit
        if (dayDef.kind === "rest" && (s.pushupLog[wk] != null || dy === 7)) any = true;
        if (any) streakCount++;
        else break;
      }
    }

    // water today
    const water = s.water[todayISO()] || 0;

    return { phase, day, vol, projWeight, pos, onTrack, exCount, exDone, setsLogged, setsTarget, plateau, isDeload, streakCount, water };
  }, [s]);

  return {
    s, update, derived,
    setView, setWeek, setDay, setStart, completeBoot, setTweak, goToday,
    logSet, clearSet, toggleExercise, lastLoggedSet, suggestedLoad,
    logWeight, removeWeight, logPushups, setWaterToday, setNoteToday,
    setMealSwap, setMealOutNote,
    reset,
  };
}

// Sets target per week per exercise: handles "2→4" notation.
function setsForWeek(ex, wk) {
  const vol = PLAN.volume[wk - 1];
  if (vol.deload) return 2;
  // ex.sets is a string like "2→4", "3", "4", "2→3", "3→4"
  const m = String(ex.sets).match(/(\d+)\s*→\s*(\d+)/);
  if (m) {
    const [_, lo, hi] = m;
    return Math.min(+hi, Math.max(+lo, vol.sets));
  }
  const n = parseInt(ex.sets, 10);
  return isNaN(n) ? 2 : n;
}

// Parse "6–8" rep range into [lo, hi]. Handles "12", "max", "60 s", etc.
function parseReps(reps) {
  const m = String(reps).match(/(\d+)\s*[–-]\s*(\d+)/);
  if (m) return { lo: +m[1], hi: +m[2] };
  const n = parseInt(reps, 10);
  if (!isNaN(n)) return { lo: n, hi: n };
  return null;
}

// Vyvanse + caffeine RPE warning applies on Push/Pull/Legs/UpperPower compound primary lifts.
const COMPOUND_LIFTS = new Set([
  "Barbell bench press", "Overhead press (barbell)", "Barbell back squat",
  "Trap bar DL → conventional", "Close-grip bench press", "Push press",
  "Romanian deadlift", "Barbell row (Pendlay)", "Barbell row (heavier)",
]);

Object.assign(window, {
  usePlanStore, programPosition, todayISO, isoOffset, isoDaysBetween,
  setsForWeek, parseReps, COMPOUND_LIFTS, defaultState,
});

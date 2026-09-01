// core.jsx — shared logic for all three prototype variants.
// Themes import this; each owns its own visual layer.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const STORE_KEY = "fti.plan.v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) { return {}; }
}
function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
}

// usePlanState — single source of truth for week/day selections, completed
// exercise checkboxes, and weight log. Persists everything.
function usePlanState() {
  const [s, setS] = useState(() => ({
    week: 1,
    day: 1,
    completed: {},      // key `${week}-${day}-${exIdx}` -> bool
    weightLog: [],      // [{ wk, lb }]
    pushupLog: {},      // wk -> count
    ...loadStore(),
  }));
  useEffect(() => { saveStore(s); }, [s]);

  const setWeek = (w) => setS((p) => ({ ...p, week: Math.max(1, Math.min(24, w)) }));
  const setDay  = (d) => setS((p) => ({ ...p, day: d }));
  const toggle  = (k) => setS((p) => ({ ...p, completed: { ...p.completed, [k]: !p.completed[k] } }));
  const logWeight = (wk, lb) => setS((p) => {
    const filtered = p.weightLog.filter((e) => e.wk !== wk);
    return { ...p, weightLog: [...filtered, { wk, lb }].sort((a, b) => a.wk - b.wk) };
  });
  const removeWeight = (wk) => setS((p) => ({ ...p, weightLog: p.weightLog.filter((e) => e.wk !== wk) }));
  const logPushups = (wk, n) => setS((p) => ({ ...p, pushupLog: { ...p.pushupLog, [wk]: n } }));
  const reset = () => setS({ week: 1, day: 1, completed: {}, weightLog: [], pushupLog: {} });

  return { s, setWeek, setDay, toggle, logWeight, removeWeight, logPushups, reset };
}

// Phase from week.
function phaseOf(wk) {
  if (wk <= 8) return PLAN.phases[0];
  if (wk <= 16) return PLAN.phases[1];
  return PLAN.phases[2];
}

// Day-completion progress for a given week.
function dayProgress(state, wk, dayN) {
  const day = PLAN.days[dayN - 1];
  const total = day.exercises.length;
  let done = 0;
  for (let i = 0; i < total; i++) {
    if (state.completed[`${wk}-${dayN}-${i}`]) done++;
  }
  return { done, total };
}

// SVG line chart of weight projection vs. user log.
// Theme-aware via CSS vars: --chart-line, --chart-actual, --chart-grid,
// --chart-text, --chart-marker.
function WeightChart({ weightLog, currentWeek, height = 220, showAxis = true, theme = {} }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 600, h: height });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setSize({ w, h: height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [height]);

  const proj = PLAN.weight_curve_lb;
  const padL = showAxis ? 36 : 12, padR = 12, padT = 14, padB = showAxis ? 24 : 12;
  const W = size.w, H = size.h;
  const innerW = Math.max(50, W - padL - padR);
  const innerH = Math.max(50, H - padT - padB);

  const min = 180, max = 212;
  const xAt = (wk) => padL + ((wk - 1) / 23) * innerW;
  const yAt = (lb) => padT + (1 - (lb - min) / (max - min)) * innerH;

  const projPath = proj.map((lb, i) => `${i === 0 ? "M" : "L"} ${xAt(i + 1).toFixed(1)} ${yAt(lb).toFixed(1)}`).join(" ");
  const sortedLog = [...weightLog].sort((a, b) => a.wk - b.wk);
  const logPath = sortedLog.length ? sortedLog.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.wk).toFixed(1)} ${yAt(p.lb).toFixed(1)}`).join(" ") : "";

  const phaseBoundaries = [8.5, 16.5];
  const milestones = [
    { wk: 8, lb: 202, label: "P1 ↗" },
    { wk: 16, lb: 192, label: "P2 ↗" },
    { wk: 24, lb: 183, label: "Goal" },
  ];

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        {/* phase bands */}
        {phaseBoundaries.map((b, i) => (
          <line key={i} x1={xAt(b)} x2={xAt(b)} y1={padT} y2={H - padB}
            stroke="var(--chart-grid, rgba(0,0,0,.08))" strokeDasharray="2 4" />
        ))}
        {/* y grid */}
        {showAxis && [185, 190, 195, 200, 205, 210].map((lb) => (
          <g key={lb}>
            <line x1={padL} x2={W - padR} y1={yAt(lb)} y2={yAt(lb)}
              stroke="var(--chart-grid, rgba(0,0,0,.06))" />
            <text x={padL - 6} y={yAt(lb) + 3} textAnchor="end"
              fontSize="9.5" fill="var(--chart-text, rgba(0,0,0,.5))"
              style={{ fontFamily: "var(--mono, monospace)", fontVariantNumeric: "tabular-nums" }}>{lb}</text>
          </g>
        ))}
        {/* x ticks */}
        {showAxis && [1, 6, 12, 18, 24].map((wk) => (
          <text key={wk} x={xAt(wk)} y={H - padB + 14} textAnchor="middle"
            fontSize="9.5" fill="var(--chart-text, rgba(0,0,0,.5))"
            style={{ fontFamily: "var(--mono, monospace)" }}>w{wk}</text>
        ))}
        {/* projection line */}
        <path d={projPath} fill="none" stroke="var(--chart-line, rgba(0,0,0,.35))"
          strokeWidth="1.25" strokeDasharray="3 3" />
        {/* current week vertical */}
        <line x1={xAt(currentWeek)} x2={xAt(currentWeek)} y1={padT} y2={H - padB}
          stroke="var(--chart-marker, currentColor)" strokeWidth="1" opacity=".6" />
        {/* milestones */}
        {milestones.map((m) => (
          <g key={m.wk}>
            <circle cx={xAt(m.wk)} cy={yAt(m.lb)} r="2.5"
              fill="var(--chart-line, rgba(0,0,0,.55))" />
          </g>
        ))}
        {/* user log */}
        {logPath && <path d={logPath} fill="none" stroke="var(--chart-actual, currentColor)"
          strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />}
        {sortedLog.map((p, i) => (
          <circle key={i} cx={xAt(p.wk)} cy={yAt(p.lb)} r="3"
            fill="var(--chart-actual, currentColor)" />
        ))}
      </svg>
    </div>
  );
}

// Push-up progression sparkline.
function PushupSpark({ logged, currentWeek, height = 60, theme = {} }) {
  const ref = useRef(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const data = PLAN.pushup_progression;
  const max = 55;
  const xAt = (wk) => 8 + ((wk - 1) / 23) * (w - 16);
  const yAt = (n) => 6 + (1 - n / max) * (height - 12);
  const path = data.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.week).toFixed(1)} ${yAt(p.target).toFixed(1)}`).join(" ");
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width={w} height={height}>
        <path d={path} fill="none" stroke="var(--chart-line, currentColor)"
          strokeWidth="1.25" opacity=".5" strokeDasharray="2 3" />
        {Object.entries(logged).map(([wk, n]) => (
          <circle key={wk} cx={xAt(+wk)} cy={yAt(+n)} r="3"
            fill="var(--chart-actual, currentColor)" />
        ))}
        <line x1={xAt(currentWeek)} x2={xAt(currentWeek)} y1={4} y2={height - 4}
          stroke="var(--chart-marker, currentColor)" opacity=".5" />
      </svg>
    </div>
  );
}

// WeekSlider — compact week scrubber with phase shading.
function WeekSlider({ value, onChange, render }) {
  return (
    <div className="week-slider">
      <input type="range" min="1" max="24" value={value}
        onChange={(e) => onChange(+e.target.value)} />
      {render && render()}
    </div>
  );
}

// Tabs container (controlled).
function DayTabs({ value, onChange, render }) {
  return (
    <div className="day-tabs">
      {PLAN.days.map((d) => (
        <button key={d.n}
          className={"day-tab" + (value === d.n ? " is-active" : "")}
          onClick={() => onChange(d.n)}>
          {render ? render(d, value === d.n) : <><span>{d.n}</span> <em>{d.name}</em></>}
        </button>
      ))}
    </div>
  );
}

// Exercise checklist for current day.
function Checklist({ state, week, dayN, toggle, ExerciseRow }) {
  const day = PLAN.days[dayN - 1];
  return (
    <div className="checklist">
      {day.exercises.map((ex, i) => {
        const k = `${week}-${dayN}-${i}`;
        const done = !!state.completed[k];
        return (
          <ExerciseRow key={i} ex={ex} done={done} onToggle={() => toggle(k)} />
        );
      })}
    </div>
  );
}

Object.assign(window, {
  usePlanState, phaseOf, dayProgress,
  WeightChart, PushupSpark, WeekSlider, DayTabs, Checklist,
});

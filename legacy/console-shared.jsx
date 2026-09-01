// console-shared.jsx — chrome, charts, ASCII bars, boot, spotlight.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ============ CRT shell ============
function CRT({ children, scanlines, flicker }) {
  return (
    <div className={"crt" + (scanlines ? " sc" : "") + (flicker ? " fl" : "")}>
      {children}
    </div>
  );
}

// ============ Top bar ============
function TopBar({ store }) {
  const { s, derived, goToday, setView } = store;
  const { pos, phase, streakCount } = derived;
  return (
    <header className="topbar">
      <div className="tl">
        <span className="dot" title="online"></span>
        <span className="brand">FTI<span className="acc">·</span>CONSOLE</span>
        {pos && (
          <span className="day-ind">
            <span className="key">D</span>
            <b>{pos.day_idx + 1}</b><span className="muted">/168</span>
            <span className="key" style={{marginLeft:10}}>WK</span>
            <b>{pos.week}</b><span className="muted">/24</span>
            <span className="key" style={{marginLeft:10}}>P</span>
            <b>{phase.n}</b>
          </span>
        )}
      </div>
      <div className="tr">
        {pos && <span className="streak" title="consecutive days">▮ {streakCount}</span>}
        <button className="todaybtn" onClick={goToday} title="Jump to today (T)" disabled={!s.startDate}>
          ⌖ TODAY
        </button>
        <span className="kbd-hint" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("__open-spotlight")); }} title="Open spotlight (⌘K)">⌘K</span>
      </div>
    </header>
  );
}

// ============ Side / bottom nav ============
const VIEWS = [
  { id: "today",     label: "TODAY",     hot: "1", icon: "◉" },
  { id: "train",     label: "TRAIN",     hot: "2", icon: "▣" },
  { id: "plan",      label: "PLAN",      hot: "3", icon: "◫" },
  { id: "log",       label: "LOG",       hot: "4", icon: "◈" },
  { id: "protocols", label: "PROTOCOLS", hot: "5", icon: "△" },
  { id: "atlas",     label: "ATLAS",     hot: "6", icon: "◆" },
  { id: "export",    label: "EXPORT",    hot: "7", icon: "↗" },
];

function Nav({ store }) {
  const { s, setView } = store;
  return (
    <nav className="nav">
      {VIEWS.map((v) => (
        <button key={v.id}
          className={"nav-btn" + (s.view === v.id ? " is-active" : "")}
          onClick={() => setView(v.id)}>
          <span className="nav-icon">{v.icon}</span>
          <span className="nav-label">{v.label}</span>
          <span className="nav-hot">{v.hot}</span>
        </button>
      ))}
    </nav>
  );
}

// ============ Boot sequence ============
function Boot({ onDone, store }) {
  const [lines, setLines] = useState([]);
  const [cursor, setCursor] = useState(true);
  const seq = [
    "FTI BIOS v1.0.4 ............................. OK",
    "Loading BASELINE.dat ......................... OK",
    "  · horizon     168 d",
    "Mounting PLAN.bin ............................ OK",
    "  · phases      3",
    "  · sessions    120 (5×24)",
    "  · push-ups    progression w1=8 → w24=50",
    "Subscribing to localStorage event bus ........ OK",
    "",
    "READY.",
  ];
  useEffect(() => {
    let i = 0;
    const it = setInterval(() => {
      i++;
      setLines(seq.slice(0, i));
      if (i >= seq.length) { clearInterval(it); }
    }, 90);
    return () => clearInterval(it);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="boot">
      <pre className="boot-pre">
{lines.join("\n")}
        {lines.length >= seq.length ? (
          <span>
            {"\n\n> press any key to continue"}{cursor ? "_" : " "}
          </span>
        ) : <span>{cursor ? "_" : " "}</span>}
      </pre>
      {lines.length >= seq.length && (
        <button className="boot-skip" onClick={onDone}>continue ↵</button>
      )}
      <button className="boot-skipall" onClick={onDone}>skip</button>
    </div>
  );
}

// ============ Setup (first run, set start date) ============
function Setup({ store }) {
  const { setStart } = store;
  const [d, setD] = useState(todayISO());
  return (
    <div className="setup">
      <h2>NO START DATE ON FILE</h2>
      <p>The console anchors all "today" calculations to your program start date.<br/>
         Day 1 of the program = the first day you train (Push). Pick that date.</p>
      <div className="setup-form">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
        <button onClick={() => setStart(d)}>WRITE START_DATE ↵</button>
      </div>
      <p className="setup-hint">
        Picking today is fine — most programs start the day they're set up.
        You can change this later in Plan → Settings.
      </p>
    </div>
  );
}

// ============ Spotlight (⌘K) ============
function Spotlight({ open, onClose, store }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const { setView, setWeek, setDay } = store;
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    if (!open) setQ("");
  }, [open]);

  const items = useMemo(() => {
    const all = [];
    VIEWS.forEach((v) => all.push({
      kind: "view", label: v.label, hint: "view " + v.hot,
      run: () => { setView(v.id); onClose(); }
    }));
    PLAN.days.forEach((d) => all.push({
      kind: "day", label: `Day ${d.n} — ${d.name}`, hint: d.sub,
      run: () => { setDay(d.n); setView("plan"); onClose(); }
    }));
    for (let w = 1; w <= 24; w++) {
      const phaseN = w <= 8 ? 1 : (w <= 16 ? 2 : 3);
      all.push({
        kind: "week", label: `Week ${w}`, hint: `phase ${phaseN}` + (PLAN.volume[w-1].deload ? " · deload" : ""),
        run: () => { setWeek(w); setView("plan"); onClose(); }
      });
    }
    PLAN.days.forEach((d) => d.exercises.forEach((ex, exIdx) => all.push({
      kind: "exercise", label: ex.name, hint: `D${d.n} ${d.name} · ${ex.sets} × ${ex.reps}`,
      run: () => {
        setDay(d.n); setView("plan"); onClose();
        // Deep-link: scroll to + highlight the specific exercise card after Plan renders
        setTimeout(() => {
          const sel = `[data-ex-anchor="d${d.n}-${exIdx}"]`;
          const el = document.querySelector(sel);
          if (el) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            el.classList.add("ex-flash");
            setTimeout(() => el.classList.remove("ex-flash"), 1800);
          }
        }, 60);
      }
    })));
    Object.entries(PLAN.protocols).forEach(([k, p]) => all.push({
      kind: "proto", label: p.title, hint: p.cadence,
      run: () => { setView("protocols"); onClose(); }
    }));
    return all;
  }, []);

  const filtered = q
    ? items.filter((i) => (i.label + " " + i.hint).toLowerCase().includes(q.toLowerCase())).slice(0, 12)
    : items.slice(0, 12);

  if (!open) return null;
  return (
    <div className="spot-bg" onClick={onClose}>
      <div className="spot" onClick={(e) => e.stopPropagation()}>
        <div className="spot-input">
          <span className="spot-prompt">$</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="search exercise · day · week · protocol..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) filtered[0].run();
              if (e.key === "Escape") onClose();
            }} />
          <span className="spot-esc">ESC</span>
        </div>
        <div className="spot-list">
          {filtered.map((it, i) => (
            <button key={i} className="spot-item" onClick={it.run}>
              <span className={"spot-kind k-" + it.kind}>{it.kind}</span>
              <span className="spot-label">{it.label}</span>
              <span className="spot-hint">{it.hint}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="spot-empty">no matches</div>}
        </div>
      </div>
    </div>
  );
}

// ============ ASCII bar (for macros / progress) ============
function AsciiBar({ value, max, width = 20, label, suffix }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return (
    <span className="ascii-bar">
      {label && <span className="ab-label">{label}</span>}
      <span className="ab-track">[<b>{"█".repeat(filled)}</b>{"░".repeat(empty)}]</span>
      <span className="ab-val">{value}{suffix}</span>
    </span>
  );
}

// ============ Compliance heatmap (24 weeks × 7 days) ============
function ComplianceGrid({ store }) {
  // heatmap is now clickable — accept store via prop and wire navigation
  const { s, setView, setWeek, setDay } = store;
  const cells = [];
  for (let wk = 1; wk <= 24; wk++) {
    for (let dy = 1; dy <= 7; dy++) {
      let intensity = 0;
      const dayDef = PLAN.days[dy - 1];
      let setsLogged = 0, setsTarget = 0;
      dayDef.exercises.forEach((ex, ei) => {
        const t = setsForWeek(ex, wk);
        setsTarget += t;
        for (let n = 1; n <= t; n++) {
          if (s.sets[`${wk}-${dy}-${ei}-${n}`]) setsLogged++;
        }
        if (s.completed[`${wk}-${dy}-${ei}`]) setsLogged += 0; // already counted above
      });
      let exDone = 0;
      for (let ei = 0; ei < dayDef.exercises.length; ei++) {
        if (s.completed[`${wk}-${dy}-${ei}`]) exDone++;
      }
      if (setsTarget > 0) intensity = Math.min(1, setsLogged / setsTarget);
      else intensity = exDone > 0 ? 1 : 0;
      if (intensity === 0 && exDone > 0) intensity = exDone / dayDef.exercises.length;
      const isDeload = PLAN.volume[wk - 1].deload;
      cells.push({ wk, dy, intensity, isRest: dayDef.kind === "rest", isDeload });
    }
  }
  return (
    <div className="hm">
      <div className="hm-cols">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="hm-col">
            {[1,2,3,4,5,6,7].map((dy) => {
              const c = cells.find((x) => x.wk === i + 1 && x.dy === dy);
              const op = c.intensity === 0 ? 0.06 : 0.2 + c.intensity * 0.8;
              return (
                <div key={dy} className={"hm-cell" + (c.isRest ? " rest" : "") + (c.isDeload ? " deload" : "")}
                  style={{ "--op": op }} title={`W${c.wk} D${c.dy} · click to inspect`}
                  onClick={() => { store.setWeek(c.wk); store.setDay(c.dy); store.setView("plan"); }}></div>
              );
            })}
            <div className="hm-wk">{(i + 1) % 4 === 0 || i === 0 ? `w${i + 1}` : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  CRT, TopBar, Nav, Boot, Setup, Spotlight, AsciiBar, ComplianceGrid, VIEWS,
});

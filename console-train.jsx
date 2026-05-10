// console-train.jsx — Workout / TRAIN mode.
// Big tap targets, per-set logging, rest timer, last-session reference,
// auto-suggested loads, RPE warnings on compound lifts.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Rest timer ----------
function RestTimer({ defaultS = 90, heavyBonus = 60, isHeavy }) {
  const target = defaultS + (isHeavy ? heavyBonus : 0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(null);
  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now() - elapsed * 1000;
    const it = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 200);
    return () => clearInterval(it);
  }, [running]);
  const reset = () => { setRunning(false); setElapsed(0); };
  const start = () => { setRunning(true); };
  const stop = () => { setRunning(false); };
  const remain = Math.max(0, target - elapsed);
  const m = Math.floor(remain / 60), s = remain % 60;
  const overtime = elapsed > target;
  const pct = Math.min(1, elapsed / target);

  return (
    <div className={"rest" + (running ? " run" : "") + (overtime ? " over" : "")}>
      <div className="rest-ring">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r="28" fill="none"
            stroke="var(--bg-3)" strokeWidth="3" />
          <circle cx="32" cy="32" r="28" fill="none"
            stroke="var(--accent)" strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 28}`}
            strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct)}`}
            transform="rotate(-90 32 32)" strokeLinecap="round" />
        </svg>
        <span className="rest-time">
          {overtime ? `+${elapsed - target}s` : `${m}:${String(s).padStart(2,"0")}`}
        </span>
      </div>
      <div className="rest-ctrl">
        <div className="rest-lbl">REST · target {Math.floor(target/60)}:{String(target%60).padStart(2,"0")}{isHeavy && <span className="rest-heavy">+{heavyBonus}s heavy</span>}</div>
        <div className="rest-btns">
          {!running && elapsed === 0 && <button onClick={start}>START [R]</button>}
          {running && <button onClick={stop}>PAUSE</button>}
          {!running && elapsed > 0 && <button onClick={start}>RESUME</button>}
          {elapsed > 0 && <button onClick={reset} className="ghost">RESET</button>}
        </div>
      </div>
    </div>
  );
}

// Expose start/reset via ref-like callback
function RestTimerHotkey({ defaultS, heavyBonus, isHeavy, onAutoStart }) {
  return <RestTimer defaultS={defaultS} heavyBonus={heavyBonus} isHeavy={isHeavy} />;
}

// ---------- Set log row ----------
function SetRow({ n, target, payload, onLog, onClear, last, hint }) {
  const [w, setW] = useState(payload?.weight ?? last?.weight ?? "");
  const [r, setR] = useState(payload?.reps ?? "");
  useEffect(() => {
    setW(payload?.weight ?? last?.weight ?? "");
    setR(payload?.reps ?? "");
  }, [payload?.weight, payload?.reps]);

  const submit = () => {
    const wn = parseFloat(w), rn = parseInt(r, 10);
    if (!isNaN(wn) && !isNaN(rn)) onLog({ weight: wn, reps: rn });
  };
  const done = !!payload;

  return (
    <div className={"set-row" + (done ? " done" : "")}>
      <span className="set-n">SET <b>{n}</b><span className="set-target">/{target}</span></span>
      <input type="number" inputMode="decimal" placeholder={last ? `${last.weight}` : "kg"}
        value={w} onChange={(e) => setW(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()} step="2.5" />
      <span className="set-x">×</span>
      <input type="number" inputMode="numeric" placeholder={last ? `${last.reps}` : "reps"}
        value={r} onChange={(e) => setR(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="set-go" onClick={done ? onClear : submit}>
        {done ? "✓ logged" : "LOG ↵"}
      </button>
    </div>
  );
}

// ---------- Exercise card (open one at a time, like Strong app) ----------
function ExerciseCard({ store, exIdx, ex, week, day, isOpen, onOpen }) {
  const { s, logSet, clearSet, lastLoggedSet, suggestedLoad, toggleExercise } = store;
  const target = setsForWeek(ex, week);
  const repRange = parseReps(ex.reps);
  const last = lastLoggedSet(ex.name, week, day);
  const suggested = suggestedLoad(ex.name, repRange?.hi ?? 99);
  const isCompound = COMPOUND_LIFTS.has(ex.name);
  const compKey = `${week}-${day}-${exIdx}`;
  const exDone = !!s.completed[compKey];
  const videoModal = window.__videoModal;

  const sets = [];
  for (let n = 1; n <= target; n++) {
    const k = `${week}-${day}-${exIdx}-${n}`;
    sets.push({ n, payload: s.sets[k] });
  }
  const setsLogged = sets.filter((x) => x.payload).length;
  const allDone = setsLogged === target;

  return (
    <div className={"ex-card" + (isOpen ? " open" : "") + (allDone || exDone ? " complete" : "")}>
      <button className="ex-head" onClick={onOpen}>
        <div className="ex-head-l">
          <span className="ex-num">{String(exIdx + 1).padStart(2, "0")}</span>
          <div>
            <div className="ex-title">{ex.name}</div>
            <div className="ex-sub">
              <b>{target}</b> × {ex.reps}
              {ex.note && <span className="ex-note"> · {ex.note}</span>}
            </div>
          </div>
        </div>
        <div className="ex-head-r">
          {isCompound && <span className="rpe-tag" title="Vyvanse + caffeine elevate HR. Cap at RPE 7-8.">RPE 7–8</span>}
          <span className="ex-prog">{setsLogged}/{target}</span>
          <span className="ex-chev">{isOpen ? "▾" : "▸"}</span>
        </div>
      </button>

      {isOpen && (
        <div className="ex-body">
          {ex.video && (
            <button className="ex-video" onClick={(e) => { e.preventDefault(); videoModal && videoModal.open(ex.video, ex.name); }}>
              ▶ form video — scientific breakdown · plays inline
            </button>
          )}
          {(last || suggested) && (
            <div className="ex-prev">
              {last && (
                <span className="ex-prev-last">
                  <span className="muted">last</span> w{last.wk} d{last.d}: <b>{last.weight} kg × {last.reps}</b>
                </span>
              )}
              {suggested && (
                <span className="ex-prev-sug">
                  <span className="muted">today</span> <b>{suggested.weight} kg</b>
                  <span className="muted"> · {suggested.hint}</span>
                </span>
              )}
            </div>
          )}

          <div className="set-list">
            {sets.map(({ n, payload }) => (
              <SetRow key={n} n={n} target={target} payload={payload} last={last}
                onLog={(p) => logSet(week, day, exIdx, n, { ...p, exName: ex.name })}
                onClear={() => clearSet(week, day, exIdx, n)}
              />
            ))}
          </div>

          <div className="ex-actions">
            <button className="ex-mark" onClick={() => toggleExercise(week, day, exIdx)}>
              {exDone ? "↺ mark not done" : "✓ mark exercise complete"}
            </button>
            {isCompound && (
              <span className="ex-hint">
                ⚠ heavy compound — water 500ml between sets · keep RPE ≤ 8
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- TRAIN view ----------
function TrainView({ store }) {
  const { s, derived } = store;
  const day = PLAN.days[s.day - 1];
  const [openIdx, setOpenIdx] = useState(0);
  // determine if any exercise in this day is heavy compound
  const isHeavyDay = day.exercises.some((ex) => COMPOUND_LIFTS.has(ex.name));

  // hotkeys: O = open next, R handled by RestTimer button text
  useEffect(() => {
    const fn = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setOpenIdx((i) => Math.min(day.exercises.length - 1, i + 1));
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpenIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [day.exercises.length]);

  if (day.kind === "rest") {
    return (
      <div className="train-rest">
        <h2>D{s.day} · {day.name.toUpperCase()}</h2>
        <p className="train-rest-sub">{day.sub}</p>
        <div className="train-rest-card">
          <div>// muscle is built during recovery, not the session</div>
          <div className="train-rest-actions">
            {day.pushups && <button onClick={() => store.setView("today")}>log push-ups →</button>}
            <button onClick={() => store.setDay(s.day === 7 ? 1 : s.day + 1)}>skip to next training day →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="train">
      <div className="train-hero">
        <div className="train-h-l">
          <div className="train-h-eyebrow">SESSION · D{s.day} · W{s.week}</div>
          <h2>{day.name.toUpperCase()}</h2>
          <div className="train-h-sub">{day.sub}</div>
        </div>
        <div className="train-h-r">
          <RestTimer defaultS={90} heavyBonus={60} isHeavy={isHeavyDay} />
        </div>
      </div>

      <div className="train-meta">
        <span className="tm">VOL <b>{derived.vol.sets} sets</b></span>
        <span className="tm">PHASE <b>{derived.phase.name}</b></span>
        <span className="tm">PROG <b>{derived.setsLogged}/{derived.setsTarget} sets</b></span>
        {derived.isDeload && <span className="tm warn">DELOAD WEEK · 40% load · 2 sets</span>}
      </div>

      <div className="ex-stack">
        {day.exercises.map((ex, i) => (
          <ExerciseCard key={i} store={store} ex={ex} exIdx={i}
            week={s.week} day={s.day}
            isOpen={openIdx === i}
            onOpen={() => setOpenIdx(openIdx === i ? -1 : i)}
          />
        ))}
      </div>

      {day.pushups && (
        <div className="train-pushups">
          <div className="tp-l">
            <div className="tp-eyebrow">+ DAILY PUSH-UPS</div>
            <div className="tp-target">target this week: <b>{PLAN.pushup_progression[s.week-1].target}</b> × 3 sets</div>
          </div>
          <div className="tp-r">
            <PushupQuickLog store={store} />
          </div>
        </div>
      )}
    </div>
  );
}

function PushupQuickLog({ store }) {
  const { s, logPushups } = store;
  const cur = s.pushupLog[s.week] ?? "";
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur]);
  return (
    <div className="pu-quick">
      <input type="number" inputMode="numeric" placeholder="max" value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = parseInt(v, 10);
            if (n > 0 && n < 200) logPushups(s.week, n);
          }
        }} />
      <button onClick={() => {
        const n = parseInt(v, 10);
        if (n > 0 && n < 200) logPushups(s.week, n);
      }}>LOG ↵</button>
    </div>
  );
}

Object.assign(window, { TrainView, PushupQuickLog });

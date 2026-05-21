// console-train.jsx — Workout / TRAIN mode.
// Per-set logging with coach comments, bonus sets, custom-exercise additions.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Rest timer ----------
function RestTimer({ defaultS = 90, heavyBonus = 60, isHeavy }) {
  const target = defaultS + (isHeavy ? heavyBonus : 0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(null);
  const chimed = useRef(false);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now() - elapsed * 1000;
    const it = setInterval(() => {
      const e = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(e);
      // Chime once when target reached.
      if (!chimed.current && e >= target) {
        chimed.current = true;
        try {
          if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
          // Web Audio bleep — no asset needed
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            const ctx = new AC();
            const o1 = ctx.createOscillator();
            const g = ctx.createGain();
            o1.type = "sine"; o1.frequency.value = 880;
            g.gain.value = 0.001;
            o1.connect(g); g.connect(ctx.destination);
            const t0 = ctx.currentTime;
            g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
            o1.start(t0); o1.stop(t0 + 0.4);
            setTimeout(() => ctx.close().catch(() => {}), 600);
          }
        } catch (e) {}
      }
    }, 200);
    return () => clearInterval(it);
  }, [running, target]);
  const reset = () => { setRunning(false); setElapsed(0); chimed.current = false; };
  const start = () => { chimed.current = elapsed >= target; setRunning(true); };
  const stop = () => { setRunning(false); };
  const remain = Math.max(0, target - elapsed);
  const m = Math.floor(remain / 60), s = remain % 60;
  const overtime = elapsed > target;
  const pct = Math.min(1, elapsed / target);

  return (
    <div className={"rest" + (running ? " run" : "") + (overtime ? " over" : "")}>
      <div className="rest-ring">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bg-3)" strokeWidth="3" />
          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="3"
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

// ---------- Set log row ----------
function SetRow({ n, target, payload, onLog, onClear, last, isBonus }) {
  const [w, setW] = useState(payload?.weight ?? last?.weight ?? "");
  const [r, setR] = useState(payload?.reps ?? "");
  const wRef = useRef(null);
  const rRef = useRef(null);
  const goRef = useRef(null);
  useEffect(() => {
    setW(payload?.weight ?? last?.weight ?? "");
    setR(payload?.reps ?? "");
  }, [payload?.weight, payload?.reps]);

  const submit = () => {
    const wn = parseFloat(w), rn = parseInt(r, 10);
    if (!isNaN(wn) && !isNaN(rn)) {
      onLog({ weight: wn, reps: rn });
      // After successful log, drop focus so virtual keyboard collapses.
      if (rRef.current) rRef.current.blur();
    }
  };
  const onWeightKey = (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      // If reps is empty, advance to reps. Else submit.
      if (!r.toString().trim()) {
        e.preventDefault();
        rRef.current && rRef.current.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    }
  };
  const onRepsKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };
  const done = !!payload;

  return (
    <div className={"set-row" + (done ? " done" : "") + (isBonus ? " bonus" : "")}>
      <span className="set-n">
        {isBonus ? <span className="set-bonus-tag">+</span> : null}
        SET <b>{n}</b>
        {!isBonus && <span className="set-target">/{target}</span>}
      </span>
      <input ref={wRef} type="number" inputMode="decimal" placeholder={last ? `${last.weight}` : "kg"}
        value={w} onChange={(e) => setW(e.target.value)}
        onKeyDown={onWeightKey} step="2.5"
        aria-label={`Weight for set ${n}`} />
      <span className="set-x">×</span>
      <input ref={rRef} type="number" inputMode="numeric" placeholder={last ? `${last.reps}` : "reps"}
        value={r} onChange={(e) => setR(e.target.value)}
        onKeyDown={onRepsKey}
        aria-label={`Reps for set ${n}`} />
      <button ref={goRef} className="set-go" onClick={done ? onClear : submit}
        aria-label={done ? `Clear set ${n}` : `Log set ${n}`}>
        {done ? "✓ logged" : "LOG ↵"}
      </button>
    </div>
  );
}

// ---------- Exercise card (handles prescribed + custom) ----------
function ExerciseCard({ store, exIdx, ex, week, day, isOpen, onOpen, isCustom, customIdx }) {
  const { s, logSet, clearSet, lastLoggedSet, suggestedLoad, toggleExercise, removeCustomExercise } = store;
  const target = setsForWeek(ex, week);
  const repRange = parseReps(ex.reps);
  const last = lastLoggedSet(ex.name, week, day);
  const suggested = suggestedLoad(ex.name, repRange?.hi ?? 99);
  const isCompound = COMPOUND_LIFTS.has(ex.name);
  const compKey = `${week}-${day}-${exIdx}`;
  const exDone = !!s.completed[compKey];
  const videoModal = window.__videoModal;
  const [bonusRows, setBonusRows] = useState(0);

  // Determine highest logged set number for this exercise (so we know how many rows to render).
  let maxLogged = 0;
  Object.keys(s.sets).forEach((k) => {
    const parts = k.split("-").map(Number);
    if (parts[0] === week && parts[1] === day && parts[2] === exIdx) {
      maxLogged = Math.max(maxLogged, parts[3]);
    }
  });
  const totalRows = Math.max(target, maxLogged) + bonusRows;
  const sets = [];
  for (let n = 1; n <= totalRows; n++) {
    const k = `${week}-${day}-${exIdx}-${n}`;
    sets.push({ n, payload: s.sets[k], isBonus: n > target });
  }
  const setsLogged = sets.filter((x) => x.payload).length;
  const allDone = setsLogged >= target;

  // Payload sent to logSet — enriched so the store can build a coach line.
  const logPayload = (p) => ({
    ...p,
    exName: ex.name,
    repsLo: repRange?.lo,
    repsHi: repRange?.hi,
    suggested,
    lastBest: store.s.sets ? (() => {
      let best = null;
      Object.entries(store.s.sets).forEach(([k, v]) => {
        if (v.exName !== ex.name || !v.weight || !v.reps) return;
        if (!best || v.weight > best.weight || (v.weight === best.weight && v.reps > best.reps)) {
          best = { weight: v.weight, reps: v.reps };
        }
      });
      return best;
    })() : null,
  });

  return (
    <div className={"ex-card" + (isOpen ? " open" : "") + (allDone || exDone ? " complete" : "") + (isCustom ? " custom" : "")}>
      <button className="ex-head" onClick={onOpen}>
        <div className="ex-head-l">
          <span className="ex-num">{isCustom ? "+" : String(exIdx + 1).padStart(2, "0")}</span>
          <div>
            <div className="ex-title">{ex.name}{isCustom && <span className="ex-custom-tag"> · BONUS</span>}</div>
            <div className="ex-sub">
              <b>{target}</b> × {ex.reps}
              {ex.note && <span className="ex-note"> · {ex.note}</span>}
            </div>
          </div>
        </div>
        <div className="ex-head-r">
          {isCompound && <span className="rpe-tag" title="Vyvanse + caffeine elevate HR. Cap at RPE 7-8.">RPE 7–8</span>}
          <span className="ex-prog">{setsLogged}/{target}{maxLogged > target ? `+${maxLogged - target}` : ""}</span>
          <span className="ex-chev">{isOpen ? "▾" : "▸"}</span>
        </div>
      </button>

      {isOpen && (
        <div className="ex-body">
          {ex.video && (
            <button className="ex-video" onClick={(e) => { e.preventDefault(); videoModal && videoModal.open(ex.video, ex.name); }}>
              ▶ form reference — NewPipe / YouTube / Piped
            </button>
          )}
          {window.FORM_CUES && window.FORM_CUES[ex.name] && (
            <button className="ex-cues" onClick={(e) => { e.preventDefault(); window.__formCuesModal && window.__formCuesModal.open(ex.name); }}>
              ▣ form cues &amp; common mistakes
            </button>
          )}
          {(last || suggested) && !isCustom && (
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
            {sets.map(({ n, payload, isBonus }) => (
              <SetRow key={n} n={n} target={target} payload={payload} last={last} isBonus={isBonus}
                onLog={(p) => logSet(week, day, exIdx, n, logPayload(p))}
                onClear={() => clearSet(week, day, exIdx, n)}
              />
            ))}
          </div>

          <div className="ex-actions">
            <button className="ex-mark" onClick={() => toggleExercise(week, day, exIdx)}>
              {exDone ? "↺ mark not done" : "✓ mark exercise complete"}
            </button>
            <button className="ex-bonus" onClick={() => setBonusRows((b) => b + 1)}>
              + add bonus set
            </button>
            {isCustom && (
              <button className="ex-remove" onClick={() => removeCustomExercise(week, day, customIdx)}>
                × remove this bonus exercise
              </button>
            )}
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

// ---------- "+ Add custom exercise" form ----------
function AddCustomExercise({ store, week, day }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("8-12");

  const submit = () => {
    if (!name.trim()) return;
    store.addCustomExercise(week, day, {
      name: name.trim(),
      sets: sets || "3",
      reps: reps || "8-12",
    });
    setName(""); setSets("3"); setReps("8-12"); setOpen(false);
  };

  if (!open) {
    return (
      <button className="add-custom-trigger" onClick={() => setOpen(true)}>
        + add a bonus exercise to today
      </button>
    );
  }
  return (
    <div className="add-custom">
      <div className="add-custom-head">+ BONUS EXERCISE</div>
      <div className="add-custom-form">
        <input type="text" placeholder="exercise name (e.g. Cable crunch)" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <div className="add-custom-row">
          <label>sets <input type="text" inputMode="numeric" value={sets}
            onChange={(e) => setSets(e.target.value)} /></label>
          <label>reps <input type="text" value={reps}
            onChange={(e) => setReps(e.target.value)} /></label>
        </div>
        <div className="add-custom-actions">
          <button className="ghost" onClick={() => setOpen(false)}>cancel</button>
          <button onClick={submit}>ADD ↵</button>
        </div>
      </div>
    </div>
  );
}

// ---------- TRAIN view ----------
function TrainView({ store }) {
  const { s, derived } = store;
  const day = PLAN.days[s.day - 1];
  const [openIdx, setOpenIdx] = useState(0);
  const isHeavyDay = day.exercises.some((ex) => COMPOUND_LIFTS.has(ex.name));
  const customKey = `${s.week}-${s.day}`;
  const customs = (s.customEx || {})[customKey] || [];

  useEffect(() => {
    const fn = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      const totalEx = day.exercises.length + customs.length;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setOpenIdx((i) => Math.min(totalEx - 1, i + 1));
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpenIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [day.exercises.length, customs.length]);

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
        <AddCustomExercise store={store} week={s.week} day={s.day} />
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
        {customs.map((cex, i) => {
          const exIdx = 1000 + i;
          const orderIdx = day.exercises.length + i;
          return (
            <ExerciseCard key={"cx" + i} store={store} ex={cex} exIdx={exIdx}
              week={s.week} day={s.day} isCustom customIdx={i}
              isOpen={openIdx === orderIdx}
              onOpen={() => setOpenIdx(openIdx === orderIdx ? -1 : orderIdx)}
            />
          );
        })}
      </div>

      <AddCustomExercise store={store} week={s.week} day={s.day} />

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

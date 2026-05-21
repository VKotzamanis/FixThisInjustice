// console-views.jsx — Today / Plan / Log / Protocols views.

const { useState, useEffect, useRef, useMemo } = React;

// ============ TODAY ============
function TodayView({ store }) {
  const { s, derived, setView, setWaterToday, setNoteToday } = store;
  const { phase, day, vol, projWeight, pos, onTrack, water, streakCount, isDeload, plateau } = derived;
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!s.startDate) return <Setup store={store} />;

  const note = s.notes[todayISO()] || "";
  const todayStr = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  // Project weight today
  const proj = projWeight;
  const lastLogged = [...s.weightLog].sort((a, b) => b.wk - a.wk)[0];
  const delta = lastLogged ? (lastLogged.lb - 210).toFixed(1) : null;

  // Today's session summary
  const dayProg = derived.exDone + "/" + derived.exCount;

  return (
    <div className="today">
      {/* HERO */}
      <div className="today-hero">
        <div className="today-eyebrow">
          <span>{todayStr.toUpperCase()}</span>
          <span className="dot-sep">·</span>
          <span>{timeStr}</span>
          <span className="dot-sep">·</span>
          <span>D <b>{pos.day_idx + 1}</b><span className="muted">/168</span></span>
          {!onTrack && <span className="off-track">[scrubbed — not today]</span>}
        </div>
        <h1>
          <span className="muted">today is</span><br/>
          <span className="hero-name">{day.name.toUpperCase()}</span>
        </h1>
        <div className="today-sub">{day.sub}</div>

        {/* progress bar */}
        <div className="today-progbar">
          <div className="tpb-track">
            <div className="tpb-fill" style={{ width: (pos.day_idx / 167 * 100) + "%" }}></div>
            <div className="tpb-tick p1" style={{ left: (8 / 24 * 100) + "%" }} title="P1→P2">P1</div>
            <div className="tpb-tick p2" style={{ left: (16 / 24 * 100) + "%" }} title="P2→P3">P2</div>
          </div>
          <div className="tpb-meta">
            <span>w<b>{pos.week}</b>/24</span>
            <span>phase <b>{phase.n} {phase.name}</b></span>
            <span>{Math.round(pos.day_idx / 167 * 100)}%</span>
          </div>
        </div>
      </div>

      {/* BANNERS */}
      {isDeload && (
        <div className="banner deload">
          <span className="banner-tag">DELOAD WEEK</span>
          <span>2 sets · 40% load reduction · no cardio · +200 kcal · feel stronger after.</span>
        </div>
      )}
      {plateau && (
        <div className="banner plateau">
          <span className="banner-tag">PLATEAU DETECTED</span>
          <span>3 weight points within 1 lb. Verify tracking accuracy first — hidden oils. Then -150 kcal + 1 row session, wait 2 weeks. <button onClick={() => setView("protocols")}>open protocol →</button></span>
        </div>
      )}

      {/* SESSION + PUSH-UPS */}
      <div className="today-grid">
        <div className="today-card session-card" onClick={() => setView("train")}>
          <div className="card-head">
            <div>
              <div className="card-eyebrow">TODAY'S SESSION</div>
              <div className="card-h">{day.name}<span className="muted"> · {day.exercises.length} exercises</span></div>
            </div>
            <div className="card-cta">START TRAINING →</div>
          </div>
          <div className="session-list">
            {day.exercises.slice(0, 5).map((ex, i) => {
              const t = setsForWeek(ex, s.week);
              const k = `${s.week}-${s.day}-${i}`;
              const exDone = !!s.completed[k];
              let setsLogged = 0;
              for (let n = 1; n <= t; n++) if (s.sets[`${k}-${n}`]) setsLogged++;
              return (
                <div key={i} className={"sess-row" + (exDone || setsLogged === t ? " done" : "")}>
                  <span className="sess-i">{String(i+1).padStart(2,"0")}</span>
                  <span className="sess-name">{ex.name}</span>
                  <span className="sess-rep">{t}×{ex.reps}</span>
                  <span className="sess-prog">{setsLogged}/{t}</span>
                </div>
              );
            })}
          </div>
          <div className="session-foot">
            <span>{derived.exDone}/{derived.exCount} exercises · {derived.setsLogged}/{derived.setsTarget} sets</span>
            {derived.exDone === derived.exCount && derived.exCount > 0 && <span className="all-done">✓ ALL DONE</span>}
          </div>
        </div>

        <div className="today-card stats-card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">TELEMETRY</div>
              <div className="card-h">today's numbers</div>
            </div>
          </div>
          <div className="t-stats">
            <div className="t-stat">
              <div className="t-stat-l">PROJ WEIGHT</div>
              <div className="t-stat-v">{proj.toFixed(1)} <small>lb</small></div>
              {lastLogged && <div className="t-stat-s">last: {lastLogged.lb} lb · w{lastLogged.wk}</div>}
            </div>
            <div className="t-stat">
              <div className="t-stat-l">PUSH-UPS TARGET</div>
              <div className="t-stat-v">{PLAN.pushup_progression[s.week-1].target}</div>
              <div className="t-stat-s">logged: {s.pushupLog[s.week] ?? "—"}</div>
            </div>
            <div className="t-stat">
              <div className="t-stat-l">STREAK</div>
              <div className="t-stat-v">{streakCount} <small>d</small></div>
              <div className="t-stat-s">consecutive</div>
            </div>
            <div className="t-stat">
              <div className="t-stat-l">PHASE PROGRESS</div>
              {isDeload ? (
                <>
                  <div className="t-stat-v warn" style={{fontSize:"22px"}}>DELOAD</div>
                  <div className="t-stat-s">w{s.week} · −40 % load</div>
                </>
              ) : (
                <>
                  <div className="t-stat-v">{Math.round((s.week - phase.weeks[0] + 1) / (phase.weeks[1] - phase.weeks[0] + 1) * 100)}<small>%</small></div>
                  <div className="t-stat-s">{phase.weeks[1] - s.week + 1}w left</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <SkipSession store={store} />

      {/* MEALS + (WEIGHT or PUSH-UPS) */}
      <div className="today-grid">
        <MealTracker store={store} />
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <QuickWeightLog store={store} />
          <PushupTodayCard store={store} />
        </div>
      </div>

      {/* SCHEDULE + WATER */}
      <div className="today-grid">
        <div className="today-card schedule-card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">SCHEDULE · VYVANSE-AWARE</div>
              <div className="card-h">today's day</div>
            </div>
            <div className="card-meta">8:30 dose</div>
          </div>
          <VyvanseCurve height={70} />
          <div className="sched-list">
            {PLAN.schedule.map((row, i) => {
              const [hh, mm] = row.time.split(":").map(Number);
              const rowMin = hh * 60 + mm;
              const nowMin = now.getHours() * 60 + now.getMinutes();
              const upcoming = rowMin > nowMin && rowMin - nowMin < 60;
              const past = rowMin <= nowMin;
              return (
                <div key={i} className={"sched-row" + (upcoming ? " up" : "") + (past ? " past" : "") + (row.tag === "supp" ? " supp" : "")}>
                  <span className="sr-t">{row.time}</span>
                  <span className="sr-tag">{row.tag}</span>
                  <span className="sr-w">{row.what}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="today-card water-card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">HYDRATION</div>
              <div className="card-h">3.5 L · 7×500ml</div>
            </div>
            <div className="card-meta">{water}/{s.waterTarget}</div>
          </div>
          <div className="water-grid">
            {Array.from({ length: s.waterTarget }, (_, i) => (
              <button key={i}
                className={"wcup" + (i < water ? " full" : "")}
                onClick={() => setWaterToday(i + 1 === water ? i : i + 1)}
                title={`500ml × ${i + 1}`}>
                <svg viewBox="0 0 24 32" width="100%" height="100%">
                  <path d="M4 4 L20 4 L18 28 Q12 30 6 28 Z" fill="none"
                    stroke="currentColor" strokeWidth="1.4" />
                  {i < water && (
                    <path d="M4.5 16 L19.5 16 L18 28 Q12 30 6 28 Z"
                      fill="var(--accent)" opacity=".7" />
                  )}
                </svg>
              </button>
            ))}
          </div>
          <div className="water-foot">
            tap to fill / unfill · Vyvanse causes mild dehydration — compounds with training sweat
          </div>

          <div className="today-note">
            <div className="card-eyebrow" style={{marginTop:14}}>NOTE</div>
            <textarea value={note} onChange={(e) => setNoteToday(e.target.value)}
              placeholder="// one-line note for today (sleep, mood, deadline, anything)"
              rows={2} />
          </div>
        </div>
      </div>

      {/* TIME CAPSULE */}
      {window.TimeCapsule && (
        <div className="today-grid" style={{gridTemplateColumns:"1fr"}}>
          <TimeCapsule store={store} />
        </div>
      )}

      {/* QUICK LINKS */}
      <div className="today-quick">
        <button onClick={() => setView("log")}>view log →</button>
        <button onClick={() => setView("plan")}>plan →</button>
        <button onClick={() => setView("protocols")}>protocols →</button>
      </div>
    </div>
  );
}

// ============ PLAN ============
function PlanView({ store }) {
  const { s, derived, setWeek, setDay } = store;
  const { phase, day, vol } = derived;

  return (
    <div className="plan">
      <h2 className="vh">PLAN</h2>

      {/* phase strip */}
      <div className="phase-row">
        {PLAN.phases.map((p) => (
          <button key={p.n}
            className={"phase-btn" + (phase.n === p.n ? " is-active" : "")}
            onClick={() => setWeek(p.weeks[0])}>
            <span className="pb-id">P{p.n} · {p.kcal} kcal</span>
            <span className="pb-name">{p.name}</span>
            <span className="pb-meta">w{p.weeks[0]}–{p.weeks[1]} · {p.milestones.weight_lb}lb · {p.milestones.bench_kg}kg bench</span>
          </button>
        ))}
      </div>

      {/* week scrubber */}
      <div className="week-scrub">
        <div className="ws-num">w<b>{String(s.week).padStart(2,"0")}</b></div>
        <div className="ws-slider">
          <input type="range" min="1" max="24" value={s.week}
            onChange={(e) => setWeek(+e.target.value)} />
          <div className="ws-ticks">
            {[1, 6, 12, 18, 24].map((w) => (
              <span key={w} style={{ left: ((w - 1) / 23 * 100) + "%" }}>w{w}</span>
            ))}
            {[6, 12, 18, 24].map((w) => (
              <span key={"d" + w} className="ws-deload" style={{ left: ((w - 1) / 23 * 100) + "%" }}>D</span>
            ))}
          </div>
        </div>
        <div className="ws-meta">
          <b className={vol.deload ? "warn" : ""}>{vol.deload ? "DELOAD" : `${vol.sets} sets`}</b>
          <span>{phase.kcal} kcal</span>
          {vol.note && <span className="ws-note">// {vol.note}</span>}
        </div>
      </div>

      {/* day strip */}
      <div className="day-strip">
        {PLAN.days.map((d) => {
          let exDone = 0;
          for (let i = 0; i < d.exercises.length; i++) if (s.completed[`${s.week}-${d.n}-${i}`]) exDone++;
          return (
            <button key={d.n}
              className={"ds-btn" + (s.day === d.n ? " is-active" : "") + (d.kind === "rest" ? " rest" : "")}
              onClick={() => setDay(d.n)}>
              <span className="ds-n">D{d.n}</span>
              <span className="ds-name">{d.name}</span>
              <span className="ds-prog">{exDone}/{d.exercises.length}</span>
            </button>
          );
        })}
      </div>

      {/* day detail */}
      <div className="plan-detail">
        <div className="pd-head">
          <h3>{day.name.toUpperCase()}</h3>
          <span className="pd-sub">{day.sub}</span>
          <button className="pd-train" onClick={() => store.setView("train")}>OPEN IN TRAIN →</button>
        </div>
        <div className="pd-list">
          {day.exercises.map((ex, i) => {
            const t = setsForWeek(ex, s.week);
            return (
              <div key={i} className="pd-row" data-ex-anchor={`d${day.n}-${i}`}>
                <span className="pd-i">{String(i+1).padStart(2,"0")}</span>
                <div className="pd-name">
                  {ex.name}
                  {ex.video && (
                    <button className="pd-vid" onClick={() => window.__videoModal && window.__videoModal.open(ex.video, ex.name)} title="form reference">▶ video</button>
                  )}
                  {window.FORM_CUES && window.FORM_CUES[ex.name] && (
                    <button className="pd-vid" style={{color:"var(--warn)",borderBottomColor:"var(--warn)"}}
                      onClick={() => window.__formCuesModal && window.__formCuesModal.open(ex.name)} title="form cues">▣ cues</button>
                  )}
                  {ex.note && <div className="pd-note">↳ {ex.note}</div>}
                </div>
                <span className="pd-sets"><b>{t}</b> × {ex.reps}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* nutrition */}
      <div className="plan-grid">
        <div className="plan-block">
          <h3>NUTRITION · {phase.kcal} kcal</h3>
          <div className="macro-bars">
            <AsciiBar label="kcal" value={PLAN.macros.kcal} max={3000} width={26} />
            <AsciiBar label="prot" value={PLAN.macros.protein} max={250} width={26} suffix=" g" />
            <AsciiBar label="carb" value={PLAN.macros.carbs} max={350} width={26} suffix=" g" />
            <AsciiBar label="fat " value={PLAN.macros.fat}    max={120} width={26} suffix=" g" />
          </div>
          <table className="meal-tbl">
            <thead><tr><th>SLOT</th><th>WHAT</th><th>SWAP / NOTE</th><th className="num">KCAL</th><th className="num">P</th></tr></thead>
            <tbody>{PLAN.meals.map((m, i) => {
              const swap = (s.mealSwaps && s.mealSwaps[i]) || "";
              return (
                <tr key={i}>
                  <td>{m.meal}</td>
                  <td className="muted">{m.what}</td>
                  <td>
                    <input className="meal-swap-input"
                      value={swap}
                      placeholder="—"
                      onChange={(e) => store.setMealSwap(i, e.target.value)} />
                  </td>
                  <td className="num">{m.kcal}</td>
                  <td className="num">{m.p}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <div className="meal-out-row">
            <span className="mor-l">PLANNED MEAL OUT (one per fortnight)</span>
            <input className="meal-out-input"
              value={s.mealOutNote || ""}
              placeholder="e.g. Sat — burger w/ Sam"
              onChange={(e) => store.setMealOutNote(e.target.value)} />
          </div>
        </div>
        <div className="plan-block">
          <h3>SUPPLEMENTS</h3>
          <div className="sup-list">
            {PLAN.supplements.map((sup, i) => (
              <div key={i} className="sup-row">
                <span className="sup-n">{sup.name}</span>
                <span className="sup-d">{sup.dose}</span>
                <span className="sup-note">{sup.note}</span>
              </div>
            ))}
          </div>
          <h3 style={{marginTop:24}}>STANDING RULES</h3>
          <ul className="rules">
            {PLAN.rules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============ LOG ============
function LogView({ store }) {
  const { s, derived, logWeight, removeWeight, logPushups } = store;
  const [wInput, setWInput] = useState("");

  return (
    <div className="log">
      <h2 className="vh">LOG</h2>

      <div className="log-grid">
        <div className="log-card span-2">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">BODY MASS · w1–24</div>
              <div className="card-h">projection vs. measured</div>
            </div>
            <div className="card-meta">proj: {derived.projWeight.toFixed(1)} lb · w{s.week}</div>
          </div>
          <WeightChart weightLog={s.weightLog} currentWeek={s.week} height={260} />
          <div className="wlog-form">
            <span className="prompt">$ log w{s.week}:</span>
            <input type="number" step="0.1" placeholder="lb" value={wInput}
              onChange={(e) => setWInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const lb = parseFloat(wInput);
                  if (lb > 100 && lb < 300) { logWeight(s.week, lb); setWInput(""); }
                }
              }} />
            <button onClick={() => {
              const lb = parseFloat(wInput);
              if (lb > 100 && lb < 300) { logWeight(s.week, lb); setWInput(""); }
            }}>WRITE</button>
          </div>
          {s.weightLog.length > 0 && (
            <div className="wlog-pills">
              {s.weightLog.map((e) => (
                <button key={e.wk} className="pill" onClick={() => removeWeight(e.wk)} title="click to remove">
                  w{e.wk} · {e.lb} lb ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="log-card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">PUSH-UPS</div>
              <div className="card-h">target curve</div>
            </div>
            <div className="card-meta">w{s.week} target {PLAN.pushup_progression[s.week-1].target}</div>
          </div>
          <PushupSpark logged={s.pushupLog} currentWeek={s.week} height={80} />
          <PushupQuickLog store={store} />
        </div>

        <div className="log-card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">COMPLIANCE</div>
              <div className="card-h">24 weeks × 7 days</div>
            </div>
            <div className="card-meta">streak {derived.streakCount}d</div>
          </div>
          <ComplianceGrid store={store} />
          <div className="hm-legend">
            <span><span className="hm-dot d0"></span>none</span>
            <span><span className="hm-dot d1"></span>partial</span>
            <span><span className="hm-dot d2"></span>complete</span>
            <span><span className="hm-dot deload"></span>deload</span>
          </div>
        </div>
      </div>

      {/* per-exercise PR list */}
      <div className="log-card pr-card">
        <div className="card-head">
          <div>
            <div className="card-eyebrow">PERSONAL RECORDS</div>
            <div className="card-h">heaviest set logged · per exercise</div>
          </div>
        </div>
        <PRList store={store} />
      </div>
    </div>
  );
}

function PRList({ store }) {
  const { s } = store;
  const prs = useMemo(() => {
    const map = {};
    Object.entries(s.sets).forEach(([k, v]) => {
      if (!v.exName || typeof v.weight !== "number") return;
      const cur = map[v.exName];
      if (!cur || v.weight > cur.weight || (v.weight === cur.weight && v.reps > cur.reps)) {
        const [wk, d] = k.split("-").map(Number);
        map[v.exName] = { ...v, wk, d };
      }
    });
    return Object.entries(map).sort((a, b) => b[1].weight - a[1].weight);
  }, [s.sets]);

  if (prs.length === 0) {
    return <div className="empty">// no sets logged yet — go train</div>;
  }
  return (
    <div className="pr-list">
      {prs.map(([name, p]) => (
        <div key={name} className="pr-row">
          <span className="pr-name">{name}</span>
          <span className="pr-load"><b>{p.weight}</b> kg × <b>{p.reps}</b></span>
          <span className="pr-when">w{p.wk} d{p.d}</span>
        </div>
      ))}
    </div>
  );
}

// ============ PROTOCOLS ============
function ProtocolsView({ store }) {
  const { derived } = store;
  return (
    <div className="protocols">
      <h2 className="vh">PROTOCOLS</h2>

      {derived.isDeload && (
        <div className="banner deload">
          <span className="banner-tag">ACTIVE</span>
          <span>You are in a deload week. Apply the protocol below.</span>
        </div>
      )}
      {derived.plateau && (
        <div className="banner plateau">
          <span className="banner-tag">ACTIVE</span>
          <span>Plateau detected from your weight log. Apply the protocol below.</span>
        </div>
      )}

      <div className="proto-grid">
        {Object.entries(PLAN.protocols).map(([k, p]) => {
          const active = (k === "deload" && derived.isDeload) || (k === "plateau" && derived.plateau);
          return (
            <div key={k} className={"proto-card" + (active ? " active" : "")}>
              <div className="proto-head">
                <h3>{p.title.toUpperCase()}</h3>
                <span className="proto-cad">{p.cadence}</span>
              </div>
              <ol>{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
              {p.note && <div className="proto-note">// {p.note}</div>}
            </div>
          );
        })}
      </div>

      <FallbackTrigger store={store} />
    </div>
  );
}

function FallbackTrigger({ store }) {
  const [a1, setA1] = useState(null);
  const [a2, setA2] = useState(null);
  const trigger = a1 === true || a2 === true;
  return (
    <div className="fallback-tool">
      <h3>FALLBACK TRIGGER CHECK</h3>
      <p>Fallback is a protocol, not a feeling. Two questions:</p>
      <div className="fb-q">
        <div>1. Thesis deadline within 72 h?</div>
        <div className="fb-btns">
          <button className={a1 === true ? "on" : ""} onClick={() => setA1(true)}>YES</button>
          <button className={a1 === false ? "on" : ""} onClick={() => setA1(false)}>NO</button>
        </div>
      </div>
      <div className="fb-q">
        <div>2. Sleep below 5.5 h average for 3 consecutive nights?</div>
        <div className="fb-btns">
          <button className={a2 === true ? "on" : ""} onClick={() => setA2(true)}>YES</button>
          <button className={a2 === false ? "on" : ""} onClick={() => setA2(false)}>NO</button>
        </div>
      </div>
      {a1 != null && a2 != null && (
        <div className={"fb-out " + (trigger ? "on" : "off")}>
          {trigger
            ? "✓ ENTER FALLBACK MODE — 2 weeks max. 3 sessions. 2,500 kcal. 190 g protein. Push-ups 2 sets daily."
            : "✗ Fallback NOT triggered. Continue main plan. Tiredness alone is not a trigger."}
        </div>
      )}
    </div>
  );
}

// ============ EXPORT / IMPORT ============
function ExportView({ store }) {
  const { s, derived } = store;
  const [tab, setTab] = useState("summary");
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState(null);

  const doImport = () => {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      setImportStatus({ ok: false, msg: "parse error · not valid JSON" });
      return;
    }
    // sanity check
    if (typeof parsed !== "object" || parsed === null) {
      setImportStatus({ ok: false, msg: "not an object — expected an export from this app" });
      return;
    }
    if (!confirm("Replace ALL current data with the imported snapshot? Your current logs will be overwritten.")) return;
    try {
      // Merge defaults so missing fields don't break the app.
      const fresh = { ...defaultState(), ...parsed, bootSeen: true };
      localStorage.setItem("fti.console.v2", JSON.stringify(fresh));
      setImportStatus({ ok: true, msg: "imported · reloading…" });
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setImportStatus({ ok: false, msg: "write failed · " + (e.message || "unknown") });
    }
  };

  const importFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => { setImportText(String(e.target.result || "")); };
    reader.readAsText(file);
  };

  const exportText = useMemo(() => {
    const lines = [];
    const today = todayISO();
    lines.push("# FTI · 24-WEEK RECONDITIONING PROTOCOL — EXPORT");
    lines.push("");
    lines.push(`Generated:        ${today}`);
    lines.push(`Subject start:    ${s.startDate || "—"}`);
    lines.push(`Current position: w${s.week}/24 · d${s.day}/7 · phase ${derived.phase.n} (${derived.phase.name})`);
    lines.push(`Phase calories:   ${derived.phase.kcal} kcal/day`);
    if (derived.isDeload) lines.push(`STATUS:           DELOAD WEEK (active)`);
    if (derived.plateau)  lines.push(`STATUS:           PLATEAU DETECTED`);
    lines.push("");

    lines.push("## WEIGHT LOG");
    if (s.weightLog.length === 0) lines.push("  (empty)");
    else {
      lines.push("  WK   LB     KG     Δ vs start");
      [...s.weightLog].sort((a,b)=>a.wk-b.wk).forEach((w) => {
        const kg = (w.lb / 2.20462).toFixed(1);
        const delta = (w.lb - 210).toFixed(1);
        lines.push(`  w${String(w.wk).padStart(2,"0")}  ${w.lb.toFixed(1).padStart(5)}  ${kg.padStart(5)}   ${delta > 0 ? "+" : ""}${delta} lb`);
      });
    }
    lines.push("");

    lines.push("## PUSH-UP LOG (max unbroken)");
    const pks = Object.keys(s.pushupLog).sort((a,b)=>+a-+b);
    if (pks.length === 0) lines.push("  (empty)");
    else pks.forEach((k) => lines.push(`  w${String(k).padStart(2,"0")}  ${s.pushupLog[k]}`));
    lines.push("");

    lines.push("## SET LOG");
    const setKeys = Object.keys(s.sets).sort();
    if (setKeys.length === 0) lines.push("  (empty)");
    else setKeys.forEach((k) => {
      const set = s.sets[k];
      const [wk, d, ei, sn] = k.split("-").map(Number);
      const ex = PLAN.days[d-1].exercises[ei];
      lines.push(`  w${wk} d${d} ${ex ? ex.name : "?"} set ${sn}: ${set.weight || "—"} kg × ${set.reps || "—"}`);
    });
    lines.push("");

    lines.push("## MEAL SWAPS / OUT");
    const swaps = s.mealSwaps || {};
    const swapEntries = Object.entries(swaps).filter(([_, v]) => v && v.trim());
    if (swapEntries.length === 0 && !s.mealOutNote) lines.push("  (none)");
    swapEntries.forEach(([i, txt]) => {
      const m = PLAN.meals[+i];
      lines.push(`  ${m ? m.meal : i}: ${txt}`);
    });
    if (s.mealOutNote) lines.push(`  Planned meal out: ${s.mealOutNote}`);
    lines.push("");

    lines.push("## DAILY NOTES");
    const noteKeys = Object.keys(s.notes).sort();
    if (noteKeys.length === 0) lines.push("  (empty)");
    else noteKeys.forEach((d) => {
      if (s.notes[d] && s.notes[d].trim()) lines.push(`  ${d}\n    ${s.notes[d].split("\n").join("\n    ")}`);
    });
    lines.push("");

    lines.push(`## TOTALS`);
    lines.push(`  Sets logged:       ${setKeys.length}`);
    lines.push(`  Weight check-ins:  ${s.weightLog.length}`);
    lines.push(`  Push-up tests:     ${pks.length}`);
    lines.push(`  Streak (days):     ${derived.streakCount}`);
    lines.push("");
    lines.push("// end of export.");
    return lines.join("\n");
  }, [s, derived]);

  const dlText = () => {
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fti-export-${todayISO()}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const dlJson = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fti-state-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const copy = () => {
    navigator.clipboard.writeText(tab === "json" ? JSON.stringify(s, null, 2) : exportText);
  };

  return (
    <div className="export">
      <h2 className="vh">EXPORT</h2>
      <p className="export-sub">Snapshot of every logged set, weight check-in, push-up test, meal swap, and daily note since you started. Use it for your records, or hand it to a coach.</p>

      <div className="export-actions">
        <button className={"ea-tab" + (tab === "summary" ? " on" : "")} onClick={() => setTab("summary")}>SUMMARY</button>
        <button className={"ea-tab" + (tab === "json" ? " on" : "")} onClick={() => setTab("json")}>RAW JSON</button>
        <span className="ea-spacer"></span>
        <button className="ea-btn" onClick={copy}>COPY</button>
        <button className="ea-btn" onClick={dlText}>DOWNLOAD .txt</button>
        <button className="ea-btn" onClick={dlJson}>DOWNLOAD .json</button>
      </div>

      <pre className="export-pre">{tab === "json" ? JSON.stringify(s, null, 2) : exportText}</pre>

      <div className="import-block">
        <div className="import-head">
          <div className="card-eyebrow">RESTORE FROM BACKUP</div>
          <div className="card-h">Paste a previous .json export</div>
        </div>
        <p className="import-note">
          Replaces ALL current data on this device. Use when restoring on a new phone,
          after a factory reset, or to roll back. Your current data is wiped.
        </p>
        <textarea className="import-area" rows={5}
          placeholder='// paste the contents of fti-state-YYYY-MM-DD.json here, or use the file picker'
          value={importText}
          onChange={(e) => setImportText(e.target.value)} />
        <div className="import-actions">
          <label className="import-file-btn">
            ↑ choose file
            <input type="file" accept="application/json,.json"
              onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} />
          </label>
          <button className="import-btn" onClick={doImport} disabled={!importText.trim()}>
            ⬆ RESTORE
          </button>
        </div>
        {importStatus && (
          <div className={"import-status " + (importStatus.ok ? "ok" : "err")}>
            {importStatus.ok ? "✓" : "✗"} {importStatus.msg}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { TodayView, PlanView, LogView, ProtocolsView, ExportView });

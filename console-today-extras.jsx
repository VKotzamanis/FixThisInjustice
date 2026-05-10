// console-today-extras.jsx — daily meal tracker, quick weight log,
// daily push-up counter, and helpers used by the upgraded Today view.

const { useState, useEffect, useMemo } = React;

// ---------- Daily meal tracker ----------
// State shape: s.mealsByDay[ISO] = { [mealIdx]: { skipped: bool, swap: string|null } }
// "Eaten" = entry exists and skipped !== true.
function MealTracker({ store }) {
  const { s, update } = store;
  const today = todayISO();
  const phase = s.week <= 8 ? PLAN.phases[0] : (s.week <= 16 ? PLAN.phases[1] : PLAN.phases[2]);
  const target = phase.kcal_range[1]; // top of phase target
  const proteinTarget = PLAN.macros.protein;

  const day = (s.mealsByDay && s.mealsByDay[today]) || {};
  const setMeal = (idx, patch) => {
    update((p) => {
      const next = { ...(p.mealsByDay || {}) };
      const cur = next[today] || {};
      next[today] = { ...cur, [idx]: { ...(cur[idx] || {}), ...patch } };
      return { ...p, mealsByDay: next };
    });
  };
  const clearMeal = (idx) => {
    update((p) => {
      const next = { ...(p.mealsByDay || {}) };
      const cur = { ...(next[today] || {}) };
      delete cur[idx];
      next[today] = cur;
      return { ...p, mealsByDay: next };
    });
  };

  const totals = useMemo(() => {
    let kcal = 0, protein = 0, eaten = 0, skipped = 0;
    PLAN.meals.forEach((m, i) => {
      const e = day[i];
      if (!e) return;
      if (e.skipped) { skipped++; return; }
      kcal += m.kcal; protein += m.p; eaten++;
    });
    return { kcal, protein, eaten, skipped };
  }, [day]);

  const proteinFragile = totals.eaten > 0 && totals.protein < proteinTarget * 0.5
    && PLAN.meals.findIndex((m) => /pita/i.test(m.what)) >= 0
    && day[3]?.skipped;

  const pPct = Math.min(1, totals.protein / proteinTarget);
  const kPct = Math.min(1, totals.kcal / target);

  return (
    <div className="today-card meals-card">
      <div className="card-head">
        <div>
          <div className="card-eyebrow">FUEL · TODAY'S MEALS</div>
          <div className="card-h">eat <span className="muted">· {target} kcal · {proteinTarget} g protein</span></div>
        </div>
        <div className="card-meta meals-totals">
          <span><b>{totals.kcal}</b><span className="muted">/{target}</span> kcal</span>
          <span style={{marginLeft:10}}><b>{totals.protein}</b><span className="muted">/{proteinTarget}</span> g P</span>
        </div>
      </div>

      <div className="meals-progress">
        <div className="mp-row"><span className="mp-l">kcal</span>
          <div className="mp-track"><div className="mp-fill" style={{width:(kPct*100)+"%"}}></div></div>
          <span className="mp-v">{Math.round(kPct*100)}%</span>
        </div>
        <div className="mp-row"><span className="mp-l">prot</span>
          <div className="mp-track"><div className="mp-fill prot" style={{width:(pPct*100)+"%"}}></div></div>
          <span className="mp-v">{Math.round(pPct*100)}%</span>
        </div>
      </div>

      <div className="meals-list">
        {PLAN.meals.map((m, i) => {
          const e = day[i];
          const isCritical = /pita/i.test(m.what) || /shake/i.test(m.what);
          const eaten = e && !e.skipped;
          const skipped = e && e.skipped;
          return (
            <div key={i} className={"meal-row" + (eaten ? " eaten" : "") + (skipped ? " skipped" : "")}>
              <button className="meal-tick" onClick={() => {
                if (eaten) clearMeal(i);
                else setMeal(i, { skipped: false });
              }} aria-label={eaten ? "mark not eaten" : "mark eaten"}>
                {eaten ? "✓" : (skipped ? "✗" : "·")}
              </button>
              <div className="meal-mid">
                <div className="meal-slot">
                  {m.meal}
                  {isCritical && !eaten && !skipped && <span className="meal-crit" title="Vyvanse-fragile — protein at risk if skipped">!</span>}
                </div>
                <div className="meal-what">{m.what}</div>
              </div>
              <div className="meal-num">
                <div className="meal-kcal">{m.kcal}</div>
                <div className="meal-p"><b>{m.p}</b>g P</div>
              </div>
              {!eaten && (
                <button className="meal-skip" onClick={() => skipped ? clearMeal(i) : setMeal(i, { skipped: true })}
                  title={skipped ? "unskip" : "mark skipped"}>
                  {skipped ? "↺" : "skip"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {totals.skipped > 0 && totals.protein < proteinTarget * 0.7 && (
        <div className="meals-warn">
          ⚠ {totals.skipped} meal{totals.skipped>1?"s":""} skipped · protein at <b>{totals.protein}g</b> / {proteinTarget}g.
          Add a second whey scoop to recover. Liquid protein survives Vyvanse appetite suppression.
        </div>
      )}
    </div>
  );
}

// ---------- One-tap Monday weight ----------
function QuickWeightLog({ store }) {
  const { s, logWeight } = store;
  const [val, setVal] = useState("");
  const isMon = (new Date()).getDay() === 1;
  const already = s.weightLog.find((e) => e.wk === s.week);

  if (already) {
    return (
      <div className="qwl logged">
        <span className="qwl-l">w{s.week} weight</span>
        <span className="qwl-v">{already.lb} lb</span>
        <button className="qwl-edit" onClick={() => store.removeWeight(s.week)}>edit</button>
      </div>
    );
  }
  return (
    <div className={"qwl" + (isMon ? " mon" : "")}>
      <span className="qwl-l">{isMon ? "MONDAY · LOG WEIGHT" : "log w" + s.week + " weight"}</span>
      <input type="number" step="0.1" placeholder="lb" inputMode="decimal"
        value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const lb = parseFloat(val);
            if (lb > 100 && lb < 300) { logWeight(s.week, lb); setVal(""); }
          }
        }} />
      <button onClick={() => {
        const lb = parseFloat(val);
        if (lb > 100 && lb < 300) { logWeight(s.week, lb); setVal(""); }
      }}>LOG ↵</button>
    </div>
  );
}

// ---------- Daily push-up counter (for D2/3/4/6) ----------
function PushupTodayCard({ store }) {
  const { s, logPushups } = store;
  const day = PLAN.days[s.day - 1];
  if (!day.pushups) return null;
  const target = PLAN.pushup_progression[s.week - 1].target;
  const cur = s.pushupLog[s.week] ?? 0;
  const sets = 3;
  const setSize = Math.max(1, Math.round(target));

  return (
    <div className="today-card pushup-today">
      <div className="card-head">
        <div>
          <div className="card-eyebrow">PUSH-UPS · DAILY</div>
          <div className="card-h">target <b>{target}</b> <span className="muted">× {sets} sets</span></div>
        </div>
        <div className="card-meta">{cur > 0 ? `last logged max: ${cur}` : "not logged this week"}</div>
      </div>
      <div className="pu-pellets">
        {Array.from({ length: target }, (_, i) => (
          <span key={i} className={"pu-pellet" + (i < cur ? " on" : "")}></span>
        ))}
      </div>
      <div className="pu-row">
        <button className="pu-step" onClick={() => logPushups(s.week, Math.max(0, cur - 1))}>−1</button>
        <button className="pu-step" onClick={() => logPushups(s.week, cur + 1)}>+1</button>
        <button className="pu-step" onClick={() => logPushups(s.week, cur + 5)}>+5</button>
        <input type="number" placeholder="set" inputMode="numeric"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseInt(e.target.value, 10);
              if (n >= 0 && n < 200) { logPushups(s.week, n); e.target.value = ""; }
            }
          }} />
        {cur >= target && <span className="pu-done">✓ TARGET HIT</span>}
      </div>
    </div>
  );
}

// ---------- Skip / shift session controls ----------
function SkipSession({ store }) {
  const { s, derived, update } = store;
  if (!derived.onTrack) return null;
  if (derived.exDone > 0 || derived.setsLogged > 0) return null;
  if (derived.day.kind === "rest") return null;

  const skip = () => {
    update((p) => ({ ...p, skipped: { ...(p.skipped || {}), [`${s.week}-${s.day}`]: true } }));
  };
  return (
    <div className="skip-bar">
      <button className="skip-btn" onClick={skip}>can't train today · mark skipped</button>
    </div>
  );
}

Object.assign(window, { MealTracker, QuickWeightLog, PushupTodayCard, SkipSession });

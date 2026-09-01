// console-fun.jsx — fun mechanics: form cues, specimens, telemetry, phase boss, capsule, eggs.
// All UI components + a few hooks. Loaded last.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// =====================================================================
// FORM CUES MODAL
// =====================================================================
function FormCuesModal({ exercise, cues, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!cues) return null;
  return (
    <div className="fcm-bg" onClick={onClose}>
      <div className="fcm" onClick={(e) => e.stopPropagation()}>
        <div className="fcm-head">
          <div className="fcm-title">
            <div className="fcm-eyebrow">▣ FORM CUES &amp; COMMON MISTAKES</div>
            <div className="fcm-name">{exercise}</div>
          </div>
          <button className="fcm-close" onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className="fcm-body">
          <section>
            <h4 className="fcm-h">SETUP</h4>
            <ol className="fcm-list">{cues.setup.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
          <section>
            <h4 className="fcm-h">EXECUTION</h4>
            <ol className="fcm-list">{cues.execution.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
          <section>
            <h4 className="fcm-h danger">COMMON MISTAKES</h4>
            <ul className="fcm-list mistakes">{cues.mistakes.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </section>
          {cues.tip && (
            <section className="fcm-tip">
              <span className="fcm-tip-tag">// PRO TIP</span>
              <span>{cues.tip}</span>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function useFormCuesModal() {
  const [entry, setEntry] = useState(null);
  const open = (name) => {
    const cues = (window.FORM_CUES || {})[name];
    if (cues) setEntry({ name, cues });
  };
  const close = () => setEntry(null);
  const node = entry
    ? <FormCuesModal exercise={entry.name} cues={entry.cues} onClose={close} />
    : null;
  return { open, close, node };
}

// =====================================================================
// SPECIMEN CARD DROP — toast + collection logic
// =====================================================================
function SpecimenDrop({ card, onClose }) {
  // Auto-dismiss after 12s, or on click.
  useEffect(() => {
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!card) return null;
  return (
    <div className={"spec-drop rarity-" + card.rarity} onClick={onClose}>
      <div className="spec-drop-head">
        <span className="spec-rarity">◈ {card.rarity.toUpperCase()} SPECIMEN ACQUIRED</span>
        <span className="spec-x">tap to dismiss</span>
      </div>
      <div className="spec-drop-card">
        <div className="spec-cat">{card.category}</div>
        <div className="spec-title">{card.title}</div>
        <div className="spec-body">{card.body}</div>
        {card.source && <div className="spec-source">{card.source}</div>}
      </div>
      <div className="spec-drop-foot">added to ATLAS · #{card.id}</div>
    </div>
  );
}

// =====================================================================
// TELEMETRY TOAST — every set log triggers a ~4s readout
// =====================================================================
function TelemetryToast({ msg, tone, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!msg) return null;
  return (
    <div className={"tlm-toast" + (tone === "coach" ? " coach" : "")} onClick={onClose}>
      <span className="tlm-tag">{tone === "coach" ? "// COACH" : "// TELEMETRY"}</span>
      <span className="tlm-msg">{msg}</span>
    </div>
  );
}

// Build a telemetry message based on the set just logged + history.
function buildTelemetryMsg(store, ctx) {
  const { week, day, exName, weight, reps, exIdx } = ctx;
  const all = Object.entries(store.s.sets);
  // tonnage cumulative for this exercise in this phase
  const phase = week <= 8 ? 1 : (week <= 16 ? 2 : 3);
  const phaseWks = phase === 1 ? [1,8] : phase === 2 ? [9,16] : [17,24];
  let phaseTonnage = 0;
  let lifetimeTonnage = 0;
  let lifetimeBest = { weight: 0, reps: 0 };
  let exTimesLogged = 0;
  all.forEach(([k, v]) => {
    if (v.exName !== exName) return;
    if (!v.weight || !v.reps) return;
    const w = +k.split("-")[0];
    const t = v.weight * v.reps;
    lifetimeTonnage += t;
    if (w >= phaseWks[0] && w <= phaseWks[1]) phaseTonnage += t;
    if (v.weight > lifetimeBest.weight || (v.weight === lifetimeBest.weight && v.reps > lifetimeBest.reps)) {
      lifetimeBest = { weight: v.weight, reps: v.reps };
    }
    exTimesLogged++;
  });
  // estimated 1RM via Epley
  const e1rm = Math.round(weight * (1 + reps / 30));
  // milestones — pick the most relevant message
  const choices = [];
  if (exTimesLogged === 1) {
    choices.push(`first ${exName.toLowerCase()} set on record · baseline established`);
  } else {
    choices.push(`e1RM ${e1rm} kg · lifetime best ${lifetimeBest.weight}×${lifetimeBest.reps}`);
    choices.push(`set banked · ${exTimesLogged} ${exName.toLowerCase()} sets logged total`);
  }
  if (phaseTonnage > 1000) {
    choices.push(`phase ${phase} tonnage: ${Math.round(phaseTonnage).toLocaleString()} kg moved`);
  }
  if (weight > 0 && reps >= 8) {
    choices.push(`${reps} reps × ${weight} kg = ${weight * reps} kg banked this set`);
  }
  if (lifetimeBest.weight && weight === lifetimeBest.weight && reps === lifetimeBest.reps) {
    choices.push(`tied lifetime best · ${weight} kg × ${reps}`);
  }
  if (lifetimeBest.weight && weight > lifetimeBest.weight) {
    choices.push(`🏆 NEW PR · previous best ${lifetimeBest.weight} kg`);
  }
  // Pick one at random
  return choices[Math.floor(Math.random() * choices.length)];
}

// =====================================================================
// ATLAS VIEW — specimen card collection
// =====================================================================
function AtlasView({ store }) {
  const owned = store.s.specimens || {};
  const all = window.SPECIMEN_CARDS || [];
  const ownedCount = Object.keys(owned).length;
  const totalCount = all.length;
  const ownedByRarity = { common: 0, uncommon: 0, rare: 0 };
  const totalByRarity = { common: 0, uncommon: 0, rare: 0 };
  all.forEach(c => {
    totalByRarity[c.rarity]++;
    if (owned[c.id]) ownedByRarity[c.rarity]++;
  });

  const [filter, setFilter] = useState("all"); // all | owned | locked | common | uncommon | rare
  const [open, setOpen] = useState(null);  // currently expanded card id

  const filtered = all.filter(c => {
    const own = !!owned[c.id];
    if (filter === "all") return true;
    if (filter === "owned") return own;
    if (filter === "locked") return !own;
    if (["common", "uncommon", "rare"].includes(filter)) return c.rarity === filter;
    return true;
  });

  return (
    <div className="atlas">
      <h2 className="vh">ATLAS</h2>
      <p className="atlas-sub">
        A field journal. Each working set logged has a chance to drop a card.
        Tap any owned card to read it.
      </p>

      <div className="atlas-stats">
        <div className="as">
          <div className="as-l">COLLECTED</div>
          <div className="as-v">{ownedCount}<small>/{totalCount}</small></div>
          <div className="as-p">
            <span style={{ width: ((ownedCount / totalCount) * 100) + "%" }}></span>
          </div>
        </div>
        <div className="as">
          <div className="as-l">COMMON</div>
          <div className="as-v">{ownedByRarity.common}<small>/{totalByRarity.common}</small></div>
        </div>
        <div className="as">
          <div className="as-l">UNCOMMON</div>
          <div className="as-v">{ownedByRarity.uncommon}<small>/{totalByRarity.uncommon}</small></div>
        </div>
        <div className="as">
          <div className="as-l">RARE</div>
          <div className="as-v">{ownedByRarity.rare}<small>/{totalByRarity.rare}</small></div>
        </div>
      </div>

      <div className="atlas-filters">
        {["all","owned","locked","common","uncommon","rare"].map(f => (
          <button key={f} className={"af-btn" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="atlas-grid">
        {filtered.map(c => {
          const own = !!owned[c.id];
          const isOpen = open === c.id;
          return (
            <button key={c.id} className={"ac rarity-" + c.rarity + (own ? " owned" : " locked") + (isOpen ? " open" : "")}
              onClick={() => own ? setOpen(isOpen ? null : c.id) : null}>
              <div className="ac-head">
                <span className="ac-id">#{c.id}</span>
                <span className="ac-rarity">{c.rarity}</span>
              </div>
              {own ? (
                <>
                  <div className="ac-cat">{c.category}</div>
                  <div className="ac-title">{c.title}</div>
                  {isOpen && (
                    <>
                      <div className="ac-body">{c.body}</div>
                      {c.source && <div className="ac-source">{c.source}</div>}
                    </>
                  )}
                </>
              ) : (
                <div className="ac-locked">
                  <div className="ac-lock-icon">⌧</div>
                  <div className="ac-lock-msg">UNDISCOVERED</div>
                  <div className="ac-lock-hint">{c.category} · {c.rarity}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// PHASE BOSS CUTSCENE — fullscreen takeover at phase transition
// =====================================================================
function PhaseTransition({ from, to, stats, onClose }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= 5) return;
    const t = setTimeout(() => setStep(s => s + 1), step === 0 ? 600 : 800);
    return () => clearTimeout(t);
  }, [step]);
  return (
    <div className="phase-trans">
      <pre className="pt-art">
{` ╔═══════════════════════════════════════════════════╗
 ║                                                   ║
 ║         PHASE TRANSITION SEQUENCE                 ║
 ║                                                   ║
 ║         ${String(from).padEnd(13)}→  ${String(to).padEnd(20)} ║
 ║                                                   ║
 ╚═══════════════════════════════════════════════════╝`}
      </pre>
      <div className="pt-stats">
        {step >= 1 && <div className="pt-row"><span>weeks completed</span> <b>{stats.weeks}</b></div>}
        {step >= 2 && <div className="pt-row"><span>sets logged</span> <b>{stats.sets}</b></div>}
        {step >= 3 && <div className="pt-row"><span>tonnage moved</span> <b>{Math.round(stats.tonnage).toLocaleString()} kg</b></div>}
        {step >= 4 && <div className="pt-row"><span>specimens collected</span> <b>{stats.specimens}</b></div>}
      </div>
      {step >= 5 && (
        <div className="pt-foot">
          <div className="pt-msg">// new phase begins on next training day</div>
          <button className="pt-btn" onClick={onClose}>CONTINUE ↵</button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// TIME CAPSULE — week 1 → week 24
// =====================================================================
function TimeCapsule({ store }) {
  const [text, setText] = useState(store.s.timeCapsule?.note || "");
  const [collapsed, setCollapsed] = useState(true);
  const writtenAt = store.s.timeCapsule?.writtenAt;
  const opened = store.s.timeCapsule?.opened;
  const pos = store.derived.pos;
  const programWeek = pos ? pos.week : 1;
  const canOpen = programWeek >= 24 && writtenAt && !opened;
  const inDraftMode = !writtenAt;

  const seal = () => {
    if (text.trim().length < 20) {
      alert("Write at least a sentence. This is for future-you.");
      return;
    }
    store.update({ timeCapsule: { note: text, writtenAt: todayISO(), opened: false } });
  };
  const openCapsule = () => {
    store.update(p => ({ ...p, timeCapsule: { ...(p.timeCapsule || {}), opened: true } }));
  };

  // Once sealed (but not yet openable), collapse to a one-line banner.
  if (!inDraftMode && !opened && !canOpen && collapsed) {
    return (
      <button className="capsule capsule-collapsed" onClick={() => setCollapsed(false)}>
        <span className="capsule-eyebrow">⌬ TIME CAPSULE</span>
        <span className="capsule-mini">sealed {writtenAt} · unlocks in {24 - programWeek} week{24 - programWeek === 1 ? "" : "s"}</span>
        <span className="capsule-expand">▸ expand</span>
      </button>
    );
  }

  return (
    <div className="capsule">
      <div className="capsule-eyebrow">⌬ TIME CAPSULE</div>
      <div className="capsule-h">a letter to your week-24 self</div>
      {inDraftMode ? (
        <>
          <p className="capsule-p">
            Write a short note — why you're starting, what you hope for, what you fear,
            what success looks like. It will be sealed until week 24.
          </p>
          <textarea className="capsule-area" rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="// I'm starting this because..." />
          <div className="capsule-actions">
            <span className="capsule-count">{text.length} chars</span>
            <button className="capsule-btn" onClick={seal} disabled={text.trim().length < 20}>
              SEAL CAPSULE ↵
            </button>
          </div>
        </>
      ) : opened ? (
        <>
          <p className="capsule-p sealed">CAPSULE OPENED · sealed {writtenAt}</p>
          <pre className="capsule-text">{store.s.timeCapsule.note}</pre>
        </>
      ) : canOpen ? (
        <>
          <p className="capsule-p">Week 24 reached. The capsule is unlocked.</p>
          <button className="capsule-btn big" onClick={openCapsule}>OPEN CAPSULE</button>
        </>
      ) : (
        <>
          <p className="capsule-p sealed">▮ CAPSULE SEALED · {writtenAt} · opens week 24</p>
          <div className="capsule-locked">
            ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈ ◈
            <br />
            unlocks in {24 - programWeek} week{24 - programWeek === 1 ? "" : "s"}
          </div>
          <button className="capsule-collapse-btn" onClick={() => setCollapsed(true)}>▴ collapse</button>
        </>
      )}
    </div>
  );
}

// =====================================================================
// EASTER EGGS — Konami code listener + cheat command + 100th set
// =====================================================================
function useKonamiCode(onActivate) {
  const buf = useRef([]);
  useEffect(() => {
    const code = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    const onKey = (e) => {
      buf.current.push(e.key);
      if (buf.current.length > code.length) buf.current.shift();
      if (buf.current.length === code.length &&
          buf.current.every((k, i) => k.toLowerCase() === code[i].toLowerCase())) {
        buf.current = [];
        onActivate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onActivate]);
}

function KonamiOverlay({ onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="konami" onClick={onClose}>
      <pre className="konami-art">
{`         ▲ ▲ ▼ ▼ ◀ ▶ ◀ ▶ B A
   ╔═══════════════════════════════╗
   ║   CHEAT CODE NOT FOUND        ║
   ║                               ║
   ║   you can't shortcut a squat. ║
   ║                               ║
   ╚═══════════════════════════════╝`}
      </pre>
    </div>
  );
}

// Special toast for the Nth set (50, 100, 250, 500, 1000)
function MilestoneToast({ count, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [onClose]);
  const msg = {
    50: "// 50 sets banked. you're past the 'will I actually do this' threshold.",
    100: "// 100 sets. 1% of a 10,000-set lifetime. negligible. continue.",
    250: "// 250 sets logged. you have outlasted 80% of new gym goers (3-month dropoff).",
    500: "// 500 sets. half a thousand. Milo's bull would weigh ~600 kg by now.",
    1000: "// 1,000 sets. you are no longer a beginner. by any reasonable definition.",
  }[count] || "// milestone";
  return (
    <div className="milestone" onClick={onClose}>
      <div className="milestone-bg"></div>
      <div className="milestone-card">
        <div className="milestone-num">{count}</div>
        <div className="milestone-label">SETS LOGGED</div>
        <div className="milestone-msg">{msg}</div>
      </div>
    </div>
  );
}

// =====================================================================
// EXPORTS
// =====================================================================
// =====================================================================
// ERROR BOUNDARY — wraps each view. A view crash gives a recoverable
// message + "back to Today" instead of a black screen.
// =====================================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) {
    try { console.error("[FTI] view crashed:", err, info); } catch (e) {}
  }
  reset = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="err-boundary">
        <div className="err-tag">// VIEW CRASHED</div>
        <h3>this view threw an error</h3>
        <pre className="err-msg">{String(this.state.error.message || this.state.error)}</pre>
        <div className="err-actions">
          <button onClick={this.reset}>↻ retry this view</button>
          {this.props.onBack && (
            <button className="ghost" onClick={() => { this.reset(); this.props.onBack(); }}>
              ← back to Today
            </button>
          )}
        </div>
        <div className="err-help">
          // your data is safe. Use Export → backup JSON before further changes if you suspect corruption.
        </div>
      </div>
    );
  }
}

// =====================================================================
// PWA UPDATE TOAST — listens for new service worker, prompts reload
// =====================================================================
function PWAUpdateToast({ onReload, onDismiss }) {
  return (
    <div className="pwa-toast">
      <span className="pwa-tag">// NEW VERSION</span>
      <span className="pwa-msg">a fresh build is ready</span>
      <button className="pwa-reload" onClick={onReload}>RELOAD</button>
      <button className="pwa-dismiss" onClick={onDismiss} aria-label="dismiss">✕</button>
    </div>
  );
}

// =====================================================================
// UNDO TOAST — after deleting a set, give 6 seconds to take it back
// =====================================================================
function UndoToast({ msg, onUndo, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="undo-toast">
      <span className="undo-tag">// DELETED</span>
      <span className="undo-msg">{msg}</span>
      <button className="undo-btn" onClick={onUndo}>↺ UNDO</button>
    </div>
  );
}

Object.assign(window, { ErrorBoundary, PWAUpdateToast, UndoToast });


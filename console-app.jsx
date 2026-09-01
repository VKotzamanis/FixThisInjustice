// console-app.jsx — root <App /> component + ReactDOM.render. Loaded last.

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#f472b6",
  "scanlines": true,
  "flicker": true,
  "density": "compact"
}/*EDITMODE-END*/;

function App() {
  const store = usePlanStore();
  const { s, derived, setView, setWeek, setDay, completeBoot, reset, goToday, update } = store;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [spotOpen, setSpotOpen] = useState(false);
  const [bootShown, setBootShown] = useState(!s.bootSeen);
  const [phaseTransition, setPhaseTransition] = useState(null);
  const [konami, setKonami] = useState(false);

  // Visual viewport — track on-screen keyboard so fixed-position chrome can
  // sit ABOVE it. Sets --kb-h on body.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height);
      document.body.style.setProperty("--kb-h", inset + "px");
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  // Modals
  const videoModal = (window.useVideoModal || (() => ({open:()=>{},close:()=>{},node:null})))();
  const formCuesModal = (window.useFormCuesModal || (() => ({open:()=>{},close:()=>{},node:null})))();
  useEffect(() => {
    window.__videoModal = videoModal;
    window.__formCuesModal = formCuesModal;
    return () => { window.__videoModal = null; window.__formCuesModal = null; };
  }, [videoModal, formCuesModal]);

  // Sync tweaks → CSS
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    document.body.classList.toggle("compact", t.density === "compact");
  }, [t.accent, t.density]);

  // Phase transition detector — when the user crosses 8→9 or 16→17 we trigger a cutscene.
  useEffect(() => {
    const cur = derived.phase.n;
    const seen = s.lastPhaseSeen || 1;
    if (cur > seen) {
      // Compute stats for the just-completed phase.
      const fromPhase = seen;
      const fromName = PLAN.phases[fromPhase - 1].name.toUpperCase();
      const toName   = PLAN.phases[cur - 1].name.toUpperCase();
      const phaseWks = fromPhase === 1 ? [1, 8] : fromPhase === 2 ? [9, 16] : [17, 24];
      let sets = 0, tonnage = 0;
      Object.entries(s.sets).forEach(([k, v]) => {
        const wk = +k.split("-")[0];
        if (wk >= phaseWks[0] && wk <= phaseWks[1] && v.weight && v.reps) {
          sets++;
          tonnage += v.weight * v.reps;
        }
      });
      const specimens = Object.keys(s.specimens || {}).length;
      setPhaseTransition({
        from: `PHASE ${fromPhase} · ${fromName}`,
        to:   `PHASE ${cur} · ${toName}`,
        stats: { weeks: phaseWks[1] - phaseWks[0] + 1, sets, tonnage, specimens },
      });
    }
  }, [derived.phase.n]);

  const closePhaseTransition = () => {
    update({ lastPhaseSeen: derived.phase.n });
    setPhaseTransition(null);
  };

  // PWA update detection — show a small toast when the SW says a new version is ready.
  const [pwaUpdate, setPwaUpdate] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let waitingWorker = null;
    const tryShow = (reg) => {
      if (!reg) return;
      if (reg.waiting && reg.active) { waitingWorker = reg.waiting; setPwaUpdate(true); }
      reg.addEventListener && reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = nw;
            setPwaUpdate(true);
          }
        });
      });
    };
    navigator.serviceWorker.getRegistration().then(tryShow).catch(() => {});
    const onCtrl = () => { /* page is now under new SW — could auto-reload, but we let user choose */ };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    window.__pwaReload = () => {
      if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => location.reload(), 200);
    };
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onCtrl);
  }, []);

  // Konami code easter egg
  if (window.useKonamiCode) window.useKonamiCode(() => setKonami(true));

  // Keyboard: ⌘K, view 1-N, J/K week, ←/→ day, T today, Esc closes spot.
  useEffect(() => {
    const fn = (e) => {
      const tag = e.target?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setSpotOpen(true); return;
      }
      if (isInput) return;
      if (e.key === "Escape") setSpotOpen(false);
      if (/^[1-9]$/.test(e.key)) {
        const v = VIEWS[+e.key - 1]; if (v) setView(v.id);
      }
      if (e.key === "j") setWeek(Math.min(24, s.week + 1));
      if (e.key === "k") setWeek(Math.max(1, s.week - 1));
      if (e.key === "ArrowRight") setDay(s.day === 7 ? 1 : s.day + 1);
      if (e.key === "ArrowLeft")  setDay(s.day === 1 ? 7 : s.day - 1);
      if (e.key.toLowerCase() === "t") goToday();
    };
    const openSpotEvt = () => setSpotOpen(true);
    window.addEventListener("keydown", fn);
    window.addEventListener("__open-spotlight", openSpotEvt);
    return () => {
      window.removeEventListener("keydown", fn);
      window.removeEventListener("__open-spotlight", openSpotEvt);
    };
  }, [s.week, s.day]);

  if (bootShown) {
    return <Boot onDone={() => { completeBoot(); setBootShown(false); }} />;
  }

  // Auto-dismiss handlers for the toast queue
  const clearDrop = () => update(p => ({ ...p, lastDrop: null }));
  const clearTelemetry = () => update(p => ({ ...p, lastTelemetry: null }));
  const clearMilestone = () => update(p => ({ ...p, lastMilestone: null }));

  // Wrap each view in an ErrorBoundary so a crash isn't a black screen.
  const Wrap = (node) => {
    const Boundary = window.ErrorBoundary;
    return Boundary ? <Boundary onBack={() => setView("today")}>{node}</Boundary> : node;
  };

  return (
    <CRT scanlines={t.scanlines} flicker={t.flicker}>
      <TopBar store={store} />
      <div className="app">
        <Nav store={store} />
        <main>
          {!s.startDate && s.view !== "today" ? <Setup store={store} /> : null}
          {s.view === "today" && Wrap(<TodayView store={store} />)}
          {s.view === "train" && Wrap(<TrainView store={store} />)}
          {s.view === "plan" && Wrap(<PlanView store={store} />)}
          {s.view === "log" && Wrap(<LogView store={store} />)}
          {s.view === "protocols" && Wrap(<ProtocolsView store={store} />)}
          {s.view === "atlas" && Wrap(<AtlasView store={store} />)}
          {s.view === "export" && Wrap(<ExportView store={store} />)}

          <div className="foot">
            <span>// FTI · Console · daily companion · all data on this device</span>
            <span>
              <button onClick={() => { localStorage.removeItem("fti.console.v2"); location.reload(); }}>
                $ rm -rf logs/
              </button>
            </span>
          </div>
        </main>
      </div>

      <Spotlight open={spotOpen} onClose={() => setSpotOpen(false)} store={store} />
      {videoModal.node}
      {formCuesModal.node}

      {/* Toasts and cutscenes */}
      {s.lastTelemetry && <TelemetryToast msg={s.lastTelemetry.msg} tone={s.lastTelemetry.tone} onClose={clearTelemetry} />}
      {s.lastDrop && <SpecimenDrop card={s.lastDrop.card} onClose={clearDrop} />}
      {s.lastMilestone && <MilestoneToast count={s.lastMilestone.count} onClose={clearMilestone} />}
      {phaseTransition && (
        <PhaseTransition
          from={phaseTransition.from}
          to={phaseTransition.to}
          stats={phaseTransition.stats}
          onClose={closePhaseTransition}
        />
      )}
      {konami && <KonamiOverlay onClose={() => setKonami(false)} />}

      {/* Undo toast — set deletion has a 6s window */}
      {s.lastDeletedSet && window.UndoToast && (
        <UndoToast
          msg={(() => {
            const ek = s.lastDeletedSet.set;
            return `set ${s.lastDeletedSet.key.split("-").pop()} · ${ek.exName || ""} ${ek.weight}kg×${ek.reps}`;
          })()}
          onUndo={() => store.undoDeleteSet()}
          onDismiss={() => store.clearUndo()}
        />
      )}

      {/* PWA update toast */}
      {pwaUpdate && window.PWAUpdateToast && (
        <PWAUpdateToast
          onReload={() => window.__pwaReload && window.__pwaReload()}
          onDismiss={() => setPwaUpdate(false)}
        />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Display">
          <TweakColor label="Phosphor" value={t.accent}
            options={["#a3e635", "#22d3ee", "#fbbf24", "#f472b6", "#ffffff"]}
            onChange={(v) => setTweak("accent", v)} />
          <TweakRadio label="Density" value={t.density}
            options={[{label:"Comfy",value:"comfortable"},{label:"Compact",value:"compact"}]}
            onChange={(v) => setTweak("density", v)} />
          <TweakToggle label="Scanlines" value={t.scanlines}
            onChange={(v) => setTweak("scanlines", v)} />
          <TweakToggle label="Flicker" value={t.flicker}
            onChange={(v) => setTweak("flicker", v)} />
        </TweakSection>
        <TweakSection label="Data">
          <TweakButton label="Replay boot" onClick={() => {
            store.update({ bootSeen: false });
            location.reload();
          }} />
          <TweakButton label="Reset start date" onClick={() => {
            if (confirm("Clear program start date?")) store.update({ startDate: null });
          }} />
        </TweakSection>
        <TweakSection label="Help">
          <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text-2)",lineHeight:1.7}}>
            <div><b>⌘K</b> spotlight search</div>
            <div><b>1-7</b> switch view</div>
            <div><b>J/K</b> ±1 week</div>
            <div><b>←/→</b> ±1 day</div>
            <div><b>T</b> jump to today</div>
            <div style={{marginTop:6,color:"var(--text-3)"}}>↑↑↓↓←→←→ B A</div>
          </div>
        </TweakSection>
      </TweaksPanel>
    </CRT>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

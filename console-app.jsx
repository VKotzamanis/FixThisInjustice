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
  const { s, derived, setView, setWeek, setDay, completeBoot, reset, goToday } = store;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [spotOpen, setSpotOpen] = useState(false);
  const [bootShown, setBootShown] = useState(!s.bootSeen);
  const videoModal = useVideoModal();
  // Expose globally so deeply-nested components can open the modal without prop drilling.
  useEffect(() => { window.__videoModal = videoModal; return () => { window.__videoModal = null; }; }, [videoModal]);

  // Sync tweaks → CSS
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    document.body.classList.toggle("compact", t.density === "compact");
  }, [t.accent, t.density]);

  // Keyboard: ⌘K, view 1-5, J/K week, ←/→ day, T today, Esc closes spot.
  useEffect(() => {
    const fn = (e) => {
      const tag = e.target?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      // Spotlight
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
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [s.week, s.day]);

  if (bootShown) {
    return <Boot onDone={() => { completeBoot(); setBootShown(false); }} />;
  }

  return (
    <CRT scanlines={t.scanlines} flicker={t.flicker}>
      <TopBar store={store} />
      <div className="app">
        <Nav store={store} />
        <main>
          {!s.startDate && s.view !== "today" ? <Setup store={store} /> : null}
          {s.view === "today" && <TodayView store={store} />}
          {s.view === "train" && <TrainView store={store} />}
          {s.view === "plan" && <PlanView store={store} />}
          {s.view === "log" && <LogView store={store} />}
          {s.view === "protocols" && <ProtocolsView store={store} />}
          {s.view === "export" && <ExportView store={store} />}

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
            <div><b>1-5</b> switch view</div>
            <div><b>J/K</b> ±1 week</div>
            <div><b>←/→</b> ±1 day</div>
            <div><b>T</b> jump to today</div>
          </div>
        </TweakSection>
      </TweaksPanel>
    </CRT>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

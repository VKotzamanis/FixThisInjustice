// console-video.jsx — Invidious-only video modal.
//
// Curated from https://docs.invidious.io/instances/ — only clearnet, public,
// uptime-monitored instances. We try each in order until one loads.
//
// Strategy:
//   1. Iframe-embed the video on the first instance.
//   2. If the user can see it doesn't load (3-second timeout, or it stays
//      black), they tap "try next instance" — we rotate forward.
//   3. The user's preferred-working instance is remembered in localStorage
//      so the NEXT exercise opens straight to it.
//   4. Big "open in new tab" link at the bottom always uses the current
//      instance — on Android, that link can also be intercepted by NewPipe
//      if the user has set it up (long-press → Open with).

const { useState, useEffect } = React;

// Public Invidious instances — sorted by uptime + stability.
// Updated from https://docs.invidious.io/instances/ — if all are down,
// the list at that URL is the authoritative source for new instances.
const INSTANCES = [
  { host: "invidious.nerdvpn.de",    flag: "🇺🇦" },
  { host: "inv.nadeko.net",          flag: "🇨🇱" },
  { host: "invidious.tiekoetter.com",flag: "🇩🇪" },
  { host: "yt.chocolatemoo53.com",   flag: "🇺🇸" },
  { host: "inv.thepixora.com",       flag: "🇨🇦" },
  { host: "invidious.f5.si",         flag: "🇯🇵" },
];

const STORE_KEY = "fti.video.instance";

// 11-char URL-safe base64 → YouTube ID. Anything else is treated as search query.
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function loadPreferred() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    const idx = INSTANCES.findIndex(i => i.host === saved);
    return idx >= 0 ? idx : 0;
  } catch (e) { return 0; }
}

function VideoModal({ video, title, onClose }) {
  const isId = typeof video === "string" && YT_ID_RE.test(video);
  const videoId = isId ? video : null;
  const query   = isId ? title : video;

  const [idx, setIdx] = useState(loadPreferred);
  const [reloadKey, setReloadKey] = useState(0); // bump to force iframe reload

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

  // Persist working instance after the user explicitly accepts it via "looks good".
  const markInstanceWorking = () => {
    try { localStorage.setItem(STORE_KEY, INSTANCES[idx].host); } catch (e) {}
  };
  // Cycle to next instance
  const nextInstance = () => {
    setIdx((i) => (i + 1) % INSTANCES.length);
    setReloadKey(k => k + 1);
  };

  if (!video) return null;

  const inst = INSTANCES[idx];
  const embedUrl = videoId
    ? `https://${inst.host}/embed/${videoId}?autoplay=1`
    : null;
  const watchUrl = videoId
    ? `https://${inst.host}/watch?v=${videoId}`
    : `https://${inst.host}/search?q=${encodeURIComponent(query || title)}`;
  const searchUrl = `https://${inst.host}/search?q=${encodeURIComponent(query || title)}`;

  return (
    <div className="vmod-bg" onClick={onClose}>
      <div className="vmod" onClick={(e) => e.stopPropagation()}>
        <div className="vmod-head">
          <div className="vmod-title">
            <div className="vmod-eyebrow">▶ FORM REFERENCE</div>
            <div className="vmod-name">{title}</div>
          </div>
          <button className="vmod-close" onClick={onClose} aria-label="close">✕</button>
        </div>

        {/* Instance status bar — shows current host + rotate control */}
        <div className="vmod-instance">
          <span className="vmod-inst-l">
            <span className="vmod-inst-flag">{inst.flag}</span>
            <span className="vmod-inst-host">{inst.host}</span>
            <span className="vmod-inst-meta">instance {idx + 1}/{INSTANCES.length}</span>
          </span>
          <button className="vmod-inst-next" onClick={nextInstance}>
            ↻ try next
          </button>
        </div>

        {isId ? (
          <div className="vmod-frame">
            <iframe
              key={`${idx}-${reloadKey}`}
              src={embedUrl}
              title={title}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="vmod-search">
            <div className="vmod-search-eyebrow">SEARCH</div>
            <div className="vmod-search-q">"{query}"</div>
            <div className="vmod-search-note">
              No specific video curated for this exercise — tap below to search.
            </div>
          </div>
        )}

        <div className="vmod-foot">
          <a className="vmod-link-btn pri" href={watchUrl} target="_blank" rel="noopener noreferrer"
             onClick={markInstanceWorking}>
            <span>↗ open in new tab</span>
            <small>full size · works without ads</small>
          </a>
          {isId && (
            <a className="vmod-link-btn" href={searchUrl} target="_blank" rel="noopener noreferrer">
              <span>🔍 search for a different video</span>
              <small>maybe a better one</small>
            </a>
          )}
          <div className="vmod-foot-note">
            All instances ad-free. List from docs.invidious.io.
            <br/>If all are down, check the docs page for new instances.
          </div>
        </div>
      </div>
    </div>
  );
}

function useVideoModal() {
  const [entry, setEntry] = useState(null);
  const open = (a, b) => {
    if (typeof a === "object" && a !== null) setEntry({ video: a.video, title: a.title });
    else setEntry({ video: a, title: b });
  };
  const close = () => setEntry(null);
  const node = entry
    ? <VideoModal video={entry.video} title={entry.title} onClose={close} />
    : null;
  return { open, close, node };
}

Object.assign(window, { VideoModal, useVideoModal });

// console-video.jsx — smart video modal.
// Accepts either an 11-char YouTube ID OR a search query in the `video` field.
//   ID    → inline embed (YouTube by default, Piped opt-in toggle)
//   query → "search card" with big tap targets — no broken iframe.
//
// PRIMARY ad-free route on phone: "Open in NewPipe" intent. Two taps total
// from any exercise card to ad-free native playback.

const { useState, useEffect } = React;

const PIPED_INSTANCES = [
  "https://piped.video",
  "https://piped.kavin.rocks",
  "https://piped.projectsegfau.lt",
  "https://piped.adminforge.de",
];

// 11-char URL-safe base64 → YouTube ID. Anything else is a search query.
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function VideoModal({ video, title, onClose }) {
  const isId = typeof video === "string" && YT_ID_RE.test(video);
  const videoId = isId ? video : null;
  const query   = isId ? title : video; // when it's a query we fall back to using it as the search string

  const initialMode = (() => {
    try { return localStorage.getItem("fti.video.mode") || "yt"; } catch (e) { return "yt"; }
  })();
  const [mode, setMode] = useState(initialMode);
  const [pipedIdx, setPipedIdx] = useState(0);
  const [iframeBroken, setIframeBroken] = useState(false);

  useEffect(() => { try { localStorage.setItem("fti.video.mode", mode); } catch (e) {} }, [mode]);

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

  if (!video) return null;

  // --- URLs ---
  const ytShort   = videoId ? `https://youtu.be/${videoId}` : null;
  const ytEmbed   = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0`
    : null;
  const pipedEmbed = videoId
    ? `${PIPED_INSTANCES[pipedIdx]}/embed/${videoId}?autoplay=1`
    : null;
  const ytSearch  = `https://www.youtube.com/results?search_query=${encodeURIComponent(query || title)}`;
  // NewPipe intercepts youtu.be / youtube.com URLs on Android.
  const npVideo   = videoId
    ? `intent://youtu.be/${videoId}#Intent;package=org.schabi.newpipe;scheme=https;end`
    : null;
  const npSearch  = `intent://www.youtube.com/results?search_query=${encodeURIComponent(query || title)}#Intent;package=org.schabi.newpipe;scheme=https;end`;
  const pipedSearch = `${PIPED_INSTANCES[0]}/results?search_query=${encodeURIComponent(query || title)}`;

  const tryNextPiped = () => {
    if (pipedIdx < PIPED_INSTANCES.length - 1) {
      setIframeBroken(false);
      setPipedIdx(pipedIdx + 1);
    } else {
      setIframeBroken(true);
    }
  };

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

        {/* Big primary CTA: open in NewPipe (ad-free, native, instant on Android). */}
        <a className="vmod-newpipe" href={isId ? npVideo : npSearch}>
          <span className="vmod-np-l">
            <span className="vmod-np-icon">▶</span>
            <span className="vmod-np-text">
              <b>OPEN IN NEWPIPE</b>
              <small>{isId ? "ad-free · native player" : "ad-free · search results"}</small>
            </span>
          </span>
          <span className="vmod-np-arrow">↗</span>
        </a>

        {isId ? (
          // ---- Direct video ID: inline embed ----
          <div className="vmod-frame">
            {iframeBroken ? (
              <div className="vmod-fallback">
                <div className="vmod-fb-icon">⚠</div>
                <div className="vmod-fb-msg">
                  Inline player failed.<br/>Use the buttons above / below.
                </div>
              </div>
            ) : (
              <iframe
                key={mode + ":" + pipedIdx}
                src={mode === "piped" ? pipedEmbed : ytEmbed}
                title={title}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                onError={() => mode === "piped" ? tryNextPiped() : setIframeBroken(true)}
              />
            )}
          </div>
        ) : (
          // ---- Search query: no iframe, just clean tap targets ----
          <div className="vmod-search">
            <div className="vmod-search-eyebrow">SEARCH QUERY</div>
            <div className="vmod-search-q">"{query}"</div>
            <div className="vmod-search-note">
              No specific video curated for this exercise — tap NewPipe above for instant ad-free playback,
              or pick a source below.
            </div>
          </div>
        )}

        <div className="vmod-foot">
          {isId && (
            <div className="vmod-mode">
              <button
                className={"vmod-mode-btn" + (mode === "yt" ? " on" : "")}
                onClick={() => { setMode("yt"); setIframeBroken(false); }}>
                YouTube <small>(has ads)</small>
              </button>
              <button
                className={"vmod-mode-btn" + (mode === "piped" ? " on" : "")}
                onClick={() => { setMode("piped"); setIframeBroken(false); setPipedIdx(0); }}>
                Piped <small>{mode === "piped" ? `inst ${pipedIdx+1}/${PIPED_INSTANCES.length}` : "ad-free · flaky"}</small>
              </button>
              {mode === "piped" && pipedIdx < PIPED_INSTANCES.length - 1 && (
                <button className="vmod-retry" onClick={tryNextPiped}>retry next</button>
              )}
            </div>
          )}
          <div className="vmod-links">
            <a className="vmod-link-btn" href={ytSearch} target="_blank" rel="noopener noreferrer">
              <span>🔍 YouTube search</span>
              <small>{isId ? "find a better video" : "ad-supported · in browser"}</small>
            </a>
            <a className="vmod-link-btn" href={pipedSearch} target="_blank" rel="noopener noreferrer">
              <span>🔍 Piped search</span>
              <small>ad-free · in browser</small>
            </a>
            {isId && (
              <a className="vmod-link-btn" href={ytShort} target="_blank" rel="noopener noreferrer">
                <span>↗ youtu.be</span>
                <small>this exact video</small>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function useVideoModal() {
  const [entry, setEntry] = useState(null);
  // Back-compat: open(idOrQuery, title) OR open({video, title}).
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

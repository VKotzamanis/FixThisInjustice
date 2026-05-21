// console-video.jsx — smart video modal.
//
// Accepts either an 11-char YouTube ID OR a search query in the `video` field.
//   ID    → inline embed (YouTube by default, Piped opt-in)
//   query → search card with big tap targets
//
// Ad-free routing on Android (in priority order):
//   1. Plain https://youtu.be/<id> opened in new tab. If NewPipe is set as the
//      default handler for youtu.be / youtube.com URLs, the OS routes there
//      directly. If not default, Android shows an app chooser INCLUDING NewPipe.
//      (intent:// URLs are unreliable in PWAs — Chrome falls back to the
//      Play Store if it can't verify the package signature, which is exactly
//      the bug we're working around.)
//   2. Invidious — ad-free YouTube frontend, opens in browser, no app needed.
//   3. Piped — same idea as Invidious, alternate stack.
//
// On a phone where NewPipe is installed but NOT set as default for youtu.be,
// the user can fix this once: long-press the youtu.be link → "Open with" →
// NewPipe → "Always". From then on, every tap goes straight to NewPipe.

const { useState, useEffect } = React;

const PIPED_INSTANCES = [
  "https://piped.video",
  "https://piped.kavin.rocks",
  "https://piped.projectsegfau.lt",
  "https://piped.adminforge.de",
];

// Invidious mirrors — community-run, ad-free YouTube frontends. Try in order.
const INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://invidious.fdn.fr",
  "https://invidious.privacydev.net",
];

// 11-char URL-safe base64 → YouTube ID. Anything else is treated as a search query.
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function VideoModal({ video, title, onClose }) {
  const isId = typeof video === "string" && YT_ID_RE.test(video);
  const videoId = isId ? video : null;
  const query   = isId ? title : video;

  const initialMode = (() => {
    try { return localStorage.getItem("fti.video.mode") || "yt"; } catch (e) { return "yt"; }
  })();
  const [mode, setMode] = useState(initialMode);
  const [pipedIdx, setPipedIdx] = useState(0);
  const [iframeBroken, setIframeBroken] = useState(false);
  const [invIdx, setInvIdx] = useState(0);

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

  // Invidious (ad-free, no app needed)
  const invWatch  = videoId ? `${INVIDIOUS_INSTANCES[invIdx]}/watch?v=${videoId}` : null;
  const invSearch = `${INVIDIOUS_INSTANCES[invIdx]}/search?q=${encodeURIComponent(query || title)}`;
  const pipedSearch = `${PIPED_INSTANCES[0]}/results?search_query=${encodeURIComponent(query || title)}`;

  // Detect Android for tailored "open externally" copy.
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  // Plain youtube link — primary route for NewPipe on Android.
  // youtu.be is what NewPipe registers most reliably for.
  const ytExt = videoId
    ? `https://youtu.be/${videoId}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(query || title)}`;

  const tryNextPiped = () => {
    if (pipedIdx < PIPED_INSTANCES.length - 1) {
      setIframeBroken(false);
      setPipedIdx(pipedIdx + 1);
    } else {
      setIframeBroken(true);
    }
  };
  const tryNextInv = () => {
    if (invIdx < INVIDIOUS_INSTANCES.length - 1) setInvIdx(invIdx + 1);
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

        {/* PRIMARY CTA: plain youtu.be link. On Android with NewPipe installed
            and set as default → opens in NewPipe directly. Otherwise OS shows
            an app chooser (pick NewPipe → tap "Always" once → permanent). */}
        <a className="vmod-newpipe" href={ytExt} target="_blank" rel="noopener noreferrer">
          <span className="vmod-np-l">
            <span className="vmod-np-icon">▶</span>
            <span className="vmod-np-text">
              <b>{isAndroid ? "OPEN IN NEWPIPE" : "OPEN VIDEO"}</b>
              <small>{isAndroid
                ? (isId ? "youtu.be link → app chooser → NewPipe"
                        : "search results → app chooser → NewPipe")
                : "opens in your default browser/app"}</small>
            </span>
          </span>
          <span className="vmod-np-arrow">↗</span>
        </a>

        {isAndroid && (
          <div className="vmod-newpipe-hint">
            <b>opens Play Store instead of NewPipe?</b>
            <span>NewPipe isn't set as the default for youtu.be links yet.
              <br/>Long-press the button → <i>Open with</i> → <i>NewPipe</i> →{" "}
              <i>Always</i>. One-time fix.</span>
          </div>
        )}

        {isId ? (
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
          <div className="vmod-search">
            <div className="vmod-search-eyebrow">SEARCH QUERY</div>
            <div className="vmod-search-q">"{query}"</div>
            <div className="vmod-search-note">
              No specific video curated for this exercise — pick a source below.
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
            <a className="vmod-link-btn pri" href={isId ? invWatch : invSearch}
               target="_blank" rel="noopener noreferrer">
              <span>🌐 Invidious{invIdx > 0 ? ` (#${invIdx + 1})` : ""}</span>
              <small>ad-free · no app needed · works in browser</small>
            </a>
            {invIdx < INVIDIOUS_INSTANCES.length - 1 && (
              <button className="vmod-link-btn ghost" onClick={tryNextInv}>
                <span>↻ try next Invidious instance</span>
                <small>if the one above is down</small>
              </button>
            )}
            <a className="vmod-link-btn" href={pipedSearch} target="_blank" rel="noopener noreferrer">
              <span>🌐 Piped search</span>
              <small>ad-free · alternate stack</small>
            </a>
            <a className="vmod-link-btn" href={ytSearch} target="_blank" rel="noopener noreferrer">
              <span>🔍 YouTube search</span>
              <small>{isId ? "find a different video" : "ad-supported · in browser"}</small>
            </a>
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

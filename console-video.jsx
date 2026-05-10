// console-video.jsx — inline video modal.
// Uses Piped (open-source, ad-free YouTube frontend) for the in-app embed,
// and exposes an "Open in NewPipe" button that fires the youtu.be URL —
// on Android with NewPipe installed, the OS intent dialog routes it to NewPipe.
// Falls back to YouTube if Piped is blocked.

const { useState, useEffect } = React;

// Curated Piped instances. First one that loads wins.
const PIPED_INSTANCES = [
  "https://piped.video",
  "https://piped.kavin.rocks",
  "https://piped.projectsegfau.lt",
];

function VideoModal({ videoId, title, onClose }) {
  const [instance, setInstance] = useState(0);
  const [showIframe, setShowIframe] = useState(true);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!videoId) return null;

  const ytShort = `https://youtu.be/${videoId}`;
  const ytFull  = `https://www.youtube.com/watch?v=${videoId}`;
  const piped   = `${PIPED_INSTANCES[instance]}/embed/${videoId}?autoplay=1`;

  // NewPipe registers as an Android intent handler for youtu.be / youtube.com URLs.
  // Tapping a regular YouTube link on a device with NewPipe installed shows the
  // OS chooser. We can also try a direct intent: URL for Android Chrome.
  const newpipeIntent = `intent://youtu.be/${videoId}#Intent;package=org.schabi.newpipe;scheme=https;end`;

  const tryNextInstance = () => {
    if (instance < PIPED_INSTANCES.length - 1) {
      setInstance(instance + 1);
    } else {
      setShowIframe(false);
    }
  };

  return (
    <div className="vmod-bg" onClick={onClose}>
      <div className="vmod" onClick={(e) => e.stopPropagation()}>
        <div className="vmod-head">
          <div className="vmod-title">
            <span className="vmod-eyebrow">▶ FORM REFERENCE</span>
            <span className="vmod-name">{title}</span>
          </div>
          <button className="vmod-close" onClick={onClose} aria-label="close">ESC ✕</button>
        </div>

        <div className="vmod-frame">
          {showIframe ? (
            <iframe
              key={instance}
              src={piped}
              title={title}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
              onError={tryNextInstance}
            />
          ) : (
            <div className="vmod-fallback">
              <div className="vmod-fb-icon">⚠</div>
              <div className="vmod-fb-msg">
                Inline player blocked.<br/>
                Open externally below — NewPipe will intercept on Android.
              </div>
            </div>
          )}
        </div>

        <div className="vmod-foot">
          <div className="vmod-foot-l">
            via Piped <span className="muted">· no ads · no tracking</span>
            {showIframe && instance > 0 && (
              <span className="muted"> · instance {instance + 1}/{PIPED_INSTANCES.length}</span>
            )}
            {showIframe && (
              <button className="vmod-link" onClick={tryNextInstance}>retry on next instance</button>
            )}
          </div>
          <div className="vmod-foot-r">
            <a className="vmod-btn pri" href={newpipeIntent}>
              ↗ OPEN IN NEWPIPE
            </a>
            <a className="vmod-btn" href={ytShort} target="_blank" rel="noopener noreferrer">
              youtu.be
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook: call openVideo({id, title}) to show the modal.
function useVideoModal() {
  const [video, setVideo] = useState(null);
  const open = (id, title) => setVideo({ id, title });
  const close = () => setVideo(null);
  const node = video ? <VideoModal videoId={video.id} title={video.title} onClose={close} /> : null;
  return { open, close, node };
}

Object.assign(window, { VideoModal, useVideoModal });

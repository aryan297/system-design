import { useRegisterSW } from "virtual:pwa-register/react";
import "./PWABadge.css";

export default function PWABadge() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="pwa-toast" role="alert">
      <span className="pwa-toast-icon">{needRefresh ? "⬆️" : "📡"}</span>
      <span className="pwa-toast-text">
        {needRefresh
          ? "New content is available — refresh to update."
          : "Ready to work offline. Everything you've opened is now cached."}
      </span>
      {needRefresh && (
        <button className="pwa-toast-btn" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
      )}
      <button className="pwa-toast-close" onClick={close} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

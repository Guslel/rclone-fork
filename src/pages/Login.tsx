import { Cloud } from "lucide-react";

/** Shown when the page was opened without signing in through the app. */
export default function Login(_: { onDone: () => void }) {
  return (
    <div className="center-screen">
      <div className="panel login-card">
        <span className="brand-mark" style={{ width: 28, height: 28 }} aria-hidden>
          <Cloud size={16} />
        </span>
        <div>
          <h1>Abra pelo aplicativo</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Por segurança, o painel só abre pelo aplicativo <strong>Painel do rclone</strong>. Abra o aplicativo (ou dê dois cliques nele de novo): ele
            abre esta página já conectada.
          </p>
        </div>
      </div>
    </div>
  );
}

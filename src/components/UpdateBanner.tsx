import { Download } from "lucide-react";
import { useState } from "react";
import { useAsync } from "../lib/hooks";
import { app } from "../lib/rc";
import { Spinner } from "./ui";

type UpdateInfo = { atual: string; nova?: string; notas?: string; disponivel: boolean; erro?: string };

/**
 * Shown above every page when GitHub has a newer release. "Atualizar" swaps
 * the executable and restarts the panel; the page reloads once it is back.
 */
export default function UpdateBanner() {
  // The server asks GitHub at most every 6 h; checking hourly just picks that up.
  const info = useAsync(() => app<UpdateInfo>("atualizacao"), [], 60 * 60 * 1000);
  const [state, setState] = useState<"idle" | "busy" | "restarting">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!info.data?.disponivel) return null;

  const update = async () => {
    setState("busy");
    setError(null);
    try {
      await app("atualizacao", "POST");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
      return;
    }
    setState("restarting");
    // Wait for the old version to go away, then for the new one to answer.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const v = await app<{ versao: string }>("info").catch(() => null);
      if (v && v.versao !== info.data?.atual) {
        location.reload();
        return;
      }
    }
    setError("O painel não voltou sozinho. Abra-o de novo pelo menu do sistema.");
    setState("idle");
  };

  return (
    <div className="update-banner callout info" role="status">
      <Download size={16} strokeWidth={1.75} />
      <div style={{ flex: 1 }}>
        <strong>Nova versão do painel: {info.data.nova}</strong>{" "}
        <span className="muted">(você está na {info.data.atual})</span>
        {info.data.notas && <p className="muted update-notes">{info.data.notas}</p>}
        {error && <p style={{ color: "var(--danger)", margin: "4px 0 0" }}>{error}</p>}
      </div>
      <button className="btn primary sm" onClick={update} disabled={state !== "idle"}>
        {state !== "idle" && <Spinner size={14} />}
        {state === "idle" ? "Atualizar" : state === "busy" ? "Baixando…" : "Reiniciando…"}
      </button>
    </div>
  );
}

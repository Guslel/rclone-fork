import { Gauge, Power } from "lucide-react";
import { useEffect, useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { Hint, PageHead, Spinner } from "../components/ui";
import { useAsync } from "../lib/hooks";
import { app, rc } from "../lib/rc";
import { bytes } from "../lib/format";

// rclone's K and M are binary (KiB, MiB); bytes() in format.ts uses the same base.
const PRESETS = [
  { value: "off", label: "Sem limite", bytes: 0 },
  { value: "512K", label: "512 KB/s", bytes: 512 * 1024 },
  { value: "1M", label: "1 MB/s", bytes: 1024 ** 2 },
  { value: "5M", label: "5 MB/s", bytes: 5 * 1024 ** 2 },
  { value: "10M", label: "10 MB/s", bytes: 10 * 1024 ** 2 },
];

export default function SettingsPage(_: PageProps) {
  const fb = useFeedback();
  const bw = useAsync((signal) => rc<{ rate: string; bytesPerSecond: number }>("core/bwlimit", {}, signal), []);
  const version = useAsync(
    (signal) => rc<{ version: string; os: string; arch: string; goVersion: string; isGit: boolean }>("core/version", {}, signal),
    [],
  );
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);

  const current = bw.data ? Math.max(0, bw.data.bytesPerSecond) : null;
  const preset = current == null ? undefined : PRESETS.find((p) => p.bytes === current);

  useEffect(() => {
    if (bw.data && !preset) setCustom(bw.data.rate);
  }, [bw.data, preset]);

  async function apply(value: string) {
    setBusy(true);
    try {
      const r = await rc<{ bytesPerSecond: number }>("core/bwlimit", { rate: value });
      fb.toast("ok", r.bytesPerSecond > 0 ? `Velocidade limitada a ${bytes(r.bytesPerSecond)}/s.` : "Sem limite de velocidade.");
      bw.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function quit() {
    const ok = await fb.confirm({
      title: "Encerrar o painel?",
      danger: true,
      confirm: "Encerrar",
      body: (
        <p>
          Tarefas em andamento são interrompidas, contas montadas como disco são desmontadas e <strong>as automações param</strong> até o painel ser
          aberto de novo.
        </p>
      ),
    });
    if (!ok) return;
    await app("encerrar", "POST").catch(() => undefined);
    setStopped(true);
  }

  if (stopped) {
    return (
      <div className="center-screen">
        <p className="muted">O rclone foi encerrado. Pode fechar esta aba.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Ajustes" description="Velocidade, informações do rclone e encerramento." />

      <section className="panel panel-pad form-grid">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2>
            <Gauge size={16} /> Limite de velocidade <Hint term="bwlimit" />
          </h2>
          <span className="small muted num">Atual: {current == null ? "—" : current > 0 ? `${bytes(current)}/s` : "sem limite"}</span>
        </div>
        <div className="segmented scroll-x" role="group" aria-label="Limite de velocidade" style={{ justifySelf: "start" }}>
          {PRESETS.map((p) => (
            <button key={p.value} aria-pressed={preset?.value === p.value} onClick={() => apply(p.value)} disabled={busy}>
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="field"
          style={{ maxWidth: 420 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) apply(custom.trim());
          }}
        >
          <span className="field-label">Outro valor</span>
          <span style={{ display: "flex", gap: 8 }}>
            <input className="input mono" placeholder="2M" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Outro limite" />
            <button className="btn" type="submit" disabled={busy || !custom.trim()}>
              {busy ? <Spinner size={14} /> : null} Aplicar
            </button>
          </span>
          <span className="field-help">
            Um número seguido de K ou M: <span className="mono">300K</span> é 300 KB/s, <span className="mono">2M</span> é 2 MB/s. Vale até o rclone ser
            encerrado.
          </span>
        </form>
      </section>

      <section className="section panel panel-pad form-grid">
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>Sobre o rclone</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 16px", margin: 0 }}>
          <dt className="muted">Versão</dt>
          <dd className="num" style={{ margin: 0 }}>{version.data?.version ?? "—"}</dd>
          <dt className="muted">Sistema</dt>
          <dd style={{ margin: 0 }}>
            {version.data ? `${version.data.os} / ${version.data.arch}` : "—"}
          </dd>
          <dt className="muted">Go</dt>
          <dd style={{ margin: 0 }}>{version.data?.goVersion ?? "—"}</dd>
        </dl>
        <p className="field-help">
          O painel usa uma cópia própria do rclone oficial, baixada e conferida pela assinatura digital, e a mesma configuração de contas do comando
          rclone. Contas criadas aqui também aparecem no terminal.
        </p>
      </section>

      <StartupSection />

      <section className="section panel panel-pad form-grid">
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>Encerrar</h2>
        <p className="muted">Fecha o painel e o rclone. Se “Iniciar com o computador” estiver ligado, eles voltam na próxima vez que você entrar no sistema.</p>
        <button className="btn" style={{ justifySelf: "start", color: "var(--danger)" }} onClick={quit}>
          <Power size={15} /> Encerrar o painel
        </button>
      </section>
    </div>
  );
}

function StartupSection() {
  const fb = useFeedback();
  const state = useAsync(() => app<{ ativo: boolean; suportado: boolean }>("inicio"), []);
  const [busy, setBusy] = useState(false);
  if (state.data && !state.data.suportado) return null;

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await app("inicio", "POST", { ativo: on });
      fb.toast("ok", on ? "O painel vai iniciar junto com o computador." : "O painel não vai mais iniciar sozinho.");
      state.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section panel panel-pad form-grid">
      <h2 style={{ fontSize: 14, fontWeight: 600 }}>Iniciar com o computador</h2>
      <label className="check">
        <input type="checkbox" checked={state.data?.ativo ?? false} disabled={!state.data || busy} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Abrir o painel em segundo plano quando eu entrar no computador
          <span className="field-help" style={{ display: "block" }}>
            Necessário para as automações rodarem sozinhas. Ele fica escondido, sem abrir o navegador; para ver o painel, é só abrir o aplicativo.
          </span>
        </span>
      </label>
    </section>
  );
}

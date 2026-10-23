import { ArrowLeftRight, ArrowRight, ChevronRight, Copy, Eye, FolderInput, Play, RefreshCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { LocationPicker, type Location } from "../components/LocationPicker";
import { Callout, ErrorLine, Hint, PageHead, SkeletonRows, Spinner } from "../components/ui";
import { LOCAL, bytes, fsPath, locationLabel, plural } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { homePath, rc, type CoreStats } from "../lib/rc";
import { loadRemotes, rememberJob, type JobKind } from "../lib/store";
import type { TermKey } from "../lib/terms";

type Mode = "copy" | "sync" | "move" | "bisync";

const MODES: { id: Mode; title: string; text: string; icon: ReactNode; danger?: string; term: TermKey }[] = [
  { id: "copy", title: "Copiar", text: "Envia o que é novo ou mudou. Não apaga nada.", icon: <Copy size={15} />, term: "copy" },
  { id: "sync", title: "Sincronizar", text: "Deixa o destino igual à origem.", icon: <RefreshCcw size={15} />, danger: "Pode apagar no destino", term: "sync" },
  { id: "move", title: "Mover", text: "Copia e remove da origem.", icon: <FolderInput size={15} />, danger: "Apaga da origem", term: "move" },
  { id: "bisync", title: "Dois sentidos", text: "Mudanças dos dois lados vão para o outro.", icon: <ArrowLeftRight size={15} />, danger: "Pode apagar dos dois lados", term: "bisync" },
];

type Preview = { stats: CoreStats; key: string };

export default function Transfer({ go, params }: PageProps) {
  const fb = useFeedback();
  const remotes = useAsync((signal) => loadRemotes(signal), []);
  const initialMode = (["copy", "sync", "move", "bisync"].includes(params.get("mode") ?? "") ? params.get("mode") : "copy") as Mode;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [src, setSrc] = useState<Location>({ remote: LOCAL, path: homePath() });
  const [dst, setDst] = useState<Location | null>(null);
  const [label, setLabel] = useState("");
  const [exclude, setExclude] = useState("");
  const [emptyDirs, setEmptyDirs] = useState(false);
  const [resync, setResync] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "start">("");
  const [error, setError] = useState<string | null>(null);

  // Until the user picks, the destination is the root of the first account.
  const destination = dst ?? { remote: remotes.data?.[0]?.name ?? LOCAL, path: "" };
  const srcFs = fsPath(src.remote, src.path);
  const dstFs = fsPath(destination.remote, destination.path);
  const rules = exclude
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const key = JSON.stringify([mode, srcFs, dstFs, rules, emptyDirs, resync]);
  const fresh = preview?.key === key;
  const same = srcFs === dstFs;

  function body(dryRun: boolean): Record<string, unknown> {
    const filter = rules.length ? { _filter: { ExcludeRule: rules } } : {};
    if (mode === "bisync") return { path1: srcFs, path2: dstFs, dryRun, resync, ...filter };
    return {
      srcFs,
      dstFs,
      createEmptySrcDirs: emptyDirs,
      ...(mode === "move" ? { deleteEmptySrcDirs: true } : {}),
      ...(dryRun ? { _config: { DryRun: true } } : {}),
      ...filter,
    };
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    const group = `previa-${Date.now()}`;
    try {
      await rc(`sync/${mode}`, { ...body(true), _group: group });
      const stats = await rc<CoreStats>("core/stats", { group });
      setPreview({ stats, key });
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      rc("core/stats-delete", { group }).catch(() => undefined);
      setBusy("");
    }
  }

  async function start() {
    // A stale preview (settings changed since) is not shown in the confirmation.
    const s = fresh ? preview?.stats : undefined;
    const m = MODES.find((x) => x.id === mode)!;
    const ok = await fb.confirm({
      title: `${m.title} agora?`,
      danger: mode !== "copy",
      confirm: m.title,
      body: (
        <>
          <p className="mono small" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {locationLabel(src.remote, src.path)} <ArrowRight size={12} /> {locationLabel(destination.remote, destination.path)}
          </p>
          {s && (
            <p>
              Pela prévia: {plural(s.totalTransfers, "arquivo será enviado", "arquivos serão enviados")}
              {s.deletes > 0 && (
                <>
                  {" "}
                  e <strong style={{ color: "var(--danger)" }}>{plural(s.deletes, "arquivo será apagado", "arquivos serão apagados")}</strong>
                </>
              )}
              .
            </p>
          )}
          {mode === "sync" && <Callout tone="warn">Arquivos que existem só no destino serão apagados.</Callout>}
          {mode === "move" && <Callout tone="warn">Os arquivos serão removidos da origem depois de copiados.</Callout>}
          {mode === "bisync" && <Callout tone="warn">Apagar um arquivo de um lado faz ele ser apagado do outro também.</Callout>}
        </>
      ),
    });
    if (!ok) return;
    setBusy("start");
    try {
      const params = body(false);
      const { jobid } = await rc<{ jobid: number }>(`sync/${mode}`, { ...params, _async: true });
      await rememberJob(jobid, {
        call: { path: `sync/${mode}`, params },
        kind: mode as JobKind,
        label: label.trim() || `${m.title} ${src.path.split("/").filter(Boolean).pop() ?? ""}`.trim(),
        src: locationLabel(src.remote, src.path),
        dst: locationLabel(destination.remote, destination.path),
      });
      fb.toast("ok", "Transferência iniciada.");
      go("tarefas");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Transferir"
        description="Copie, sincronize ou mova pastas entre o computador e as suas contas. Se quiser conferir antes, a prévia mostra o que vai acontecer sem mexer em nada."
      />

      <div className="modes" role="radiogroup" aria-label="Tipo de transferência">
        {MODES.map((m) => (
          <button key={m.id} className="mode" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}>
            <strong>
              {m.icon} {m.title}
            </strong>
            <span>{m.text}</span>
            {m.danger && <span className="tag">{m.danger}</span>}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
        Em dúvida? “Copiar” é sempre seguro. <Hint term={MODES.find((m) => m.id === mode)!.term} />
      </p>

      <section className="section">
        {remotes.loading && !remotes.data ? (
          <SkeletonRows rows={4} />
        ) : remotes.error ? (
          <ErrorLine error={remotes.error} onRetry={remotes.reload} />
        ) : (
          <div className="route">
            <LocationPicker label={mode === "bisync" ? "Lado 1" : "Origem"} remotes={remotes.data ?? []} value={src} onChange={setSrc} allowNew={false} />
            <div className="route-arrow" aria-hidden>
              {mode === "bisync" ? <ArrowLeftRight size={18} /> : <ArrowRight size={18} />}
            </div>
            <LocationPicker label={mode === "bisync" ? "Lado 2" : "Destino"} remotes={remotes.data ?? []} value={destination} onChange={setDst} />
          </div>
        )}
      </section>

      <section className="section">
        <details className="panel panel-pad">
          <summary className="disclosure">
            <ChevronRight size={15} className="chev" />Opções</summary>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label className="field">
              <span className="field-label">Nome da tarefa (opcional)</span>
              <input className="input" placeholder="Ex.: Backup do Obsidian" value={label} onChange={(e) => setLabel(e.target.value)} />
              <span className="field-help">Aparece na lista de tarefas para você reconhecer depois.</span>
            </label>
            <label className="field">
              <span className="field-label">
                Ignorar arquivos <Hint term="exclude" />
              </span>
              <textarea className="input mono" placeholder={"*.tmp\n.git/**"} value={exclude} onChange={(e) => setExclude(e.target.value)} />
            </label>
            {mode !== "bisync" && (
              <label className="check">
                <input type="checkbox" checked={emptyDirs} onChange={(e) => setEmptyDirs(e.target.checked)} />
                <span>
                  Criar também as pastas vazias
                  <span className="field-help" style={{ display: "block" }}>
                    Por padrão o rclone só leva pastas que têm arquivos.
                  </span>
                </span>
              </label>
            )}
            {mode === "bisync" && (
              <label className="check">
                <input type="checkbox" checked={resync} onChange={(e) => setResync(e.target.checked)} />
                <span>
                  Primeira vez entre estas duas pastas (resync)
                  <span className="field-help" style={{ display: "block" }}>
                    Obrigatório na primeira execução: junta o conteúdo dos dois lados sem apagar nada. Depois, desmarque.
                  </span>
                </span>
              </label>
            )}
          </div>
        </details>
      </section>

      {same && (
        <div className="section">
          <Callout tone="warn">Origem e destino são o mesmo lugar.</Callout>
        </div>
      )}
      {error && (
        <div className="section">
          <ErrorLine error={error} />
        </div>
      )}

      {preview && fresh && (
        <section className="section panel panel-pad">
          <div className="section-head">
            <h2>
              Prévia <Hint term="dryRun" />
            </h2>
            <span className="small faint">Nada foi alterado</span>
          </div>
          <div className="preview">
            <div className="stat">
              <b>{preview.stats.totalTransfers}</b>
              <span className="small muted">a {mode === "move" ? "mover" : "enviar"}</span>
            </div>
            <div className={`stat ${preview.stats.deletes > 0 ? "danger" : ""}`}>
              <b>{preview.stats.deletes}</b>
              <span className="small muted">a apagar</span>
            </div>
            <div className="stat">
              <b>{preview.stats.totalChecks || preview.stats.checks}</b>
              <span className="small muted">
                já iguais <Hint term="checks" />
              </span>
            </div>
            <div className="stat">
              <b>{bytes(preview.stats.totalBytes)}</b>
              <span className="small muted">aproximadamente</span>
            </div>
          </div>
          {preview.stats.errors > 0 && (
            <div style={{ marginTop: 12 }}>
              <Callout tone="danger">
                {plural(preview.stats.errors, "erro", "erros")} na prévia. {preview.stats.lastError}
              </Callout>
            </div>
          )}
          {preview.stats.totalTransfers === 0 && preview.stats.deletes === 0 && preview.stats.errors === 0 && (
            <p className="muted" style={{ marginTop: 12 }}>
              Tudo já está igual. Não há nada para fazer.
            </p>
          )}
        </section>
      )}

      <div className="section" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn" onClick={runPreview} disabled={!!busy || same}>
          {busy === "preview" ? <Spinner size={15} /> : <Eye size={15} />} {busy === "preview" ? "Calculando…" : "Ver prévia"}
        </button>
        <button
          className={mode === "copy" ? "btn primary" : "btn danger"}
          onClick={start}
          disabled={!!busy || same}
        >
          {busy === "start" ? <Spinner size={15} /> : <Play size={15} />} {MODES.find((m) => m.id === mode)!.title}
        </button>
      </div>
    </div>
  );
}

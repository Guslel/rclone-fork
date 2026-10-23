import { ArrowLeftRight, Cloud, Plus } from "lucide-react";
import { JobRow } from "../components/JobRow";
import { Quota } from "../components/Quota";
import { Callout, Empty, ErrorLine, Hint, PageHead, SkeletonRows } from "../components/ui";
import { useAbout } from "../lib/about";
import { bytes, relative } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { loadJobs } from "../lib/jobs";
import { explainError, rc, type CoreStats } from "../lib/rc";
import { loadRemotes } from "../lib/store";
import type { Navigate } from "../App";

export default function Overview({ go }: { go: Navigate }) {
  const remotes = useAsync((signal) => loadRemotes(signal), []);
  const about = useAbout(remotes.data);
  const jobs = useAsync((signal) => loadJobs(signal, 6), [], 1500);
  const stats = useAsync((signal) => rc<CoreStats>("core/stats", {}, signal), [], 3000);

  const running = jobs.data?.filter((j) => !j.finished).length ?? 0;
  const known = remotes.data?.filter((r) => about[r.name]?.used != null) ?? [];
  const pending = remotes.data?.some((r) => !r.target && about[r.name] === undefined) ?? false;
  const used = known.reduce((s, r) => s + (about[r.name]?.used ?? 0), 0);
  const failed = jobs.data?.find((j) => j.finished && !j.success && !/context canceled/i.test(j.error));
  const lastDone = jobs.data?.find((j) => j.finished);

  return (
    <div className="page">
      <PageHead
        title="Visão geral"
        description="Suas contas conectadas, o espaço em cada uma e o que o rclone está fazendo agora."
        actions={
          <button className="btn primary" onClick={() => go("transferir")}>
            <ArrowLeftRight size={15} /> Nova transferência
          </button>
        }
      />

      {failed && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="danger">
            <strong>A última tarefa “{failed.meta?.label}” falhou.</strong> {explainError(failed.error).slice(0, 160)}{" "}
            <button className="btn sm ghost" onClick={() => go("tarefas")}>
              Ver tarefas
            </button>
          </Callout>
        </div>
      )}

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">
            Contas <Hint term="remote" />
          </span>
          <span className="tile-value">{remotes.data?.length ?? "—"}</span>
          <span className="tile-sub">{remotes.data ? [...new Set(remotes.data.map((r) => r.service))].join(", ") || "nenhuma" : " "}</span>
        </div>
        <div className="tile">
          <span className="tile-label">
            Espaço usado <Hint term="quota" />
          </span>
          <span className="tile-value">{remotes.data && (known.length || !pending) ? bytes(used) : "—"}</span>
          <span className="tile-sub">{!remotes.data ? " " : pending ? "consultando as nuvens…" : known.length === 1 ? "de 1 conta que informa o espaço" : `somando ${known.length} contas que informam`}</span>
        </div>
        <div className="tile">
          <span className="tile-label">
            Em andamento <Hint term="job" />
          </span>
          <span className="tile-value">{jobs.data ? running : "—"}</span>
          <span className="tile-sub">
            {running
              ? "tarefas rodando agora"
              : lastDone
                ? `última: ${lastDone.meta?.label ?? "tarefa"}, ${relative(lastDone.endTime)}`
                : "nenhuma tarefa rodando"}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Transferido</span>
          <span className="tile-value">{bytes(stats.data?.bytes ?? 0)}</span>
          <span className="tile-sub">desde que o rclone foi aberto</span>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Contas</h2>
          <button className="btn sm ghost" onClick={() => go("contas")}>
            Gerenciar
          </button>
        </div>
        <div className="panel">
          {remotes.error && <div className="panel-pad"><ErrorLine error={remotes.error} onRetry={remotes.reload} /></div>}
          {remotes.loading && !remotes.data && <SkeletonRows rows={2} />}
          {remotes.data?.length === 0 && (
            <Empty
              icon={<Cloud size={22} className="faint" />}
              title="Nenhuma conta conectada"
              action={
                <button className="btn primary" onClick={() => go("contas", { add: "1" })}>
                  <Plus size={15} /> Conectar conta
                </button>
              }
            >
              Conecte um Google Drive, OneDrive, Dropbox ou outro serviço para começar.
            </Empty>
          )}
          {remotes.data?.map((r) => (
            <div key={r.name} className="list-row">
              <button className="row-btn" onClick={() => go("arquivos", { remote: r.name })}>
                <Cloud size={16} className="faint" />
                <span>
                  <span className="name" style={{ fontWeight: 500 }}>{r.name}</span>
                  <span className="faint small" style={{ display: "block" }}>{r.service}</span>
                </span>
              </button>
              <div className="quota quota-right">
                <Quota remote={r} about={about[r.name]} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Tarefas recentes</h2>
          <button className="btn sm ghost" onClick={() => go("tarefas")}>
            Ver todas
          </button>
        </div>
        <div className="panel" style={{ overflowX: "auto" }}>
          {jobs.data?.length === 0 ? (
            <Empty icon={<ArrowLeftRight size={22} className="faint" />} title="Nenhuma tarefa ainda">
              Cópias, sincronizações e envios que você fizer pelo painel aparecem aqui com o progresso ao vivo.
            </Empty>
          ) : !jobs.data ? (
            jobs.error ? <div className="panel-pad"><ErrorLine error={jobs.error} /></div> : <SkeletonRows rows={2} />
          ) : (
            <table className="table job-table">
              <thead>
                <tr>
                  <th>Tarefa</th>
                  <th>Origem → destino</th>
                  <th>Status</th>
                  <th>Progresso</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

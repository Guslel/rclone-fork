import { ArrowLeftRight, ListChecks } from "lucide-react";
import { useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { JobRoute, JobRow, JobStatusPill, jobSummary } from "../components/JobRow";
import { Callout, Dialog, Empty, ErrorLine, Hint, PageHead, SkeletonRows } from "../components/ui";
import { bytes, dateTime, duration } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { loadJobs, type JobView } from "../lib/jobs";
import { explainError, rc } from "../lib/rc";
import { rememberJob } from "../lib/store";

type Filter = "all" | "running" | "done" | "failed";

const FILTERS: { id: Filter; label: string; test: (j: JobView) => boolean }[] = [
  { id: "all", label: "Todas", test: () => true },
  { id: "running", label: "Em andamento", test: (j) => !j.finished },
  { id: "done", label: "Concluídas", test: (j) => j.finished && j.success },
  { id: "failed", label: "Com erro", test: (j) => j.finished && !j.success },
];

export default function Jobs({ go }: PageProps) {
  const fb = useFeedback();
  const jobs = useAsync((signal) => loadJobs(signal), [], 1000);
  const [filter, setFilter] = useState<Filter>("all");
  const [detailsId, setDetailsId] = useState<number | null>(null);

  async function stop(j: JobView) {
    const ok = await fb.confirm({
      title: "Parar esta tarefa?",
      confirm: "Parar",
      body: <p>O que já foi transferido fica no destino. Se rodar de novo depois, o rclone continua de onde parou, sem reenviar o que já está igual.</p>,
    });
    if (!ok) return;
    try {
      await rc("job/stop", { jobid: j.id });
      fb.toast("ok", "Tarefa parada.");
      jobs.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    }
  }

  async function retry(j: JobView) {
    const call = j.meta?.call;
    if (!call || !j.meta) return;
    try {
      const { jobid } = await rc<{ jobid: number }>(call.path, { ...call.params, _async: true });
      await rememberJob(jobid, { ...j.meta, call });
      fb.toast("ok", "Tarefa iniciada de novo.");
      setDetailsId(null);
      jobs.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    }
  }

  const visible = jobs.data?.filter(FILTERS.find((f) => f.id === filter)!.test) ?? [];
  const running = jobs.data?.filter((j) => !j.finished) ?? [];
  const details = jobs.data?.find((j) => j.id === detailsId) ?? null;

  return (
    <div className="page">
      <PageHead
        title="Tarefas"
        description={
          <>
            Tudo o que o painel pediu ao rclone desde que ele foi aberto, com o progresso ao vivo. <Hint term="job" />
          </>
        }
        actions={
          <button className="btn primary" onClick={() => go("transferir")}>
            <ArrowLeftRight size={15} /> Nova transferência
          </button>
        }
      />

      <div className="toolbar">
        <div className="segmented scroll-x" role="group" aria-label="Filtrar tarefas">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              {jobs.data && <span className="faint num"> {jobs.data.filter(f.test).length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {jobs.error && !jobs.data && (
          <div className="panel-pad">
            <ErrorLine error={jobs.error} onRetry={jobs.reload} />
          </div>
        )}
        {jobs.loading && !jobs.data && <SkeletonRows rows={4} />}
        {jobs.data && visible.length === 0 && (
          <Empty icon={<ListChecks size={22} className="faint" />} title={filter === "all" ? "Nenhuma tarefa ainda" : "Nenhuma tarefa neste filtro"}>
            {filter === "all" && "Quando você copiar, sincronizar ou mover algo, a tarefa aparece aqui."}
          </Empty>
        )}
        {visible.length > 0 && (
          <table className="table job-table">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Origem → destino</th>
                <th>Status</th>
                <th>Progresso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <JobRow key={j.id} job={j} onStop={stop} onRetry={retry} onDetails={(x) => setDetailsId(x.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {running.some((j) => j.stats?.transferring?.length) && (
        <section className="section">
          <div className="section-head">
            <h2>Enviando agora</h2>
          </div>
          <div className="panel">
            {running.flatMap((j) =>
              (j.stats?.transferring ?? []).slice(0, 8).map((t) => (
                <div key={`${j.id}-${t.name}`} className="list-row">
                  <span className="mono small ellipsis">{t.name}</span>
                  <span className="small muted num">
                    {t.percentage}% de {bytes(t.size)} · {bytes(t.speed)}/s
                  </span>
                </div>
              )),
            )}
          </div>
        </section>
      )}

      <Dialog
        open={details !== null}
        onClose={() => setDetailsId(null)}
        title={details?.meta?.label ?? "Tarefa"}
        description={details ? <JobStatusPill job={details} /> : undefined}
        footer={
          details?.finished && !details.success && details.meta?.call ? (
            <button className="btn primary" onClick={() => retry(details)}>
              Tentar de novo
            </button>
          ) : undefined
        }
      >
        {details && (
          <>
            <JobRoute job={details} />
            {details.finished && !details.success && !/context canceled/i.test(details.error) && (
              <Callout tone="danger">
                <strong>{explainError(details.error)}</strong>
                <span className="mono small" style={{ display: "block", marginTop: 4, overflowWrap: "anywhere" }}>
                  {details.error}
                </span>
              </Callout>
            )}
            <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "6px 16px", margin: 0 }}>
              <dt className="muted">Início</dt>
              <dd className="num" style={{ margin: 0 }}>{dateTime(details.startTime)}</dd>
              <dt className="muted">Duração</dt>
              <dd className="num" style={{ margin: 0 }}>{duration(details.duration)}</dd>
              <dt className="muted">Resultado</dt>
              <dd style={{ margin: 0 }}>{details.finished ? jobSummary(details) : "em andamento"}</dd>
              <dt className="muted">Verificados</dt>
              <dd className="num" style={{ margin: 0 }}>{details.stats?.checks ?? 0}</dd>
              <dt className="muted">Erros</dt>
              <dd className="num" style={{ margin: 0 }}>{details.stats?.errors ?? 0}</dd>
            </dl>
            {details.stats?.lastError && <p className="small muted">Último erro: {explainError(details.stats.lastError)}</p>}
          </>
        )}
      </Dialog>
    </div>
  );
}

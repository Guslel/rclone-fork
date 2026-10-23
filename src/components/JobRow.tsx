import { ArrowRight, CircleStop, Info, RotateCcw } from "lucide-react";
import { Fragment } from "react";
import { KIND_LABEL, jobProgress, type JobView } from "../lib/jobs";
import { bytes, duration, plural, relative, speed } from "../lib/format";
import { Meter, Pill } from "./ui";
import { explainError } from "../lib/rc";

const canceled = (j: JobView) => /context canceled/i.test(j.error);

export function JobStatusPill({ job }: { job: JobView }) {
  if (!job.finished) return <Pill tone="run">Em andamento</Pill>;
  if (job.success) return <Pill tone="ok">Concluída</Pill>;
  if (canceled(job)) return <Pill tone="neutral">Parada</Pill>;
  return <Pill tone="fail">Falhou</Pill>;
}

export function JobRoute({ job }: { job: JobView }) {
  const m = job.meta;
  if (!m?.src) return <span className="muted">—</span>;
  return (
    <span className="mono small job-route" title={m.dst ? `${m.src} → ${m.dst}` : m.src}>
      <span className="ellipsis">{breakable(m.src)}</span>
      {m.dst && (
        <>
          <ArrowRight size={12} className="faint" style={{ flex: "none" }} />
          <span className="ellipsis">{breakable(m.dst)}</span>
        </>
      )}
    </span>
  );
}

/** A path that may wrap only after "/" and ":". */
function breakable(path: string) {
  return path.split(/(?<=[/:])/).map((part, i) => (
    <Fragment key={i}>
      {part}
      <wbr />
    </Fragment>
  ));
}

/** What a finished job did, in words; "nothing new" instead of a row of zeros. */
export function jobSummary(j: JobView): string {
  const s = j.stats;
  if (!s) return duration(j.duration);
  if (j.success && s.transfers === 0 && s.deletes === 0) return `Nada novo — ${plural(s.checks, "arquivo já estava igual", "arquivos já estavam iguais")}`;
  const parts = [`${bytes(s.bytes)} em ${plural(s.transfers, "arquivo", "arquivos")}`];
  if (s.deletes > 0) parts.push(`${s.deletes} apagado(s)`);
  parts.push(duration(j.duration));
  return parts.join(" · ");
}

/** One job in a table: label, route, state and live progress. */
export function JobRow({
  job,
  onStop,
  onRetry,
  onDetails,
}: {
  job: JobView;
  onStop?: (j: JobView) => void;
  onRetry?: (j: JobView) => void;
  onDetails?: (j: JobView) => void;
}) {
  const s = job.stats;
  const pct = jobProgress(job);
  const failed = job.finished && !job.success && !canceled(job);
  const hasActions = onStop || onRetry || onDetails;
  return (
    <tr>
      <td className="job-name">
        <div style={{ fontWeight: 500 }}>{job.meta?.label ?? KIND_LABEL[job.meta?.kind ?? "other"]}</div>
        <div className="faint small">{relative(job.startTime)}</div>
      </td>
      <td className="job-route-cell">
        <JobRoute job={job} />
      </td>
      <td className="job-status">
        <JobStatusPill job={job} />
      </td>
      <td className="job-progress">
        {!job.finished ? (
          <div className="job-progress-box">
            <Meter value={pct} label="Progresso" />
            <span className="small muted num ellipsis">
              {bytes(s?.bytes)} de {bytes(s?.totalBytes)} · {speed(s?.speed)} · resta {duration(s?.eta)}
            </span>
          </div>
        ) : (
          <span className="small muted num job-progress-box ellipsis">
            {failed ? (
              <span style={{ color: "var(--danger)" }} title={job.error}>
                {explainError(job.error).slice(0, 90)}
              </span>
            ) : (
              jobSummary(job)
            )}
          </span>
        )}
      </td>
      {hasActions && (
        <td className="right job-actions">
          <span style={{ display: "inline-flex", gap: 4 }}>
            {!job.finished && onStop && (
              <button className="btn sm" onClick={() => onStop(job)} aria-label={`Parar ${job.meta?.label ?? "tarefa"}`}>
                <CircleStop size={14} /> Parar
              </button>
            )}
            {failed && onRetry && job.meta?.call && (
              <button className="btn sm" onClick={() => onRetry(job)}>
                <RotateCcw size={14} /> Tentar de novo
              </button>
            )}
            {onDetails && (
              <button className="btn sm ghost icon" onClick={() => onDetails(job)} aria-label="Ver detalhes" title="Ver detalhes">
                <Info size={15} />
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  );
}

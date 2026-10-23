import { app, rc, type CoreStats, type JobStatus } from "./rc";
import { jobMetas, type JobMeta } from "./store";

export type JobView = JobStatus & { meta?: JobMeta; stats?: CoreStats };

/** Jobs started from this panel during the current rclone run, newest first. */
export async function loadJobs(signal?: AbortSignal, limit = 40): Promise<JobView[]> {
  const [{ jobids = [] }, { metas: local }, auto] = await Promise.all([
    rc<{ jobids?: number[] }>("job/list", {}, signal),
    jobMetas(),
    // Jobs started by automations are labelled by the app, not the browser.
    app<Record<string, JobMeta>>("tarefas").catch(() => ({}) as Record<string, JobMeta>),
  ]);
  const metas: Record<number, JobMeta> = { ...local };
  for (const [id, m] of Object.entries(auto)) metas[Number(id)] = m;
  // Only jobs the panel labelled: internal calls (listing, stats) are jobs too.
  const ids = jobids.filter((id) => metas[id]).sort((a, b) => b - a).slice(0, limit);
  return Promise.all(
    ids.map(async (id) => {
      const status = await rc<JobStatus>("job/status", { jobid: id }, signal);
      const stats = await rc<CoreStats>("core/stats", { group: status.group || `job/${id}` }, signal).catch(() => undefined);
      return { ...status, meta: metas[id], stats };
    }),
  );
}

export const KIND_LABEL: Record<string, string> = {
  copy: "Copiar",
  sync: "Sincronizar",
  move: "Mover",
  bisync: "Sincronizar nos dois sentidos",
  copyfile: "Copiar arquivo",
  movefile: "Mover arquivo",
  delete: "Apagar",
  purge: "Apagar pasta",
  upload: "Enviar",
  other: "Tarefa",
};

export function jobProgress(j: JobView): number {
  const s = j.stats;
  if (j.finished) return 100;
  if (!s) return 0;
  if (s.totalBytes > 0) return Math.min(100, (s.bytes / s.totalBytes) * 100);
  if (s.totalTransfers > 0) return Math.min(100, (s.transfers / s.totalTransfers) * 100);
  return 0;
}

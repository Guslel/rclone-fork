import { rc, type Provider } from "./rc";

/** `target` is set for wrapper types (alias, crypt…) that store their data in another remote or folder. */
export type RemoteInfo = { name: string; type: string; service: string; target?: string };

/** Backends whose space belongs to the remote they wrap. */
export const WRAPPERS = new Set(["alias", "crypt", "union", "combine", "chunker", "compress", "hasher", "cache"]);

let providersCache: Promise<Provider[]> | null = null;

export function loadProviders(): Promise<Provider[]> {
  providersCache ??= rc<{ providers: Provider[] }>("config/providers")
    .then((r) => r.providers ?? [])
    .catch((e) => {
      providersCache = null;
      throw e;
    });
  return providersCache;
}

export async function serviceName(type: string): Promise<string> {
  const providers = await loadProviders().catch(() => []);
  const p = providers.find((x) => x.Prefix === type);
  return p ? shortDescription(p.Description, p.Prefix) : (PT_NAMES[type] ?? type);
}

// Service names that are descriptions rather than brands.
const PT_NAMES: Record<string, string> = {
  local: "Disco do computador",
  alias: "Atalho para outra conta",
  crypt: "Pasta criptografada",
  union: "União de várias contas",
  combine: "Várias contas combinadas",
  chunker: "Divisor de arquivos grandes",
  compress: "Pasta comprimida",
  hasher: "Verificador de hashes",
  memory: "Memória (temporário)",
  http: "Site HTTP (somente leitura)",
  cache: "Cache de outra conta",
};

/** "Google Drive" instead of "Google Drive (this is not Google Docs)". */
export function shortDescription(d: string, prefix?: string): string {
  if (prefix && PT_NAMES[prefix]) return PT_NAMES[prefix];
  return d.replace(/\s*\(.*\)\s*$/, "").trim() || d;
}

export async function loadRemotes(signal?: AbortSignal): Promise<RemoteInfo[]> {
  const { remotes = [] } = await rc<{ remotes?: string[] }>("config/listremotes", {}, signal);
  return Promise.all(
    remotes.map(async (name) => {
      const cfg = await rc<{ type?: string; remote?: string; upstreams?: string }>("config/get", { name }, signal).catch(() => ({ type: "?" }) as { type?: string; remote?: string; upstreams?: string });
      const type = cfg.type ?? "?";
      const target = WRAPPERS.has(type) ? (cfg.remote ?? cfg.upstreams) : undefined;
      return { name, type, service: await serviceName(type), target };
    }),
  );
}

// ---------- Job labels ----------
// rclone's job/status does not return the job's parameters, so the panel
// remembers what each job was. Keys include rclone's process id so ids from
// a previous rclone run are never confused with the current ones (v1.60 has
// no executeId).

export type JobKind = "copy" | "sync" | "move" | "bisync" | "copyfile" | "movefile" | "delete" | "purge" | "upload" | "other";
/** `call` is the rc request that started the job, kept so it can be retried. */
export type JobMeta = {
  kind: JobKind;
  label: string;
  src?: string;
  dst?: string;
  startedAt: string;
  call?: { path: string; params: Record<string, unknown> };
};

const JOBS_KEY = "rclone-painel-jobs";
let executeId: string | null = null;

async function currentExecuteId(): Promise<string> {
  if (executeId) return executeId;
  const r = await rc<{ pid?: number }>("core/pid");
  executeId = `pid${r.pid ?? 0}`;
  return executeId;
}

function readAll(): Record<string, JobMeta> {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export async function rememberJob(id: number, meta: Omit<JobMeta, "startedAt">) {
  const exec = await currentExecuteId();
  const all = readAll();
  all[`${exec}:${id}`] = { ...meta, startedAt: new Date().toISOString() };
  // Keep the newest 200 entries.
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(all));
  } catch {
    // Labels are a convenience; jobs still show without them.
  }
}

export async function jobMetas(): Promise<{ executeId: string; metas: Record<number, JobMeta> }> {
  const exec = await currentExecuteId();
  const out: Record<number, JobMeta> = {};
  for (const [k, v] of Object.entries(readAll())) {
    const [e, id] = k.split(":");
    if (e === exec) out[Number(id)] = v;
  }
  return { executeId: exec, metas: out };
}

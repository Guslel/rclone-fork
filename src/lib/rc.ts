// Client for the rclone remote control API (`rclone rcd`).
//
// The page is served by the same rclone, so every call is same-origin. The
// launcher opens the page with `#token=<base64 user:pass>`; the token is kept
// in sessionStorage (this tab only) and removed from the address bar.

const AUTH_KEY = "rclone-painel-auth";
const HOME_KEY = "rclone-painel-home";

(function readLaunchParams() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get("token");
  const home = hash.get("home");
  if (token) sessionStorage.setItem(AUTH_KEY, token);
  if (home) sessionStorage.setItem(HOME_KEY, home);
  if (token || home) history.replaceState(null, "", location.pathname + location.search);
})();

export function homeDir(): string | null {
  return sessionStorage.getItem(HOME_KEY);
}

export function isWindows(): boolean {
  return sessionStorage.getItem("rclone-painel-os") === "windows";
}

/**
 * The home folder as the panel's local path: "home/gustavo" on Linux/macOS
 * (shown under the "/" root) or "C:/Users/gustavo" on Windows.
 */
export function homePath(): string {
  return (homeDir() ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Windows drive letters ("C:"), shown as the root of "Este computador". */
export function localDrives(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem("rclone-painel-drives") ?? "[]");
  } catch {
    return [];
  }
}

export function setCredentials(user: string, pass: string) {
  sessionStorage.setItem(AUTH_KEY, btoa(`${user}:${pass}`));
}

// location.origin never carries "user:pass@". Chrome refuses fetch() to URLs
// with credentials, and a relative URL inherits them when the launcher opened
// the page as http://user:pass@127.0.0.1:5572/.
function url(path: string): string {
  return `${location.origin}/${path.replace(/^\/+/, "")}`;
}

function authHeader(): Record<string, string> {
  const token = sessionStorage.getItem(AUTH_KEY);
  return token ? { Authorization: `Basic ${token}` } : {};
}

export class RcError extends Error {
  status: number;
  path: string;
  constructor(message: string, status: number, path: string) {
    super(message);
    this.status = status;
    this.path = path;
  }
}

export type Params = Record<string, unknown>;

export async function rc<T = Record<string, unknown>>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(params),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new RcError("Não foi possível falar com o rclone. Ele ainda está rodando?", 0, path);
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    // Some errors come back without a JSON body.
  }
  if (!res.ok) {
    const raw = typeof data?.error === "string" ? data.error : res.statusText;
    throw new RcError(friendlyError(raw, res.status), res.status, path);
  }
  return (data ?? {}) as T;
}

/** Turns rclone's English errors into something the owner can act on. */
export function friendlyError(raw: string, status: number): string {
  const short = explainError(raw, status);
  return short === raw ? raw : `${short} (${raw})`;
}

/** The plain-Portuguese part of an rclone error, without the original text. */
export function explainError(raw: string, status = 500): string {
  if (status === 401) return "Sessão expirada. Abra o painel de novo pelo comando rclone-painel.";
  const rules: [RegExp, string][] = [
    [/directory not found|object not found|not found/i, "Pasta ou arquivo não encontrado."],
    [/rateLimitExceeded|rate limit|too many requests/i, "A nuvem pediu para ir mais devagar (limite de ritmo). Tente de novo em alguns minutos."],
    [/permission denied|forbidden|insufficient/i, "Sem permissão para fazer isso nesta pasta ou conta."],
    [/didn't find section in config file/i, "Essa conta não existe mais na configuração."],
    [/quota|storage.*full|insufficient storage/i, "Sem espaço na nuvem de destino."],
    [/token.*expired|invalid_grant|oauth2/i, "O acesso a essa conta expirou. Reconecte a conta em Contas."],
    [/mountpoint .* is not empty|directory .* is not empty/i, "A pasta escolhida para montar não está vazia."],
    [/fusermount|fuse/i, "O sistema não deixou montar (FUSE). Confira se a pasta existe e está vazia."],
    [/can't use --dry-run/i, "Essa operação não tem prévia."],
  ];
  for (const [re, msg] of rules) if (re.test(raw)) return msg;
  return raw;
}

/** Runs a call as an rclone job and resolves with its output when it ends. */
export async function rcJob<T = Record<string, unknown>>(
  path: string,
  params: Params,
  onStart?: (jobid: number) => void,
): Promise<T> {
  const { jobid } = await rc<{ jobid: number }>(path, { ...params, _async: true });
  onStart?.(jobid);
  for (;;) {
    await new Promise((r) => setTimeout(r, 700));
    const s = await rc<JobStatus>("job/status", { jobid });
    if (s.finished) {
      if (!s.success) throw new RcError(friendlyError(s.error || "Falhou", 500), 500, path);
      return (s.output ?? {}) as T;
    }
  }
}

/** Uploads files into `fs` + `dir` (multipart, operations/uploadfile). */
export async function uploadFiles(fs: string, dir: string, files: FileList | File[]): Promise<void> {
  const form = new FormData();
  for (const f of Array.from(files)) form.append("file", f, f.name);
  const qs = new URLSearchParams({ fs, remote: dir });
  const res = await fetch(url(`operations/uploadfile?${qs}`), { method: "POST", headers: authHeader(), body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new RcError(friendlyError(data?.error ?? res.statusText, res.status), res.status, "operations/uploadfile");
  }
}

/** Downloads one object through --rc-serve, keeping the auth header. */
export async function downloadFile(fs: string, path: string, name: string): Promise<void> {
  const res = await fetch(url(`[${fs}]/${path.split("/").map(encodeURIComponent).join("/")}`), { headers: authHeader() });
  if (!res.ok) throw new RcError(friendlyError(res.statusText, res.status), res.status, "download");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---------- Types for the endpoints we use ----------

export type JobStatus = {
  id: number;
  finished: boolean;
  success: boolean;
  error: string;
  startTime: string;
  endTime: string;
  duration: number;
  group: string;
  output?: Record<string, unknown>;
};

export type CoreStats = {
  bytes: number;
  totalBytes: number;
  transfers: number;
  totalTransfers: number;
  checks: number;
  totalChecks: number;
  deletes: number;
  renames: number;
  errors: number;
  lastError?: string;
  speed: number;
  eta: number | null;
  elapsedTime: number;
  transferring?: { name: string; size: number; percentage: number; speed: number }[];
};

export type ListItem = {
  Path: string;
  Name: string;
  Size: number;
  MimeType: string;
  ModTime: string;
  IsDir: boolean;
};

export type About = { total?: number; used?: number; free?: number; trashed?: number; other?: number; objects?: number };

export type ProviderOption = {
  Name: string;
  Help: string;
  Default: unknown;
  DefaultStr?: string;
  Examples?: { Value: string; Help: string; Provider?: string }[] | null;
  Required: boolean;
  IsPassword: boolean;
  Type: string;
  Exclusive: boolean;
  Advanced?: boolean;
  Hide?: number;
  Provider?: string;
};

export type Provider = { Name: string; Description: string; Prefix: string; Options: ProviderOption[] };

export type ConfigOut = { State: string; Option: ProviderOption | null; Error: string; Result?: string };

export type Mount = { Fs: string; MountPoint: string; MountedOn: string };

// ---------- The app's own endpoints (served by rclone-painel, not rclone) ----------

export async function app<T = Record<string, unknown>>(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(`api/${path}`), {
      method,
      headers: body === undefined ? authHeader() : { "Content-Type": "application/json", ...authHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RcError("Não foi possível falar com o painel. Ele ainda está aberto?", 0, path);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new RcError(data?.error ?? res.statusText, res.status, path);
  return data as T;
}

export type AppInfo = { home: string; os: "linux" | "windows" | "darwin"; versao: string; separador: string; drives?: string[] };

/** Fills in the home folder when the page was opened without it (e.g. a bookmark). */
export async function loadAppInfo(): Promise<AppInfo | null> {
  try {
    const info = await app<AppInfo>("info");
    sessionStorage.setItem(HOME_KEY, info.home);
    sessionStorage.setItem("rclone-painel-os", info.os);
    sessionStorage.setItem("rclone-painel-drives", JSON.stringify(info.drives ?? []));
    return info;
  } catch {
    return null;
  }
}

export function appOS(): string {
  return sessionStorage.getItem("rclone-painel-os") ?? "linux";
}

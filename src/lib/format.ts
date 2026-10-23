const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function bytes(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${nf.format(v)} ${units[i]}`;
}

export function speed(n: number | undefined): string {
  return n ? `${bytes(n)}/s` : "—";
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}min`;
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function dateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1980) return "—";
  return dateFmt.format(d);
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function relative(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = (d - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function percent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

export function plural(n: number, one: string, many: string): string {
  return `${new Intl.NumberFormat("pt-BR").format(n)} ${n === 1 ? one : many}`;
}

/**
 * "remote:" + path, or a local absolute path. Local paths are kept without
 * a leading slash: "home/gustavo" means /home/gustavo; on Windows the first
 * segment is the drive ("C:/Users/gustavo").
 */
export function fsPath(remote: string, path: string): string {
  const p = path.replace(/^\/+/, "");
  if (remote === LOCAL) {
    if (/^[A-Za-z]:/.test(p)) return /^[A-Za-z]:$/.test(p) ? `${p}/` : p;
    return `/${p}`;
  }
  return `${remote}:${p}`;
}

/** Inverse of fsPath: "conta:pasta" or a local path back to a picker location. */
export function parseFs(fs: string): { remote: string; path: string } {
  const s = fs.replace(/\\/g, "/");
  if (s.startsWith("/")) return { remote: LOCAL, path: s.replace(/^\/+/, "") };
  if (/^[A-Za-z]:(\/|$)/.test(s)) return { remote: LOCAL, path: s.replace(/\/+$/, "") };
  const i = s.indexOf(":");
  return i < 0 ? { remote: LOCAL, path: s } : { remote: s.slice(0, i), path: s.slice(i + 1) };
}

/** Pseudo-remote name for this computer's file system. */
export const LOCAL = "__local__";

export function locationLabel(remote: string, path: string): string {
  return fsPath(remote, path);
}

export function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function joinPath(dir: string, name: string): string {
  return [dir.replace(/\/+$/, ""), name].filter(Boolean).join("/");
}

/**
 * Breadcrumb segments with the middle collapsed when the path is long:
 * each item is the visible label and the path up to it (null for "…").
 */
export function crumbs(path: string, keepEnd = 2): { label: string; path: string | null }[] {
  const parts = path.split("/").filter(Boolean);
  const items = parts.map((label, i) => ({ label, path: parts.slice(0, i + 1).join("/") }));
  if (items.length <= keepEnd + 2) return items;
  return [items[0], { label: "…", path: null }, ...items.slice(-keepEnd)];
}

/**
 * Splits a panel location into the rclone fs to call and a function that
 * turns full panel paths into paths relative to it. On Windows the drive is
 * the fs ("C:/"), elsewhere "/" or "conta:".
 */
export function splitLocation(remote: string, path: string): { fs: string; prefix: string; rel: (p: string) => string } {
  const p = path.replace(/^\/+/, "");
  let fs = `${remote}:`;
  let prefix = "";
  if (remote === LOCAL) {
    const m = /^([A-Za-z]:)(\/|$)/.exec(p);
    fs = m ? `${m[1]}/` : "/";
    prefix = m ? `${m[1]}/` : "";
  }
  const rel = (full: string) => {
    const q = full.replace(/^\/+/, "");
    if (prefix && q === prefix.slice(0, -1)) return "";
    return prefix && q.startsWith(prefix) ? q.slice(prefix.length) : q;
  };
  return { fs, prefix, rel };
}

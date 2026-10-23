import { useEffect, useState } from "react";
import { rc, type About } from "./rc";
import type { RemoteInfo } from "./store";

// operations/about can take tens of seconds on some clouds (Google Drive under
// rate limiting), so space is fetched per account in the background and the
// last answer is kept for a while to show instantly on the next visit.
const KEY = "rclone-painel-about";
const FRESH_MS = 10 * 60 * 1000;

type Cached = { at: number; about: About | null };

function readCache(): Record<string, Cached> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(name: string, about: About | null) {
  try {
    const all = readCache();
    all[name] = { at: Date.now(), about };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // The cache is only a speed-up.
  }
}

/** undefined = still loading, null = this account does not report space. */
export type AboutMap = Record<string, About | null | undefined>;

export function useAbout(remotes: RemoteInfo[] | undefined): AboutMap {
  const [map, setMap] = useState<AboutMap>({});
  const names = remotes?.map((r) => `${r.name}:${r.target ?? ""}`).join("|") ?? "";

  useEffect(() => {
    if (!remotes) return;
    const ctrl = new AbortController();
    const cache = readCache();
    const initial: AboutMap = {};
    for (const r of remotes) {
      // A wrapper's space is its target's; asking would count the same disk twice.
      if (r.target) initial[r.name] = null;
      else if (cache[r.name]) initial[r.name] = cache[r.name].about;
    }
    setMap(initial);
    for (const r of remotes) {
      if (r.target) continue;
      const c = cache[r.name];
      if (c && Date.now() - c.at < FRESH_MS) continue;
      rc<About>("operations/about", { fs: `${r.name}:` }, ctrl.signal)
        .then((a) => a)
        .catch((e) => ((e as Error).name === "AbortError" ? undefined : null))
        .then((a) => {
          if (a === undefined || ctrl.signal.aborted) return;
          writeCache(r.name, a);
          setMap((m) => ({ ...m, [r.name]: a }));
        });
    }
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);

  return map;
}

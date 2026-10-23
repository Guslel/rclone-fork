import { useCallback, useEffect, useRef, useState } from "react";

export type Async<T> = { data: T | undefined; error: string | null; loading: boolean; reload: () => void };

/** Runs `fn` on mount and whenever `deps` change; optionally polls. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], pollMs?: number): Async<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const run = async () => {
      if (first) setLoading(true);
      try {
        const result = await fnRef.current(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          first = false;
          if (pollMs && document.visibilityState !== "hidden") timer = setTimeout(run, pollMs);
          else if (pollMs) timer = setTimeout(run, pollMs * 4);
        }
      }
    };
    run();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // Storage can be unavailable; the value still lives for this session.
      }
    },
    [key],
  );
  return [value, set];
}

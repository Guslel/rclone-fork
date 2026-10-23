import { Copy, Download, Pause, Play, ScrollText, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { Callout, Empty, PageHead } from "../components/ui";
import { explainError } from "../lib/rc";

type Level = "ERRO" | "AVISO" | "INFO" | "DEBUG";
type Entry = { id: number; time: string; level: Level; text: string; extra: string[] };
type Source = "painel" | "rclone";
type Filter = "todos" | "avisos" | "erros";

const SOURCES: { id: Source; label: string; help: string }[] = [
  { id: "painel", label: "Painel", help: "O que o aplicativo fez: automações, vigia de pastas, erros ao abrir." },
  { id: "rclone", label: "rclone", help: "O que o rclone registrou: limites do Google, falhas de rede, arquivos que não copiou." },
];

const MAX_ENTRIES = 2000;
const HEADER = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})(?:\.\d+)? (.*)$/;

/** Turns "2026/10/22 16:28:38 ERRO mensagem" (or rclone's "ERROR : x") into an entry. */
function parse(line: string, id: number, source: Source): Entry | null {
  const m = HEADER.exec(line);
  if (!m) return null;
  let rest = m[2];
  let level: Level = "INFO";
  const own = /^(INFO|AVISO|ERRO) (.*)$/.exec(rest);
  const rc = /^(ERROR|NOTICE|INFO|DEBUG|WARNING|CRITICAL)\s*:\s?(.*)$/.exec(rest);
  if (own) {
    level = own[1] as Level;
    rest = own[2];
  } else if (rc) {
    rest = rc[2];
    // NOTICE is rclone's default level: most of it is neutral ("Serving remote
    // control…"), so only the ones that read like a problem count as warnings.
    const worrying = /fail|can't|cannot|couldn't|retir|retry|rate ?limit|deprecat|will stop/i.test(rest);
    level =
      rc[1] === "ERROR" || rc[1] === "CRITICAL"
        ? "ERRO"
        : rc[1] === "WARNING" || (rc[1] === "NOTICE" && worrying)
          ? "AVISO"
          : rc[1] === "DEBUG"
            ? "DEBUG"
            : "INFO";
  } else if (source === "painel") {
    level = "INFO";
  }
  return { id, time: m[1], level, text: rest, extra: [] };
}

/** Appends raw lines to the entries; lines without a timestamp belong to the entry before. */
function append(prev: Entry[], lines: string[], source: Source, nextId: { current: number }): Entry[] {
  const out = prev.slice();
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = parse(line, nextId.current, source);
    if (e) {
      nextId.current++;
      out.push(e);
    } else if (out.length) {
      const last = out[out.length - 1];
      out[out.length - 1] = { ...last, extra: [...last.extra, line] };
    } else {
      out.push({ id: nextId.current++, time: "", level: "INFO", text: line, extra: [] });
    }
  }
  return out.length > MAX_ENTRIES ? out.slice(out.length - MAX_ENTRIES) : out;
}

export default function Logs(_: PageProps) {
  const fb = useFeedback();
  const [source, setSource] = useState<Source>("painel");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const offset = useRef(-1);
  const nextId = useRef(1);
  const box = useRef<HTMLDivElement>(null);

  const poll = useCallback(
    async (signal: AbortSignal) => {
      try {
        const r = await fetch(`/api/logs?arquivo=${source}&desde=${offset.current}`, { signal }).then((x) => (x.ok ? x.json() : Promise.reject(new Error("falhou"))));
        const first = offset.current < 0 || r.proximo < offset.current;
        offset.current = r.proximo;
        setError(null);
        setEntries((prev) => (r.linhas.length || first ? append(first ? [] : prev, r.linhas, source, nextId) : prev));
        setLoaded(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Não foi possível ler o log. O painel ainda está aberto?");
      }
    },
    [source],
  );

  useEffect(() => {
    offset.current = -1;
    nextId.current = 1;
    setEntries([]);
    setLoaded(false);
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (document.visibilityState !== "hidden") await poll(ctrl.signal);
      if (!ctrl.signal.aborted) timer = setTimeout(loop, 2000);
    };
    loop();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [poll]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "erros" && e.level !== "ERRO") return false;
      if (filter === "avisos" && e.level !== "ERRO" && e.level !== "AVISO") return false;
      return !q || `${e.text} ${e.extra.join(" ")}`.toLowerCase().includes(q);
    });
  }, [entries, filter, query]);

  const counts = useMemo(() => ({ erros: entries.filter((e) => e.level === "ERRO").length, avisos: entries.filter((e) => e.level === "AVISO").length }), [entries]);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, follow]);

  async function copy() {
    const text = shown.map((e) => [`${e.time} ${e.level} ${e.text}`, ...e.extra].join("\n")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      fb.toast("ok", `${shown.length} linhas copiadas.`);
    } catch {
      fb.toast("error", "Não foi possível copiar. Use o botão Baixar.");
    }
  }

  const current = SOURCES.find((s) => s.id === source)!;

  return (
    <div className="page">
      <PageHead
        title="Logs"
        description="O registro do que o painel e o rclone estão fazendo, ao vivo. Útil quando algo não funciona como esperado."
        actions={
          <>
            <button className="btn" onClick={copy} disabled={!shown.length}>
              <Copy size={15} /> Copiar
            </button>
            <a className="btn" href={`/api/logs/baixar?arquivo=${source}`}>
              <Download size={15} /> Baixar
            </a>
          </>
        }
      />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Qual log">
          {SOURCES.map((s) => (
            <button key={s.id} aria-pressed={source === s.id} onClick={() => setSource(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Nível">
          <button aria-pressed={filter === "todos"} onClick={() => setFilter("todos")}>
            Tudo
          </button>
          <button aria-pressed={filter === "avisos"} onClick={() => setFilter("avisos")}>
            Avisos e erros <span className="faint num">{counts.erros + counts.avisos}</span>
          </button>
          <button aria-pressed={filter === "erros"} onClick={() => setFilter("erros")}>
            Só erros <span className="faint num">{counts.erros}</span>
          </button>
        </div>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
          <Search size={14} className="faint" style={{ position: "absolute", left: 10, top: 9 }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar no log" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar no log" />
        </div>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setFollow((f) => !f)} aria-pressed={follow}>
          {follow ? <Pause size={15} /> : <Play size={15} />} {follow ? "Pausar rolagem" : "Seguir o fim"}
        </button>
      </div>

      <p className="small muted" style={{ marginBottom: 12 }}>
        {current.help}
      </p>

      {error && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      <div className="panel log-box" ref={box} role="log" aria-live="off" aria-label={`Log do ${current.label}`}>
        {loaded && shown.length === 0 && (
          <Empty icon={<ScrollText size={22} className="faint" />} title={entries.length ? "Nada neste filtro" : "O log está vazio"}>
            {entries.length ? "Troque o filtro ou apague a busca." : "As linhas aparecem aqui assim que algo acontecer."}
          </Empty>
        )}
        {shown.map((e) => {
          const hint = e.level === "ERRO" ? explainError(e.text) : e.text;
          return (
            <div key={e.id} className={`log-line ${e.level.toLowerCase()}`}>
              <span className="log-time num">{e.time.slice(11)}</span>
              <span className="log-level">{e.level}</span>
              <span className="log-text">
                {e.text}
                {e.extra.map((x, i) => (
                  <span key={i} className="log-extra">
                    {x}
                  </span>
                ))}
                {e.level === "ERRO" && hint !== e.text && <span className="log-hint">{hint}</span>}
              </span>
            </div>
          );
        })}
      </div>

      <p className="small faint" style={{ marginTop: 10 }}>
        Mostra as últimas {MAX_ENTRIES} entradas e se atualiza a cada 2 segundos. Os logs mostram nomes de arquivos e pastas: confira antes de compartilhar.
      </p>
    </div>
  );
}

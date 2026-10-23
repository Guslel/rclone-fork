import { ArrowRight, Clock, Eye, History, Pause, Pencil, Play, Plus, RefreshCcw, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { LocationPicker, type Location } from "../components/LocationPicker";
import { Callout, Dialog, Empty, ErrorLine, Hint, Menu, PageHead, Pill, SkeletonRows, Spinner } from "../components/ui";
import { LOCAL, bytes, dateTime, duration, fsPath, parseFs, plural, relative } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { app, homePath, rc, type CoreStats } from "../lib/rc";
import { loadRemotes, type RemoteInfo } from "../lib/store";

export type Automation = {
  id: string;
  nome: string;
  origem: string;
  destino: string;
  modo: "copy" | "sync";
  aoMudar: boolean;
  intervaloMin: number;
  ignorar: string[];
  historico: boolean;
  historicoDias: number;
  ativa: boolean;
  criadaEm?: string;
};

type Run = {
  inicio: string;
  fim: string;
  motivo: string;
  sucesso: boolean;
  erro?: string;
  enviados: number;
  apagados: number;
  bytes: number;
  verificados: number;
};

type State = {
  rodando: boolean;
  vigiando: boolean;
  avisoVigia?: string;
  pendente: boolean;
  proxima?: string;
  historico: Run[];
  mudancaEm?: string;
  historicoEm?: string;
};

type Data = { automacoes: Automation[]; estado: Record<string, State> };

const INTERVALS = [
  { min: 15, label: "a cada 15 minutos" },
  { min: 30, label: "a cada 30 minutos" },
  { min: 60, label: "a cada 1 hora" },
  { min: 180, label: "a cada 3 horas" },
  { min: 360, label: "a cada 6 horas" },
  { min: 1440, label: "uma vez por dia" },
];

const KEEP_DAYS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
  { dias: 365, label: "1 ano" },
  { dias: 0, label: "para sempre (ocupa mais espaço)" },
];

/** True when the destination is the root of an account/drive: it has no sibling folder for the history. */
function isRootDestination(fs: string) {
  const d = fs.replace(/\\/g, "/").replace(/\/+$/, "");
  return d === "" || /^[^/]*:$/.test(d);
}

function intervalLabel(min: number) {
  return INTERVALS.find((i) => i.min === min)?.label ?? `a cada ${min} minutos`;
}

function runSummary(r: Run): string {
  if (!r.sucesso) return r.erro || "Falhou";
  if (r.enviados === 0 && r.apagados === 0) return "Nada novo para enviar";
  const parts = [`${plural(r.enviados, "arquivo enviado", "arquivos enviados")} (${bytes(r.bytes)})`];
  if (r.apagados) parts.push(plural(r.apagados, "apagado", "apagados"));
  return parts.join(" · ");
}

export default function Automations({ go }: PageProps) {
  const fb = useFeedback();
  const data = useAsync(() => app<Data>("automacoes"), [], 2000);
  const startup = useAsync(() => app<{ ativo: boolean; suportado: boolean }>("inicio"), []);
  const remotes = useAsync((signal) => loadRemotes(signal), []);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [history, setHistory] = useState<string | null>(null);

  async function save(list: Automation[], message: string) {
    try {
      await app("automacoes", "PUT", list);
      fb.toast("ok", message);
      data.reload();
      return true;
    } catch (e) {
      fb.toast("error", (e as Error).message);
      return false;
    }
  }

  const list = data.data?.automacoes ?? [];

  async function remove(a: Automation) {
    const ok = await fb.confirm({
      title: `Apagar a automação “${a.nome}”?`,
      danger: true,
      confirm: "Apagar automação",
      body: <p>Ela para de rodar. Nenhum arquivo é apagado: nem na origem, nem no destino.</p>,
    });
    if (ok) await save(list.filter((x) => x.id !== a.id), "Automação apagada.");
  }

  async function runNow(a: Automation) {
    try {
      await app(`automacoes/${a.id}/rodar`, "POST");
      fb.toast("ok", `“${a.nome}” começou a rodar.`);
      data.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    }
  }

  const newOne = (): Automation => ({
    id: crypto.randomUUID(),
    nome: "",
    origem: fsPath(LOCAL, homePath()),
    destino: remotes.data?.[0] ? `${remotes.data[0].name}:` : "",
    modo: "copy",
    aoMudar: true,
    intervaloMin: 60,
    ignorar: [],
    historico: false,
    historicoDias: 30,
    ativa: true,
  });

  return (
    <div className="page">
      <PageHead
        title="Automações"
        description="Envie uma pasta sozinho: quando algo muda nela e de tempos em tempos. Elas rodam em segundo plano, mesmo com esta aba fechada."
        actions={
          <button className="btn primary" onClick={() => setEditing(newOne())} disabled={!remotes.data}>
            <Plus size={15} /> Nova automação
          </button>
        }
      />

      {startup.data?.suportado && !startup.data.ativo && list.some((a) => a.ativa) && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warn">
            <strong>As automações só rodam enquanto o painel estiver aberto.</strong> Para rodarem sempre, deixe o painel iniciar com o computador.{" "}
            <button
              className="btn sm"
              onClick={() =>
                app("inicio", "POST", { ativo: true })
                  .then(() => {
                    fb.toast("ok", "O painel vai iniciar junto com o computador.");
                    startup.reload();
                  })
                  .catch((e) => fb.toast("error", e.message))
              }
            >
              Iniciar com o computador
            </button>
          </Callout>
        </div>
      )}

      <div className="panel">
        {data.error && !data.data && (
          <div className="panel-pad">
            <ErrorLine error={data.error} onRetry={data.reload} />
          </div>
        )}
        {data.loading && !data.data && <SkeletonRows rows={3} />}
        {data.data && list.length === 0 && (
          <Empty
            icon={<Zap size={22} className="faint" />}
            title="Nenhuma automação ainda"
            action={
              <button className="btn primary" onClick={() => setEditing(newOne())}>
                <Plus size={15} /> Criar a primeira
              </button>
            }
          >
            Exemplo: sempre que você salvar algo na pasta do Obsidian, ela é enviada para o Drive alguns segundos depois.
          </Empty>
        )}
        {list.map((a) => {
          const st = data.data?.estado[a.id];
          const last = st?.historico?.[0];
          return (
            <div key={a.id} className="auto-row">
              <div className="auto-main">
                <div className="auto-title">
                  <strong>{a.nome}</strong>
                  {!a.ativa ? (
                    <Pill tone="neutral">Pausada</Pill>
                  ) : st?.rodando ? (
                    <Pill tone="run">Rodando agora</Pill>
                  ) : st?.pendente ? (
                    <Pill tone="run">Mudança detectada, enviando em instantes</Pill>
                  ) : (
                    <Pill tone="ok">Ativa</Pill>
                  )}
                </div>
                <span className="mono small job-route">
                  <span className="ellipsis">{a.origem}</span>
                  <ArrowRight size={12} className="faint" style={{ flex: "none" }} />
                  <span className="ellipsis">{a.destino}</span>
                </span>
                <span className="small muted auto-when">
                  <span>{a.modo === "copy" ? "Copiar" : "Sincronizar"}</span>
                  {a.aoMudar && (
                    <span>
                      <Zap size={12} /> ao mudar
                      {a.ativa && st && !st.vigiando && st.avisoVigia ? ` (vigia parado: ${st.avisoVigia})` : ""}
                    </span>
                  )}
                  {a.intervaloMin > 0 && (
                    <span>
                      <Clock size={12} /> {intervalLabel(a.intervaloMin)}
                    </span>
                  )}
                  {a.historico && (
                    <span>
                      <History size={12} /> guarda versões antigas {a.historicoDias ? `por ${a.historicoDias} dias` : "para sempre"}
                    </span>
                  )}
                  {a.ativa && st?.proxima && <span>próxima conferência {relative(st.proxima)}</span>}
                </span>
                <span className="small">
                  {last ? (
                    <button className="link small" onClick={() => setHistory(a.id)}>
                      <span style={{ color: last.sucesso ? "var(--text-2)" : "var(--danger)" }}>
                        Última vez {relative(last.fim)}: {runSummary(last)}
                      </span>
                    </button>
                  ) : (
                    <span className="faint">Ainda não rodou.</span>
                  )}
                </span>
              </div>
              <div className="remote-actions">
                <button className="btn sm" onClick={() => runNow(a)} disabled={!a.ativa || st?.rodando}>
                  <Play size={14} /> Rodar agora
                </button>
                <button className="btn sm" onClick={() => setEditing(a)}>
                  <Pencil size={14} /> Editar
                </button>
                <Menu
                  label={`Mais ações para ${a.nome}`}
                  items={[
                    {
                      label: a.ativa ? "Pausar" : "Ativar",
                      icon: a.ativa ? <Pause size={14} /> : <Play size={14} />,
                      onSelect: () =>
                        save(
                          list.map((x) => (x.id === a.id ? { ...x, ativa: !x.ativa } : x)),
                          a.ativa ? "Automação pausada." : "Automação ativada.",
                        ),
                    },
                    { label: "Ver execuções", icon: <Clock size={14} />, onSelect: () => setHistory(a.id) },
                    ...(a.historico && st?.historicoEm
                      ? [
                          {
                            label: "Abrir versões antigas",
                            icon: <History size={14} />,
                            onSelect: () => {
                              const loc = parseFs(st.historicoEm!);
                              go("arquivos", { remote: loc.remote, path: loc.path });
                            },
                          },
                        ]
                      : []),
                    { label: "Apagar automação", icon: <Trash2 size={14} />, danger: true, onSelect: () => remove(a) },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>
            Como funciona <Hint term="job" />
          </h2>
        </div>
        <div className="panel panel-pad small muted form-grid" style={{ gap: 8 }}>
          <p>
            <strong style={{ color: "var(--text)" }}>Ao mudar:</strong> o painel percebe na hora quando um arquivo da pasta muda, espera 30 segundos sem
            novas mudanças e então envia. Enquanto nada muda, ele não consome nada e não consulta a nuvem.
          </p>
          <p>
            <strong style={{ color: "var(--text)" }}>De tempos em tempos:</strong> uma conferência de segurança que pega o que tiver escapado, como mudanças
            feitas com o painel fechado. Ela também roda logo depois que o painel abre.
          </p>
        </div>
      </section>

      {editing && (
        <Editor
          key={editing.id}
          initial={editing}
          isNew={!list.some((x) => x.id === editing.id)}
          remotes={remotes.data ?? []}
          onClose={() => setEditing(null)}
          onSave={async (a) => {
            const exists = list.some((x) => x.id === a.id);
            const next = exists ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a];
            if (await save(next, exists ? "Automação salva." : `Automação “${a.nome}” criada.`)) setEditing(null);
          }}
        />
      )}
      <HistoryDialog
        automation={list.find((a) => a.id === history) ?? null}
        runs={history ? (data.data?.estado[history]?.historico ?? []) : []}
        onClose={() => setHistory(null)}
      />
    </div>
  );
}

function Editor({
  initial,
  isNew,
  remotes,
  onClose,
  onSave,
}: {
  initial: Automation;
  isNew: boolean;
  remotes: RemoteInfo[];
  onClose: () => void;
  onSave: (a: Automation) => Promise<void>;
}) {
  const [a, setA] = useState<Automation>(initial);
  const [src, setSrc] = useState<Location>(parseFs(initial.origem));
  const [dst, setDst] = useState<Location>(parseFs(initial.destino || (remotes[0] ? `${remotes[0].name}:` : "/")));
  const [ignore, setIgnore] = useState((initial.ignorar ?? []).join("\n"));
  const [preview, setPreview] = useState<CoreStats | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "save">("");
  const [error, setError] = useState<string | null>(null);

  const origem = fsPath(src.remote, src.path);
  const destino = fsPath(dst.remote, dst.path);
  const localSource = src.remote === LOCAL;
  const rules = ignore
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const valid = a.nome.trim() && origem !== destino && (a.aoMudar || a.intervaloMin > 0);
  const set = (p: Partial<Automation>) => {
    setA((x) => ({ ...x, ...p }));
    setPreview(null);
  };

  async function runPreview() {
    setBusy("preview");
    setError(null);
    const group = `previa-auto-${Date.now()}`;
    try {
      await rc(`sync/${a.modo}`, {
        srcFs: origem,
        dstFs: destino,
        _config: { DryRun: true },
        _group: group,
        ...(rules.length ? { _filter: { ExcludeRule: rules } } : {}),
      });
      setPreview(await rc<CoreStats>("core/stats", { group }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      rc("core/stats-delete", { group }).catch(() => undefined);
      setBusy("");
    }
  }

  async function submit() {
    setBusy("save");
    await onSave({ ...a, nome: a.nome.trim(), origem, destino, ignorar: rules, aoMudar: a.aoMudar && localSource, historico: a.historico && !rootDest });
    setBusy("");
  }

  const obsidian = /obsidian/i.test(origem);
  const rootDest = isRootDestination(destino);
  const historyHint = `${destino.replace(/\/+$/, "")}-historico`;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={isNew ? "Nova automação" : `Editar “${initial.nome}”`}
      description="Escolha a pasta, para onde ela vai e quando enviar."
      footer={
        <>
          <button className="btn left" onClick={runPreview} disabled={!!busy || origem === destino}>
            {busy === "preview" ? <Spinner size={14} /> : <Eye size={14} />} Ver prévia
          </button>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit} disabled={!valid || !!busy}>
            {busy === "save" && <Spinner size={14} />} {isNew ? "Criar automação" : "Salvar"}
          </button>
        </>
      }
    >
      {error && <ErrorLine error={error} />}
      <label className="field">
        <span className="field-label">Nome</span>
        <input className="input" placeholder="Ex.: Backup do Obsidian" value={a.nome} onChange={(e) => set({ nome: e.target.value })} autoFocus />
      </label>

      <div className="route">
        <LocationPicker label="Pasta de origem" remotes={remotes} value={src} onChange={(l) => (setSrc(l), setPreview(null))} allowNew={false} />
        <div className="route-arrow" aria-hidden>
          <ArrowRight size={18} />
        </div>
        <LocationPicker label="Destino" remotes={remotes} value={dst} onChange={(l) => (setDst(l), setPreview(null))} />
      </div>

      <div className="field">
        <span className="field-label">O que fazer</span>
        <div className="segmented" role="radiogroup" aria-label="O que fazer" style={{ alignSelf: "flex-start" }}>
          <button role="radio" aria-pressed={a.modo === "copy"} aria-checked={a.modo === "copy"} onClick={() => set({ modo: "copy" })}>
            Copiar
          </button>
          <button role="radio" aria-pressed={a.modo === "sync"} aria-checked={a.modo === "sync"} onClick={() => set({ modo: "sync" })}>
            Sincronizar
          </button>
        </div>
        <span className="field-help">
          {a.modo === "copy"
            ? "Envia o que é novo ou mudou. Nunca apaga nada no destino: se você apagar um arquivo da pasta, a cópia continua lá."
            : "Deixa o destino igual à pasta: se você apagar um arquivo da pasta, ele também é apagado do destino."}
        </span>
        {a.modo === "sync" &&
          (a.historico ? (
            <Callout tone="info">Com as versões antigas ligadas, o que for apagado da pasta sai do destino, mas a última versão fica guardada no histórico.</Callout>
          ) : (
            <Callout tone="warn">Com Sincronizar, apagar algo da pasta por engano apaga também do destino. Veja a prévia ou ligue as versões antigas.</Callout>
          ))}
      </div>

      <div className="field">
        <span className="field-label">Quando</span>
        <label className="check">
          <input type="checkbox" checked={a.aoMudar && localSource} disabled={!localSource} onChange={(e) => set({ aoMudar: e.target.checked })} />
          <span>
            Quando algo mudar na pasta
            <span className="field-help" style={{ display: "block" }}>
              {localSource
                ? "Espera 30 segundos sem novas mudanças e envia. Não consome nada enquanto a pasta está parada."
                : "Só funciona quando a origem é uma pasta deste computador."}
            </span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={a.intervaloMin > 0} onChange={(e) => set({ intervaloMin: e.target.checked ? 60 : 0 })} />
          <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            De tempos em tempos, como conferência
            {a.intervaloMin > 0 && (
              <select className="select" style={{ maxWidth: 240 }} value={a.intervaloMin} onChange={(e) => set({ intervaloMin: Number(e.target.value) })}>
                {INTERVALS.map((i) => (
                  <option key={i.min} value={i.min}>
                    {i.label}
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>
        {!a.aoMudar && a.intervaloMin === 0 && <span className="field-help" style={{ color: "var(--danger)" }}>Escolha pelo menos uma das opções.</span>}
      </div>

      <div className="field">
        <span className="field-label">Versões antigas</span>
        <label className="check">
          <input type="checkbox" checked={a.historico} disabled={rootDest} onChange={(e) => set({ historico: e.target.checked })} />
          <span>
            Guardar a versão anterior antes de sobrescrever ou apagar
            <span className="field-help" style={{ display: "block" }}>
              {rootDest
                ? "Para guardar versões, escolha uma pasta como destino, não a raiz da conta."
                : `Guarda numa pasta ao lado do destino (${historyHint}), uma pasta por dia. Se você apagar ou estragar um arquivo, a versão anterior continua lá.`}
            </span>
          </span>
        </label>
        {a.historico && !rootDest && (
          <>
            <label className="field" style={{ maxWidth: 320 }}>
              <span className="field-label">Manter por quanto tempo</span>
              <select className="select" value={a.historicoDias} onChange={(e) => set({ historicoDias: Number(e.target.value) })}>
                {KEEP_DAYS.map((k) => (
                  <option key={k.dias} value={k.dias}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="field-help">
              Cada versão guardada vira um arquivo com o horário no nome (ex.: <span className="mono">slot1-143005.sav</span>). Ocupa espaço no seu
              Drive só com o que mudou; as pastas mais antigas que o prazo são apagadas sozinhas.
            </span>
          </>
        )}
      </div>

      <label className="field">
        <span className="field-label">
          Ignorar arquivos <Hint term="exclude" />
        </span>
        <textarea className="input mono" placeholder={"*.tmp\n.git/**"} value={ignore} onChange={(e) => (setIgnore(e.target.value), setPreview(null))} />
        {obsidian && !rules.includes(".obsidian/workspace*.json") && (
          <button
            type="button"
            className="link small"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setIgnore([...rules, ".obsidian/workspace*.json"].join("\n"))}
          >
            Sugestão para Obsidian: ignorar .obsidian/workspace*.json (o Obsidian regrava esse arquivo o tempo todo)
          </button>
        )}
      </label>

      {preview && (
        <div className="panel panel-pad">
          <div className="section-head">
            <h2>Prévia</h2>
            <span className="small faint">Nada foi alterado</span>
          </div>
          <div className="preview">
            <div className="stat">
              <b>{preview.totalTransfers}</b>
              <span className="small muted">a enviar agora</span>
            </div>
            <div className={`stat ${preview.deletes > 0 ? "danger" : ""}`}>
              <b>{preview.deletes}</b>
              <span className="small muted">a apagar no destino</span>
            </div>
            <div className="stat">
              <b>{preview.totalChecks || preview.checks}</b>
              <span className="small muted">já iguais</span>
            </div>
            <div className="stat">
              <b>{bytes(preview.totalBytes)}</b>
              <span className="small muted">aproximadamente</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function HistoryDialog({ automation, runs, onClose }: { automation: Automation | null; runs: Run[]; onClose: () => void }) {
  return (
    <Dialog open={automation !== null} wide onClose={onClose} title={`Histórico: ${automation?.nome ?? ""}`} description="As últimas 30 execuções.">
      {runs.length === 0 && <p className="muted">Ainda não rodou.</p>}
      {runs.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Por quê</th>
              <th>Resultado</th>
              <th className="right">Duração</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {dateTime(r.inicio)}
                </td>
                <td className="muted">
                  {r.motivo === "mudança" ? (
                    <>
                      <Zap size={12} /> mudança
                    </>
                  ) : r.motivo === "agendada" ? (
                    <>
                      <Clock size={12} /> conferência
                    </>
                  ) : r.motivo === "ao iniciar" ? (
                    <>
                      <RefreshCcw size={12} /> ao abrir
                    </>
                  ) : (
                    <>
                      <Play size={12} /> manual
                    </>
                  )}
                </td>
                <td style={{ color: r.sucesso ? undefined : "var(--danger)" }}>{runSummary(r)}</td>
                <td className="right num muted">{duration((new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 1000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

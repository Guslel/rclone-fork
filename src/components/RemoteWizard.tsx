import { ArrowLeft, Check, ChevronRight, ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { rc, type ConfigOut, type Provider, type ProviderOption } from "../lib/rc";
import { loadProviders, shortDescription } from "../lib/store";
import { QUESTIONS, YES_NO } from "../lib/terms";
import { Callout, Dialog, Spinner } from "./ui";

// Shown first in the provider list: what people connect most.
const POPULAR = ["drive", "onedrive", "dropbox", "s3", "protondrive", "pcloud", "mega", "box", "webdav", "sftp", "ftp", "smb", "crypt", "alias"];

type Step = { kind: "provider" } | { kind: "options" } | { kind: "question"; out: ConfigOut } | { kind: "waiting" } | { kind: "done" };

/**
 * Basic settings of a backend. rclone's non-interactive flow only asks the
 * follow-up questions (sign-in, drive choice), so these are collected here
 * and sent as parameters. Options tied to a sub-provider (S3's "AWS",
 * "!AWS,Minio"…) show only when that provider is chosen.
 */
export function basicOptions(p: Provider | undefined, values: Record<string, string>): ProviderOption[] {
  if (!p) return [];
  const chosen = values.provider ?? "";
  return p.Options.filter((o) => {
    if (o.Advanced || o.Hide) return false;
    if (!o.Provider) return true;
    const negate = o.Provider.startsWith("!");
    const list = o.Provider.replace(/^!/, "").split(",");
    return negate ? !list.includes(chosen) : list.includes(chosen);
  });
}

/**
 * Creates (or reconnects) a remote by walking through rclone's own
 * non-interactive configuration questions. Each answer goes back to rclone
 * as an async job, because steps like browser sign-in block until finished.
 */
export function RemoteWizard({
  open,
  onClose,
  existing,
  reconnect,
}: {
  open: boolean;
  onClose: (changed: boolean) => void;
  existing: string[];
  reconnect?: string;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [filter, setFilter] = useState("");
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>({ kind: "provider" });
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const created = useRef(false);
  const jobRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setFilter("");
    setType("");
    setName("");
    setError(null);
    setCount(0);
    setValues({});
    created.current = false;
    jobRef.current = null;
    if (reconnect) {
      setName(reconnect);
      start(reconnect, "", true);
    } else {
      setStep({ kind: "provider" });
    }
    loadProviders()
      .then(setProviders)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reconnect]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = providers.filter((p) => !f || `${p.Prefix} ${p.Description}`.toLowerCase().includes(f));
    const rank = (p: Provider) => {
      const i = POPULAR.indexOf(p.Prefix);
      return i === -1 ? 100 : i;
    };
    return list.sort((a, b) => rank(a) - rank(b) || a.Description.localeCompare(b.Description));
  }, [providers, filter]);

  const nameError = !name.trim()
    ? null
    : existing.includes(name.trim()) && !reconnect
      ? "Já existe uma conta com esse nome."
      : !/^[\w][\w.\- +@]*$/u.test(name.trim()) || /\s$/.test(name)
        ? "Use letras, números, espaço e _ - . + @ (sem começar com espaço ou hífen)."
        : null;

  async function runStep(path: string, params: Record<string, unknown>) {
    setStep({ kind: "waiting" });
    setError(null);
    try {
      const { jobid } = await rc<{ jobid: number }>(path, { ...params, _async: true });
      jobRef.current = jobid;
      for (;;) {
        await new Promise((r) => setTimeout(r, 800));
        const s = await rc<{ finished: boolean; success: boolean; error: string; output?: ConfigOut }>("job/status", { jobid });
        if (!s.finished) continue;
        jobRef.current = null;
        if (!s.success) throw new Error(s.error || "O rclone não conseguiu continuar.");
        const out = (s.output ?? { State: "", Option: null, Error: "" }) as ConfigOut;
        setCount((c) => c + 1);
        if (!out.State) {
          setStep({ kind: "done" });
        } else {
          setAnswer(defaultAnswer(out.Option));
          setStep({ kind: "question", out });
        }
        return;
      }
    } catch (e) {
      setError((e as Error).message);
      setStep((s) => (s.kind === "waiting" ? { kind: "provider" } : s));
    }
  }

  function start(remoteName: string, remoteType: string, isReconnect = false) {
    if (isReconnect) {
      runStep("config/update", { name: remoteName, parameters: {}, opt: { nonInteractive: true } });
      return;
    }
    // Only what the user changed: defaults stay rclone's own.
    const parameters: Record<string, string> = {};
    for (const o of basicOptions(providers.find((p) => p.Prefix === remoteType), values)) {
      const v = values[o.Name];
      if (v !== undefined && v !== "" && v !== defaultAnswer(o)) parameters[o.Name] = v;
    }
    created.current = true;
    runStep("config/create", { name: remoteName, type: remoteType, parameters, opt: { nonInteractive: true, obscure: true } });
  }

  function afterProvider() {
    const opts = basicOptions(providers.find((p) => p.Prefix === type), {});
    if (opts.length) setStep({ kind: "options" });
    else start(name.trim(), type);
  }

  const options = basicOptions(providers.find((p) => p.Prefix === type), values);
  const missing = options.filter((o) => o.Required && !(values[o.Name] ?? defaultAnswer(o)));

  function reply(value: string) {
    if (step.kind !== "question") return;
    runStep("config/update", {
      name: name.trim(),
      parameters: {},
      opt: { nonInteractive: true, continue: true, state: step.out.State, result: value },
    });
  }

  async function cancel() {
    if (jobRef.current) await rc("job/stop", { jobid: jobRef.current }).catch(() => undefined);
    if (created.current && step.kind !== "done") await rc("config/delete", { name: name.trim() }).catch(() => undefined);
    onClose(false);
  }

  const provider = providers.find((p) => p.Prefix === type);
  const title = reconnect ? `Reconectar ${reconnect}` : step.kind === "provider" ? "Conectar conta" : `Conectar ${provider ? shortDescription(provider.Description, provider.Prefix) : "conta"}`;

  return (
    <Dialog
      open={open}
      wide
      onClose={cancel}
      title={title}
      description={
        step.kind === "provider"
          ? "Escolha o serviço e dê um nome para a conexão. Depois o rclone faz algumas perguntas; cada uma vem explicada."
          : step.kind === "options"
            ? "Configurações básicas do serviço. Preencha o que for obrigatório; o resto pode ficar como está."
            : step.kind === "done"
              ? undefined
              : `Pergunta ${count + (step.kind === "waiting" ? 1 : 0)} do rclone`
      }
      footer={
        step.kind === "provider" ? (
          <>
            <button className="btn" onClick={cancel}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!type || !name.trim() || !!nameError} onClick={afterProvider}>
              Continuar
            </button>
          </>
        ) : step.kind === "options" ? (
          <>
            <button className="btn left ghost" onClick={() => setStep({ kind: "provider" })}>
              <ArrowLeft size={14} /> Voltar
            </button>
            <button className="btn primary" disabled={missing.length > 0} onClick={() => start(name.trim(), type)}>
              Continuar
            </button>
          </>
        ) : step.kind === "question" ? (
          <>
            <button className="btn left ghost" onClick={cancel}>
              <ArrowLeft size={14} /> Cancelar
            </button>
            {step.out.Option?.Type === "bool" ? (
              <>
                <button className="btn" onClick={() => reply("false")}>
                  Não
                </button>
                <button className="btn primary" onClick={() => reply("true")}>
                  Sim
                </button>
              </>
            ) : (
              <button className="btn primary" disabled={!!step.out.Option?.Required && !answer} onClick={() => reply(answer)}>
                Continuar
              </button>
            )}
          </>
        ) : step.kind === "waiting" ? (
          <button className="btn" onClick={cancel}>
            Cancelar
          </button>
        ) : (
          <button className="btn primary" onClick={() => onClose(true)}>
            Concluir
          </button>
        )
      }
    >
      {error && <Callout tone="danger">{error}</Callout>}

      {step.kind === "provider" && (
        <>
          <label className="field">
            <span className="field-label">Nome da conexão</span>
            <input
              className="input"
              placeholder="Ex.: drive-pessoal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              autoFocus
            />
            <span className="field-help" style={nameError ? { color: "var(--danger)" } : undefined}>
              {nameError ?? "É como a conta vai aparecer no painel e no terminal (nome:pasta). Curto e sem acentos é mais prático."}
            </span>
          </label>
          <div className="field">
            <span className="field-label">Serviço</span>
            <div style={{ position: "relative" }}>
              <Search size={14} className="faint" style={{ position: "absolute", left: 10, top: 9 }} />
              <input
                className="input"
                style={{ paddingLeft: 30 }}
                placeholder="Buscar: Drive, OneDrive, S3, SFTP…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Buscar serviço"
              />
            </div>
            <div className="providers" role="radiogroup" aria-label="Serviço">
              {shown.map((p) => (
                <button key={p.Prefix} className="provider" role="radio" aria-checked={type === p.Prefix} onClick={() => setType(p.Prefix)}>
                  <span style={{ color: "var(--text)", fontSize: 13.5 }}>{shortDescription(p.Description, p.Prefix)}</span>
                  <span className="mono">{p.Prefix}</span>
                </button>
              ))}
              {!providers.length && !error && (
                <span className="muted small">
                  <Spinner size={14} /> Carregando serviços…
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {step.kind === "options" && (
        <OptionsForm
          options={options}
          values={values}
          onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
          onSubmit={() => missing.length === 0 && start(name.trim(), type)}
        />
      )}

      {step.kind === "question" && step.out.Option && (
        <QuestionField option={step.out.Option} error={step.out.Error} value={answer} onChange={setAnswer} onSubmit={() => reply(answer)} />
      )}

      {step.kind === "waiting" && (
        <div className="empty" style={{ padding: "32px 16px" }}>
          <Spinner size={22} />
          <h3>Falando com o rclone…</h3>
          <p>
            Se você respondeu para fazer login pelo navegador, uma aba de login deve ter aberto. Entre na conta, autorize o acesso e volte para cá. Se a aba
            não abriu, o link aparece no terminal onde o rclone-painel está rodando.
          </p>
        </div>
      )}

      {step.kind === "done" && (
        <div className="empty" style={{ padding: "32px 16px" }}>
          <span className="brand-mark" style={{ width: 32, height: 32, background: "var(--ok)" }}>
            <Check size={18} />
          </span>
          <h3>{reconnect ? "Conta reconectada" : `“${name.trim()}” conectada`}</h3>
          <p>Ela já aparece em Arquivos, Transferir e Montar.</p>
        </div>
      )}
    </Dialog>
  );
}

export function defaultAnswer(o: ProviderOption | null): string {
  if (!o) return "";
  if (o.DefaultStr !== undefined) return o.DefaultStr;
  if (o.Default == null) return "";
  return String(o.Default);
}

function QuestionField({
  option: o,
  error,
  value,
  onChange,
  onSubmit,
}: {
  option: ProviderOption;
  error: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const known = QUESTIONS[o.Name];
  const examples = o.Examples ?? [];
  const isBool = o.Type === "bool";
  const listId = `ex-${o.Name}`;

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {error && <Callout tone="danger">{error}</Callout>}
      <div className="field">
        <span className="field-label" style={{ fontSize: 15 }}>
          {known?.title ?? o.Name}
          {o.Required && !isBool && <span className="faint"> (obrigatório)</span>}
        </span>
        <p className="field-help" style={{ fontSize: 13.5 }}>
          {known?.help ?? firstLine(o.Help)}
        </p>
        {o.Name === "config_shared_client_id" && (
          <a href="https://rclone.org/drive/#making-your-own-client-id" target="_blank" rel="noreferrer" className="small">
            Como criar o seu Client ID <ExternalLink size={12} />
          </a>
        )}
      </div>

      {isBool ? (
        <p className="muted small">
          Recomendado: <strong>{YES_NO[defaultAnswer(o)] ?? defaultAnswer(o)}</strong>. Responda nos botões abaixo.
        </p>
      ) : o.Exclusive && examples.length > 0 ? (
        <div className="picker-list" role="radiogroup" aria-label={known?.title ?? o.Name} style={{ maxHeight: 300 }}>
          {examples.map((ex) => (
            <label key={ex.Value} className="check" style={{ padding: "8px 10px" }}>
              <input type="radio" name={o.Name} checked={value === ex.Value} onChange={() => onChange(ex.Value)} />
              <span>
                {ex.Help ? firstLine(ex.Help) : ex.Value}
                <span className="mono faint small" style={{ display: "block" }}>
                  {ex.Value || "(vazio)"}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <>
          <input
            className="input"
            type={o.IsPassword ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={value}
            list={examples.length ? listId : undefined}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            aria-label={known?.title ?? o.Name}
          />
          {examples.length > 0 && (
            <datalist id={listId}>
              {examples.map((ex) => (
                <option key={ex.Value} value={ex.Value}>
                  {firstLine(ex.Help)}
                </option>
              ))}
            </datalist>
          )}
          {!o.Required && <span className="field-help">Pode deixar em branco.</span>}
        </>
      )}

      <details className="original">
        <summary>Texto original do rclone</summary>
        <pre>
          {o.Name}
          {"\n"}
          {o.Help}
        </pre>
      </details>
    </form>
  );
}

function firstLine(s: string): string {
  return (s ?? "").split("\n")[0].trim();
}

function OptionsForm({
  options,
  values,
  onChange,
  onSubmit,
}: {
  options: ProviderOption[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSubmit: () => void;
}) {
  const required = options.filter((o) => o.Required);
  const optional = options.filter((o) => !o.Required);
  const field = (o: ProviderOption) => (
    <OptionField key={o.Name} option={o} value={values[o.Name] ?? defaultAnswer(o)} onChange={(v) => onChange(o.Name, v)} />
  );

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {required.map(field)}
      {required.length === 0 && <p className="muted">Este serviço não tem campos obrigatórios. Pode continuar direto.</p>}
      {optional.length > 0 && (
        <details className="panel panel-pad">
          <summary className="disclosure">
            <ChevronRight size={15} className="chev" />Opcionais ({optional.length})</summary>
          <div className="form-grid" style={{ marginTop: 16 }}>
            {optional.map(field)}
          </div>
        </details>
      )}
      <button type="submit" hidden />
    </form>
  );
}

/**
 * One backend setting as a form control, labelled and explained in pt-BR.
 * `secretSaved` marks a password that already has a stored value: the field
 * starts empty and only a new value replaces it.
 */
export function OptionField({
  option: o,
  value,
  onChange,
  secretSaved = false,
}: {
  option: ProviderOption;
  value: string;
  onChange: (value: string) => void;
  secretSaved?: boolean;
}) {
  const known = QUESTIONS[o.Name];
  const examples = o.Examples ?? [];
  const label = known?.title ?? o.Name;
  let control;
  if (o.Type === "bool") {
    control = (
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  } else if (o.Exclusive && examples.length > 0) {
    control = (
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {!o.Required && <option value="">(padrão)</option>}
        {examples.map((ex) => (
          <option key={ex.Value} value={ex.Value}>
            {firstLine(ex.Help) || ex.Value}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <>
        <input
          className="input"
          type={o.IsPassword ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={secretSaved ? "•••••••• guardada — deixe vazio para manter" : undefined}
          list={examples.length ? `opt-${o.Name}` : undefined}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        {examples.length > 0 && (
          <datalist id={`opt-${o.Name}`}>
            {examples.map((ex) => (
              <option key={ex.Value} value={ex.Value}>
                {firstLine(ex.Help)}
              </option>
            ))}
          </datalist>
        )}
      </>
    );
  }
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {o.Required && <span className="faint">(obrigatório)</span>}
        {known && <span className="mono faint small">{o.Name}</span>}
      </span>
      {control}
      <span className="field-help">{known?.help ?? firstLine(o.Help)}</span>
    </label>
  );
}

import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { rc, type Provider, type ProviderOption } from "../lib/rc";
import { loadProviders, shortDescription, type RemoteInfo } from "../lib/store";
import { QUESTIONS } from "../lib/terms";
import { useFeedback } from "./feedback";
import { OptionField, basicOptions, defaultAnswer } from "./RemoteWizard";
import { Callout, Dialog, ErrorLine, Spinner } from "./ui";

// Sign-in tokens are refreshed by rclone itself; changing them by hand breaks
// the account. Reconnect is the way to redo sign-in.
const NOT_EDITABLE = /token/i;

function isSecret(o: ProviderOption): boolean {
  return o.IsPassword || /secret|password|pass$|key$/i.test(o.Name);
}

/** Edits the settings of an existing remote with config/update. */
export function EditRemote({ remote, onClose }: { remote: RemoteInfo | null; onClose: (changed: boolean) => void }) {
  const fb = useFeedback();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!remote) return;
    setProvider(null);
    setError(null);
    setFilter("");
    Promise.all([loadProviders(), rc<Record<string, string>>("config/get", { name: remote.name })])
      .then(([providers, cfg]) => {
        setProvider(providers.find((p) => p.Prefix === remote.type) ?? null);
        setSaved(cfg);
        setValues({});
      })
      .catch((e) => setError((e as Error).message));
  }, [remote]);

  // Current value shown in the form: what is saved, else rclone's default.
  // Secrets start empty and only a typed value replaces them.
  const shown = (o: ProviderOption) => {
    if (o.Name in values) return values[o.Name];
    if (isSecret(o)) return "";
    return saved[o.Name] ?? defaultAnswer(o);
  };

  const merged = { ...saved, ...values };
  const basic = basicOptions(provider ?? undefined, merged).filter((o) => !NOT_EDITABLE.test(o.Name));
  const advanced = useMemo(() => {
    if (!provider) return [];
    const chosen = merged.provider ?? "";
    const f = filter.trim().toLowerCase();
    return provider.Options.filter((o) => {
      if (!o.Advanced || o.Hide || NOT_EDITABLE.test(o.Name)) return false;
      if (o.Provider) {
        const negate = o.Provider.startsWith("!");
        const list = o.Provider.replace(/^!/, "").split(",");
        if (negate ? list.includes(chosen) : !list.includes(chosen)) return false;
      }
      if (!f) return true;
      return `${o.Name} ${o.Help} ${QUESTIONS[o.Name]?.title ?? ""}`.toLowerCase().includes(f);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, filter, merged.provider]);

  const changed = useMemo(() => {
    const out: Record<string, string> = {};
    for (const o of provider?.Options ?? []) {
      if (!(o.Name in values)) continue;
      const v = values[o.Name];
      if (isSecret(o)) {
        if (v !== "") out[o.Name] = v;
      } else if (v !== (saved[o.Name] ?? defaultAnswer(o))) {
        out[o.Name] = v;
      }
    }
    return out;
  }, [values, saved, provider]);

  const count = Object.keys(changed).length;
  const advancedChanged = advanced.filter((o) => o.Name in changed).length;

  async function save() {
    if (!remote || !count) return;
    setBusy(true);
    setError(null);
    try {
      // Parameters are written before rclone runs any follow-up questions, so
      // a question in the reply does not mean the change was lost.
      await rc("config/update", { name: remote.name, parameters: changed, opt: { nonInteractive: true, obscure: true } });
      fb.toast("ok", `${count === 1 ? "1 configuração salva" : `${count} configurações salvas`} em “${remote.name}”.`);
      onClose(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (name: string, v: string) => setValues((s) => ({ ...s, [name]: v }));

  return (
    <Dialog
      open={remote !== null}
      wide
      onClose={() => onClose(false)}
      title={`Editar ${remote?.name ?? ""}`}
      description={provider ? `${shortDescription(provider.Description, provider.Prefix)} · as mudanças valem também para o rclone no terminal.` : undefined}
      footer={
        <>
          <span className="left small muted">{count ? `${count} alteração(ões) não salva(s)` : "Nenhuma alteração"}</span>
          <button className="btn" onClick={() => onClose(false)}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={!count || busy}>
            {busy && <Spinner size={14} />} Salvar
          </button>
        </>
      }
    >
      {error && <ErrorLine error={error} />}
      {!provider && !error && (
        <p className="muted">
          <Spinner size={14} /> Carregando configurações…
        </p>
      )}
      {provider && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {/token/i.test(Object.keys(saved).join(" ")) && (
            <Callout tone="info">O login desta conta não aparece aqui. Para refazer o login, use “Reconectar” no menu Mais.</Callout>
          )}
          {basic.length === 0 && <p className="muted">Este serviço não tem configurações básicas.</p>}
          {basic.map((o) => (
            <OptionField key={o.Name} option={o} value={shown(o)} onChange={(v) => set(o.Name, v)} secretSaved={isSecret(o) && !!saved[o.Name]} />
          ))}
          {provider.Options.some((o) => o.Advanced && !o.Hide) && (
            <details className="panel panel-pad">
              <summary className="disclosure">
                <ChevronRight size={15} className="chev" />
                Avançado{advancedChanged ? ` · ${advancedChanged} alterada(s)` : ""}
              </summary>
              <div className="form-grid" style={{ marginTop: 16 }}>
                <p className="field-help">Raramente precisam mudar. Na dúvida, deixe como está.</p>
                <div style={{ position: "relative" }}>
                  <Search size={14} className="faint" style={{ position: "absolute", left: 10, top: 9 }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 30 }}
                    placeholder="Filtrar opções avançadas"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    aria-label="Filtrar opções avançadas"
                  />
                </div>
                {advanced.map((o) => (
                  <OptionField key={o.Name} option={o} value={shown(o)} onChange={(v) => set(o.Name, v)} secretSaved={isSecret(o) && !!saved[o.Name]} />
                ))}
                {advanced.length === 0 && <p className="faint small">Nenhuma opção encontrada.</p>}
              </div>
            </details>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}

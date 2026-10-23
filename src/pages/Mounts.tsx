import { Copy, HardDriveDownload, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { Callout, Empty, ErrorLine, Hint, PageHead, SkeletonRows, Spinner } from "../components/ui";
import { dateTime } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { app, homeDir, isWindows, rc, type Mount } from "../lib/rc";
import { loadRemotes } from "../lib/store";

const CACHE_MODES = [
  { value: "off", label: "Desligado", help: "Não guarda nada. Muitos programas não conseguem salvar arquivos assim." },
  { value: "minimal", label: "Mínimo", help: "Guarda só o necessário para abrir arquivos para leitura e escrita." },
  { value: "writes", label: "Escrita (recomendado)", help: "Arquivos editados ficam no computador até terminarem de enviar. Funciona com quase todos os programas." },
  { value: "full", label: "Completo", help: "Guarda também o que você abre. Mais rápido para reabrir, usa mais disco." },
];

export default function Mounts({ params }: PageProps) {
  const fb = useFeedback();
  const remotes = useAsync((signal) => loadRemotes(signal), []);
  const mounts = useAsync((signal) => rc<{ mountPoints?: Mount[] }>("mount/listmounts", {}, signal).then((r) => r.mountPoints ?? []), [], 5000);
  const home = homeDir();

  const [remote, setRemote] = useState(params.get("remote") ?? "");
  const [sub, setSub] = useState("");
  const [point, setPoint] = useState("");
  const [cache, setCache] = useState("writes");
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!remote && remotes.data?.[0]) setRemote(remotes.data[0].name);
  }, [remotes.data, remote]);

  const windows = isWindows();
  useEffect(() => {
    // Windows mounts as a free drive letter ("*" lets rclone pick one).
    if (windows) setPoint("*");
    else if (remote && home) setPoint(`${home}/Nuvens/${remote}`);
  }, [remote, home, windows]);

  async function mount() {
    if (!windows && !point.startsWith("/")) {
      fb.toast("error", "A pasta de montagem precisa ser um caminho completo, começando com /.");
      return;
    }
    setBusy("mount");
    try {
      // rclone needs the mount point to exist (and be empty) on Linux; on
      // Windows it must not exist yet.
      if (!windows) await rc("operations/mkdir", { fs: "/", remote: point.replace(/^\/+/, "") });
      await rc("mount/mount", {
        fs: `${remote}:${sub.replace(/^\/+/, "")}`,
        mountPoint: point,
        vfsOpt: { CacheMode: cache, ReadOnly: readOnly },
      });
      fb.toast("ok", (
        <>
          Montado em <span className="mono">{point}</span>. Abra essa pasta no gerenciador de arquivos.
        </>
      ));
      mounts.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unmount(m: Mount) {
    const ok = await fb.confirm({
      title: "Desmontar?",
      confirm: "Desmontar",
      body: (
        <p>
          A pasta <span className="mono">{m.MountPoint}</span> deixa de mostrar {m.Fs}. Nada é apagado na nuvem. Se algum arquivo ainda estiver sendo
          enviado, espere terminar antes.
        </p>
      ),
    });
    if (!ok) return;
    setBusy(m.MountPoint);
    try {
      await rc("mount/unmount", { mountPoint: m.MountPoint });
      fb.toast("ok", "Desmontado.");
      mounts.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const cacheHelp = CACHE_MODES.find((c) => c.value === cache)?.help;

  return (
    <div className="page">
      <PageHead
        title="Montar como disco"
        description={
          <>
            Faça uma conta aparecer como uma pasta comum do computador, para abrir e salvar arquivos direto de qualquer programa. <Hint term="mount" />
          </>
        }
      />

      <MountSupportNotice />
      <Callout tone="info">As montagens ficam ativas enquanto o painel estiver aberto. Ao encerrar o painel, as pastas são desmontadas.</Callout>

      <section className="section">
        <div className="section-head">
          <h2>Montadas agora</h2>
        </div>
        <div className="panel" style={{ overflowX: "auto" }}>
          {mounts.error && (
            <div className="panel-pad">
              <ErrorLine error={mounts.error} onRetry={mounts.reload} />
            </div>
          )}
          {mounts.loading && !mounts.data && <SkeletonRows rows={2} />}
          {mounts.data?.length === 0 && (
            <Empty icon={<HardDriveDownload size={22} className="faint" />} title="Nada montado">
              Escolha uma conta abaixo para montar.
            </Empty>
          )}
          {!!mounts.data?.length && (
            <table className="table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Pasta no computador</th>
                  <th>Desde</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mounts.data.map((m) => (
                  <tr key={m.MountPoint}>
                    <td className="mono">{m.Fs}</td>
                    <td>
                      <span className="mono">{m.MountPoint}</span>{" "}
                      <button
                        className="btn ghost sm icon"
                        aria-label="Copiar caminho"
                        title="Copiar caminho"
                        onClick={() => navigator.clipboard?.writeText(m.MountPoint).then(() => fb.toast("ok", "Caminho copiado."))}
                      >
                        <Copy size={13} />
                      </button>
                    </td>
                    <td className="muted num">{dateTime(m.MountedOn)}</td>
                    <td className="right">
                      <button className="btn sm" onClick={() => unmount(m)} disabled={busy === m.MountPoint}>
                        {busy === m.MountPoint ? <Spinner size={14} /> : <Unplug size={14} />} Desmontar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Nova montagem</h2>
        </div>
        <form
          className="panel panel-pad form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            mount();
          }}
        >
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Conta</span>
              <select className="select" value={remote} onChange={(e) => setRemote(e.target.value)} required>
                {remotes.data?.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name} — {r.service}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Só uma subpasta (opcional)</span>
              <input className="input" placeholder="Ex.: Documentos/Trabalho" value={sub} onChange={(e) => setSub(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">{windows ? "Letra da unidade" : "Pasta no computador"}</span>
            <input className="input mono" value={point} onChange={(e) => setPoint(e.target.value)} required />
            <span className="field-help">
              {windows
                ? "Use * para o rclone escolher uma letra livre (ela aparece em Este Computador), ou digite uma, como Z:."
                : "Precisa estar vazia. Se não existir, o painel cria."}
            </span>
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">
                Cache de arquivos <Hint term="cacheMode" />
              </span>
              <select className="select" value={cache} onChange={(e) => setCache(e.target.value)}>
                {CACHE_MODES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span className="field-help">{cacheHelp}</span>
            </label>
            <label className="check" style={{ alignSelf: "center" }}>
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
              <span>
                Somente leitura
                <span className="field-help" style={{ display: "block" }}>
                  Impede alterar ou apagar arquivos na nuvem por esta pasta.
                </span>
              </span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn primary" type="submit" disabled={!remote || busy === "mount"}>
              {busy === "mount" ? <Spinner size={15} /> : <HardDriveDownload size={15} />} Montar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type MountSupport = { ok: boolean; falta?: string; comoFazer?: string; automatico: boolean };

/** Explains and, on Windows, starts installing what mounting needs (WinFsp). */
function MountSupportNotice() {
  const fb = useFeedback();
  const sup = useAsync(() => app<MountSupport>("sistema"), []);
  const [busy, setBusy] = useState(false);
  if (!sup.data || sup.data.ok) return null;

  async function install() {
    setBusy(true);
    try {
      const r = await app<{ mensagem: string }>("sistema/instalar-montagem", "POST");
      fb.toast("ok", r.mensagem);
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <Callout tone="warn">
        <strong>Para montar como disco, falta instalar o {sup.data.falta}.</strong> {sup.data.comoFazer}{" "}
        {sup.data.automatico && (
          <button className="btn sm" onClick={install} disabled={busy} style={{ marginLeft: 4 }}>
            {busy ? <Spinner size={14} /> : null} Instalar {sup.data.falta}
          </button>
        )}
      </Callout>
    </div>
  );
}

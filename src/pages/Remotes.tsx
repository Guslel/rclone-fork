import { Cloud, FolderOpen, HardDriveDownload, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { EditRemote } from "../components/EditRemote";
import { RemoteWizard } from "../components/RemoteWizard";
import { Quota } from "../components/Quota";
import { Empty, ErrorLine, Hint, Menu, PageHead, SkeletonRows } from "../components/ui";
import { useAbout } from "../lib/about";
import { useAsync } from "../lib/hooks";
import { rc } from "../lib/rc";
import { loadRemotes, type RemoteInfo } from "../lib/store";

export default function Remotes({ go, params }: PageProps) {
  const fb = useFeedback();
  const remotes = useAsync((signal) => loadRemotes(signal), []);
  const about = useAbout(remotes.data);
  const [wizard, setWizard] = useState<{ open: boolean; reconnect?: string }>({ open: params.get("add") === "1" });
  const [editing, setEditing] = useState<RemoteInfo | null>(null);

  async function remove(name: string) {
    const ok = await fb.confirm({
      title: `Apagar a conta “${name}”?`,
      danger: true,
      confirm: "Apagar conta",
      body: (
        <p>
          A conta é removida da configuração do rclone (some também do terminal). <strong>Nenhum arquivo na nuvem é apagado</strong>: só o acesso do rclone a ela. Para usar de novo, é só conectar outra vez.
        </p>
      ),
    });
    if (!ok) return;
    try {
      await rc("config/delete", { name });
      fb.toast("ok", `Conta “${name}” apagada do rclone.`);
      remotes.reload();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Contas"
        description={
          <>
            As nuvens que o rclone sabe acessar. São as mesmas do comando rclone no terminal. <Hint term="remote" />
          </>
        }
        actions={
          <button className="btn primary" onClick={() => setWizard({ open: true })}>
            <Plus size={15} /> Conectar conta
          </button>
        }
      />

      <div className="panel">
        {remotes.error && (
          <div className="panel-pad">
            <ErrorLine error={remotes.error} onRetry={remotes.reload} />
          </div>
        )}
        {remotes.loading && !remotes.data && <SkeletonRows rows={3} />}
        {remotes.data?.length === 0 && (
          <Empty
            icon={<Cloud size={22} className="faint" />}
            title="Nenhuma conta conectada"
            action={
              <button className="btn primary" onClick={() => setWizard({ open: true })}>
                <Plus size={15} /> Conectar a primeira conta
              </button>
            }
          >
            O assistente pergunta tudo o que o rclone precisa, explicando cada passo.
          </Empty>
        )}
        {remotes.data?.map((r) => {
          return (
            <div key={r.name} className="list-row" style={{ gridTemplateColumns: "minmax(0,1fr) 220px auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Cloud size={18} className="faint" style={{ flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{r.name}</div>
                  <div className="small faint">
                    {r.service} · <span className="mono">{r.type}</span>
                  </div>
                </div>
              </div>
              <div className="hide-sm quota">
                <Quota remote={r} about={about[r.name]} showPercent={false} />
              </div>
              <div className="remote-actions">
                <button className="btn sm" onClick={() => go("arquivos", { remote: r.name })}>
                  <FolderOpen size={14} /> Abrir
                </button>
                <button className="btn sm" onClick={() => setEditing(r)}>
                  <Pencil size={14} /> Editar
                </button>
                <button className="btn sm" onClick={() => go("montar", { remote: r.name })}>
                  <HardDriveDownload size={14} /> Montar
                </button>
                <Menu
                  label={`Mais ações para ${r.name}`}
                  items={[
                    { label: "Reconectar (refazer login)", icon: <KeyRound size={14} />, onSelect: () => setWizard({ open: true, reconnect: r.name }) },
                    { label: "Apagar conta", icon: <Trash2 size={14} />, danger: true, onSelect: () => remove(r.name) },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      <RemoteWizard
        open={wizard.open}
        reconnect={wizard.reconnect}
        existing={remotes.data?.map((r) => r.name) ?? []}
        onClose={(changed) => {
          setWizard({ open: false });
          if (params.get("add")) go("contas");
          if (changed) remotes.reload();
        }}
      />
      <EditRemote
        remote={editing}
        onClose={(changed) => {
          setEditing(null);
          if (changed) remotes.reload();
        }}
      />
    </div>
  );
}

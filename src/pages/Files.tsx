import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Download,
  File,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Laptop,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Ruler,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PageProps } from "../App";
import { useFeedback } from "../components/feedback";
import { LocationPicker, type Location } from "../components/LocationPicker";
import { Callout, Dialog, Empty, ErrorLine, Hint, Meter, PageHead, SkeletonRows, Spinner } from "../components/ui";
import { LOCAL, bytes, crumbs, dateTime, fsPath, joinPath, locationLabel, parentPath, percent, plural, splitLocation } from "../lib/format";
import { useAsync } from "../lib/hooks";
import { downloadFile, homePath, isWindows, localDrives, rc, rcJob, uploadFiles, type About, type ListItem } from "../lib/rc";
import { loadRemotes, rememberJob } from "../lib/store";

type SortKey = "name" | "size" | "date";

export default function Files({ go, params }: PageProps) {
  const fb = useFeedback();
  const remotes = useAsync((signal) => loadRemotes(signal), []);
  const remote = params.get("remote") ?? remotes.data?.[0]?.name ?? LOCAL;
  const path = params.get("path") ?? (remote === LOCAL ? homePath() : "");
  const { fs, prefix, rel } = splitLocation(remote, path);
  const atDrives = remote === LOCAL && isWindows() && !path.replace(/^\/+/, "");

  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "name", asc: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "mkdir" | "rename" | "copy" | "move" | "info">(null);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const list = useAsync(
    (signal) =>
      atDrives
        ? Promise.resolve(localDrives().map((d): ListItem => ({ Path: d, Name: d, Size: 0, MimeType: "", ModTime: "", IsDir: true })))
        : rc<{ list: ListItem[] }>("operations/list", { fs, remote: rel(path) }, signal).then((r) =>
            (r.list ?? []).map((i) => ({ ...i, Path: prefix + i.Path })),
          ),
    [fs, path],
  );
  const about = useAsync((signal) => (remote === LOCAL ? Promise.resolve(null) : rc<About>("operations/about", { fs }, signal).catch(() => null)), [fs]);

  useEffect(() => setSelected(new Set()), [fs, path]);

  const open = (r: string, p: string) => go("arquivos", { remote: r, path: p });

  const items = useMemo(() => {
    const arr = [...(list.data ?? [])];
    const dir = sort.asc ? 1 : -1;
    arr.sort((a, b) => {
      if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
      if (sort.key === "size") return (a.Size - b.Size) * dir;
      if (sort.key === "date") return (new Date(a.ModTime).getTime() - new Date(b.ModTime).getTime()) * dir;
      return a.Name.localeCompare(b.Name, "pt-BR", { numeric: true }) * dir;
    });
    return arr;
  }, [list.data, sort]);

  const chosen = items.filter((i) => selected.has(i.Path));
  const one = chosen.length === 1 ? chosen[0] : null;

  async function run(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label);
    try {
      await fn();
      if (done) fb.toast("ok", done);
      list.reload();
      about.reload();
      setSelected(new Set());
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    await run("upload", () => uploadFiles(fs, rel(path), files), `${plural(files.length, "arquivo enviado", "arquivos enviados")} para ${locationLabel(remote, path)}.`);
  }

  async function download() {
    const files = chosen.filter((c) => !c.IsDir);
    await run("download", async () => {
      for (const f of files) await downloadFile(fs, rel(f.Path), f.Name);
    });
  }

  async function remove() {
    const dirs = chosen.filter((c) => c.IsDir);
    const ok = await fb.confirm({
      title: chosen.length === 1 ? `Apagar “${chosen[0].Name}”?` : `Apagar ${chosen.length} itens?`,
      danger: true,
      confirm: "Apagar",
      body: (
        <>
          <p>
            {dirs.length > 0
              ? `${plural(dirs.length, "pasta será apagada", "pastas serão apagadas")} com tudo o que há dentro.`
              : "Os arquivos selecionados serão apagados."}{" "}
            {remote === LOCAL ? "No computador, isso não passa pela lixeira." : "Muitos serviços guardam na lixeira por um tempo, mas não conte com isso."}
          </p>
          <ul className="mono small muted" style={{ margin: 0, paddingLeft: 18 }}>
            {chosen.slice(0, 8).map((c) => (
              <li key={c.Path}>{c.Path}</li>
            ))}
            {chosen.length > 8 && <li>e mais {chosen.length - 8}…</li>}
          </ul>
        </>
      ),
    });
    if (!ok) return;
    await run(
      "delete",
      async () => {
        for (const c of chosen) {
          if (c.IsDir) {
            await rcJob("operations/purge", { fs, remote: rel(c.Path) }, (id) =>
              rememberJob(id, { kind: "purge", label: `Apagar ${c.Name}`, src: locationLabel(remote, c.Path) }),
            );
          } else {
            await rc("operations/deletefile", { fs, remote: rel(c.Path) });
          }
        }
      },
      chosen.length === 1 ? `“${chosen[0].Name}” apagado.` : `${chosen.length} itens apagados.`,
    );
  }

  async function publicLink() {
    if (!one) return;
    await run("link", async () => {
      const r = await rc<{ url: string }>("operations/publiclink", { fs, remote: rel(one.Path) });
      await navigator.clipboard?.writeText(r.url).catch(() => undefined);
      fb.toast("ok", (
        <>
          Link copiado: <span className="mono small">{r.url}</span>
        </>
      ));
    });
  }

  async function transferTo(kind: "copy" | "move", dest: Location) {
    setDialog(null);
    await run(
      kind,
      async () => {
        for (const c of chosen) {
          const target = joinPath(dest.path, c.Name);
          if (c.IsDir) {
            const { jobid } = await rc<{ jobid: number }>(`sync/${kind}`, {
              srcFs: fsPath(remote, c.Path),
              dstFs: fsPath(dest.remote, target),
              ...(kind === "move" ? { deleteEmptySrcDirs: true } : {}),
              _async: true,
            });
            await rememberJob(jobid, {
              kind,
              label: `${kind === "copy" ? "Copiar" : "Mover"} ${c.Name}`,
              src: locationLabel(remote, c.Path),
              dst: locationLabel(dest.remote, target),
            });
          } else {
            const d = splitLocation(dest.remote, target);
            await rc(`operations/${kind}file`, { srcFs: fs, srcRemote: rel(c.Path), dstFs: d.fs, dstRemote: d.rel(target) });
          }
        }
      },
      chosen.some((c) => c.IsDir)
        ? "Pastas na fila. Acompanhe em Tarefas."
        : `${plural(chosen.length, "arquivo", "arquivos")} ${kind === "copy" ? "copiado(s)" : "movido(s)"}.`,
    );
  }

  const quota = about.data?.total ? percent(about.data.used ?? 0, about.data.total) : null;

  const sortHeader = (key: SortKey, label: string, right = false, extra = "") => (
    <th
      className={`sortable ${right ? "right" : ""} ${extra}`}
      aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
    >
      {label} {sort.key === key && (sort.asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </th>
  );

  return (
    <div className="page">
      <PageHead
        title="Arquivos"
        description={
          <>
            Navegue, envie, baixe e organize arquivos em qualquer conta ou no computador. <Hint term="remote" />
          </>
        }
        actions={
          <>
            <button className="btn" onClick={() => setDialog("mkdir")}>
              <FolderPlus size={15} /> Nova pasta
            </button>
            <button className="btn primary" onClick={() => uploadRef.current?.click()} disabled={busy === "upload"}>
              {busy === "upload" ? <Spinner size={15} /> : <Upload size={15} />} Enviar arquivos
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) upload(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="toolbar">
        <select
          className="select"
          style={{ width: 240 }}
          aria-label="Conta"
          value={remote}
          onChange={(e) => open(e.target.value, e.target.value === LOCAL ? homePath() : "")}
        >
          {remotes.data?.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name} — {r.service}
            </option>
          ))}
          <option value={LOCAL}>Este computador</option>
        </select>
        <nav className="crumbs" aria-label="Caminho">
          <button className="crumb" onClick={() => open(remote, "")} aria-label="Raiz">
            {remote === LOCAL ? <Laptop size={14} /> : <HardDrive size={14} />}
          </button>
          {crumbs(path).map((c, i, all) => (
            <span key={i} className="crumbs">
              <ChevronRight size={13} className="faint" />
              {c.path === null ? (
                <span className="crumb faint" title={`/${path}`}>
                  …
                </span>
              ) : (
                <button className="crumb" aria-current={i === all.length - 1 ? "location" : undefined} onClick={() => open(remote, c.path!)}>
                  {c.label}
                </button>
              )}
            </span>
          ))}
        </nav>
        <span className="spacer" />
        {quota != null && (
          <span className="small muted num hide-sm" style={{ display: "flex", alignItems: "center", gap: 8, width: 220 }}>
            <Meter value={quota} label="Espaço usado" />
            <span style={{ whiteSpace: "nowrap" }}>{bytes(about.data?.free)} livres</span>
          </span>
        )}
<span style={{ display: "flex", gap: 4 }}>
        <button className="btn ghost icon" onClick={() => setDialog("info")} aria-label="Mais ações da pasta" title="Mais ações">
          <MoreHorizontal size={16} />
        </button>
        <button className="btn ghost icon" onClick={list.reload} aria-label="Atualizar" title="Atualizar">
          <RefreshCw size={15} className={list.loading ? "spin" : ""} />
        </button>
        </span>
      </div>

      {chosen.length > 0 && (
        <div className="selection-bar" role="toolbar" aria-label="Ações para os itens selecionados">
          <span className="label small">
            <strong>{plural(chosen.length, "item selecionado", "itens selecionados")}</strong>
          </span>
          {chosen.every((c) => !c.IsDir) && (
            <button className="btn sm" onClick={download} disabled={!!busy}>
              <Download size={14} /> Baixar
            </button>
          )}
          {one && (
            <button className="btn sm" onClick={() => setDialog("rename")}>
              <Pencil size={14} /> Renomear
            </button>
          )}
          <button className="btn sm" onClick={() => setDialog("copy")}>
            <Copy size={14} /> Copiar para…
          </button>
          <button className="btn sm" onClick={() => setDialog("move")}>
            <FolderInput size={14} /> Mover para…
          </button>
          {one && remote !== LOCAL && (
            <button className="btn sm" onClick={publicLink} disabled={!!busy}>
              <Link2 size={14} /> Link público
            </button>
          )}
          <button className="btn sm" onClick={remove} disabled={!!busy} style={{ color: "var(--danger)" }}>
            <Trash2 size={14} /> Apagar
          </button>
        </div>
      )}

      <div
        className={`panel ${dragging ? "drop-zone" : ""}`}
        style={{ overflowX: "auto" }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
      >
        {list.error && (
          <div className="panel-pad">
            <ErrorLine error={list.error} onRetry={list.reload} />
          </div>
        )}
        {list.loading && !list.data && <SkeletonRows rows={6} />}
        {list.data && items.length === 0 && (
          <Empty icon={<Folder size={22} className="faint" />} title="Pasta vazia">
            Arraste arquivos para cá ou use “Enviar arquivos”.
          </Empty>
        )}
        {items.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar tudo"
                    checked={selected.size > 0 && selected.size === items.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.Path)) : new Set())}
                  />
                </th>
                {sortHeader("name", "Nome")}
                {sortHeader("size", "Tamanho", true)}
                {sortHeader("date", "Modificado", true, "hide-sm")}
              </tr>
            </thead>
            <tbody>
              {path && (
                <tr>
                  <td />
                  <td colSpan={3}>
                    <button className="row-btn muted" onClick={() => open(remote, parentPath(path))}>
                      <Folder size={16} className="faint" /> <span className="name">..</span>
                    </button>
                  </td>
                </tr>
              )}
              {items.map((i) => (
                <tr key={i.Path} className={selected.has(i.Path) ? "selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${i.Name}`}
                      checked={selected.has(i.Path)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(i.Path);
                        else next.delete(i.Path);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td style={{ maxWidth: 0, width: "60%" }}>
                    {i.IsDir ? (
                      <button className="row-btn" onClick={() => open(remote, i.Path)}>
                        <Folder size={16} style={{ color: "var(--accent)", flex: "none" }} />
                        <span className="name ellipsis">{i.Name}</span>
                      </button>
                    ) : (
                      <span className="row-btn" style={{ cursor: "default" }}>
                        <File size={16} className="faint" style={{ flex: "none" }} />
                        <span className="ellipsis">{i.Name}</span>
                      </span>
                    )}
                    <span className="show-sm faint small num">{dateTime(i.ModTime)}</span>
                  </td>
                  <td className="right num muted" style={{ whiteSpace: "nowrap" }}>
                    {i.IsDir ? "—" : bytes(i.Size)}
                  </td>
                  <td className="right num muted hide-sm" style={{ whiteSpace: "nowrap" }}>
                    {dateTime(i.ModTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {list.data && items.length > 0 && (
        <p className="small faint" style={{ marginTop: 8 }}>
          {plural(items.filter((i) => i.IsDir).length, "pasta", "pastas")} · {plural(items.filter((i) => !i.IsDir).length, "arquivo", "arquivos")} ·
          arraste arquivos para a lista para enviar.
        </p>
      )}

      <NameDialog
        open={dialog === "mkdir"}
        title="Nova pasta"
        description={`Dentro de ${locationLabel(remote, path)}`}
        confirm="Criar pasta"
        onClose={() => setDialog(null)}
        onSubmit={(name) => {
          setDialog(null);
          run("mkdir", () => rc("operations/mkdir", { fs, remote: rel(joinPath(path, name)) }), `Pasta “${name}” criada.`);
        }}
      />
      <NameDialog
        open={dialog === "rename"}
        title="Renomear"
        initial={one?.Name}
        confirm="Renomear"
        onClose={() => setDialog(null)}
        onSubmit={(name) => {
          setDialog(null);
          if (!one || name === one.Name) return;
          const target = joinPath(path, name);
          run(
            "rename",
            () =>
              one.IsDir
                ? rcJob("sync/move", { srcFs: fsPath(remote, one.Path), dstFs: fsPath(remote, target), deleteEmptySrcDirs: true }, (id) =>
                    rememberJob(id, { kind: "move", label: `Renomear ${one.Name}`, src: locationLabel(remote, one.Path), dst: locationLabel(remote, target) }),
                  )
                : rc("operations/movefile", { srcFs: fs, srcRemote: rel(one.Path), dstFs: fs, dstRemote: rel(target) }),
            `Renomeado para “${name}”.`,
          );
        }}
      />
      <DestinationDialog
        open={dialog === "copy" || dialog === "move"}
        kind={dialog === "move" ? "move" : "copy"}
        count={chosen.length}
        remotes={remotes.data ?? []}
        start={{ remote, path }}
        onClose={() => setDialog(null)}
        onSubmit={(d) => transferTo(dialog === "move" ? "move" : "copy", d)}
      />
      <FolderInfoDialog open={dialog === "info"} onClose={() => setDialog(null)} fs={fs} remote={remote} path={path} about={about.data ?? null} onChanged={list.reload} />
    </div>
  );
}

function NameDialog({
  open,
  title,
  description,
  confirm,
  initial = "",
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirm: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => setName(initial), [initial, open]);
  const valid = name.trim() && !/[/\\]/.test(name);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => onSubmit(name.trim())}>
            {confirm}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(name.trim());
        }}
      >
        <label className="field">
          <span className="field-label">Nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {/[/\\]/.test(name) && <span className="field-help" style={{ color: "var(--danger)" }}>O nome não pode ter / nem \.</span>}
        </label>
      </form>
    </Dialog>
  );
}

function DestinationDialog({
  open,
  kind,
  count,
  remotes,
  start,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: "copy" | "move";
  count: number;
  remotes: Awaited<ReturnType<typeof loadRemotes>>;
  start: Location;
  onClose: () => void;
  onSubmit: (l: Location) => void;
}) {
  const [dest, setDest] = useState<Location>(start);
  useEffect(() => {
    if (open) setDest(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog
      open={open}
      wide
      onClose={onClose}
      title={kind === "copy" ? `Copiar ${plural(count, "item", "itens")} para…` : `Mover ${plural(count, "item", "itens")} para…`}
      description={kind === "move" ? "Os itens saem do lugar atual depois de copiados." : "Os itens continuam onde estão; uma cópia vai para o destino."}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => onSubmit(dest)}>
            {kind === "copy" ? "Copiar aqui" : "Mover para cá"}
          </button>
        </>
      }
    >
      {open && <LocationPicker label="Destino" remotes={remotes} value={dest} onChange={setDest} />}
    </Dialog>
  );
}

function FolderInfoDialog({
  open,
  onClose,
  fs,
  remote,
  path,
  about,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  fs: string;
  remote: string;
  path: string;
  about: About | null;
  onChanged: () => void;
}) {
  const fb = useFeedback();
  const [size, setSize] = useState<{ count: number; bytes: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (open) setSize(null);
  }, [open, path]);

  async function measure() {
    setBusy("size");
    try {
      setSize(await rc<{ count: number; bytes: number }>("operations/size", { fs: fsPath(remote, path) }));
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cleanup() {
    const ok = await fb.confirm({
      title: "Esvaziar a lixeira?",
      danger: true,
      confirm: "Esvaziar lixeira",
      body: <p>Os arquivos na lixeira de {remote} serão apagados de vez. Não dá para desfazer.</p>,
    });
    if (!ok) return;
    setBusy("cleanup");
    try {
      await rcJob("operations/cleanup", { fs });
      fb.toast("ok", "Lixeira esvaziada.");
      onChanged();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeEmpty() {
    setBusy("rmdirs");
    try {
      await rcJob("operations/rmdirs", { fs: fsPath(remote, path), remote: "", leaveRoot: true });
      fb.toast("ok", "Pastas vazias removidas.");
      onChanged();
    } catch (e) {
      fb.toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Esta pasta" description={<span className="mono">{locationLabel(remote, path)}</span>}>
      {about && (
        <div className="field">
          <span className="field-label">
            Espaço da conta <Hint term="quota" />
          </span>
          {about.total ? <Meter value={percent(about.used ?? 0, about.total)} label="Espaço usado" /> : null}
          <span className="small muted num">
            {bytes(about.used)} usados{about.total ? ` de ${bytes(about.total)}` : ""}
            {about.free != null && ` · ${bytes(about.free)} livres`}
            {about.trashed ? ` · ${bytes(about.trashed)} na lixeira` : ""}
          </span>
        </div>
      )}
      <div className="field">
        <span className="field-label">Tamanho desta pasta</span>
        {size ? (
          <span className="num">
            {bytes(size.bytes)} em {plural(size.count, "arquivo", "arquivos")}
          </span>
        ) : (
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={measure} disabled={busy === "size"}>
            {busy === "size" ? <Spinner size={14} /> : <Ruler size={14} />} Calcular tamanho
          </button>
        )}
        <span className="field-help">Soma tudo o que há dentro, incluindo subpastas. Em pastas grandes pode demorar.</span>
      </div>
      <div className="field">
        <span className="field-label">Limpeza</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={removeEmpty} disabled={!!busy}>
            {busy === "rmdirs" ? <Spinner size={14} /> : <FolderPlus size={14} />} Remover subpastas vazias
          </button>
          {remote !== LOCAL && (
            <button className="btn" onClick={cleanup} disabled={!!busy} style={{ color: "var(--danger)" }}>
              {busy === "cleanup" ? <Spinner size={14} /> : <Trash2 size={14} />} Esvaziar lixeira
            </button>
          )}
          <Hint term="cleanup" />
        </div>
        {remote !== LOCAL && <Callout tone="info">Nem todo serviço tem lixeira; se não tiver, o rclone avisa.</Callout>}
      </div>
    </Dialog>
  );
}

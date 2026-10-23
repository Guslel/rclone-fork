import { ChevronRight, Folder, FolderPlus, HardDrive, Laptop } from "lucide-react";
import { useState } from "react";
import { homePath, isWindows, localDrives, rc, type ListItem } from "../lib/rc";
import { LOCAL, crumbs, joinPath, locationLabel, splitLocation } from "../lib/format";
import { useAsync } from "../lib/hooks";
import type { RemoteInfo } from "../lib/store";
import { Spinner } from "./ui";

export type Location = { remote: string; path: string };

/** Chooses a folder on a remote or on this computer. */
export function LocationPicker({
  label,
  remotes,
  value,
  onChange,
  allowNew = true,
}: {
  label: string;
  remotes: RemoteInfo[];
  value: Location | null;
  onChange: (l: Location) => void;
  allowNew?: boolean;
}) {
  const startLocal = homePath();
  const [remote, setRemote] = useState(value?.remote ?? remotes[0]?.name ?? LOCAL);
  const [path, setPath] = useState(value?.path ?? (remote === LOCAL ? startLocal : ""));
  const [newName, setNewName] = useState("");

  const list = useAsync(
    (signal) =>
      {
        if (remote === LOCAL && isWindows() && !path.replace(/^\/+/, "")) {
          return Promise.resolve(localDrives().map((d): ListItem => ({ Path: d, Name: d, Size: 0, MimeType: "", ModTime: "", IsDir: true })));
        }
        const loc = splitLocation(remote, path);
        return rc<{ list: ListItem[] }>("operations/list", { fs: loc.fs, remote: loc.rel(path), opt: { dirsOnly: true } }, signal).then((r) =>
          (r.list ?? []).map((i) => ({ ...i, Path: loc.prefix + i.Path })).sort((a, b) => a.Name.localeCompare(b.Name, "pt-BR")),
        );
      },
    [remote, path],
  );

  const choose = (r: string, p: string) => {
    setRemote(r);
    setPath(p);
    onChange({ remote: r, path: p });
  };


  return (
    <div className="panel panel-pad field">
      <span className="field-label">{label}</span>
      <select
        className="select"
        value={remote}
        aria-label={`${label}: conta`}
        onChange={(e) => {
          const r = e.target.value;
          choose(r, r === LOCAL ? startLocal : "");
        }}
      >
        {remotes.map((r) => (
          <option key={r.name} value={r.name}>
            {r.name} — {r.service}
          </option>
        ))}
        <option value={LOCAL}>Este computador</option>
      </select>

      <nav className="crumbs small" aria-label="Pasta">
        <button type="button" className="crumb" onClick={() => choose(remote, "")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {remote === LOCAL ? <Laptop size={13} /> : <HardDrive size={13} />}
          {remote === LOCAL ? "Raiz" : remote}
        </button>
        {crumbs(path).map((c, i, all) => (
          <span key={i} className="crumbs">
            <ChevronRight size={12} className="faint" />
            {c.path === null ? (
              <span className="crumb faint" title={`/${path}`}>
                …
              </span>
            ) : (
              <button type="button" className="crumb" aria-current={i === all.length - 1 ? "location" : undefined} onClick={() => choose(remote, c.path!)}>
                {c.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      <ul className="picker-list">
        {list.loading && !list.data && (
          <li className="muted small" style={{ padding: 8 }}>
            <Spinner size={14} /> Carregando pastas…
          </li>
        )}
        {list.error &&
          (/não encontrad/i.test(list.error) ? (
            <li className="small muted" style={{ padding: 8 }}>
              Esta pasta ainda não existe. Ela será criada quando a transferência rodar.
            </li>
          ) : (
            <li className="small" style={{ padding: 8, color: "var(--danger)" }}>
              {list.error}
            </li>
          ))}
        {list.data?.length === 0 && <li className="faint small" style={{ padding: 8 }}>Nenhuma subpasta aqui.</li>}
        {list.data?.map((d) => (
          <li key={d.Path}>
            <button type="button" onClick={() => choose(remote, d.Path)}>
              <Folder size={15} className="faint" />
              <span className="ellipsis">{d.Name}</span>
            </button>
          </li>
        ))}
      </ul>

      {allowNew && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Nova subpasta (opcional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value.replace(/[/\\]/g, ""))}
            aria-label="Nome de uma nova subpasta"
          />
          <button
            type="button"
            className="btn"
            disabled={!newName.trim()}
            onClick={() => {
              choose(remote, joinPath(path, newName.trim()));
              setNewName("");
            }}
          >
            <FolderPlus size={15} /> Usar
          </button>
        </div>
      )}

      <p className="small muted">
        Selecionado: <span className="mono">{locationLabel(remote, path)}</span>
      </p>
    </div>
  );
}

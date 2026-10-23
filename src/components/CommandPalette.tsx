import { CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PAGES, type Navigate, type PageId } from "../App";
import { useAsync } from "../lib/hooks";
import { loadRemotes } from "../lib/store";

type Item = { id: string; label: string; group: string; keywords: string; run: () => void };

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function CommandPalette({ open, onClose, go }: { open: boolean; onClose: () => void; go: Navigate }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const remotes = useAsync((signal) => (open ? loadRemotes(signal) : Promise.resolve(undefined)), [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const to = (page: PageId, params?: Record<string, string>) => () => {
      go(page, params);
      onClose();
    };
    const list: Item[] = PAGES.map((p) => ({ id: p.id, label: p.label, group: "Ir para", keywords: p.keywords, run: to(p.id) }));
    list.push(
      { id: "a-copy", label: "Copiar arquivos", group: "Ação", keywords: "backup copy", run: to("transferir", { mode: "copy" }) },
      { id: "a-sync", label: "Sincronizar pastas", group: "Ação", keywords: "sync espelhar", run: to("transferir", { mode: "sync" }) },
      { id: "a-move", label: "Mover arquivos", group: "Ação", keywords: "move", run: to("transferir", { mode: "move" }) },
      { id: "a-bisync", label: "Sincronizar nos dois sentidos", group: "Ação", keywords: "bisync", run: to("transferir", { mode: "bisync" }) },
      { id: "a-add", label: "Conectar nova conta", group: "Ação", keywords: "remote nuvem adicionar", run: to("contas", { add: "1" }) },
      { id: "a-mount", label: "Montar uma conta como disco", group: "Ação", keywords: "mount", run: to("montar") },
      { id: "a-bw", label: "Limitar velocidade", group: "Ação", keywords: "banda bwlimit", run: to("ajustes") },
    );
    for (const r of remotes.data ?? []) {
      list.push({ id: `r-${r.name}`, label: `Abrir ${r.name}`, group: r.service, keywords: "arquivos", run: to("arquivos", { remote: r.name }) });
    }
    const q = normalize(query.trim());
    return q ? list.filter((i) => normalize(`${i.label} ${i.keywords} ${i.group}`).includes(q)) : list;
  }, [query, remotes.data, go, onClose]);

  useEffect(() => setActive(0), [query]);

  return (
    <dialog
      ref={ref}
      className="dialog palette"
      aria-label="Buscar ou ir para"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <input
            className="palette-input"
            autoFocus
            placeholder="Buscar páginas, ações e contas…"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                items[active]?.run();
              }
            }}
          />
          <ul className="palette-list" id="palette-list" role="listbox">
            {items.length === 0 && <li className="faint" style={{ padding: 12 }}>Nada encontrado.</li>}
            {items.map((i, idx) => (
              <li
                key={i.id}
                id={`pal-${i.id}`}
                role="option"
                aria-selected={idx === active}
                className="palette-item"
                onMouseEnter={() => setActive(idx)}
                onClick={i.run}
              >
                {i.label}
                <span className="group">{i.group}</span>
                {idx === active && <CornerDownLeft size={13} className="faint" />}
              </li>
            ))}
          </ul>
        </>
      )}
    </dialog>
  );
}

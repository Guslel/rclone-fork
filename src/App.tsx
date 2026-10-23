import {
  ArrowLeftRight,
  Cloud,
  FolderOpen,
  HardDriveDownload,
  LayoutDashboard,
  ListChecks,
  Moon,
  ScrollText,
  Search,
  Settings,
  Sun,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import CommandPalette from "./components/CommandPalette";
import { FeedbackProvider } from "./components/feedback";
import { useAsync, useLocalStorage } from "./lib/hooks";
import { loadJobs } from "./lib/jobs";
import { loadAppInfo, rc } from "./lib/rc";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Files from "./pages/Files";
import Transfer from "./pages/Transfer";
import Mounts from "./pages/Mounts";
import Automations from "./pages/Automations";
import Jobs from "./pages/Jobs";
import Remotes from "./pages/Remotes";
import Logs from "./pages/Logs";
import SettingsPage from "./pages/Settings";

export type PageId = "visao-geral" | "arquivos" | "transferir" | "automacoes" | "montar" | "tarefas" | "contas" | "logs" | "ajustes";
export type Navigate = (page: PageId, params?: Record<string, string>) => void;
export type PageProps = { go: Navigate; params: URLSearchParams };

export const PAGES: { id: PageId; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; keywords: string }[] = [
  { id: "visao-geral", label: "Visão geral", icon: LayoutDashboard, keywords: "inicio resumo dashboard" },
  { id: "arquivos", label: "Arquivos", icon: FolderOpen, keywords: "explorar navegar pastas baixar enviar" },
  { id: "transferir", label: "Transferir", icon: ArrowLeftRight, keywords: "copiar sincronizar mover backup sync bisync" },
  { id: "automacoes", label: "Automações", icon: Zap, keywords: "automatico agendar vigiar backup sozinho" },
  { id: "montar", label: "Montar como disco", icon: HardDriveDownload, keywords: "mount disco pasta" },
  { id: "tarefas", label: "Tarefas", icon: ListChecks, keywords: "jobs progresso historico" },
  { id: "contas", label: "Contas", icon: Cloud, keywords: "remotes nuvens conectar drive onedrive" },
  { id: "logs", label: "Logs", icon: ScrollText, keywords: "erros registro console diagnostico problema" },
  { id: "ajustes", label: "Ajustes", icon: Settings, keywords: "configuracoes banda versao" },
];

function parseHash(): { page: PageId; params: URLSearchParams } {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const page = PAGES.some((p) => p.id === path) ? (path as PageId) : "visao-geral";
  return { page, params: new URLSearchParams(query) };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useLocalStorage<"dark" | "light">("rclone-painel-theme", "dark");
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    rc("rc/noopauth")
      .then(() => loadAppInfo())
      .then(() => setAuthed(true))
      .catch((e) => setAuthed(e.status === 401 ? false : true));
  }, []);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const go: Navigate = useCallback((page, params) => {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    location.hash = `/${page}${q}`;
  }, []);

  if (authed === false) return <Login onDone={() => setAuthed(true)} />;
  if (authed === null) return null;

  return (
    <FeedbackProvider>
      <div className="shell">
        <MobileBar openPalette={() => setPaletteOpen(true)} theme={theme} setTheme={setTheme} />
        <Sidebar current={route.page} go={go} openPalette={() => setPaletteOpen(true)} theme={theme} setTheme={setTheme} />
        <main className="main" id="conteudo">
          <PageView key={`${route.page}?${route.params}`} page={route.page} params={route.params} go={go} />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} go={go} />
    </FeedbackProvider>
  );
}

function PageView({ page, params, go }: { page: PageId; params: URLSearchParams; go: Navigate }) {
  switch (page) {
    case "arquivos":
      return <Files go={go} params={params} />;
    case "transferir":
      return <Transfer go={go} params={params} />;
    case "automacoes":
      return <Automations go={go} params={params} />;
    case "montar":
      return <Mounts go={go} params={params} />;
    case "tarefas":
      return <Jobs go={go} params={params} />;
    case "contas":
      return <Remotes go={go} params={params} />;
    case "logs":
      return <Logs go={go} params={params} />;
    case "ajustes":
      return <SettingsPage go={go} params={params} />;
    default:
      return <Overview go={go} />;
  }
}

/** Top bar shown only on narrow screens, where the sidebar becomes a tab strip. */
function MobileBar({ openPalette, theme, setTheme }: { openPalette: () => void; theme: "dark" | "light"; setTheme: (t: "dark" | "light") => void }) {
  const ping = useAsync((signal) => rc("rc/noop", {}, signal), [], 5000);
  const online = !ping.error;
  return (
    <header className="mobile-bar">
      <span className="brand" style={{ padding: 0 }}>
        <span className="brand-mark" aria-hidden>
          <Cloud size={13} strokeWidth={2.25} />
        </span>
        rclone
        <span className={`dot ${online ? "ok" : "danger"}`} title={online ? "Conectado ao rclone" : "rclone fora do ar"} />
      </span>
      <span style={{ display: "flex", gap: 4 }}>
        <button className="btn ghost icon" onClick={openPalette} aria-label="Buscar ou ir para">
          <Search size={16} />
        </button>
        <button className="btn ghost icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Tema claro" : "Tema escuro"}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </span>
    </header>
  );
}

function Sidebar({
  current,
  go,
  openPalette,
  theme,
  setTheme,
}: {
  current: PageId;
  go: Navigate;
  openPalette: () => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
}) {
  const version = useAsync((signal) => rc<{ version: string }>("core/version", {}, signal), []);
  const jobs = useAsync((signal) => loadJobs(signal, 20), [], 2500);
  const running = jobs.data?.filter((j) => !j.finished).length ?? 0;
  const online = !jobs.error;

  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Cloud size={13} strokeWidth={2.25} />
        </span>
        rclone
      </div>
      <button className="search-trigger" onClick={openPalette}>
        <Search size={14} /> Buscar ou ir para…
        <kbd>Ctrl K</kbd>
      </button>
      {PAGES.map((p) => (
        <a
          key={p.id}
          href={`#/${p.id}`}
          className="nav-item"
          aria-current={current === p.id ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            go(p.id);
          }}
        >
          <p.icon size={16} strokeWidth={1.75} />
          {p.label}
          {p.id === "tarefas" && running > 0 && <span className="count num">{running}</span>}
        </a>
      ))}
      <div className="sidebar-foot">
        <span className="conn">
          <span className={`dot ${online ? "ok" : "danger"}`} />
          {online ? "Conectado ao rclone" : "rclone fora do ar"}
        </span>
        <span className="num">{version.data?.version ?? " "}</span>
        <button
          className="btn ghost sm"
          style={{ justifyContent: "flex-start", paddingLeft: 0 }}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          {theme === "dark" ? "Tema claro" : "Tema escuro"}
        </button>
      </div>
    </nav>
  );
}

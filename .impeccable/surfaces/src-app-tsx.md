---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface: painel (app inteiro)

Mode: Operate. Audience: the owner, alone, on their Linux PC; not an rclone expert. Job: do everything rclone does from the browser, understanding each step. First screen: Visão geral. Constraints: rclone v1.60.1 rc API only; pt-BR; destructive actions previewed and confirmed. Previous attempt rejected as confusing, slow to use, ugly in the details and generic.

## Direction contract

THESIS: The category standard, executed at Vercel/Linear craft: a dark operator's panel where every rclone capability is one click from the sidebar and every unfamiliar term carries a one-line plain-Portuguese explanation right where it appears. Refuses the half-finished admin template: default component kits, grey-on-grey, uneven spacing, unexplained jargon.

OWN-WORLD: Near-black ground, one step lighter panels separated by hairline borders rather than shadows; high-contrast off-white text with one muted secondary grey; a single indigo accent for primary actions, focus and selection; green/amber/red only for state. Geist for UI, Geist Mono only for paths and remote names. Tabular numerals. Lucide icons at 16px, 1.5 stroke. 6px radii. Compact 32px controls. Light theme via the same tokens.

STORY: The owner opens the panel and sees which clouds are connected and how full, what is running and whether anything failed. Every screen title has a one-line explanation; every rclone term has an inline hint. Anything that deletes or overwrites shows a dry-run preview and asks first.

FIRST VIEWPORT: 240px sidebar (product name, nav: Visão geral, Arquivos, Transferir, Montar, Tarefas, Contas, Ajustes; rclone version at the foot). Main: page title + one-line description + primary action "Nova transferência" at top right; a row of four summary tiles (Contas, Espaço usado, Em andamento, Transferido hoje); Contas panel with per-remote quota bars; Tarefas table (tarefa, origem → destino, status pill, progresso).

FORM: category standard (canon), chosen by the user on the decision page over the dealt hand. seed:38e812f42f84f702

Signature: precision. Command palette (Ctrl+K) to reach any action; inline "?" hints that explain rclone terms; live progress that updates without layout shift. Motion: one subtle 150ms fade/translate for route changes and dialogs, reduced-motion safe.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

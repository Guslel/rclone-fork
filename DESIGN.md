---
name: rclone painel
description: A local, dark operator's panel that drives rclone from the browser and explains every step in plain Portuguese.
colors:
  accent: "#7c83ff"
  accent-hover: "#9096ff"
  accent-fg: "#0a0a0b"
  accent-soft: "rgba(124, 131, 255, 0.14)"
  ok: "#45c486"
  ok-soft: "rgba(69, 196, 134, 0.13)"
  warn: "#e9b44c"
  warn-soft: "rgba(233, 180, 76, 0.13)"
  danger: "#f0626a"
  danger-soft: "rgba(240, 98, 106, 0.13)"
  bg: "#0a0a0b"
  bg-raised: "#111113"
  bg-hover: "#18181b"
  bg-active: "#1f1f23"
  bg-inset: "#0d0d0f"
  border: "#232327"
  border-strong: "#2e2e33"
  text: "#ededef"
  text-2: "#a0a0a8"
  text-3: "#85858d"
typography:
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  section:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"ss01\", \"cv11\""
  help:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.92em"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
components:
  button:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-hover:
    backgroundColor: "{colors.bg-hover}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.bg-hover}"
    textColor: "{colors.text}"
  button-sm:
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  panel:
    backgroundColor: "{colors.bg-raised}"
    rounded: "{rounded.lg}"
  tile:
    backgroundColor: "{colors.bg-raised}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  nav-item-active:
    backgroundColor: "{colors.bg-active}"
    textColor: "{colors.text}"
  pill-run:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  pill-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  pill-fail:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  meter:
    backgroundColor: "{colors.bg-active}"
    rounded: "{rounded.pill}"
    height: "6px"
  dialog:
    backgroundColor: "{colors.bg-raised}"
    rounded: "{rounded.lg}"
    width: "520px"
---

# Design System: rclone painel

## Overview

**Creative North Star: "The Operator's Panel"**

The category standard, executed at Vercel/Linear craft. A near-black ground holds one-step-lighter panels drawn by hairline borders, with high-contrast off-white text, one quieter secondary grey and one faint grey. A single indigo accent marks primary actions, focus and selection; green, amber and red speak only about state. Nothing is themed or metaphorical: the conventions (sidebar, summary tiles, tables, dialogs) are the commitment, and the quality lives in the details: even spacing on a 4px grid, compact 32px controls, tabular numerals, and machine literals set in mono.

The panel is dense but calm. Every page opens with a title and a one-line plain-Portuguese description, and unfamiliar rclone terms carry an inline "?" hint right where they appear. Live data (progress, quotas, counts) updates in place without shifting layout. A light theme exists as a full re-mapping of the same tokens under `:root[data-theme="light"]`; components never branch on theme.

**Key Characteristics:**
- Dark by default; light theme by token swap only.
- Flat tonal layering with 1px hairlines; shadow only on floating layers.
- One indigo accent; state colors carry meaning, never decoration.
- Geist for UI, Geist Mono for machine literals; tabular numerals for every changing number.
- Compact 32px control height, 6px control radius, 10px container radius.
- Inline plain-language hints next to jargon.

## Colors

A neutral near-black ramp with a single cool indigo accent and three state hues, each paired with a translucent "soft" fill. Values below are the dark default; the light theme re-maps every token (see sidecar for light values).

### Primary
- **Signal Indigo** (accent): primary buttons, focus outlines, selected rows and cards, links, progress fills, the running-state pill and the brand mark. Light theme deepens it so it holds contrast on white.
- **Signal Indigo, lifted** (accent-hover): hover state of primary buttons only.
- **Indigo Wash** (accent-soft): selection background, checked mode/provider cards, the running pill fill, the nav count badge, the focus halo around inputs, and `::selection`.
- **Ink on Indigo** (accent-fg): text and icons on an accent fill.

### Secondary
State colors, used only to report state:
- **Done Green** (ok, ok-soft): completed pill, connected dot, success toast icon.
- **Caution Amber** (warn, warn-soft): quota meter at 85% or more, warning callouts.
- **Fault Red** (danger, danger-soft): failed pill, quota meter at 95% or more, danger callouts, destructive buttons and menu items, preview counts of files that will be deleted.

### Neutral
- **Ground** (bg): page and sidebar background.
- **Panel** (bg-raised): panels, tiles, cards, dialogs, popovers, default buttons.
- **Inset Well** (bg-inset): text inputs, selects, segmented controls, provider cards.
- **Hover Tint** (bg-hover) and **Active Tint** (bg-active): hover rows and buttons; current nav item, pressed segment, selected palette row, meter track, skeletons.
- **Hairline** (border) and **Hairline, strong** (border-strong): panel and table dividers; control and floating-layer edges.
- **Ink** (text), **Ink, secondary** (text-2), **Ink, faint** (text-3): primary text; descriptions, help and inactive nav; table headers, metadata, placeholders, hint icons.

### Named Rules
**The One Accent Rule.** Indigo is the only non-state hue. It means "act here", "you are here" or "this is selected"; it never decorates.

**The State-Only Rule.** Green, amber and red appear only when they report a state (job status, quota level, connection, destructive consequence). Each comes as a solid ink plus a soft fill; pills and callouts use the soft fill with the solid ink.

**The Token-Swap Theme Rule.** Theme changes happen only by re-mapping tokens on the root. Components reference `var(--…)` and never hard-code a theme-specific value.

## Typography

**Display Font:** none (the panel has no display tier)
**Body Font:** Geist Variable (with ui-sans-serif, system-ui, sans-serif), self-hosted via @fontsource
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, monospace), set at 0.92em of its context

**Character:** One neutral, precise grotesque at a tight scale, with stylistic sets ss01 and cv11 on globally. Mono is a semantic marker, not a style: it says "this is a literal the machine reads".

### Hierarchy
- **Headline** (600, 22px, 1.3, -0.02em): page titles; the same size and tracking for summary tile values.
- **Title** (600, 16px): dialog titles. The login card uses 18px.
- **Section** (600, 14px): section heads inside a page ("Contas", "Tarefas recentes").
- **Body** (400, 14px, 1.5): everything by default; buttons, nav and field labels at 500. Page descriptions cap at 68ch.
- **Help** (400, 13px): field help (70ch cap), hint popovers, mode card descriptions, tile labels, small buttons.
- **Label** (500, 12.5px): table headers, tile sub-lines, wizard steps, `.small` metadata. Pills and palette group labels use 12px; kbd uses 11px.

### Named Rules
**The Tabular Rule.** Every number that changes or is compared (tile values, sizes, speeds, percentages, preview counts) uses tabular numerals so live updates never jitter.

**The Machine-Literal Rule.** Geist Mono marks text the machine reads: paths, remote names and `remote:path` routes, backend types, config keys, filter patterns and rate values. Prose, labels and numbers in sentences stay in Geist.

**The Sentence-Case Rule.** No uppercase, no tracked-out labels. Hierarchy comes from weight (400/500/600), size and the three ink levels.

## Layout

An app shell: a fixed 240px sidebar beside a scrolling main column. Page content is centered at a 1180px max width with 32px side and top padding and 48px at the bottom. The order is fixed: page head (title + one-line description at the left, actions top right, 24px below), then sections 32px apart, each with a 14px head and a panel.

Spacing follows a 4px base scale (4, 8, 12, 16, 24, 32, 48). Inside panels, rows pad 12px by 16px; panels and tiles pad 16px; gaps between controls are 8px, and icon-to-label gaps are 6px (10px in nav and list rows). Table rows are 44px tall with 36px headers. List rows are at least 56px.

Summary tiles, transfer modes and the dry-run preview sit on a 4-column grid with 12px gutters, collapsing to 2 columns at 1100px. Two-panel forms use a 2-column grid with 16px gutters.

Responsive behavior: at 860px and below the sidebar becomes a horizontal, edge-faded nav strip under a compact mobile bar (brand, connection dot, actions); the page head stacks; two-column grids and the source → destination route go single column, with the route arrow rotated. At 520px and below, modes stack, job tables reflow into two-column cards without headers, and tile padding drops to 12px.

**The Stable Row Rule.** Rows that hold live data keep one height whatever their state. Job rows fix their padding and give the progress cell a fixed width (260px) and a 36px minimum height, so progress, errors and "concluded" text swap without moving the table.

## Elevation & Depth

Flat and tonal. Depth comes from three background steps (inset well, ground, raised panel) and 1px hairline borders, not shadows. A single shadow token exists, and only layers that float above the page use it: hint popovers, menus, dialogs and toasts. Dialog backdrops dim to 55% black with a 2px blur.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)` dark; `0 8px 24px rgba(20,20,30,0.12), 0 2px 6px rgba(20,20,30,0.08)` light): floating layers only.
- **Focus halo** (`box-shadow: 0 0 0 3px` accent-soft): text inputs and selects on focus, together with an accent border.

### Named Rules
**The Hairline-Not-Shadow Rule.** Anything resting on the page (panels, tiles, cards, tables) separates by border and tone. A shadow means "this floats and will go away".

## Shapes

Small, consistent corners. Controls (buttons, inputs, nav items, segmented controls, palette rows) use 6px; containers (panels, tiles, mode cards, callouts, dialogs, toasts, the selection bar) use 10px; items nested inside a control (segments, crumbs, menu and picker items, kbd, skeletons) use 4px so they sit concentrically inside their 6px parent. Pills, the meter and count badges are fully round, and status dots are 7px circles. Borders are always 1px solid; the only dashed edge is the 2px accent outline of an active drop zone.

Icons are Lucide line icons, inline with text at 14 to 16px (22px in empty states), inheriting the current text color.

## Components

### Buttons
Quiet, compact, bordered.
- **Shape:** gently rounded (6px), 32px tall, 12px horizontal padding, 500 weight, 6px icon gap.
- **Default:** panel fill with a strong hairline; hover moves to the hover tint.
- **Primary:** indigo fill and border with ink-on-indigo text; hover lifts to the brighter indigo. One per view, top right of the page head or at the right end of a dialog footer.
- **Ghost:** transparent and borderless in secondary ink; hover gains the hover tint and full ink. Used for section links ("Gerenciar", "Ver todas"), row actions and the "Mais" menu trigger.
- **Danger:** red fill for the confirming action of a destructive dialog only.
- **Sizes:** small is 28px tall at 13px; icon-only buttons are square (32px or 28px) with an aria-label.
- **States:** colors transition over 120ms; disabled drops to 45% opacity with a not-allowed cursor; focus shows the global 2px indigo outline at a 2px offset.

### Chips (status pills)
- **Style:** fully round, 22px tall, 12px/500, soft fill with solid ink of the same state: running (indigo), done (green), failed (red), neutral (hover tint, secondary ink).
- **Count badge:** the same treatment in indigo, inline at the right of a nav item.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** raised panel on the ground; inset wells for selectable provider cards.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px hairline; strong hairline on hover for selectable cards; selected cards take the indigo wash with an indigo border.
- **Internal Padding:** 16px; list rows 12px by 16px.

### Inputs / Fields
- **Style:** inset well, strong hairline, 6px radius, 32px tall, 10px padding; textareas start at 72px and resize vertically. Selects draw their chevron from two gradients, so no glyph is needed.
- **Hover / Focus:** hover raises the border to faint ink; focus sets an indigo border plus a 3px indigo-wash halo.
- **Field anatomy:** label (500, full ink, optional "?" hint) above the control, help text (13px, secondary ink) below, 6px apart.
- **Segmented control:** inset well with 2px padding; 28px segments; the pressed segment takes the active tint and full ink.

### Navigation
- **Sidebar:** 240px on the ground with a right hairline. Brand (accent square mark, 600) at top, a "Buscar ou ir para… Ctrl K" trigger styled as an input, then 32px nav items: icon plus label at 500 in secondary ink; hover adds the hover tint, the current page takes the active tint and full ink. The foot holds the connection dot, the rclone version and the theme toggle at 12px.
- **Mobile:** a horizontal scrolling strip with a 40px right-edge fade mask under a compact bar.

### Inline Hint (signature)
A 14px circled "?" in faint ink beside a term. Hover or click opens a 280px popover (raised panel, strong hairline, Pop shadow, 6px radius, 13px) with the term's name in bold on its own line and a one-line plain-Portuguese explanation. Esc or an outside click closes it.

### Callout
A 10px-radius banner with a soft state fill, a 35 to 40% state-tinted border and a 16px state icon: info (indigo), warn (amber), danger (red). Used for last-failure notices, dry-run warnings and inline errors with a "Tentar de novo" ghost button.

### Meter
A 6px fully round track in the active tint with an indigo fill that eases its width over 400ms. The fill turns amber at 85% and red at 95%.

### Dialog
A native modal `<dialog>`, 520px wide (720px for the wide variant), at most 86vh. It has a head (16px title, secondary-ink description, ghost close button), a scrolling body with a 16px gap, and a footer with a top hairline holding right-aligned actions. Destructive confirmations show the consequence and a dry-run preview before the danger button.

### Command Palette
A 560px dialog with a borderless 48px input (15px) over a hairline, and 36px rows: icon, label, and the group name right-aligned in faint 12px. The keyboard-selected row takes the active tint. Ctrl+K opens it.

### Toasts
Stacked bottom right, 16px from the edges, at most 380px wide. Each is a raised panel with a strong hairline, 10px radius, the Pop shadow, and a 16px state icon (green or red).

### Motion
One ease, `cubic-bezier(0.16, 1, 0.3, 1)`. Pages fade in and rise 4px over 180ms; dialogs fade in and rise 6px at 0.99 scale over 160ms (toasts reuse this over 180ms); hover colors take 120ms; disclosure chevrons rotate over 150ms. Everything collapses to near zero under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** give every page a title and a one-line description, and attach a "?" hint to every rclone term where it first appears.
- **Do** keep controls at 32px (28px for small) and on the 4px spacing scale.
- **Do** set paths, remote names, `remote:path` routes and other machine literals in Geist Mono, and every changing number in tabular numerals.
- **Do** reserve the indigo accent for the primary action, focus, selection and progress.
- **Do** separate resting surfaces with 1px hairlines and tonal steps; use the Pop shadow only for floating layers.
- **Do** style through tokens so the light theme follows automatically.
- **Do** keep live rows a fixed height so progress updates never shift layout.

### Don't:
- **Don't** use green, amber or red for anything except state.
- **Don't** add drop shadows to panels, tiles, cards or tables.
- **Don't** introduce uppercase labels, tracked-out kickers or eyebrows above titles.
- **Don't** set prose or UI labels in mono.
- **Don't** add a second accent hue or gradients.
- **Don't** hard-code colors in components. Text on a solid state color uses its `-fg` token (e.g. `--danger-fg`: near-black on the dark-theme red, white on the light-theme red) so it stays at AA in both themes.

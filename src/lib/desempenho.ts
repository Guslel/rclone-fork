// Performance settings: panel-wide in Ajustes, overridable per transfer and
// per automation. Empty fields fall back to the level above.

import { app } from "./rc";

export type Ajustes = { transfers?: number; checkers?: number; ordem?: string };
export type Desempenho = Ajustes & { limite?: string };

export const RCLONE_DEFAULTS = { transfers: 4, checkers: 8 };

// Values are rclone's --order-by.
export const ORDENS = [
  { value: "", label: "Sem ordem (mais rápido para começar)" },
  { value: "size,ascending", label: "Menores primeiro" },
  { value: "size,descending", label: "Maiores primeiro" },
  { value: "modtime,descending", label: "Mais recentes primeiro" },
  { value: "modtime,ascending", label: "Mais antigos primeiro" },
  { value: "name,ascending", label: "Por nome (A–Z)" },
];

export function loadDesempenho(): Promise<Desempenho> {
  return app<Desempenho>("desempenho");
}

export function saveDesempenho(d: Desempenho): Promise<Desempenho> {
  return app<Desempenho>("desempenho", "PUT", d);
}

/** rc "_config" for the fields set in an override (field names as in rclone's config). */
export function ajustesConfig(a: Ajustes | undefined): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (a?.transfers) c.Transfers = a.transfers;
  if (a?.checkers) c.Checkers = a.checkers;
  if (a?.ordem) c.OrderBy = a.ordem;
  return c;
}

export function hasAjustes(a: Ajustes | undefined): boolean {
  return Object.keys(ajustesConfig(a)).length > 0;
}

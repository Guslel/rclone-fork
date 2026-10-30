import type { Ajustes } from "../lib/desempenho";
import { ORDENS, RCLONE_DEFAULTS } from "../lib/desempenho";

/**
 * Files at once, checks at once and send order. With `base` the fields are an
 * override: empty means "use the panel-wide setting", shown as the placeholder.
 * Without it they are the panel-wide setting itself, and the recommendations
 * are written out under each field.
 */
export default function PerfFields({ value, onChange, base }: { value: Ajustes; onChange: (v: Ajustes) => void; base?: Ajustes }) {
  const override = base !== undefined;
  const transfersBase = base?.transfers || RCLONE_DEFAULTS.transfers;
  const checkersBase = base?.checkers || RCLONE_DEFAULTS.checkers;
  const ordemBase = ORDENS.find((o) => o.value === (base?.ordem ?? ""))?.label ?? "";

  const num = (raw: string) => {
    const n = Math.round(Number(raw));
    return raw.trim() === "" || !Number.isFinite(n) || n <= 0 ? undefined : Math.min(n, 64);
  };

  return (
    <>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Arquivos ao mesmo tempo</span>
          <input
            className="input num"
            type="number"
            min={1}
            max={64}
            inputMode="numeric"
            placeholder={override ? `Padrão (${transfersBase})` : String(RCLONE_DEFAULTS.transfers)}
            value={value.transfers ?? ""}
            onChange={(e) => onChange({ ...value, transfers: num(e.target.value) })}
          />
          {!override && (
            <span className="field-help">
              Padrão do rclone: 4. Muitos arquivos pequenos (notas, fotos): 8 a 16 acelera bastante. Arquivos grandes (vídeos, backups): 2 a 4 já usam
              toda a internet. <strong>No Google Drive, acima de 8 é comum o Google recusar parte dos envios</strong> (“rate limit”) e tudo ficar mais
              lento. Internet fraca ou Wi-Fi instável: 1 ou 2.
            </span>
          )}
        </label>
        <label className="field">
          <span className="field-label">Verificações ao mesmo tempo</span>
          <input
            className="input num"
            type="number"
            min={1}
            max={64}
            inputMode="numeric"
            placeholder={override ? `Padrão (${checkersBase})` : String(RCLONE_DEFAULTS.checkers)}
            value={value.checkers ?? ""}
            onChange={(e) => onChange({ ...value, checkers: num(e.target.value) })}
          />
          {!override && (
            <span className="field-help">
              Padrão do rclone: 8. É quantos arquivos ele compara ao mesmo tempo para descobrir o que mudou. Mais deixa a conferência de pastas grandes
              mais rápida, mas faz mais consultas à nuvem. <strong>No Google Drive, fique entre 4 e 8.</strong>
            </span>
          )}
        </label>
      </div>
      <label className="field">
        <span className="field-label">Ordem de envio</span>
        <select className="select" style={{ maxWidth: 320 }} value={value.ordem ?? ""} onChange={(e) => onChange({ ...value, ordem: e.target.value || undefined })}>
          {override && <option value="">Padrão ({ordemBase})</option>}
          {ORDENS.filter((o) => !override || o.value !== "").map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!override && (
          <span className="field-help">
            Menores primeiro: muitos arquivos ficam prontos logo. Maiores primeiro: os pesados não ficam para o fim. Mais recentes primeiro: o que
            você acabou de mexer chega antes. Com uma ordem escolhida, o rclone monta a lista antes de começar, o que leva alguns segundos a mais em
            pastas enormes.
          </span>
        )}
      </label>
    </>
  );
}

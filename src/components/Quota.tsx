import type { About } from "../lib/rc";
import type { RemoteInfo } from "../lib/store";
import { bytes, percent } from "../lib/format";
import { Meter } from "./ui";

/** Space used by one account; `about` undefined means still asking the cloud. */
export function Quota({ remote, about, showPercent = true }: { remote: RemoteInfo; about: About | null | undefined; showPercent?: boolean }) {
  if (remote.target) {
    return (
      <span className="small faint ellipsis quota-text" title={remote.target}>
        usa o espaço de <span className="mono">{remote.target}</span>
      </span>
    );
  }
  if (about === undefined) {
    return (
      <>
        <span className="small faint quota-text">Consultando o espaço…</span>
        <div className="meter loading" aria-busy="true" />
      </>
    );
  }
  if (about?.total) {
    const pct = percent(about.used ?? 0, about.total);
    return (
      <>
        <span className="small muted num quota-text">
          {bytes(about.used)} de {bytes(about.total)}
          {showPercent && ` · ${Math.round(pct)}%`}
        </span>
        <Meter value={pct} label={`Espaço usado em ${remote.name}`} />
      </>
    );
  }
  return <span className="small faint quota-text">{about?.used != null ? `${bytes(about.used)} usados` : "Este serviço não informa o espaço"}</span>;
}

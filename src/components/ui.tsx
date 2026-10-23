import { AlertTriangle, CircleCheck, CircleHelp, Info, Loader2, MoreHorizontal, OctagonAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TERMS, type TermKey } from "../lib/terms";

export function PageHead({ title, description, actions }: { title: string; description: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · rclone`;
  }, [title]);
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** A "?" that explains an rclone term in plain words. */
export function Hint({ term, children }: { term?: TermKey; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const t = term ? TERMS[term] : null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span className="hint" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="hint-btn"
        aria-label={t ? `O que é: ${t.title}` : "Explicação"}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <CircleHelp size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <span className="hint-pop" role="tooltip" id={id}>
          {t && <strong>{t.title}</strong>}
          {t?.text}
          {children}
        </span>
      )}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "run" | "ok" | "fail" | "neutral"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Meter({ value, label }: { value: number; label: string }) {
  const tone = value >= 95 ? "danger" : value >= 85 ? "warn" : "";
  return (
    <div className={`meter ${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function Callout({ tone, children }: { tone: "info" | "warn" | "danger"; children: ReactNode }) {
  const Icon = tone === "info" ? Info : tone === "warn" ? AlertTriangle : OctagonAlert;
  return (
    <div className={`callout ${tone}`} role={tone === "info" ? "note" : "alert"}>
      <Icon size={16} strokeWidth={1.75} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando" className="panel-pad">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${60 + ((i * 17) % 35)}%`, margin: "14px 0" }} />
      ))}
    </div>
  );
}

export function ErrorLine({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Callout tone="danger">
      {error}
      {onRetry && (
        <>
          {" "}
          <button className="btn sm ghost" onClick={onRetry}>
            Tentar de novo
          </button>
        </>
      )}
    </Callout>
  );
}

/** Native <dialog> with focus trapping and Esc handled by the browser. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""} ${className}`}
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
          <div className="dialog-head">
            <div>
              <h2>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button className="btn ghost sm icon" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export type MenuItem = { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void };

/** A "⋯ Mais" button with a short list of labelled actions. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="btn sm ghost" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={15} /> Mais
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((i) => (
            <button
              key={i.label}
              role="menuitem"
              className={i.danger ? "menu-item danger" : "menu-item"}
              onClick={() => {
                setOpen(false);
                i.onSelect();
              }}
            >
              {i.icon}
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToastIcon({ tone }: { tone: "ok" | "error" }) {
  return tone === "ok" ? <CircleCheck size={16} /> : <OctagonAlert size={16} />;
}

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog, ToastIcon } from "./ui";

type Toast = { id: number; tone: "ok" | "error"; text: ReactNode };

type ConfirmOptions = {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
};

type Feedback = {
  toast: (tone: Toast["tone"], text: ReactNode) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
};

const Ctx = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const c = useContext(Ctx);
  if (!c) throw new Error("FeedbackProvider missing");
  return c;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const next = useRef(1);

  const toast = useCallback((tone: Toast["tone"], text: ReactNode) => {
    const id = next.current++;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setPending(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = undefined;
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <Dialog
        open={pending !== null}
        onClose={() => answer(false)}
        title={pending?.title ?? ""}
        footer={
          <>
            <button className="btn" onClick={() => answer(false)}>
              Cancelar
            </button>
            <button className={pending?.danger ? "btn danger" : "btn primary"} onClick={() => answer(true)} autoFocus={!pending?.danger}>
              {pending?.confirm}
            </button>
          </>
        }
      >
        {pending?.body}
      </Dialog>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <ToastIcon tone={t.tone} />
            <div>{t.text}</div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

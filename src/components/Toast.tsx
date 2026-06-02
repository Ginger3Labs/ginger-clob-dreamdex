import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { publicClient } from '../dreamdex/client';
import { somniaTestnet } from '../dreamdex/config';

type Kind = 'pending' | 'success' | 'error' | 'info';
type Toast = { id: number; kind: Kind; title: string; desc?: string; href?: string };

type Ctx = {
  push: (t: Omit<Toast, 'id'>) => number;
  update: (id: number, patch: Partial<Omit<Toast, 'id'>>) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<Ctx | null>(null);
let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const autoDismiss = useCallback(
    (id: number, kind: Kind) => {
      if (kind === 'success' || kind === 'error' || kind === 'info') {
        clearTimeout(timers.current[id]);
        timers.current[id] = setTimeout(() => dismiss(id), 6000);
      }
    },
    [dismiss],
  );

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = seq++;
      setToasts((ts) => [...ts, { ...t, id }]);
      autoDismiss(id, t.kind);
      return id;
    },
    [autoDismiss],
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, 'id'>>) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.kind) autoDismiss(id, patch.kind);
    },
    [autoDismiss],
  );

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="toast-viewport">
        {toasts.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id} onClick={() => dismiss(t.id)}>
            <div className="toast-dot" />
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.desc && <div className="toast-desc">{t.desc}</div>}
              {t.href && (
                <a href={t.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  view tx ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Wraps a write call with a pending → confirming → confirmed/failed toast. */
export function useTxToast() {
  const { push, update } = useToast();
  return useCallback(
    async (title: string, send: () => Promise<`0x${string}`>) => {
      const id = push({ kind: 'pending', title, desc: 'submitting…' });
      try {
        const hash = await send();
        const href = `${somniaTestnet.blockExplorers.default.url}/tx/${hash}`;
        update(id, { kind: 'pending', title, desc: 'confirming…', href });
        await publicClient.waitForTransactionReceipt({ hash });
        update(id, { kind: 'success', title, desc: 'confirmed', href });
        return hash;
      } catch (e: any) {
        update(id, { kind: 'error', title, desc: e?.shortMessage ?? e?.message ?? String(e) });
        throw e;
      }
    },
    [push, update],
  );
}

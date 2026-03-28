import { useEffect, useRef, useState } from 'react';

export interface ToastData {
  id: string;
  message: string;
  autoDismiss?: number; // ms — absent = persistent (requires user action)
  action?: { label: string; onClick: () => void };
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast.autoDismiss) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 200); // wait for exit animation
    }, toast.autoDismiss);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.autoDismiss, toast.id, onDismiss]);

  return (
    <div
      className={[
        'flex items-center justify-between gap-3 px-4 py-3',
        'bg-bg-surface border border-border-main rounded-md shadow-lg',
        'text-sm text-text-primary w-80',
        'transition-all duration-200',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className="text-accent hover:text-accent-hover font-medium shrink-0 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      {!toast.action && (
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-text-disabled hover:text-text-secondary transition-colors"
          aria-label="Cerrar"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Global toast state — module-level singleton
let _listeners: Array<(toast: ToastData) => void> = [];

export function showToast(message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) {
  const toast: ToastData = {
    id: `${Date.now()}-${Math.random()}`,
    message,
    ...opts,
  };
  _listeners.forEach((fn) => fn(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const handler = (toast: ToastData) => {
      setToasts((prev) => {
        // Max 3 visible — drop oldest
        const next = [...prev, toast];
        return next.length > 3 ? next.slice(-3) : next;
      });
    };
    _listeners.push(handler);
    return () => {
      _listeners = _listeners.filter((fn) => fn !== handler);
    };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"
      aria-live="polite"
      aria-label="Notificaciones"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

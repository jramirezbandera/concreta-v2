// Diálogo de confirmación genérico — mismo lenguaje visual que
// TitlePromptModal / PdfPreviewModal (backdrop, header con icono + X, footer
// Cancelar + acción en acento; Escape cierra, scroll del body bloqueado,
// devuelve el foco al disparador al cerrar).
//
// a11y: el foco entra en el botón de confirmar (Enter = confirmar, Escape /
// X / Cancelar = cerrar). Sin focus trap completo — se iguala el nivel de los
// modales existentes (deuda a11y común: TODO WCAG AA).

import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

interface ConfirmDialogProps {
  /** Título corto del header. */
  title: string;
  /** Cuerpo: la pregunta y sus consecuencias. */
  children: ReactNode;
  /** Etiqueta del botón de acción (en acento). */
  confirmLabel: string;
  /** Icono del header (opcional). */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  icon: Icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Bloquear scroll del body + devolver el foco al disparador al cerrar. El
  // activeElement al montar es el botón que abrió el diálogo (se captura antes
  // de mover el foco al botón de confirmar, justo debajo).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    confirmRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, []);

  // Escape cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4"
      role="presentation"
    >
      <div
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[420px] max-w-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-heading"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main">
          {Icon && <Icon size={16} className="text-text-secondary" aria-hidden="true" />}
          <span id="confirm-dialog-heading" className="text-sm font-medium text-text-primary">
            {title}
          </span>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-text-secondary leading-relaxed m-0">{children}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-main">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-4 py-1.5 rounded text-sm text-accent transition-all"
            style={{
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

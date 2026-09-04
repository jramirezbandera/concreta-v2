import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { slugTitle, titledFilename } from '../../lib/pdf/utils';

interface TitlePromptModalProps {
  /** Título inicial: el último usado (state.title) o '' en primer uso. */
  initialTitle: string;
  /** Nombre de archivo por defecto (con fecha) cuando el título va vacío. */
  fallbackFilename: string;
  /** true mientras se genera el PDF tras confirmar. */
  exporting?: boolean;
  /** Confirmar: genera el PDF con este título. */
  onConfirm: (title: string) => void;
  /** Cancelar: cierra sin generar. */
  onCancel: () => void;
  /** Rótulo del formato: «Exportar {formatLabel}». Por defecto 'PDF'. */
  formatLabel?: string;
  /** Extensión del fichero, sin punto. Por defecto 'pdf'. */
  extension?: string;
}

/**
 * Modal de "preguntar al exportar": pide el nombre del elemento ANTES de generar
 * el documento (el título se hornea en la cabecera y en el nombre de archivo,
 * así que debe conocerse antes de construirlo). Mismo lenguaje visual que
 * PdfPreviewModal (slate, backdrop, Escape).
 *
 * La línea de preview usa `titledFilename` — la MISMA función que el exportador —
 * así que el nombre mostrado nunca miente sobre el fichero real. Por eso el
 * formato es una PROP y no un fork del componente: el cuadro de materiales
 * exporta Word, y un modal clonado que prometiera `.pdf` y descargara `.docx`
 * sería exactamente el fallo que esta invariante existe para impedir. Los 21
 * módulos de PDF no pasan ninguna de las dos props y no notan el cambio.
 *
 * a11y: autofocus + seleccionar-todo al abrir (una tecla sobrescribe el
 * pre-relleno), Enter = confirmar, Escape / X / Cancelar = cerrar. El clic en el
 * backdrop NO cierra (a propósito: evita perder el título escrito por un clic
 * accidental fuera). Devuelve el foco al disparador (botón "Exportar PDF") al
 * cerrar. Sin focus trap completo — se iguala el nivel del PdfPreviewModal
 * existente (deuda a11y común: TODO WCAG AA).
 */
export function TitlePromptModal({
  initialTitle,
  fallbackFilename,
  exporting = false,
  onConfirm,
  onCancel,
  formatLabel = 'PDF',
  extension = 'pdf',
}: TitlePromptModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bloquear scroll del body + devolver el foco al disparador al cerrar.
  // El activeElement al montar es el botón "Exportar PDF" que abrió el modal
  // (se captura antes de que el autofocus mueva el foco al input, más abajo).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, []);

  // Autofocus + seleccionar todo: una tecla sobrescribe el título pre-rellenado.
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  // Escape cierra (mientras no se esté generando).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, exporting]);

  const filename = titledFilename(title, fallbackFilename, extension);
  const isFallback = slugTitle(title) === '';

  const confirm = () => {
    if (!exporting) onConfirm(title);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4"
      role="presentation"
    >
      {/* El clic en el backdrop NO cierra: solo X / Cancelar / Esc, para no
          perder el título escrito por un clic accidental fuera del modal. */}
      <div
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[440px] max-w-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="title-prompt-heading"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main">
          <FileText size={16} className="text-text-secondary" aria-hidden="true" />
          <span id="title-prompt-heading" className="text-sm font-medium text-text-primary">
            Exportar {formatLabel}
          </span>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            disabled={exporting}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label htmlFor="title-prompt-input" className="block text-sm text-text-secondary mb-2">
            Título del elemento
          </label>
          <input
            id="title-prompt-input"
            ref={inputRef}
            type="text"
            value={title}
            placeholder="Sin título"
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
              }
            }}
            className="w-full bg-bg-primary border border-border-main rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent"
          />
          <p className="mt-2.5 text-xs text-text-secondary">
            Se descargará como:{' '}
            <span className={`font-mono ${isFallback ? 'text-text-disabled' : 'text-accent'}`}>
              {filename}
            </span>
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-main">
          <button
            onClick={onCancel}
            disabled={exporting}
            className="px-4 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-sm text-accent disabled:opacity-40 transition-all"
            style={{
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
            }}
          >
            {exporting ? (
              <>
                <span
                  className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"
                />
                Generando…
              </>
            ) : (
              `Exportar ${formatLabel}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

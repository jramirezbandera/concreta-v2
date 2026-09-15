import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Folder, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Props {
  titulo: string;
  /** Una o dos frases: qué va a pasar al confirmar. */
  texto: string;
  /** Etiqueta del botón de acento. */
  confirmar: string;
  inicial?: string;
  /** Acción alternativa, sin acento (p. ej. «Descartar y seguir»). */
  secundario?: { label: string; onClick: () => void };
  onConfirm: (nombre: string) => void;
  onCancel: () => void;
  /**
   * Campos adicionales, bajo el del nombre. Los tres consumidores de siempre
   * —Guardar obra, Exportar obra y «hay cálculos sin obra»— no los pasan y
   * siguen pidiendo UNA cosa; `DialogoObra` mete aquí los otros cuatro datos.
   */
  children?: ReactNode;
  /** Por qué no se puede confirmar todavía, aparte de tener el nombre en blanco. Se enseña en el pie. */
  impedimento?: string | null;
}

/**
 * Pide UNA cosa: cómo se llama la obra. Mismo lenguaje visual que
 * `TitlePromptModal` y `ConfirmDialog` (backdrop, cabecera con icono y X, pie
 * con Cancelar y la acción en acento; Escape cierra; el foco vuelve al
 * disparador). No se puede confirmar en blanco.
 */
export function DialogoNombre({ titulo, texto, confirmar, inicial = '', secundario, onConfirm, onCancel, children, impedimento = null }: Props) {
  const [nombre, setNombre] = useState(inicial);
  const inputRef = useRef<HTMLInputElement>(null);
  const valido = nombre.trim().length > 0 && impedimento === null;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const disparador = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      document.body.style.overflow = prevOverflow;
      disparador?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const confirmarSiValido = () => {
    if (valido) onConfirm(nombre.trim());
  };

  // El diálogo se cuelga de `body`, no de donde se le invoca. En móvil el
  // cajón lateral lleva `translate-x` (Sidebar.tsx), y un ancestro con
  // `translate` distinto de `none` pasa a ser el BLOQUE CONTENEDOR de sus
  // descendientes `fixed`: `inset-0` dejaba de medir la pantalla y medía los
  // 204 px del cajón. El diálogo entero se dibujaba dentro de la barra, con el
  // nombre de la obra cortado y «Crear y abrir» partido en tres líneas. Ojo:
  // Tailwind v4 escribe la propiedad `translate`, así que `transform` sale
  // `none` y el culpable no aparece si sólo se mira ahí.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4" role="presentation">
      <div
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[440px] max-w-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogo-nombre-heading"
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main">
          <Folder size={16} className="text-text-secondary" aria-hidden="true" />
          <span id="dialogo-nombre-heading" className="text-sm font-medium text-text-primary">
            {titulo}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-text-secondary leading-relaxed m-0 mb-3">{texto}</p>
          <label htmlFor="dialogo-nombre-input" className="block text-sm text-text-secondary mb-2">
            Nombre de la obra
          </label>
          <input
            id="dialogo-nombre-input"
            ref={inputRef}
            type="text"
            value={nombre}
            placeholder="Reposición de nave industrial…"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmarSiValido();
              }
            }}
            className="w-full bg-bg-primary border border-border-main rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent"
          />
          {children}
        </div>

        {/* El pie ENVUELVE, pero SÓLO en estrecho. A 400 px el aviso de la
            provincia («de ella salen el viento, la nieve y el sismo») dejaba a
            los botones 90 px y «Crear y abrir» salía partido en tres líneas,
            una palabra por línea; ahí el aviso se lleva su propia línea y los
            botones caen enteros debajo. De `sm` para arriba se vuelve a la
            fila única de siempre, con el aviso a la izquierda: en 440 px de
            diálogo cabe, y cambiarlo no era lo que había que arreglar. */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 px-5 py-3 border-t border-border-main">
          {impedimento !== null && (
            <p className="m-0 w-full text-[11.5px] text-state-warn sm:w-auto sm:mr-auto" role="status">
              {impedimento}
            </p>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 whitespace-nowrap px-4 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            Cancelar
          </button>
          {secundario && (
            <button
              type="button"
              onClick={secundario.onClick}
              className="shrink-0 whitespace-nowrap px-4 py-1.5 rounded text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            >
              {secundario.label}
            </button>
          )}
          <button
            type="button"
            onClick={confirmarSiValido}
            disabled={!valido}
            className="shrink-0 whitespace-nowrap px-4 py-1.5 rounded text-sm text-accent disabled:opacity-40 transition-all"
            style={{
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
            }}
          >
            {confirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

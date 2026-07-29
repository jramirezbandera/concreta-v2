// FEM 2D — panel «Cómo calcula este módulo».
//
// Pinta FEM2D_METHOD_SECTIONS (methodology.ts) en un modal con el MISMO
// esqueleto que la ficha de barra: fondo con blur, Escape, scroll-lock,
// devolución de foco al disparador y cierre por clic fuera. El contenido vive
// en datos — este componente no sabe nada de motores, solo maqueta.

import { useEffect, type JSX } from 'react';
import { X } from 'lucide-react';
import { GroupHeader } from '../../components/checks';
import { FEM2D_METHOD_SECTIONS } from './methodology';

interface Props {
  onClose: () => void;
}

export function Fem2DMethodology({ onClose }: Props): JSX.Element {
  // Escape + scroll lock + devolver el foco al disparador (patrón de los
  // modales existentes — Fem2DMemberDetail / TitlePromptModal).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cómo calcula este módulo"
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[760px] max-w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main shrink-0 min-w-0">
          <div className="flex flex-col min-w-0">
            <h2 className="text-[14px] font-semibold text-text-primary truncate">Cómo calcula este módulo</h2>
            <p className="text-[11px] text-text-secondary truncate">
              Hipótesis, asunciones y limitaciones del motor FEM 2D
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto shrink-0 rounded p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Contenido. flex-1 + min-h-0: el cuerpo se queda con el alto que sobra
            del diálogo y SCROLLEA (la barra visible es aquí la señal de que hay
            más secciones abajo) en vez de estirar el diálogo. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-3 py-3">
          {/* shrink-0: las secciones son hijos de una columna flex con scroll —
              sin él, flex-shrink las comprime a repartirse el alto visible y el
              overflow-hidden del borde redondeado RECORTA las viñetas (visto en
              producción: cada sección mostraba solo su primera línea). */}
          {FEM2D_METHOD_SECTIONS.map((s) => (
            <section key={s.id} aria-label={s.title} className="shrink-0 rounded border border-border-main overflow-hidden">
              <GroupHeader label={s.title} />
              <ul className="flex flex-col gap-2 px-4 py-3">
                {s.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-text-secondary leading-snug">
                    <span className="mt-[5px] size-1 rounded-full bg-text-disabled shrink-0" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="px-2 pb-1 text-[10px] text-text-disabled leading-snug">
            Cada fila de comprobación cita su artículo; esta página documenta lo que hay entre las filas.
            Si detectas una asunción sin documentar, es un bug — repórtalo.
          </p>
        </div>
      </div>
    </div>
  );
}

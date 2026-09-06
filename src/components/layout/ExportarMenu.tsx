/**
 * Desplegable «Exportar» de la topbar, para las vistas que tienen MÁS DE UNA
 * salida. Lo estrena el cuadro de materiales, con cuatro: Word y PDF del cuadro
 * de memoria, Excel y DXF del de plano.
 *
 * Sustituye al par de botones que cambiaba de rótulo con la pestaña (Word+PDF
 * en Datos y Memoria, Excel+DXF en Plano). Aquello entregaba «lo que se estaba
 * mirando», que sonaba bien y tenía dos pegas de uso: para bajar el Excel había
 * que ir antes a Plano, y en Datos —donde no hay documento a la vista— no se
 * sabía qué iba a bajar el botón hasta pulsarlo. Un solo disparador, igual en
 * todas las pestañas, que enseña las salidas agrupadas por el cuadro que
 * entregan y dice para qué sirve cada una. Lo que se baja lo decide la opción,
 * no la vista abierta.
 *
 * El disparador lleva el mismo outline sutil que el botón «Exportar PDF» de los
 * demás módulos (ver `Topbar`), más el chevron de `AjustesMenu`: es la misma
 * acción con un paso más, no otra distinta. El módulo lo compone y la topbar
 * sólo lo coloca donde iría el botón (prop `exportMenu`).
 *
 * A11y: cierra con Escape y con clic fuera; el disparador expone aria-expanded;
 * cada grupo es un `group` con nombre, y las opciones son `menuitem`. Al elegir
 * se devuelve el foco al disparador ANTES de avisar al módulo: el modal del
 * título captura `document.activeElement` al montar para devolverle el foco al
 * cerrar, y si lo dejáramos en la opción, volvería a un botón que ya no existe.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface OpcionExportar<Id extends string> {
  id: Id;
  /** Nombre del formato: «Word», «PDF», «Excel», «DXF». */
  etiqueta: string;
  /** Para qué sirve, en lenguaje de obra: «para pegar en la memoria del proyecto». */
  detalle: string;
}

export interface GrupoExportar<Id extends string> {
  /** El cuadro que entregan las opciones del grupo: «Cuadro de memoria». */
  titulo: string;
  opciones: OpcionExportar<Id>[];
}

interface Props<Id extends string> {
  grupos: GrupoExportar<Id>[];
  /** Recibe el formato elegido; el menú ya se ha cerrado cuando llega. */
  onElegir: (id: Id) => void;
  /** Mientras se genera un fichero el disparador se bloquea y enseña el giro. */
  exportando?: boolean;
}

export function ExportarMenu<Id extends string>({
  grupos,
  onElegir,
  exportando = false,
}: Props<Id>) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  function elegir(id: Id) {
    setAbierto(false);
    disparador.current?.focus();
    onElegir(id);
  }

  return (
    <div ref={caja} className="relative">
      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        disabled={exportando}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Exportar"
        aria-label="Exportar"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-accent disabled:opacity-40 transition-all"
        style={{
          border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
          background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
        }}
      >
        {exportando ? (
          <span
            className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            aria-hidden="true"
          >
            <path d="M4 2h5l3 3v9H4zM9 2v3h3" />
          </svg>
        )}
        <span className="hidden lg:inline">Exportar</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`transition-transform duration-150 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label="Formatos de exportación"
          className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-border-main bg-bg-surface z-50 overflow-hidden"
          style={{ boxShadow: '0 12px 30px -12px rgba(0,0,0,0.45)' }}
        >
          {grupos.map((grupo, i) => (
            <div
              key={grupo.titulo}
              role="group"
              aria-label={grupo.titulo}
              className={i > 0 ? 'border-t border-border-sub pb-1' : 'pb-1'}
            >
              {/* El nombre del grupo ya va en aria-label: la cabecera visible
                  se oculta al lector para no leerla dos veces. */}
              <div
                aria-hidden="true"
                className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase text-text-disabled"
                style={{ letterSpacing: '0.06em' }}
              >
                {grupo.titulo}
              </div>
              {grupo.opciones.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  onClick={() => elegir(o.id)}
                  className="w-full px-3 py-1.5 text-left hover:bg-bg-elevated transition-colors"
                >
                  <span className="block text-[12.5px] text-text-primary">{o.etiqueta}</span>
                  <span className="block text-[11px] leading-snug text-text-disabled">
                    {o.detalle}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Botón «+ Añadir …» con la lista de elementos habituales dentro.
 *
 * Sustituye al `<datalist>` que colgaba del campo del nombre, que tenía tres
 * problemas y ninguno era de estilo:
 *
 *   1. el campo es texto libre —una fila se puede llamar «Brochal del hueco de
 *      la escalera»— pero la flecha del datalist lo hacía parecer una lista
 *      cerrada, como los desplegables de al lado, que sí lo son;
 *   2. con un nombre conocido ya escrito, la única sugerencia era ese mismo
 *      nombre: cero información, y tapando la fila de debajo;
 *   3. el autorrellenado sólo actuaba con la fila en blanco (para no pisar
 *      decisiones tomadas), así que elegir de la lista en una fila ya hecha no
 *      hacía nada visible y la lista parecía rota.
 *
 * El fondo del asunto: elegir «Pilares» es una decisión del momento de AÑADIR
 * la fila, no de editar su nombre. Aquí es donde se ofrece.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Texto del botón: «+ Añadir elemento», «+ Añadir grupo»… */
  etiqueta: string;
  /** Nombres habituales; elegir uno trae la fila rellena. */
  nombres: string[];
  /** Texto de la última opción, la que añade una fila en blanco. */
  etiquetaLibre: string;
  /** Recibe el nombre elegido, o '' para una fila en blanco. */
  onElegir: (nombre: string) => void;
}

const ITEM =
  'block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-bg-surface hover:text-text-primary';

export function MenuAnadir({ etiqueta, nombres, etiquetaLibre, onElegir }: Props) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

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

  function elegir(nombre: string) {
    onElegir(nombre);
    setAbierto(false);
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
      >
        {etiqueta}
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 max-h-[300px] min-w-[250px] overflow-y-auto rounded border border-border-main bg-bg-elevated py-1 shadow-lg"
        >
          {nombres.map((n) => (
            <button
              key={n}
              type="button"
              role="menuitem"
              onClick={() => elegir(n)}
              className={`${ITEM} text-text-secondary`}
            >
              {n}
            </button>
          ))}
          <div className="my-1 border-t border-border-sub" />
          <button
            type="button"
            role="menuitem"
            onClick={() => elegir('')}
            className={`${ITEM} text-text-disabled`}
          >
            {etiquetaLibre}
          </button>
        </div>
      )}
    </div>
  );
}

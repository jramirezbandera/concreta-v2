/**
 * ¿Qué obra es? — una fila con los cinco datos del contexto de obra (nombre,
 * uso, provincia, municipio, altitud).
 *
 * Los ENSEÑA, no los pide: desde 2026-09-12 se teclean una sola vez en el
 * diálogo del menú de obra, y esta barra es su reflejo. Hasta entonces los
 * pedía aquí TAMBIÉN, con dos botones para copiarlos a `concreta-obra` y de
 * vuelta; eran la misma información en dos formularios que podían discrepar.
 *
 * Lo que falta sigue saliendo en rojo y conserva su `id` en el DOM, para que
 * «Siguiente hueco» pueda aterrizar en él. Su salida es «Editar…», que abre el
 * mismo diálogo: no hay otro sitio donde escribirlos.
 */

import type { KeyboardEventHandler, ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import type { FichaDatos } from '../../lib/memoria/ensamblar';
import { HUECO } from '../../components/ui/estados';
import { idDom } from './ids';
import { BOTON_MENOR } from './estilos';

type DatoObra = FichaDatos['obra'][keyof Omit<FichaDatos['obra'], 'provinciaNombre'>];

interface Props {
  obra: FichaDatos['obra'];
  ayuda: boolean;
  /** Abre el diálogo de los cinco datos. */
  onEditar: () => void;
  /**
   * El Enter de la ficha. Estos cinco siguen siendo huecos —«Siguiente hueco»
   * aterriza en ellos—, pero ya no se editan aquí: el Enter sólo pasa de largo
   * al siguiente, que sin este manejador se quedaría atascado.
   */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /** El contador de huecos y los botones, alineados a la derecha de la misma fila. */
  derecha?: ReactNode;
}

/** Un dato con su rótulo; en rojo y con su etiqueta si falta. */
function Dato({ valor, texto }: { valor: DatoObra; texto: string | null }) {
  const falta = valor.estado === 'falta';
  return (
    <span
      id={valor.id ? idDom(valor.id) : undefined}
      tabIndex={-1}
      className={['flex shrink-0 items-center gap-1 text-[12px]', falta ? 'rounded px-1 py-0.5 text-state-fail' : 'text-text-primary'].join(' ')}
      style={falta ? HUECO : undefined}
    >
      {falta ? `falta ${valor.etiqueta?.toLowerCase() ?? 'un dato'}` : texto}
    </span>
  );
}

export function BarraObra({ obra, ayuda, onEditar, onKeyDown, derecha }: Props) {
  const lugar = obra.provincia.valor ? (obra.provinciaNombre ?? obra.provincia.valor) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border-main bg-bg-surface px-3 py-1.5" onKeyDown={onKeyDown}>
      <span className="shrink-0 text-[11.5px] text-text-secondary">¿Qué obra es?</span>

      <Dato valor={obra.denominacion} texto={obra.denominacion.valor} />
      <span aria-hidden="true" className="text-text-disabled">
        ·
      </span>
      <Dato valor={obra.uso} texto={obra.uso.valor} />
      <span aria-hidden="true" className="text-text-disabled">
        ·
      </span>
      <Dato valor={obra.municipio} texto={obra.municipio.valor ? `${obra.municipio.valor}${lugar ? ` (${lugar})` : ''}` : null} />
      {!obra.municipio.valor && <Dato valor={obra.provincia} texto={lugar} />}
      <Dato valor={obra.altitud} texto={obra.altitud.valor !== null ? `${obra.altitud.valor} m` : null} />

      <button type="button" onClick={onEditar} className={`${BOTON_MENOR} flex items-center gap-1`} title="Cambiar los datos de la obra">
        <Pencil size={11} aria-hidden="true" />
        Editar…
      </button>

      {ayuda && <span className="text-[11px] text-text-disabled">se teclean una vez en el menú de obra y los heredan todos los módulos</span>}

      {derecha && <div className="ml-auto flex shrink-0 items-center gap-2">{derecha}</div>}
    </div>
  );
}

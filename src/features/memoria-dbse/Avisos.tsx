/**
 * Lo que hay que mirar de los otros módulos. Cuando no hay nada —el caso
 * normal— **no pinta nada**.
 *
 * Sustituye a `Fuentes.tsx`, que era la tabla de cuatro filas siempre visible
 * con el estado de cada publicación y los botones de «Usar lo publicado». El
 * usuario la describió como «muy liosa», y tenía razón: enseñaba mecánica
 * interna —qué módulo publica qué, cuándo, desde dónde— para pedir un trámite
 * que ya no existe, porque la ficha usa siempre lo último calculado.
 *
 * Quedan dos casos, y sólo salen cuando ocurren:
 *
 *  - el módulo sigue con sus valores de partida: o se entra y se calcula, o se
 *    declara que esos valores SON los de esta obra;
 *  - lo publicado se calculó en otra provincia: o se da por bueno, o se rehace
 *    allí.
 *
 * Las dos salidas de la derecha escriben el mismo silenciador, que caduca solo
 * si cambia el resultado o el emplazamiento de la obra.
 *
 * Conserva el `id` del hueco en cada fila: «Siguiente hueco» aterriza aquí
 * buscando por `getElementById`, y sin un nodo con ese id los huecos `pub.*`
 * se quedarían sin destino.
 */

import { Link } from 'react-router';
import type { Fuente } from '../../lib/memoria/ensamblar';
import type { ModuloPub } from '../../lib/memoria/estado';
import { MODULOS } from './sobres';
import { idDom } from './ids';
import { BOTON_ACENTO, BOTON_MENOR } from './estilos';

interface Props {
  fuentes: Record<ModuloPub, Fuente>;
  /** Da por bueno el sobre tal como está. */
  onAceptar: (modulo: ModuloPub) => void;
}

export function Avisos({ fuentes, onAceptar }: Props) {
  const pendientes = (Object.keys(fuentes) as ModuloPub[]).filter((m) => fuentes[m].estado === 'falta' || fuentes[m].estado === 'revisar');
  if (pendientes.length === 0) return null;

  return (
    <div className="rounded border border-border-main bg-bg-surface px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Lo que falta calcular en otros módulos</p>
      <ul className="flex flex-col gap-2">
        {pendientes.map((m) => {
          const f = fuentes[m];
          const falta = f.estado === 'falta';
          return (
            <li key={m} id={idDom(f.id!)} tabIndex={-1} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
              <span className={falta ? 'text-state-fail' : 'text-state-warn'} aria-hidden="true">
                {falta ? '✕' : '⚠'}
              </span>
              <span className="text-text-primary">{MODULOS[m].etiqueta}</span>
              {f.nota && <span className="basis-full text-[11px] leading-snug text-text-secondary">{f.nota}</span>}
              {falta ? (
                <>
                  <Link to={MODULOS[m].ruta} className={BOTON_ACENTO}>
                    Abrir el módulo
                  </Link>
                  <button type="button" className={BOTON_MENOR} onClick={() => onAceptar(m)} title="La ficha imprimirá lo publicado tal como está">
                    Son los de esta obra
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={BOTON_ACENTO} onClick={() => onAceptar(m)}>
                    Es correcto, úsalo
                  </button>
                  <Link to={MODULOS[m].ruta} className={BOTON_MENOR}>
                    Rehacerlo aquí
                  </Link>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

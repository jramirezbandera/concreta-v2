/**
 * El conductor de la reconstrucción de PDF, y lo que el usuario ve mientras
 * dura.
 *
 * Desde el 23-09-2026 el `.concreta` no lleva los PDF dentro (ver
 * `lib/anejo/viaje`): lleva los datos, y el papel se rehace en la máquina que
 * abre la obra. Eso no es un cálculo en segundo plano —todos los exportadores
 * leen los SVG del módulo EN PANTALLA—, así que rehacer doce capítulos es
 * abrir doce módulos, uno detrás de otro, y volver. La app lo hace sola y por
 * eso hay que tapar la pantalla: lo que pasa por debajo es un pase de
 * diapositivas de módulos que no es de nadie y donde un clic del usuario se
 * perdería.
 *
 * De ahí las dos mitades de este fichero:
 *
 *  - **El conductor**: arranca la tanda al abrir una obra a la que le falta
 *    papel (el recado lo deja `alAbrir.ts` antes de la recarga), saca encargos
 *    de la cola, abre cada pieza en su módulo y, al final, devuelve las claves
 *    que la tanda pisó (`tanda.ts`) y al usuario a donde estaba.
 *  - **El modal**: un velo desenfocado sobre toda la interfaz, la barra de
 *    progreso y el nombre del capítulo que se está rehaciendo. Con salida:
 *    «Dejarlo» corta la tanda —lo hecho, hecho está— porque una pantalla que
 *    no se puede cerrar es una trampa, por rápida que vaya.
 *
 * Vive en el shell y no en la pantalla del anejo porque el usuario puede estar
 * en cualquier sitio cuando la obra se abre. Entra por `lazy()`: si no hay nada
 * que rehacer —lo normal—, este código no se descarga.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import { FileStack } from 'lucide-react';
import { showToast } from '../ui/Toast';
import { getModuleByKey } from '../../data/moduleRegistry';
import { piezaPorId, piezasPorRehacer, restaurarPieza, rutaDeModulo, type FalloRestaurar, type Pieza } from '../../lib/anejo';
import { reclamarRevision } from '../../lib/anejo/alAbrir';
import { seccionDePieza } from '../../lib/anejo/maqueta';
import {
  abandonarActual,
  cancelarTanda,
  cerrarTanda,
  lanzarSiguiente,
  perderEnCurso,
  useReconstruccion,
  type Fallida,
} from '../../lib/anejo/reconstruccion';
import { pedirRemonte } from '../../lib/anejo/remonte';
import { empezarTanda, terminarTanda } from '../../lib/anejo/tanda';
import { pestanaDesfasada, proyectoActivo } from '../../lib/proyecto';

/**
 * Lo que se espera a que el módulo de un encargo lo reclame. Es el viaje de
 * una ruta: cargar su trozo de JavaScript y montarse. Pasado eso, nadie va a
 * reclamarlo (el módulo no rehace PDF, o la ruta no llegó a cargar).
 */
const ESPERA_MODULO_MS = 20_000;

/**
 * Y lo que se espera a que termine una vez reclamado. El módulo tiene su
 * propio tope para el cálculo (`ESPERA_RECONSTRUIR_MS`), así que esto sólo
 * salta si se quedó generando el PDF para siempre. Nunca debería saltar: está
 * para que la tanda no pueda atrapar al usuario detrás del velo.
 */
const ESPERA_PIEZA_MS = 90_000;

const capitulos = (n: number) => `${n} ${n === 1 ? 'capítulo' : 'capítulos'}`;

/** Cómo acabó la tanda, en una frase. Los fallos se nombran: son los que siguen en rojo. */
function mensajeDeTanda(hechas: number, fallidas: readonly Fallida[], total: number): string {
  const sinTocar = Math.max(0, total - hechas - fallidas.length);
  const cola = sinTocar > 0 ? ` Quedan ${capitulos(sinTocar)} sin rehacer.` : '';
  if (fallidas.length === 0) {
    return hechas === 0 ? `No se ha rehecho ningún capítulo.${cola}` : `${capitulos(hechas)} con su PDF otra vez en el anejo.${cola}`;
  }
  const detalle = fallidas.map((f) => `«${f.titulo}» (${f.motivo})`).join('; ');
  if (hechas === 0) return `No se ha podido rehacer: ${detalle}.${cola}`;
  return `${capitulos(hechas)} rehechos. Sin rehacer: ${detalle}.${cola}`;
}

/** Por qué no se ha podido abrir la pieza para rehacerla, dicho en una coletilla. */
const NO_RESTAURA: Record<FalloRestaurar, string> = {
  desfasada: 'otra pestaña ha cambiado de obra',
  sitio: 'no hay sitio en el navegador',
  'sin-pieza': 'ya no está en el anejo',
  'sin-datos': 'se guardó sin sus datos dentro',
  esquema: 'la calculó una versión anterior de Concreta',
  desconocido: 'su módulo no está en esta versión',
};

/** Deja el módulo listo para rehacer la pieza y dice a dónde ir. */
function llevarAlModulo(pieza: Pieza): { ok: true; ruta: string } | { ok: false; motivo: string } {
  // Un capítulo de memoria no se restaura —es uno por obra y sus datos son los
  // de la obra de ahora—: se va al módulo y se exporta lo que hay.
  if (seccionDePieza(pieza) === 'memoria') {
    const ruta = rutaDeModulo(pieza.modulo);
    return ruta === null ? { ok: false, motivo: 'su módulo no está en esta versión' } : { ok: true, ruta };
  }
  const r = restaurarPieza(pieza.id);
  return r.ok ? { ok: true, ruta: r.ruta } : { ok: false, motivo: NO_RESTAURA[r.motivo] };
}

function Velo({
  hechos,
  total,
  titulo,
  modulo,
  cancelada,
  onDejarlo,
}: {
  hechos: number;
  total: number;
  titulo: string | null;
  modulo: string | null;
  cancelada: boolean;
  onDejarlo: () => void;
}) {
  const salida = useRef<HTMLButtonElement>(null);
  const porcentaje = total > 0 ? Math.round((hechos / total) * 100) : 0;
  const enCurso = Math.min(hechos + 1, total);

  // El foco entra en el velo: con la interfaz tapada, el tabulador no puede
  // seguir paseándose por unos botones que no hacen nada.
  useEffect(() => {
    salida.current?.focus();
  }, []);

  return createPortal(
    // El desenfoque lo pone el velo (`backdrop-blur`) y no un filtro sobre la
    // app: un ancestro con `filter` pasa a ser el bloque contenedor de sus
    // descendientes `fixed`, y por debajo hay módulos con modales propios.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]"
      role="presentation"
    >
      <div
        className="flex w-[440px] max-w-full flex-col gap-3 rounded-lg border border-border-main bg-bg-surface px-5 py-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconstruccion-titulo"
        aria-describedby="reconstruccion-detalle"
      >
        <div className="flex items-center gap-3">
          <FileStack size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <span id="reconstruccion-titulo" className="text-sm font-medium text-text-primary">
            Preparando el anejo de cálculo
          </span>
        </div>

        <p id="reconstruccion-detalle" className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
          {cancelada
            ? 'Se está terminando el capítulo que había empezado; los que faltan se quedan sin PDF y el anejo los enseñará en rojo, con la salida para volver a intentarlo.'
            : 'Los cálculos de esta obra viajan con sus datos, no con su PDF: se está rehaciendo el papel de cada capítulo. Cada uno se abre un momento en su módulo.'}
        </p>

        <div className="flex flex-col gap-1.5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={hechos}
            aria-label="Capítulos rehechos"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11px] text-text-disabled">
              {titulo ? `«${titulo}»` : 'Buscando el siguiente…'}
              {modulo && ` · ${modulo}`}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-text-secondary" aria-live="polite">
              {enCurso} de {total}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11.5px] text-text-disabled">No cierres la pestaña.</span>
          <button
            ref={salida}
            type="button"
            onClick={onDejarlo}
            disabled={cancelada}
            className="rounded border border-border-main px-3 py-1 text-[12px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {cancelada ? 'Terminando…' : 'Dejarlo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PanelReconstruccion() {
  const tanda = useReconstruccion();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  /** Dónde estaba el usuario cuando empezó la tanda, para devolverlo allí. */
  const origen = useRef<string | null>(null);

  // ── Arranque: la obra se acaba de abrir y le falta papel ────────────────
  //
  // Sin limpieza y sin guardas de «sigue vivo» a propósito: en modo estricto
  // este efecto corre dos veces, y el recado sólo lo recoge la primera (se
  // consume al leerlo). Abortar la primera por el desmontaje de mentira
  // dejaría la tanda sin arrancar justo en desarrollo.
  useEffect(() => {
    if (!reclamarRevision(proyectoActivo())) return;
    // Con la pestaña desfasada la app deja de escribir las claves de la obra:
    // la tanda no podría ni abrir la primera pieza.
    if (pestanaDesfasada()) return;
    void piezasPorRehacer()
      .then((piezas) => {
        if (piezas.length > 0) empezarTanda(piezas);
      })
      .catch((e: unknown) => console.error('No se ha podido mirar qué capítulos hay que rehacer:', e));
  }, []);

  // ── La cola ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tanda.total === 0) return;
    origen.current ??= pathname;

    if (tanda.pendientes.length === 0 && tanda.actual === null) {
      // Cerrar ANTES de devolver las claves y de navegar: `cerrarTanda`
      // devuelve `null` la segunda vez, y en modo estricto este efecto corre
      // dos veces con la misma instantánea (el aviso salía duplicado y con el
      // recuento a cero, visto en pantalla el 18-09-2026).
      const r = cerrarTanda();
      if (!r) return;
      terminarTanda();
      const vuelta = origen.current;
      origen.current = null;
      // El remonte es lo que hace visible la devolución: el módulo que quedó
      // en pantalla sigue enseñando en memoria la pieza que acaba de rehacer.
      pedirRemonte();
      if (vuelta !== null && vuelta !== pathname) navegar(vuelta, { replace: true });
      showToast(mensajeDeTanda(r.hechas, r.fallidas, r.total), { autoDismiss: 7000 });
      return;
    }

    const encargo = lanzarSiguiente();
    if (!encargo) return;
    const pieza = piezaPorId(encargo.piezaId);
    if (!pieza) {
      perderEnCurso('ya no está en el anejo');
      return;
    }
    const destino = llevarAlModulo(pieza);
    if (!destino.ok) {
      perderEnCurso(destino.motivo);
      return;
    }
    // Dos capítulos seguidos del mismo módulo no cambian de ruta, y sin
    // cambio de ruta no hay montaje: el módulo lee el almacén al montarse, así
    // que hay que tirarlo y volver a montarlo a mano.
    if (destino.ruta === pathname) pedirRemonte();
    else navegar(destino.ruta);
  }, [tanda, pathname, navegar]);

  // ── Los dos topes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tanda.enCurso === null) return;
    const t = setTimeout(() => perderEnCurso('su módulo no ha llegado a abrirse'), ESPERA_MODULO_MS);
    return () => clearTimeout(t);
  }, [tanda.enCurso]);

  useEffect(() => {
    if (tanda.actual === null) return;
    const t = setTimeout(() => abandonarActual('su módulo tardó demasiado en rehacerlo'), ESPERA_PIEZA_MS);
    return () => clearTimeout(t);
  }, [tanda.actual]);

  if (tanda.total === 0) return null;
  return (
    <Velo
      hechos={tanda.hechas + tanda.fallidas.length}
      total={tanda.total}
      titulo={tanda.actual?.titulo ?? null}
      modulo={tanda.actual ? (getModuleByKey(tanda.actual.modulo)?.label ?? null) : null}
      cancelada={tanda.cancelada}
      onDejarlo={cancelarTanda}
    />
  );
}

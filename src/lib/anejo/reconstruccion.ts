/**
 * Rehacer el PDF de una pieza que lo ha perdido.
 *
 * Una obra traída de otra máquina antes de que los PDF viajaran en el
 * `.concreta` —o unos datos del sitio borrados— deja el anejo entero con sus
 * filas en rojo: el índice está, los datos están, el papel no. Rehacerlo a
 * mano tenía trampa: había que ir al módulo, y desde allí guardar creaba una
 * pieza NUEVA al lado de la vieja, así que además tocaba borrar la vieja.
 *
 * El PDF no se puede regenerar solo. Todos los exportadores leen los SVG del
 * módulo EN PANTALLA (`document.getElementById('rc-beams-svg-pdf-vano')`), que
 * es lo que garantiza que el papel del anejo enseñe los mismos dibujos que
 * viste. Así que reconstruir es, literalmente, ir al módulo y volver a
 * exportar —pero hecho por la app en vez de por el usuario—:
 *
 *   1. el conductor (`components/anejo/PanelReconstruccion`, que vive en el
 *      shell) ABRE la pieza (`restaurarPieza`, que además fija el vínculo) y
 *      navega a su módulo;
 *   2. el módulo, al montarse, reclama el encargo y exporta al anejo con el
 *      título que ya tenía, sin preguntar nada;
 *   3. como el vínculo apunta a esa pieza y el nombre no cambia,
 *      `destinoDeGuardado` dice «actualiza»: se rehace SU capítulo, en su
 *      sitio, con su número. No hay pieza nueva que borrar.
 *   4. al acabar, el conductor lanza el siguiente encargo, y al final devuelve
 *      al usuario a la pantalla donde estaba.
 *
 * Desde el 23-09-2026 esto no es un botón: los PDF ya no viajan dentro del
 * `.concreta` (ver `viaje.ts`), así que la tanda arranca SOLA al abrir una obra
 * a la que le falta papel, con la interfaz tapada mientras dura. Por eso el
 * conductor está en el shell y no en la pantalla del anejo: el usuario puede
 * estar en cualquier sitio cuando empieza.
 *
 * El estado vive aquí, en el módulo de JS, y no en el almacén: un encargo a
 * medias no debe sobrevivir a una recarga —al recargar no hay módulo que lo
 * reclame y el usuario no entendería nada—. Es el mismo criterio de
 * `remonte.ts`.
 */

import { useSyncExternalStore } from 'react';

export interface Encargo {
  piezaId: string;
  /** `moduleRegistry.key` del módulo que la produjo. */
  modulo: string;
  /** El nombre con el que se guardó: es lo que hace que se ACTUALICE y no se duplique. */
  titulo: string;
  /** La fecha que tenía el capítulo. Se rehace el papel, no el cálculo: la fecha se conserva. */
  fecha: string;
}

export interface Fallida {
  titulo: string;
  motivo: string;
}

export interface EstadoReconstruccion {
  /** Encargos aún sin lanzar. */
  pendientes: readonly Encargo[];
  /** El lanzado: el conductor ya navegó a su módulo y espera que lo reclame. */
  enCurso: Encargo | null;
  /**
   * La pieza que se está rehaciendo ahora, lanzada o ya reclamada por su
   * módulo. `enCurso` se apaga en cuanto el módulo la reclama —es el protocolo
   * que evita lanzarla dos veces—, y la barra de progreso necesita seguir
   * sabiendo de quién es el papel que se está haciendo.
   */
  actual: Encargo | null;
  /** Cuántas se han rehecho en esta tanda. */
  hechas: number;
  fallidas: readonly Fallida[];
  /** Cuántas se pidieron: `0` cuando no hay tanda en marcha. */
  total: number;
  /** El usuario ha dicho «dejarlo» y se está terminando el capítulo en curso. */
  cancelada: boolean;
}

const VACIO: EstadoReconstruccion = {
  pendientes: [],
  enCurso: null,
  actual: null,
  hechas: 0,
  fallidas: [],
  total: 0,
  cancelada: false,
};

let estado: EstadoReconstruccion = VACIO;
const oyentes = new Set<() => void>();

function cambiar(nuevo: EstadoReconstruccion): void {
  estado = nuevo;
  for (const fn of oyentes) fn();
}

/** Empieza una tanda. Si ya había una en marcha, no se toca: dos tandas a la vez no existen. */
export function pedirReconstruir(encargos: readonly Encargo[]): boolean {
  if (estado.total > 0 || encargos.length === 0) return false;
  cambiar({
    pendientes: [...encargos],
    enCurso: null,
    actual: null,
    hechas: 0,
    fallidas: [],
    total: encargos.length,
    cancelada: false,
  });
  return true;
}

/**
 * Saca el siguiente encargo y lo deja «en curso». Lo llama el conductor justo
 * antes de navegar al módulo. Devuelve `null` si no hay ninguno, si ya hay uno
 * lanzado o si el de antes sigue trabajando —lo que hace que un efecto
 * invocado dos veces (React en modo estricto) no lance dos—.
 */
export function lanzarSiguiente(): Encargo | null {
  if (estado.enCurso !== null || estado.actual !== null || estado.pendientes.length === 0) return null;
  const [siguiente, ...resto] = estado.pendientes;
  cambiar({ ...estado, pendientes: resto, enCurso: siguiente, actual: siguiente });
  return siguiente;
}

/**
 * El módulo reclama lo suyo. Devuelve el encargo y lo deja reclamado, así que
 * la segunda llamada —el efecto repetido del modo estricto— devuelve `null`.
 */
export function tomarEncargo(modulo: string | null | undefined): Encargo | null {
  const e = estado.enCurso;
  if (!e || !modulo || e.modulo !== modulo) return null;
  cambiar({ ...estado, enCurso: null, pendientes: estado.pendientes });
  reclamado = e;
  return e;
}

/**
 * El encargo que un módulo acaba de reclamar, mientras lo trabaja. No entra en
 * el estado público: la pantalla del anejo no está montada para verlo, y si
 * volviera a estarlo con `enCurso` puesto significaría que nadie lo reclamó.
 */
let reclamado: Encargo | null = null;

/**
 * Lo termina el módulo: `ok` lo cuenta como hecho, y si no, con su motivo.
 *
 * Sin nada reclamado no cuenta nada. Eso es lo que hace inofensivo que el
 * conductor dé por perdido un encargo que se eternizaba y el módulo termine
 * después: su recuento llega cuando ya no hay a qué sumarlo.
 */
export function acabarEncargo(ok: boolean, motivo = 'no se pudo rehacer el PDF'): void {
  const e = reclamado;
  reclamado = null;
  if (e === null || estado.total === 0) return;
  if (ok) cambiar({ ...estado, actual: null, hechas: estado.hechas + 1 });
  else cambiar({ ...estado, actual: null, fallidas: [...estado.fallidas, { titulo: e?.titulo ?? '', motivo }] });
}

/**
 * Da por perdido el encargo lanzado: la pantalla del anejo se ha vuelto a
 * montar con uno «en curso», así que nadie lo reclamó (el módulo no rehace
 * PDF, o el usuario navegó a otra parte por su cuenta).
 */
export function perderEnCurso(motivo = 'ese módulo no ha podido rehacerlo'): void {
  const e = estado.enCurso;
  if (!e) return;
  cambiar({ ...estado, enCurso: null, actual: null, fallidas: [...estado.fallidas, { titulo: e.titulo, motivo }] });
}

/**
 * Da por perdida la pieza que se está rehaciendo ahora, la haya reclamado un
 * módulo o no. Es el último recurso del conductor: con la interfaz tapada por
 * el modal, una tanda que se queda esperando para siempre atrapa al usuario.
 */
export function abandonarActual(motivo = 'su módulo tardó demasiado'): void {
  const e = estado.actual;
  if (!e) return;
  reclamado = null;
  cambiar({ ...estado, enCurso: null, actual: null, fallidas: [...estado.fallidas, { titulo: e.titulo, motivo }] });
}

/**
 * «Dejarlo»: se vacía la cola y el conductor, que ya sabe terminar cuando no
 * quedan pendientes, cierra y cuenta lo hecho.
 *
 * Pero el capítulo que un módulo ya tiene RECLAMADO se deja terminar, y por eso
 * `actual` sigue puesto: su PDF está a medio hacer, y guardarlo fija el vínculo
 * del módulo con esa pieza. Si la tanda cerrara antes, ese vínculo aterrizaría
 * DESPUÉS de haber devuelto las claves y dejaría el módulo enseñando un cálculo
 * con el nombre de otro —visto en pantalla el 23-09-2026: la píldora decía
 * «Viga V-24» sobre la viga que el usuario tenía a medias—. El lanzado y aún no
 * reclamado sí se tira: ahí no hay nada a medias.
 *
 * El recuento NO se toca: `total` sigue siendo lo que se pidió, y la diferencia
 * con lo hecho es lo que el aviso final llama «sin rehacer».
 */
export function cancelarTanda(): void {
  if (estado.total === 0) return;
  const trabajando = reclamado !== null;
  cambiar({
    ...estado,
    pendientes: [],
    enCurso: null,
    actual: trabajando ? estado.actual : null,
    cancelada: true,
  });
}

/**
 * Cierra la tanda y devuelve el recuento para contarlo, o `null` si no había
 * ninguna abierta.
 *
 * Ese `null` no es cortesía: React en modo estricto ejecuta el efecto DOS
 * veces con la misma instantánea, así que la segunda llamada llegaba con la
 * tanda ya cerrada y anunciaba «0 capítulos rehechos» encima del recuento
 * bueno. Visto en pantalla el 18-09-2026.
 */
export function cerrarTanda(): { hechas: number; fallidas: readonly Fallida[]; total: number } | null {
  if (estado.total === 0) return null;
  const resumen = { hechas: estado.hechas, fallidas: estado.fallidas, total: estado.total };
  reclamado = null;
  cambiar(VACIO);
  return resumen;
}

export function suscribirReconstruccion(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function instantaneaReconstruccion(): EstadoReconstruccion {
  return estado;
}

const enServidor = () => VACIO;

export function useReconstruccion(): EstadoReconstruccion {
  return useSyncExternalStore(suscribirReconstruccion, instantaneaReconstruccion, enServidor);
}

/** Sólo para tests. */
export function _reiniciarReconstruccionParaTests(): void {
  estado = VACIO;
  reclamado = null;
  oyentes.clear();
}

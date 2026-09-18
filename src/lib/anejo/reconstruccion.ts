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
 *   1. la pantalla del anejo ABRE la pieza (`restaurarPieza`, que además fija
 *      el vínculo) y navega a su módulo;
 *   2. el módulo, al montarse, reclama el encargo y exporta al anejo con el
 *      título que ya tenía, sin preguntar nada;
 *   3. como el vínculo apunta a esa pieza y el nombre no cambia,
 *      `destinoDeGuardado` dice «actualiza»: se rehace SU capítulo, en su
 *      sitio, con su número. No hay pieza nueva que borrar.
 *   4. el módulo vuelve al anejo, y si quedan encargos se repite.
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
}

export interface Fallida {
  titulo: string;
  motivo: string;
}

export interface EstadoReconstruccion {
  /** Encargos aún sin lanzar. */
  pendientes: readonly Encargo[];
  /** El lanzado: la pantalla ya navegó a su módulo y espera que lo reclame. */
  enCurso: Encargo | null;
  /** Cuántas se han rehecho en esta tanda. */
  hechas: number;
  fallidas: readonly Fallida[];
  /** Cuántas se pidieron: `0` cuando no hay tanda en marcha. */
  total: number;
}

const VACIO: EstadoReconstruccion = { pendientes: [], enCurso: null, hechas: 0, fallidas: [], total: 0 };

let estado: EstadoReconstruccion = VACIO;
const oyentes = new Set<() => void>();

function cambiar(nuevo: EstadoReconstruccion): void {
  estado = nuevo;
  for (const fn of oyentes) fn();
}

/** Empieza una tanda. Si ya había una en marcha, no se toca: dos tandas a la vez no existen. */
export function pedirReconstruir(encargos: readonly Encargo[]): boolean {
  if (estado.total > 0 || encargos.length === 0) return false;
  cambiar({ pendientes: [...encargos], enCurso: null, hechas: 0, fallidas: [], total: encargos.length });
  return true;
}

/**
 * Saca el siguiente encargo y lo deja «en curso». Lo llama la pantalla del
 * anejo justo antes de navegar al módulo. Devuelve `null` si no hay ninguno o
 * si ya hay uno lanzado —lo que hace que un efecto invocado dos veces (React
 * en modo estricto) no lance dos—.
 */
export function lanzarSiguiente(): Encargo | null {
  if (estado.enCurso !== null || estado.pendientes.length === 0) return null;
  const [siguiente, ...resto] = estado.pendientes;
  cambiar({ ...estado, pendientes: resto, enCurso: siguiente });
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

/** Lo termina el módulo: `ok` lo cuenta como hecho, y si no, con su motivo. */
export function acabarEncargo(ok: boolean, motivo = 'no se pudo rehacer el PDF'): void {
  const e = reclamado;
  reclamado = null;
  if (estado.total === 0) return;
  if (ok) cambiar({ ...estado, hechas: estado.hechas + 1 });
  else cambiar({ ...estado, fallidas: [...estado.fallidas, { titulo: e?.titulo ?? '', motivo }] });
}

/**
 * Da por perdido el encargo lanzado: la pantalla del anejo se ha vuelto a
 * montar con uno «en curso», así que nadie lo reclamó (el módulo no rehace
 * PDF, o el usuario navegó a otra parte por su cuenta).
 */
export function perderEnCurso(motivo = 'ese módulo no ha podido rehacerlo'): void {
  const e = estado.enCurso;
  if (!e) return;
  cambiar({ ...estado, enCurso: null, fallidas: [...estado.fallidas, { titulo: e.titulo, motivo }] });
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

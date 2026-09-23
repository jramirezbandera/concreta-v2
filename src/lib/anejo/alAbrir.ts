/**
 * «Esta obra acaba de abrirse: mírale el anejo.»
 *
 * Abrir una obra termina en una RECARGA de la página (ver `cambiarDeProyecto`:
 * en una PWA con todo el estado en localStorage, la recarga es el remonte
 * correcto). Así que la petición de reconstruir los PDF que falten no puede
 * ser una variable ni un estado de React: nace antes de la recarga y hay que
 * leerla después.
 *
 * Va en `sessionStorage`, y eso son tres decisiones:
 *
 *  - **Sobrevive a la recarga y no al navegador.** Es exactamente la vida que
 *    tiene que tener: si mañana abres la app, no hay nada que «acabar de
 *    abrir».
 *  - **Es de ESTA pestaña.** Dos pestañas con la misma obra no pueden ponerse
 *    a reconstruir a la vez, y la que no abrió la obra no tiene por qué.
 *  - **No es `localStorage`.** No compite por la cuota que `lib/storage/seguro`
 *    protege (el motivo de que el identificador esté prohibido en el resto de
 *    la app), y no es un dato de la obra: es un recado entre dos cargas.
 *
 * Lleva el id del proyecto a propósito: si entre la petición y la carga acabó
 * abriéndose otra obra —un centinela que se recupera, otra pestaña—, el recado
 * ya no es para ésta y se tira.
 */

const CLAVE = 'concreta-rehacer-al-abrir';

function almacen(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Modo privado, cookies bloqueadas: sin recado, la obra se abre igual y el
    // anejo enseña sus filas en rojo con la salida de siempre.
    return null;
  }
}

/** Deja dicho que la obra `id`, en cuanto cargue, revise su anejo. */
export function pedirRevisionAlAbrir(id: string): void {
  try {
    almacen()?.setItem(CLAVE, id);
  } catch {
    /* sin sitio en sessionStorage: nada que hacer, y nada que romper */
  }
}

/** ¿Hay un recado esperando? Sólo para decidir si vale la pena cargar el conductor. */
export function hayRevisionPendiente(): boolean {
  try {
    return (almacen()?.getItem(CLAVE) ?? null) !== null;
  } catch {
    return false;
  }
}

/**
 * Recoge el recado y lo borra. Devuelve `true` sólo si era para la obra que
 * hay abierta ahora mismo. Se consume SIEMPRE, sea o no para ésta: un recado
 * que sobrevive a su carga volvería a saltar en la siguiente.
 */
export function reclamarRevision(idActivo: string | null): boolean {
  const s = almacen();
  if (!s) return false;
  let guardado: string | null = null;
  try {
    guardado = s.getItem(CLAVE);
    s.removeItem(CLAVE);
  } catch {
    return false;
  }
  return guardado !== null && guardado === idActivo;
}

/** Sólo para tests. */
export function _olvidarRevisionParaTests(): void {
  try {
    almacen()?.removeItem(CLAVE);
  } catch {
    /* nada */
  }
}

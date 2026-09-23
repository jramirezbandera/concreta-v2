/**
 * La vida de una tanda de reconstrucción: empezarla y devolverlo todo al
 * terminar.
 *
 * Rehacer el PDF de una pieza es abrirla en su módulo (`restaurarPieza`), y
 * abrirla ESCRIBE las claves de ese módulo. Con un botón y una pieza, eso es lo
 * que el usuario ha pedido; con una tanda automática de doce, no: al terminar,
 * cada módulo se habría quedado con los datos del último capítulo rehecho y el
 * vínculo apuntando a él. La obra recién importada enseñaría en Vigas la V-3 en
 * vez de la V-7 que estabas calculando al exportarla, y nadie te lo habría
 * dicho.
 *
 * Así que la tanda se hace sobre una copia: antes de empezar se guarda lo que
 * se va a pisar —las claves de esos módulos y el vínculo— y al acabar se
 * devuelve tal cual estaba. Lo único que queda cambiado es lo que se quería
 * cambiar: los PDF en IndexedDB y, en el índice, el `blobId`, las páginas y la
 * fecha de cada pieza.
 *
 * La copia vive aquí, en el módulo de JS, como el estado de la tanda
 * (`reconstruccion.ts`) y por el mismo motivo: si una recarga se lleva la tanda
 * por delante, se lleva también la copia, y lo que quedó escrito es lo que la
 * pieza tenía dentro —no un cálculo inventado—.
 *
 * Está aparte de `reconstruccion.ts` para que aquél siga sin depender de nada
 * (el shell lo importa siempre) y esto entre sólo con el conductor.
 */

import { clavesPisadasPor } from './index';
import { pedirReconstruir, type Encargo } from './reconstruccion';
import { CLAVE_VINCULO } from './vinculo';
import { borrarClave, escribirClave, leerClave, volcarPendientes } from '../storage/seguro';
import type { Pieza } from './types';

/** Clave → lo que valía antes de la tanda (`null` si no existía). */
export type Pisada = ReadonlyMap<string, string | null>;

let pisadaActual: Pisada | null = null;

/**
 * Copia el estado de los módulos que la tanda va a pisar.
 *
 * Se vuelca la cola diferida antes de leer: `useModuleState` persiste con 300
 * ms de retardo, y la última tecla de lo que el usuario tenía a medias podría
 * estar todavía en el aire.
 */
export function tomarPisada(modulos: readonly string[]): Pisada {
  volcarPendientes();
  const claves = new Set<string>([CLAVE_VINCULO]);
  for (const modulo of new Set(modulos)) for (const clave of clavesPisadasPor(modulo)) claves.add(clave);
  const copia = new Map<string, string | null>();
  for (const clave of claves) copia.set(clave, leerClave(clave));
  return copia;
}

/**
 * Devuelve las claves a como estaban. `true` si todas volvieron a su sitio.
 *
 * Quien llame tiene que pedir el remonte después (`pedirRemonte`): los módulos
 * leen el almacén al montarse, y el que esté en pantalla seguiría enseñando lo
 * que ya no está guardado.
 */
export function devolverPisada(pisada: Pisada): boolean {
  volcarPendientes();
  let todo = true;
  for (const [clave, valor] of pisada) {
    const ok = valor === null ? borrarClave(clave) : escribirClave(clave, valor);
    if (!ok) todo = false;
  }
  return todo;
}

/**
 * Empieza una tanda con estas piezas, guardando antes lo que va a pisar.
 * `false` si no hay nada que rehacer o si ya había una tanda en marcha.
 */
export function empezarTanda(piezas: readonly Pieza[]): boolean {
  const encargos: Encargo[] = piezas.map((p) => ({ piezaId: p.id, modulo: p.modulo, titulo: p.titulo, fecha: p.ts }));
  if (encargos.length === 0) return false;
  const pisada = tomarPisada(encargos.map((e) => e.modulo));
  if (!pedirReconstruir(encargos)) return false;
  pisadaActual = pisada;
  return true;
}

/**
 * Devuelve lo pisado y olvida la copia. `true` si todo volvió a su sitio (sin
 * copia que devolver, también: no había nada que restaurar).
 */
export function terminarTanda(): boolean {
  const pisada = pisadaActual;
  pisadaActual = null;
  return pisada === null ? true : devolverPisada(pisada);
}

/** Sólo para tests. */
export function _olvidarPisadaParaTests(): void {
  pisadaActual = null;
}

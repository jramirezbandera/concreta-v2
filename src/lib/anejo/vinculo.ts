/**
 * El vínculo entre un módulo y la pieza del anejo que tiene abierta.
 *
 * Es lo que hace que «Guardar en el anejo» ACTUALICE el capítulo que estabas
 * editando en vez de añadir otro. Nace en dos sitios —al abrir una pieza desde
 * el anejo y al guardarla por primera vez desde el módulo—, y ese segundo caso
 * es el que mata el fallo de siempre: corriges una errata en la V-3, vuelves a
 * guardar, y antes te salían dos capítulos «V-3».
 *
 * Se suelta al cambiar el nombre del cálculo (el nombre ES la identidad de la
 * pieza: si escribes «V-4» donde ponía «V-3», estás haciendo otra), con «Nuevo
 * cálculo», y al cambiar de obra —esto último solo, porque la clave es de
 * proyecto y se borra con las demás—.
 *
 * Vive en su propio fichero, y no en `index.ts`, para que `index.ts` pueda
 * usarlo sin que él necesite nada de `index.ts`: aquí no se sabe qué es una
 * pieza, sólo se apunta un par de identificadores.
 */

import { borrarClave, escribirClave, leerClave } from '../storage/seguro';

/** Satélite de `concreta-anejo` en `CLAVES_PROYECTO`: viaja con la obra. */
export const CLAVE_VINCULO = 'concreta-anejo-abierta';

export interface Vinculo {
  /** `moduleRegistry.key` del módulo que la tiene abierta. */
  modulo: string;
  /** `Pieza.id`. Puede haber dejado de existir: quien lo lea tiene que mirarlo. */
  piezaId: string;
}

/**
 * El vínculo guardado, o `null` si no hay o no se entiende. Que la pieza siga
 * en el anejo NO se comprueba aquí —esto no sabe leer el índice—: lo hace
 * `piezaAbierta` en `index.ts`.
 */
export function leerVinculo(): Vinculo | null {
  const raw = leerClave(CLAVE_VINCULO);
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const { modulo, piezaId } = v as Record<string, unknown>;
    if (typeof modulo !== 'string' || typeof piezaId !== 'string' || !modulo || !piezaId) return null;
    return { modulo, piezaId };
  } catch {
    return null;
  }
}

/** `false` sólo si no hubo sitio para escribirlo; el vínculo es una comodidad, no un dato. */
export function fijarVinculo(v: Vinculo): boolean {
  return escribirClave(CLAVE_VINCULO, JSON.stringify(v));
}

export function soltarVinculo(): void {
  borrarClave(CLAVE_VINCULO);
}

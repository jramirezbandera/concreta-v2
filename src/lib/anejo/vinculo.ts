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
  return vinculoDe(leerClave(CLAVE_VINCULO));
}

/**
 * El vínculo a partir de su texto crudo, que es lo que devuelve
 * `instantaneaVinculo`. Existe separado de `leerVinculo` para que React pueda
 * derivar la pieza abierta SIN leer el almacén a mitad de render: una lectura
 * escondida dentro de una función el compilador la memoiza por sus argumentos,
 * y como el módulo no cambia, el valor se quedaría congelado.
 */
export function vinculoDe(raw: string | null): Vinculo | null {
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
  const ok = escribirClave(CLAVE_VINCULO, JSON.stringify(v));
  if (ok) avisar();
  return ok;
}

export function soltarVinculo(): void {
  borrarClave(CLAVE_VINCULO);
  avisar();
}

// ── Suscripción (para `useVinculo`) ──────────────────────────────────────────
//
// El vínculo se fija DESPUÉS de escribir el índice, así que el aviso del índice
// llega cuando todavía no hay vínculo: la miga de pan se repintaba diciendo
// «Sin guardar» un instante después de guardar la pieza, y ahí se quedaba hasta
// que otra cosa la volviera a pintar. Con el visor de por medio eso lo tapaba
// cerrarlo; guardando desde el desplegable no hay nada que cerrar. Dos almacenes
// distintos, dos avisos: éste es el suyo.

const oyentes = new Set<() => void>();

function avisar(): void {
  for (const fn of oyentes) fn();
}

/** Avisa al fijarlo o soltarlo aquí, y al cambiar desde otra pestaña. */
export function suscribirVinculo(fn: () => void): () => void {
  oyentes.add(fn);
  const otraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_VINCULO) fn();
  };
  window.addEventListener('storage', otraPestana);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener('storage', otraPestana);
  };
}

/** El vínculo en crudo: texto, así que sirve de instantánea estable. */
export function instantaneaVinculo(): string | null {
  return leerClave(CLAVE_VINCULO);
}

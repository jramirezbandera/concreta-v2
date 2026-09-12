/**
 * La cola de lo que falta: «Siguiente hueco», el contador y el bloqueo de exportar.
 *
 * Un hueco es cualquier `Valor` de la ficha ensamblada que deja algo por
 * hacer —falta, heredado o revisar— y que lleva `id`: los derivados no lo llevan y
 * por eso nunca son huecos, y el perfil de estudio ni siquiera pasa por aquí.
 * La cola se recorre en el orden en que `ensamblar` construye `FichaDatos`,
 * que es el orden del documento; así «Siguiente hueco» lleva de arriba abajo,
 * como si se leyera la ficha, y no salta de la geotecnia al viento.
 */

import type { Estado, Hueco, Valor } from './model';
import { bloquea, pendiente } from './model';

/** Sí cuando es un `Valor` de la ficha: tiene `estado` y `origen`. */
const esValor = (v: unknown): v is Valor<unknown> =>
  typeof v === 'object' && v !== null && 'estado' in v && 'origen' in v && 'valor' in v;

function accionDe(v: Valor<unknown>): Hueco['accion'] {
  if (v.estado === 'revisar') return 'usarPublicado';
  if (v.estado === 'heredado') return 'confirmar';
  // Falta: si el origen es un módulo, lo resuelve publicar allí; si no, teclearlo.
  return v.origen === 'materiales' || v.origen === 'viento-nieve' || v.origen === 'cargas-planta' || v.origen === 'sismo'
    ? 'publicarModulo'
    : 'teclear';
}

/** Recorre un árbol de datos en orden de inserción y devuelve sus huecos. */
export function colaHuecos(datos: unknown): Hueco[] {
  const out: Hueco[] = [];
  const vistos = new Set<string>();
  const recorrer = (nodo: unknown) => {
    if (typeof nodo !== 'object' || nodo === null) return;
    if (esValor(nodo)) {
      if (nodo.id && nodo.apartado && pendiente(nodo.estado) && !vistos.has(nodo.id)) {
        vistos.add(nodo.id);
        out.push({
          id: nodo.id,
          apartado: nodo.apartado,
          etiqueta: nodo.etiqueta ?? nodo.id,
          estado: nodo.estado as Exclude<Estado, 'derivado' | 'ok'>,
          accion: accionDe(nodo),
        });
      }
      // Un valor puede envolver otros valores (una tipología de forjado con
      // sus campos residuales): se sigue bajando por él.
      recorrer(nodo.valor);
      return;
    }
    for (const hijo of Array.isArray(nodo) ? nodo : Object.values(nodo)) recorrer(hijo);
  };
  recorrer(datos);
  return out;
}

/** El siguiente hueco después del que tiene el foco; cíclico; el primero si no hay foco o no es un hueco. */
export function siguienteHueco(huecos: Hueco[], actualId: string | null): Hueco | null {
  if (huecos.length === 0) return null;
  const i = actualId === null ? -1 : huecos.findIndex((h) => h.id === actualId);
  return huecos[(i + 1) % huecos.length];
}

/** Sí cuando queda alguna falta: la exportación está cerrada. */
export const bloqueanExportar = (huecos: Hueco[]): boolean => huecos.some((h) => bloquea(h.estado));

/** Cuántos de cada, para el contador y el mensaje. `faltan` es lo que bloquea. */
export function contarHuecos(huecos: Hueco[]): { total: number; faltan: number; heredados: number; revisar: number } {
  return {
    total: huecos.length,
    faltan: huecos.filter((h) => h.estado === 'falta').length,
    heredados: huecos.filter((h) => h.estado === 'heredado').length,
    revisar: huecos.filter((h) => h.estado === 'revisar').length,
  };
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Lo que dice el aviso al intentar exportar. `null` cuando se puede exportar:
 * desde 2026-09-12 sólo cierran la puerta las FALTAS. Lo que está por
 * confirmar o por dar por bueno se cuenta y se avisa, pero se imprime.
 */
export function mensajeBloqueo(huecos: Hueco[]): string | null {
  const c = contarHuecos(huecos);
  if (c.faltan === 0) return null;
  return `${plural(c.faltan, 'Falta', 'Faltan')} ${c.faltan} ${plural(c.faltan, 'dato', 'datos')} por rellenar.`;
}

/** Lo que se avisa al exportar con ámbares, que no impiden nada. */
export function mensajeAviso(huecos: Hueco[]): string | null {
  const c = contarHuecos(huecos);
  const partes: string[] = [];
  if (c.heredados > 0) partes.push(`${c.heredados} ${plural(c.heredados, 'dato', 'datos')} de la obra anterior sin confirmar`);
  if (c.revisar > 0) partes.push(`${c.revisar} ${plural(c.revisar, 'publicación', 'publicaciones')} calculada${c.revisar === 1 ? '' : 's'} en otro sitio`);
  if (partes.length === 0) return null;
  return partes.length > 1 ? `${partes[0]} y ${partes[1]}` : partes[0];
}

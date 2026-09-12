/**
 * Por dónde entra la app.
 *
 * `start_url` del manifiesto es `/`, y `/` pinta la landing comercial: el
 * usuario que abre Concreta el lunes por la mañana NO pasa por el comodín de
 * `App.tsx`, llega a la landing y entra por un CTA. Por eso la ruta de entrada
 * no puede ser una constante: tiene que mirar si hay obra.
 *
 * Con obra abierta, el panel de la obra, que dice qué falta para entregar.
 * Sin obra —el visitante frío que acaba de descubrir la app— el mismo sitio de
 * siempre, `APP_ROUTE`: enseñarle un panel vacío de una obra que no existe no
 * le cuenta nada.
 *
 * Lee las claves a pelo y no importa `lib/proyecto` a propósito: esto lo
 * consume la landing, que es el LCP del sitio comercial, y aquél son
 * seiscientas líneas.
 */

import { CLAVE_OBRA, CLAVE_PROYECTO_ACTIVO } from '../../data/proyectoKeys';
import { APP_ROUTE } from '../../pages/landing/constants';
import { leerClave } from '../storage/seguro';

/** La pantalla de la obra. */
export const RUTA_OBRA = '/obra';

/** ¿Hay una obra que enseñar? Una obra guardada, o datos de obra tecleados sin guardarla todavía. */
export function hayObra(): boolean {
  if (leerClave(CLAVE_PROYECTO_ACTIVO) !== null) return true;
  const bruto = leerClave(CLAVE_OBRA);
  if (bruto === null) return false;
  try {
    const p: unknown = JSON.parse(bruto);
    const obra = typeof p === 'object' && p !== null ? (p as { obra?: { denominacion?: unknown; provincia?: unknown } }).obra : undefined;
    return Boolean(obra && (obra.denominacion || obra.provincia));
  } catch {
    return false;
  }
}

export function rutaDeEntrada(): string {
  return hayObra() ? RUTA_OBRA : APP_ROUTE;
}

/**
 * Contexto de obra mínimo, compartido por los módulos del capítulo Acciones y
 * Memorias: `concreta-obra`.
 *
 * Con un módulo, el municipio se teclea una vez. Con cinco compartiéndolo
 * (materiales, viento y nieve, cargas, sismo, ficha DB SE) hace falta un sitio
 * donde viva, y ese sitio NO es el estado interno de ninguno de ellos. Los
 * módulos lo leen como valor por defecto y pueden sobrescribirlo en su propio
 * estado; lo que publican lleva la obra a la que pertenece (ver `lib/pub`).
 *
 * Cinco campos: los que decide la obra y no el cálculo.
 *
 * El INE de cinco cifras del municipio vivió aquí hasta el 2026-09-11 y se
 * fue por inútil: sólo se escribía en el sello de las publicaciones, y de él
 * sólo se leían las dos primeras cifras —la provincia, que ya tiene su campo—.
 * Eran cinco cifras que nadie sabe de memoria pedidas para nada. Un fichero
 * antiguo que las traiga las pierde al abrirlo, sin cambiar ningún resultado:
 * el sello cae a la provincia y la comparación da lo mismo.
 */

import { CLAVE_OBRA } from '../../data/proyectoKeys';
import { escribirClave, leerClave } from '../storage/seguro';

export interface Obra {
  denominacion: string;
  municipio: string;
  /** Código INE de dos dígitos de la provincia. Cadena vacía = sin elegir. */
  provincia: string;
  /** Altitud topográfica, m. */
  altitud: number | null;
  /** Uso principal del edificio, en texto libre («Residencial»). */
  uso: string;
}

export const OBRA_KEY = CLAVE_OBRA;
export const OBRA_VERSION = 1;

export function obraVacia(): Obra {
  return { denominacion: '', municipio: '', provincia: '', altitud: null, uso: '' };
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Todo lo que no se reconozca cae al valor vacío; nunca se lanza. */
export function normalizarObra(bruto: unknown): Obra {
  const base = obraVacia();
  if (!esObjeto(bruto)) return base;
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    denominacion: texto(bruto.denominacion),
    municipio: texto(bruto.municipio),
    provincia: typeof bruto.provincia === 'string' && /^\d{2}$/.test(bruto.provincia) ? bruto.provincia : '',
    altitud: typeof bruto.altitud === 'number' && Number.isFinite(bruto.altitud) ? bruto.altitud : null,
    uso: texto(bruto.uso),
  };
}

/** `null` si no hay obra guardada (o no se puede leer). */
export function leerObra(): Obra | null {
  try {
    const bruto = leerClave(OBRA_KEY);
    if (!bruto) return null;
    const p: unknown = JSON.parse(bruto);
    if (!esObjeto(p) || p.v !== OBRA_VERSION) return null;
    return normalizarObra(p.obra);
  } catch {
    return null;
  }
}

/**
 * ¿Son la misma obra, campo a campo? `leerObra()` construye un objeto nuevo en
 * cada llamada, así que comparar por identidad da siempre `false`: quien
 * refleje la obra en otro sitio necesita comparar por valor para no repintar.
 */
export function mismaObra(a: Obra | null, b: Obra | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.denominacion === b.denominacion &&
    a.uso === b.uso &&
    a.provincia === b.provincia &&
    a.municipio === b.municipio &&
    a.altitud === b.altitud
  );
}

/**
 * Sustituye la obra entera, sin fundir con la anterior. Es lo que hace el
 * contenedor de proyectos al desplegar un `ProyectoFile`: la obra vive en la
 * raíz del fichero y aquí sólo se reconstruye.
 */
export function reemplazarObra(obra: Obra): boolean {
  const ok = escribirClave(OBRA_KEY, JSON.stringify({ v: OBRA_VERSION, obra: normalizarObra(obra) }));
  avisarObra();
  return ok;
}

/** Funde el cambio con lo guardado y lo escribe. Devuelve la obra resultante. */
export function guardarObra(cambio: Partial<Obra>): Obra {
  const obra = { ...(leerObra() ?? obraVacia()), ...cambio };
  escribirClave(OBRA_KEY, JSON.stringify({ v: OBRA_VERSION, obra }));
  avisarObra();
  return obra;
}

/** Sí cuando la obra tiene al menos provincia o municipio: algo que heredar. */
export function obraConEmplazamiento(obra: Obra | null): obra is Obra {
  return obra !== null && (obra.provincia !== '' || obra.municipio !== '');
}

// ── El store ────────────────────────────────────────────────────────────────
//
// Quien enseñe la obra en pantalla necesita enterarse de que ha cambiado: el
// diálogo de obra, el menú, otra pestaña. Hasta 2026-09-12 la ficha DB SE lo
// hacía a mano con `focus` y `storage`, y el evento `storage` NO se dispara en
// la pestaña que escribe: cambiar la obra desde el diálogo no repintaba nada
// hasta cambiar de ventana y volver.
//
// Mismo patrón que `lib/anejo`: oyentes locales + `storage` para las otras
// pestañas, y una instantánea con identidad estable, que es lo que
// `useSyncExternalStore` exige para no entrar en bucle de render.

const oyentes = new Set<() => void>();

function avisarObra(): void {
  for (const fn of oyentes) fn();
}

export function suscribirObra(fn: () => void): () => void {
  oyentes.add(fn);
  // `key: null` es el `clear()` del cambio de obra.
  const otraPestana = (e: StorageEvent) => {
    if (e.key === null || e.key === OBRA_KEY) fn();
  };
  window.addEventListener('storage', otraPestana);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener('storage', otraPestana);
  };
}

let instantanea: { raw: string | null; valor: Obra | null } | null = null;

/** `leerObra()` con identidad estable mientras la obra guardada no cambie. */
export function instantaneaObra(): Obra | null {
  const raw = leerClave(OBRA_KEY);
  if (instantanea && instantanea.raw === raw) return instantanea.valor;
  instantanea = { raw, valor: leerObra() };
  return instantanea.valor;
}

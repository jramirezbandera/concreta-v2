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
 * Sustituye la obra entera, sin fundir con la anterior. Es lo que hace el
 * contenedor de proyectos al desplegar un `ProyectoFile`: la obra vive en la
 * raíz del fichero y aquí sólo se reconstruye.
 */
export function reemplazarObra(obra: Obra): boolean {
  return escribirClave(OBRA_KEY, JSON.stringify({ v: OBRA_VERSION, obra: normalizarObra(obra) }));
}

/** Funde el cambio con lo guardado y lo escribe. Devuelve la obra resultante. */
export function guardarObra(cambio: Partial<Obra>): Obra {
  const obra = { ...(leerObra() ?? obraVacia()), ...cambio };
  escribirClave(OBRA_KEY, JSON.stringify({ v: OBRA_VERSION, obra }));
  return obra;
}

/** Sí cuando la obra tiene al menos provincia o municipio: algo que heredar. */
export function obraConEmplazamiento(obra: Obra | null): obra is Obra {
  return obra !== null && (obra.provincia !== '' || obra.municipio !== '');
}

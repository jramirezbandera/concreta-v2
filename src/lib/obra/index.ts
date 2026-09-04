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
 * Sólo cinco campos: los que decide la obra y no el cálculo.
 */

export interface Obra {
  denominacion: string;
  municipio: string;
  /** Código INE de cinco dígitos del municipio, si se conoce. */
  ine: string | null;
  /** Código INE de dos dígitos de la provincia. Cadena vacía = sin elegir. */
  provincia: string;
  /** Altitud topográfica, m. */
  altitud: number | null;
  /** Uso principal del edificio, en texto libre («Residencial»). */
  uso: string;
}

export const OBRA_KEY = 'concreta-obra';
export const OBRA_VERSION = 1;

export function obraVacia(): Obra {
  return { denominacion: '', municipio: '', ine: null, provincia: '', altitud: null, uso: '' };
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
    ine: typeof bruto.ine === 'string' && /^\d{5}$/.test(bruto.ine) ? bruto.ine : null,
    provincia: typeof bruto.provincia === 'string' && /^\d{2}$/.test(bruto.provincia) ? bruto.provincia : '',
    altitud: typeof bruto.altitud === 'number' && Number.isFinite(bruto.altitud) ? bruto.altitud : null,
    uso: texto(bruto.uso),
  };
}

/** `null` si no hay obra guardada (o no se puede leer). */
export function leerObra(): Obra | null {
  try {
    const bruto = localStorage.getItem(OBRA_KEY);
    if (!bruto) return null;
    const p: unknown = JSON.parse(bruto);
    if (!esObjeto(p) || p.v !== OBRA_VERSION) return null;
    return normalizarObra(p.obra);
  } catch {
    return null;
  }
}

/** Funde el cambio con lo guardado y lo escribe. Devuelve la obra resultante. */
export function guardarObra(cambio: Partial<Obra>): Obra {
  const obra = { ...(leerObra() ?? obraVacia()), ...cambio };
  try {
    localStorage.setItem(OBRA_KEY, JSON.stringify({ v: OBRA_VERSION, obra }));
  } catch {
    // Sin almacenamiento la obra vive sólo en memoria; el módulo sigue.
  }
  return obra;
}

/** Sí cuando la obra tiene al menos provincia o municipio: algo que heredar. */
export function obraConEmplazamiento(obra: Obra | null): obra is Obra {
  return obra !== null && (obra.provincia !== '' || obra.municipio !== '');
}

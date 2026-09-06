/**
 * Las columnas de «¿qué hay encima del forjado?» son una PROYECCIÓN del
 * estado, no estado.
 *
 * Cada zona sigue guardando su lista de cargas permanentes, como antes. La
 * tabla las enseña en columnas: recorre todas las zonas en su orden y agrupa
 * por clave —el id del catálogo cuando lo hay, el concepto normalizado cuando
 * la carga es «otra»—. Una obra normal usa dos o tres columnas: solado,
 * tabiquería y la formación de cubierta.
 *
 * Que no sea estado importa: el sobre publicado, el motor y los exportadores
 * ven exactamente lo mismo que antes, y un estado guardado por la versión de
 * formulario se abre sin migrar nada.
 */

import { CATALOGO_PERMANENTES } from './catalogos';
import { nuevoId, nuevoPermanente, type PermanenteUI, type PlantaUI, type ZonaUI } from './state';

export interface ColumnaEncima {
  /** Identidad de la columna dentro de la obra. */
  clave: string;
  /** Cabecera: la etiqueta del catálogo, o el concepto tal como se tecleó. */
  etiqueta: string;
  /** `null` en las cargas «otras». */
  catalogoId: string | null;
  /** kN/m³ de las que se teclean por espesor (agua 10, tierra 20); `null` en el resto. */
  porEspesor: number | null;
}

/**
 * Dos cargas son la misma columna si vienen de la misma entrada del catálogo,
 * o —cuando son libres— si se llaman igual sin distinguir mayúsculas ni
 * espacios de más. Una carga libre sin concepto no agrupa con nadie: se queda
 * en su fila hasta que se le ponga nombre, y por eso lleva su id.
 */
export function claveColumna(p: PermanenteUI): string {
  if (p.catalogoId) return `cat:${p.catalogoId}`;
  const concepto = p.concepto.trim().toLocaleLowerCase('es');
  return concepto ? `txt:${concepto}` : `id:${p.id}`;
}

const entradaCatalogo = (id: string | null) => (id ? CATALOGO_PERMANENTES.find((e) => e.id === id) : undefined);

/** La etiqueta con la que se rotula la columna de una carga. */
export function etiquetaColumna(p: PermanenteUI): string {
  const cat = entradaCatalogo(p.catalogoId);
  return p.concepto.trim() || cat?.etiqueta || 'Sin nombre';
}

/**
 * Las columnas de la obra, en el orden en que aparecen leyendo las plantas de
 * arriba abajo y las zonas de cada una. Así una carga que sólo tiene el vaso
 * de piscina cae a la derecha de las que llevan todas las plantas.
 */
export function columnasEncima(plantas: PlantaUI[]): ColumnaEncima[] {
  const vistas = new Map<string, ColumnaEncima>();
  for (const planta of plantas) {
    for (const zona of planta.zonas) {
      for (const p of zona.permanentes) {
        const clave = claveColumna(p);
        if (vistas.has(clave)) continue;
        const cat = entradaCatalogo(p.catalogoId);
        vistas.set(clave, {
          clave,
          etiqueta: etiquetaColumna(p),
          catalogoId: p.catalogoId,
          porEspesor: cat?.porEspesor ?? null,
        });
      }
    }
  }
  return [...vistas.values()];
}

/** La carga de esa zona en esa columna, si la lleva. */
export function permanenteDe(zona: ZonaUI, clave: string): PermanenteUI | undefined {
  return zona.permanentes.find((p) => claveColumna(p) === clave);
}

/**
 * Teclear un número en una celda vacía crea la carga en esa zona; vaciarla la
 * quita. Es la única forma de añadir o quitar una carga de una sola zona: el
 * catálogo de la cabecera trabaja sobre la columna entera.
 */
export function ponerEnCelda(zona: ZonaUI, columna: ColumnaEncima, valor: number | null): ZonaUI {
  const actual = permanenteDe(zona, columna.clave);
  if (valor === null) {
    if (!actual) return zona;
    return { ...zona, permanentes: zona.permanentes.filter((p) => p.id !== actual.id) };
  }
  if (actual) {
    return { ...zona, permanentes: zona.permanentes.map((p) => (p.id === actual.id ? { ...p, valor } : p)) };
  }
  const nueva: PermanenteUI = columna.catalogoId
    ? { ...nuevoPermanente(columna.catalogoId), valor, espesor: columna.porEspesor !== null ? redondea(valor / columna.porEspesor) : null }
    : { id: nuevoId('c'), concepto: columna.etiqueta, valor, catalogoId: null, espesor: null };
  return { ...zona, permanentes: [...zona.permanentes, nueva] };
}

/** El espesor de una carga que va por espesor: el valor lo pone la densidad. */
export function ponerEspesor(zona: ZonaUI, columna: ColumnaEncima, espesor: number): ZonaUI {
  if (columna.porEspesor === null) return zona;
  const valor = redondea(espesor * columna.porEspesor);
  const actual = permanenteDe(zona, columna.clave);
  if (!actual) return ponerEnCelda(zona, columna, valor);
  return { ...zona, permanentes: zona.permanentes.map((p) => (p.id === actual.id ? { ...p, espesor, valor } : p)) };
}

/** Renombrar la columna renombra la carga en todas las zonas que la llevan. */
export function renombrarColumna(plantas: PlantaUI[], clave: string, concepto: string): PlantaUI[] {
  return mapZonas(plantas, (zona) => {
    const actual = permanenteDe(zona, clave);
    if (!actual) return zona;
    return { ...zona, permanentes: zona.permanentes.map((p) => (p.id === actual.id ? { ...p, concepto } : p)) };
  });
}

/** Quitar la columna quita esa carga de TODAS las zonas: es lo que dice su tooltip. */
export function quitarColumna(plantas: PlantaUI[], clave: string): PlantaUI[] {
  return mapZonas(plantas, (zona) => {
    const actual = permanenteDe(zona, clave);
    if (!actual) return zona;
    return { ...zona, permanentes: zona.permanentes.filter((p) => p.id !== actual.id) };
  });
}

/**
 * Añadir una columna del catálogo la pone en las zonas que NO la tienen ya,
 * con el valor que propone la norma. Es lo que se quiere el noventa por ciento
 * de las veces (un solado en todas las plantas); la cubierta, que no lo lleva,
 * se arregla vaciando su celda.
 */
export function anadirColumna(plantas: PlantaUI[], catalogoId: string): PlantaUI[] {
  const clave = `cat:${catalogoId}`;
  return mapZonas(plantas, (zona) => {
    if (permanenteDe(zona, clave)) return zona;
    return { ...zona, permanentes: [...zona.permanentes, nuevoPermanente(catalogoId)] };
  });
}

// ── Cocina ──────────────────────────────────────────────────────────────────

const mapZonas = (plantas: PlantaUI[], f: (z: ZonaUI) => ZonaUI): PlantaUI[] => plantas.map((p) => ({ ...p, zonas: p.zonas.map(f) }));

const redondea = (v: number) => Math.round(v * 100) / 100;

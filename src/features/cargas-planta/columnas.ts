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
  /** Cabecera: la etiqueta del catálogo, o el concepto tal como se tecleó («Sin nombre» si aún no lo tiene). */
  etiqueta: string;
  /** El nombre de una carga libre tal cual está, vacío incluido: es lo que edita la cabecera. */
  concepto: string;
  /** `null` en las cargas «otras». */
  catalogoId: string | null;
  /** Identidad compartida de una columna libre; `null` en las del catálogo. */
  columna: string | null;
  /** kN/m³ de las que se teclean por espesor (agua 10, tierra 20); `null` en el resto. */
  porEspesor: number | null;
}

/**
 * Dos cargas son la misma columna si vienen de la misma entrada del catálogo
 * o si comparten el id de columna con el que nacen las libres. Ese id es lo
 * que deja renombrar la columna letra a letra sin que se parta ni cambie de
 * sitio: si la identidad fuera el nombre, vaciarlo repartiría la columna en
 * tantas como zonas y la caja de la cabecera perdería el foco a cada tecla.
 *
 * Las cargas libres guardadas antes de ese id agrupan como entonces: por
 * nombre, sin distinguir mayúsculas ni espacios; y sin nombre, cada una sola.
 */
export function claveColumna(p: PermanenteUI): string {
  if (p.catalogoId) return `cat:${p.catalogoId}`;
  if (p.columna) return `col:${p.columna}`;
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
 * El orden de las columnas respeta el orden en que cada zona lista sus cargas:
 * si en alguna zona la carga A va antes que la B, la columna A va antes que la
 * B; entre las que ninguna zona ordena entre sí manda la primera aparición
 * leyendo las plantas de arriba abajo. Así una carga añadida a toda la obra
 * —que cada zona pone la última— cae la última, en vez de colarse detrás de
 * las de la cubierta por ser la cubierta la primera fila; y una carga que sólo
 * tiene el vaso de piscina sigue cayendo a la derecha de las que llevan todas
 * las plantas. Dos zonas que se contradigan (A antes que B en una, B antes que
 * A en otra) se resuelven por primera aparición.
 */
function ordenarClaves(porAparicion: string[], zonas: string[][]): string[] {
  const antes = new Map<string, Set<string>>(porAparicion.map((c) => [c, new Set<string>()]));
  for (const z of zonas) for (let j = 1; j < z.length; j++) for (let i = 0; i < j; i++) if (z[i] !== z[j]) antes.get(z[j])?.add(z[i]);
  const pendientes = new Set(porAparicion);
  const salida: string[] = [];
  while (pendientes.size > 0) {
    const libre = porAparicion.find((c) => pendientes.has(c) && [...(antes.get(c) ?? [])].every((a) => !pendientes.has(a)));
    const siguiente = libre ?? (porAparicion.find((c) => pendientes.has(c)) as string);
    pendientes.delete(siguiente);
    salida.push(siguiente);
  }
  return salida;
}

/** Las columnas de la obra, en el orden de `ordenarClaves`. */
export function columnasEncima(plantas: PlantaUI[]): ColumnaEncima[] {
  const vistas = new Map<string, ColumnaEncima>();
  const zonas: string[][] = [];
  for (const planta of plantas) {
    for (const zona of planta.zonas) {
      zonas.push(zona.permanentes.map(claveColumna));
      for (const p of zona.permanentes) {
        const clave = claveColumna(p);
        if (vistas.has(clave)) continue;
        const cat = entradaCatalogo(p.catalogoId);
        vistas.set(clave, {
          clave,
          etiqueta: etiquetaColumna(p),
          concepto: p.concepto.trim(),
          catalogoId: p.catalogoId,
          columna: p.columna ?? null,
          porEspesor: cat?.porEspesor ?? null,
        });
      }
    }
  }
  return ordenarClaves([...vistas.keys()], zonas).map((clave) => vistas.get(clave) as ColumnaEncima);
}

/**
 * Las cargas de una zona en el orden de las columnas de la tabla; las de
 * columnas que la tabla no conoce, al final y como estaban. Es lo que deja
 * meter una carga en una zona que no la tenía SIN cambiar el orden de las
 * columnas: puesta al final de la zona, obligaría a la columna a irse detrás.
 */
function ordenarCargas(permanentes: PermanenteUI[], columnas: ColumnaEncima[]): PermanenteUI[] {
  const indice = new Map(columnas.map((c, i) => [c.clave, i]));
  const de = (p: PermanenteUI) => indice.get(claveColumna(p)) ?? columnas.length;
  return [...permanentes].sort((a, b) => de(a) - de(b));
}

/** La carga de esa zona en esa columna, si la lleva. */
export function permanenteDe(zona: ZonaUI, clave: string): PermanenteUI | undefined {
  return zona.permanentes.find((p) => claveColumna(p) === clave);
}

/**
 * Teclear un número en una celda vacía crea la carga en esa zona; vaciarla la
 * quita. Es la única forma de añadir o quitar una carga de una sola zona: el
 * catálogo de la cabecera trabaja sobre la columna entera. `columnas` son las
 * de la tabla, para dejar la carga nueva en el sitio de su columna.
 */
export function ponerEnCelda(zona: ZonaUI, columna: ColumnaEncima, valor: number | null, columnas: ColumnaEncima[] = [columna]): ZonaUI {
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
    : { id: nuevoId('c'), concepto: columna.concepto, valor, catalogoId: null, espesor: null, ...(columna.columna ? { columna: columna.columna } : {}) };
  return { ...zona, permanentes: ordenarCargas([...zona.permanentes, nueva], columnas) };
}

/** El espesor de una carga que va por espesor: el valor lo pone la densidad. */
export function ponerEspesor(zona: ZonaUI, columna: ColumnaEncima, espesor: number, columnas: ColumnaEncima[] = [columna]): ZonaUI {
  if (columna.porEspesor === null) return zona;
  const valor = redondea(espesor * columna.porEspesor);
  const actual = permanenteDe(zona, columna.clave);
  if (!actual) return ponerEnCelda(zona, columna, valor, columnas);
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
 * se arregla vaciando su celda. Una columna que ya existía se queda en su
 * sitio; una nueva cae la última.
 */
export function anadirColumna(plantas: PlantaUI[], catalogoId: string): PlantaUI[] {
  const columnas = columnasEncima(plantas);
  if (catalogoId === 'otro') {
    // Una carga libre no tiene «zonas que ya la llevan»: es una columna NUEVA,
    // sin nombre y a cero, la misma en todas las zonas. Sin el id compartido
    // cada zona estrenaba la suya y salían tantas columnas como zonas.
    const columna = nuevoId('k');
    return mapZonas(plantas, (zona) => ({ ...zona, permanentes: [...zona.permanentes, { ...nuevoPermanente('otro'), columna }] }));
  }
  const clave = `cat:${catalogoId}`;
  return mapZonas(plantas, (zona) => {
    if (permanenteDe(zona, clave)) return zona;
    return { ...zona, permanentes: ordenarCargas([...zona.permanentes, nuevoPermanente(catalogoId)], columnas) };
  });
}

// ── Cocina ──────────────────────────────────────────────────────────────────

const mapZonas = (plantas: PlantaUI[], f: (z: ZonaUI) => ZonaUI): PlantaUI[] => plantas.map((p) => ({ ...p, zonas: p.zonas.map(f) }));

const redondea = (v: number) => Math.round(v * 100) / 100;

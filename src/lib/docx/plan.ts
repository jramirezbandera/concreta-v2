/**
 * Del `Block[]` al plan de un documento .docx.
 *
 * `Block[]` (en `materiales/cuadros.ts`) ya separa QUÉ dice el documento de
 * CÓMO se pinta. Pero entre un bloque y un `new Paragraph(...)` de la librería
 * `docx` queda una franja de decisiones que no son ni dominio ni librería:
 * cuántas columnas caben en un A4, cuánto mide cada una, por dónde se parte una
 * tabla demasiado ancha, qué estilo lleva cada cosa. Si esas decisiones viven
 * dentro del renderer, mezcladas con los objetos de la librería, comprobar que
 * los anchos de una tabla suman 100 obliga a empaquetar un .docx, descomprimir
 * el zip y leer XML.
 *
 * Sacadas a este IR —serializable, sin una sola importación de `docx`— se
 * comprueban con un `toEqual` en milisegundos. Es el mismo movimiento que hizo
 * el módulo al inventar `Block[]`, un piso más abajo: aquí se separa CÓMO se
 * maqueta de CON QUÉ librería se escribe. El renderer que venga detrás traduce,
 * no decide.
 *
 * El texto viaja VERBATIM, y eso es deliberado. Un .docx es XML en UTF-8: «≤ ²
 * γ Δ Ø ·» son caracteres legales que Word pinta tal cual. Aquí NO se usa nada
 * parecido a `pdfStr()` de `src/lib/pdf/utils.ts`; aquella función existe
 * porque las fuentes core de jsPDF sólo hablan Latin-1 y un solo carácter
 * fuera de rango descoloca la línea entera. Aplicarla por analogía degradaría
 * «Δcdev» a «Deltacdev» y «N/mm²» a «N/mm2» en un documento normativo que el
 * proyectista firma. Tampoco se recortan espacios de las celdas: `notas.marca()`
 * devuelve `" (*)"` con espacio inicial y ese espacio es significativo.
 */

import type { Block } from '../materiales/cuadros';

// ── Modelo del plan ─────────────────────────────────────────────────────────

export interface CeldaPlan {
  texto: string;
  negrita: boolean;
}

export interface FilaPlan {
  cabecera: boolean;
  celdas: CeldaPlan[];
}

/**
 * Sólo estilos INTEGRADOS de Word: se resuelven contra la plantilla del
 * usuario (numeración, fuente, índice). Ninguno se define aquí. Un cuadro
 * pegado en la memoria del cliente tiene que heredar SU tipografía y entrar en
 * SU índice; si el renderer trajera estilos propios, el documento saldría con
 * dos maquetaciones distintas y el índice automático ignoraría los títulos.
 */
export type EstiloParrafo = 'Heading1' | 'Heading2' | 'Heading3' | 'Normal' | 'Caption';

export type BloquePlan =
  | { tipo: 'parrafo'; estilo: EstiloParrafo; texto: string }
  | { tipo: 'tabla'; caption?: string; filas: FilaPlan[]; anchos: number[] };

export interface PlanDocx {
  titulo: string;
  bloques: BloquePlan[];
}

// ── Constantes de maqueta ───────────────────────────────────────────────────

/**
 * Columnas que caben en un A4 vertical sin que el cuadro deje de leerse. Por
 * encima se trocea (ver `trocearTabla`), nunca se gira la página.
 */
export const MAX_COLUMNAS = 8;

/**
 * Tope del peso de una columna, en caracteres. Sin él, una celda kilométrica
 * —las cabeceras de `cuadroDurabilidadMadera` pasan de 50 caracteres— se
 * llevaría media tabla y dejaría a las demás en el suelo.
 */
const PESO_MAX = 40;

/**
 * Suelo de la columna 0, en porcentaje. Es lo que hace legible la etiqueta: en
 * `cuadroHormigonMemoria` la columna 0 lleva «Recubrimiento nominal de las
 * armaduras (mm)» y las demás «HA-30/F/20/XC1»; con reparto proporcional puro y
 * diez elementos se quedaría en el 9 % y saldría una palabra por línea.
 */
const ANCHO_ETIQUETA_MIN = 18;

/** Techo de la columna 0: la etiqueta manda, pero no se queda con la tabla. */
const ANCHO_ETIQUETA_MAX = 40;

/** Suelo del resto de columnas. 18 + 7·6 = 60 ≤ 100: con `MAX_COLUMNAS` siempre cabe. */
const ANCHO_MIN = 6;

/**
 * El `kvTable` no pasa por el reparto proporcional: son dos columnas y la
 * etiqueta manda siempre («Vida útil nominal del edificio» contra «50 AÑOS»).
 */
const ANCHOS_KV: readonly number[] = [40, 60];

// ── Reparto de anchos ───────────────────────────────────────────────────────

function acotar(minimo: number, maximo: number, valor: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Peso de cada columna: el contenido más largo que va a caer en ella, cabecera
 * incluida, acotado a `PESO_MAX`. Las filas cortas (una tabla mal formada, o el
 * troceado) cuentan como celda vacía en vez de reventar.
 */
function pesosDeColumnas(head: string[], filas: string[][]): number[] {
  return head.map((titulo, j) =>
    Math.min(
      PESO_MAX,
      filas.reduce((maximo, fila) => Math.max(maximo, (fila[j] ?? '').length), titulo.length),
    ),
  );
}

/**
 * Mueve `delta` puntos (positivo o negativo) entre las columnas de datos, de
 * una en una y empezando por la más ancha, sin bajar ninguna del suelo.
 * Devuelve lo que NO ha podido colocar, para que la columna 0 lo absorba y la
 * suma siga siendo 100 exacta pase lo que pase.
 */
function ajustar(valores: number[], delta: number): number {
  const porAnchura = valores.map((_, i) => i).sort((a, b) => valores[b] - valores[a]);
  let pendiente = delta;

  while (pendiente !== 0) {
    let movido = false;
    for (const i of porAnchura) {
      if (pendiente === 0) break;
      if (pendiente > 0) {
        valores[i] += 1;
        pendiente -= 1;
        movido = true;
      } else if (valores[i] > ANCHO_MIN) {
        valores[i] -= 1;
        pendiente += 1;
        movido = true;
      }
    }
    // Todas en el suelo y aún sobra que quitar: se acabó lo que se podía mover.
    if (!movido) break;
  }

  return pendiente;
}

/**
 * Porcentajes ENTEROS que suman exactamente 100. Porcentaje y no milímetros:
 * una tabla pegada en una plantilla con otros márgenes se reajusta sola,
 * mientras que un ancho absoluto se saldría del cuadro de texto ajeno.
 *
 * La columna 0 sale del reparto proporcional acotada entre el suelo y el techo
 * de la etiqueta; el resto se reparte proporcionalmente sobre lo que queda, con
 * suelo propio; y el descuadre del redondeo se le suma (o se le resta) a la
 * columna 0. Si al hacerlo la columna 0 se saliera de su rango, el desajuste
 * vuelve a las columnas de datos: ninguna rama puede devolver un negativo.
 */
function repartirAnchos(pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  // Una sola columna se lleva la tabla entera: no hay nada que repartir.
  if (pesos.length === 1) return [100];

  const total = pesos.reduce((a, b) => a + b, 0);
  const objetivo = acotar(
    ANCHO_ETIQUETA_MIN,
    ANCHO_ETIQUETA_MAX,
    total > 0 ? Math.round((100 * pesos[0]) / total) : Math.round(100 / pesos.length),
  );

  const pesosResto = pesos.slice(1);
  const totalResto = pesosResto.reduce((a, b) => a + b, 0);
  const restante = 100 - objetivo;
  const resto = pesosResto.map((peso) =>
    Math.max(
      ANCHO_MIN,
      Math.round(totalResto > 0 ? (restante * peso) / totalResto : restante / pesosResto.length),
    ),
  );

  // El descuadre (redondeos y suelos) lo absorbe la columna 0…
  let ancho0 = 100 - resto.reduce((a, b) => a + b, 0);
  // …salvo que la sacara de su rango, en cuyo caso vuelve a las de datos.
  if (ancho0 < ANCHO_ETIQUETA_MIN || ancho0 > ANCHO_ETIQUETA_MAX) {
    const acotado = acotar(ANCHO_ETIQUETA_MIN, ANCHO_ETIQUETA_MAX, ancho0);
    ancho0 = acotado + ajustar(resto, ancho0 - acotado);
  }

  return [ancho0, ...resto];
}

// ── Tablas: troceado por columnas ───────────────────────────────────────────

/**
 * Una tabla más ancha que `MAX_COLUMNAS` se parte en varias tablas, repitiendo
 * la columna 0 como etiqueta en cada trozo. NUNCA se gira la página.
 *
 * Una sección apaisada arrastra su propio `<w:sectPr>`: al pegar el cuadro en la
 * memoria del proyecto, Word inserta un salto de sección y todo lo que va detrás
 * hereda el apaisado. Eso rompe la memoria del cliente, que es justo lo
 * contrario del criterio «editable sin pelearse». Partir por columnas es lo que
 * hace a mano un proyectista, y funciona porque en TODOS los cuadros de este
 * módulo la columna 0 es la etiqueta (Localización / ELEMENTO ESTRUCTURAL / '' /
 * Elemento / Materiales).
 */
function trocearTabla(head: string[], filas: string[][]): { head: string[]; filas: string[][] }[] {
  if (head.length <= MAX_COLUMNAS) return [{ head, filas }];

  // La columna 0 se repite, así que cada trozo lleva MAX_COLUMNAS − 1 de datos.
  const porTrozo = MAX_COLUMNAS - 1;
  const trozos: { head: string[]; filas: string[][] }[] = [];

  for (let desde = 1; desde < head.length; desde += porTrozo) {
    const hasta = Math.min(desde + porTrozo, head.length);
    trozos.push({
      head: [head[0], ...head.slice(desde, hasta)],
      filas: filas.map((fila) => [fila[0] ?? '', ...fila.slice(desde, hasta)]),
    });
  }

  return trozos;
}

function celda(texto: string, negrita: boolean): CeldaPlan {
  return { texto, negrita };
}

/**
 * Una `table` del dominio: fila de cabecera entera en negrita y, en las de
 * datos, sólo la celda 0 (que es la etiqueta de la fila). Los anchos se
 * calculan POR TROZO, sobre las columnas de ese trozo: un trozo con cabeceras
 * cortas no tiene por qué heredar el reparto del que las tiene largas.
 */
function planificarTabla(head: string[], filas: string[][], caption?: string): BloquePlan[] {
  return trocearTabla(head, filas).map((trozo, i) => ({
    tipo: 'tabla',
    // El trozo 2..N avisa de que continúa el anterior. Si la tabla no traía
    // caption, el trozo tampoco lo lleva: no se inventa un rótulo.
    ...(caption !== undefined ? { caption: i === 0 ? caption : `${caption} (cont.)` } : {}),
    filas: [
      { cabecera: true, celdas: trozo.head.map((t) => celda(t, true)) },
      ...trozo.filas.map((fila) => ({
        cabecera: false,
        celdas: fila.map((t, j) => celda(t, j === 0)),
      })),
    ],
    anchos: repartirAnchos(pesosDeColumnas(trozo.head, trozo.filas)),
  }));
}

// ── Planificación ───────────────────────────────────────────────────────────

const ESTILO_HEADING: Record<1 | 2 | 3, EstiloParrafo> = {
  1: 'Heading1',
  2: 'Heading2',
  3: 'Heading3',
};

export function planificarDocx(blocks: Block[], titulo: string): PlanDocx {
  const rotulo = titulo.trim();
  const bloques: BloquePlan[] = [];

  // Un Heading1 en blanco sale en el índice automático como una entrada vacía:
  // si no hay título, no hay párrafo.
  if (rotulo !== '') bloques.push({ tipo: 'parrafo', estilo: 'Heading1', texto: rotulo });

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        bloques.push({ tipo: 'parrafo', estilo: ESTILO_HEADING[block.level], texto: block.text });
        break;

      case 'paragraph':
        bloques.push({ tipo: 'parrafo', estilo: 'Normal', texto: block.text });
        break;

      case 'kvTable':
        // Dos columnas, sin fila de cabecera: un kvTable no tiene encabezados,
        // tiene pares. Marcar la primera fila como cabecera repetiría «Vida útil
        // nominal del edificio» arriba de cada página al partirse la tabla.
        bloques.push({
          tipo: 'tabla',
          ...(block.caption !== undefined ? { caption: block.caption } : {}),
          filas: block.rows.map(([etiqueta, valor]) => ({
            cabecera: false,
            celdas: [celda(etiqueta, true), celda(valor, false)],
          })),
          anchos: [...ANCHOS_KV],
        });
        break;

      case 'table':
        // El `caption` NO se emite como párrafo aparte: viaja en el bloque de
        // tabla y el renderer lo pinta como párrafo `Caption` ENCIMA, igual que
        // hace `Documento.tsx`. Suelto, un troceado lo dejaría huérfano.
        bloques.push(...planificarTabla(block.head, block.rows, block.caption));
        break;

      case 'notes':
        // Un párrafo `Caption` por ítem, sin viñeta ni numeración.
        // `recopilarNotas()` en `cuadros.ts` ya prefija cada ítem con su
        // marcador —(*), (**), (***)— y esos marcadores están apareados con las
        // celdas de la tabla vía `notas.marca()`. Una viñeta los duplicaría
        // visualmente y una numeración los contradiría. Además
        // `cuadroDurabilidadMadera` y `cuadroCoeficientesMinoracion` empujan
        // frases sin marcador: una lista mezclaría dos cosas distintas.
        for (const item of block.items) {
          bloques.push({ tipo: 'parrafo', estilo: 'Caption', texto: item });
        }
        break;
    }
  }

  return { titulo: rotulo, bloques };
}

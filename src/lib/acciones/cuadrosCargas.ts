/**
 * Del resultado de `cargas.ts` a los cuadros, con la misma frontera `Block[]`
 * que viento y nieve y el cuadro de materiales.
 *
 * Tres salidas del mismo resultado:
 *  - MEMORIA: una tabla por planta o zona como la escribe el estudio
 *    («Peso propio forjado reticular h = 40 cm | 4,49 kN/m²», resto de carga
 *    permanente, sobrecarga de uso, TOTAL), las cargas lineales, y las tablas
 *    fijas del DB SE de γ y de ψ (esta última sólo con las filas que aparecen
 *    en la obra).
 *  - PLANO: el cuadro de acciones tal como lo rotula el estudio, con un bloque
 *    por planta (peso propio, carga muerta, sobrecarga de uso, total) y el de
 *    acciones horizontales ensamblado con lo que publican viento y sismo, más
 *    los γ de ejecución.
 *  - PREDIMENSIONADO: sólo para el Excel, la tabla Gd / Qd / qd.
 *
 * Cada zona va como `table` con su rótulo de cabecera, no como `kvTable` con
 * caption: la vista en pantalla no pinta el caption de un kvTable, y la
 * cabecera es además la forma exacta de las memorias del estudio.
 *
 * Las etiquetas del plano van cortas (≤ 33 caracteres) y los parámetros en la
 * celda del valor, por el tope de ancho de columna del Excel (ver `cuadros.ts`).
 */

import type { Block } from '../materiales/cuadros';
import type { CargasResultado, ForjadoResuelto, Hipotesis, TipoForjado, ZonaCargasResuelta } from './cargas';
import { num } from './cuadros';
import { ASPEREZAS, ZONAS_EOLICAS, type GradoAspereza, type ZonaEolica } from './tablasAE';

export const TITULO_CARGAS_MEMORIA = 'CARGAS POR PLANTA (DB SE-AE, art. 2 y 3.1; Anejo C)';
export const TITULO_GRAVITATORIAS_PLANO = 'ACCIONES GRAVITATORIAS (SEGÚN DB SE-AE)';
export const TITULO_LINEALES_PLANO = 'CARGAS LINEALES';
export const TITULO_HORIZONTALES_PLANO = 'ACCIONES HORIZONTALES';
export const TITULO_PREDIMENSIONADO = 'PREDIMENSIONADO (γG = 1,35 · γQ = 1,50)';

export const HIPOTESIS_TEXTO: Record<Hipotesis, string> = {
  uso: 'Uso',
  nieve: 'Nieve',
  'uso+nieve': 'Uso + ψ0·nieve',
  'nieve+uso': 'Nieve + ψ0·uso',
};

// ── Rótulos del peso propio ─────────────────────────────────────────────────

const NOMBRE_LARGO: Record<TipoForjado, string> = {
  losa: 'losa maciza',
  solera: 'solera',
  reticular: 'forjado reticular',
  unidireccional: 'forjado unidireccional',
  chapa: 'forjado de chapa colaborante',
  madera: 'forjado de madera',
  otro: 'forjado',
};

const NOMBRE_CORTO: Record<TipoForjado, string> = {
  losa: 'losa maciza',
  solera: 'solera',
  reticular: 'reticular',
  unidireccional: 'unidirecc.',
  chapa: 'chapa colab.',
  madera: 'madera',
  otro: 'forjado',
};

/** Con canto: madera y «otro» no siempre lo tienen. */
const conCanto = (f: ForjadoResuelto) => f.tipo !== 'madera' && f.tipo !== 'otro' ? true : f.canto > 0;

/** «Peso propio forjado reticular h = 30 cm», como en las memorias del estudio. */
export function nombrePesoPropio(f: ForjadoResuelto): string {
  const base = `Peso propio ${NOMBRE_LARGO[f.tipo]}`;
  return conCanto(f) ? `${base} h = ${num(f.canto)} cm` : base;
}

/** «Peso propio reticular H=30 cm»: ≤ 33 caracteres para el Excel del plano. */
export function etiquetaPesoPropioPlano(f: ForjadoResuelto): string {
  const base = `Peso propio ${NOMBRE_CORTO[f.tipo]}`;
  return conCanto(f) ? `${base} H=${num(f.canto)} cm` : base;
}

// ── Memoria ─────────────────────────────────────────────────────────────────

const filaUso = (z: ZonaCargasResuelta): string => {
  const partes = [z.uso.etiqueta];
  if (z.uso.incrementoEscaleras > 0) partes.push(`escaleras +${num(z.uso.incrementoEscaleras)}`);
  const tabla = z.uso.fila === 'otro' ? '' : ', tabla 3.1';
  return `Sobrecarga de uso (${partes.join(', ')}${tabla})`;
};

function tablaZonaMemoria(z: ZonaCargasResuelta): Block {
  const rows: string[][] = [[nombrePesoPropio(z.forjado), num(z.forjado.pp, 2)]];
  // La fila del resto sólo falta cuando de verdad no hay nada encima (una
  // losa de helipuerto): así lo escribe el estudio.
  if (z.resto > 0) rows.push(['Resto de carga permanente', num(z.resto, 2)]);
  rows.push([filaUso(z), num(z.uso.qUso, 2)]);
  if (z.nieve !== null && z.nieve > 0) rows.push(['Nieve', num(z.nieve, 2)]);
  rows.push(['TOTAL', num(z.G + z.Q, 2)]);
  return { kind: 'table', head: [z.rotulo, 'Carga (kN/m²)'], rows };
}

export function cuadroCargasMemoria(r: CargasResultado): Block[] {
  const blocks: Block[] = [
    { kind: 'heading', level: 2, text: TITULO_CARGAS_MEMORIA },
    {
      kind: 'paragraph',
      text: 'Valores característicos de las acciones gravitatorias en cada planta: peso propio del forjado, resto de cargas permanentes (solados, tabiquería, formación de cubierta, rellenos) y sobrecarga de uso según la tabla 3.1 del DB SE-AE. En las cubiertas se indica además la carga de nieve.',
    },
  ];
  for (const p of r.plantas) for (const z of p.zonas) blocks.push(tablaZonaMemoria(z));

  if (r.lineales.length > 0) {
    blocks.push(
      { kind: 'heading', level: 3, text: 'Cargas lineales' },
      { kind: 'table', head: ['Elemento', 'Carga (kN/m)'], rows: r.lineales.map((l) => [l.concepto, num(l.gk, 2)]) },
    );
  }

  blocks.push(
    { kind: 'heading', level: 3, text: 'Coeficientes parciales de seguridad (DB SE, tabla 4.1)' },
    {
      kind: 'kvTable',
      rows: [
        ['Acciones permanentes (G)', `γG = ${num(r.gamma.G, 2)}`],
        ['Acciones variables (Q)', `γQ = ${num(r.gamma.Q, 2)}`],
        ['Acciones accidentales (A)', `γA = ${num(r.gamma.A, 2)}`],
      ],
    },
  );

  if (r.psiPresentes.length > 0) {
    blocks.push(
      { kind: 'heading', level: 3, text: 'Coeficientes de simultaneidad (DB SE, tabla 4.2)' },
      {
        kind: 'table',
        head: ['Acción', 'ψ0', 'ψ1', 'ψ2'],
        rows: r.psiPresentes.map((p) => [p.etiqueta, num(p.psi.psi0, 1), num(p.psi.psi1, 1), num(p.psi.psi2, 1)]),
      },
    );
  }

  if (r.notas.length > 0) blocks.push({ kind: 'notes', items: r.notas });
  return blocks;
}

// ── Plano ───────────────────────────────────────────────────────────────────

/** Lo que el cuadro necesita de la publicación de viento; la feature lo traduce del sobre. */
export interface ResumenVientoPlano {
  zonaEolica: ZonaEolica;
  /** Velocidad básica, m/s. `null` si la presión dinámica se tecleó. */
  vb: number | null;
  aspereza: GradoAspereza;
}

/** Lo que el cuadro necesita de la publicación de sismo, cuando exista. */
export interface ResumenSismoPlano {
  /** Aceleración sísmica de cálculo, en g. */
  ac: number;
  /** Coeficiente de contribución K. */
  K: number;
  /** Coeficiente de comportamiento por ductilidad. */
  mu: number;
  /** «baja», «alta»… si se conoce. */
  ductilidad?: string;
  /** Años, si se conoce (vive en el cuadro de materiales). */
  vidaUtil?: number;
}

function tablaZonaPlano(z: ZonaCargasResuelta): Block {
  const rows: string[][] = [
    [etiquetaPesoPropioPlano(z.forjado), num(z.forjado.pp, 2)],
    ['Carga muerta', num(z.resto, 2)],
    ['Sobrecarga de uso', num(z.uso.qUso, 2)],
  ];
  if (z.nieve !== null && z.nieve > 0) rows.push(['Nieve', num(z.nieve, 2)]);
  rows.push(['Total', num(z.G + z.Q, 2)]);
  return { kind: 'table', head: [z.rotulo, 'kN/m²'], rows };
}

export function cuadroAccionesPlanoCargas(r: CargasResultado, viento: ResumenVientoPlano | null, sismo: ResumenSismoPlano | null): Block[] {
  const blocks: Block[] = [{ kind: 'heading', level: 2, text: TITULO_GRAVITATORIAS_PLANO }];
  for (const p of r.plantas) for (const z of p.zonas) blocks.push(tablaZonaPlano(z));

  if (r.lineales.length > 0) {
    blocks.push(
      { kind: 'heading', level: 2, text: TITULO_LINEALES_PLANO },
      { kind: 'table', head: ['Elemento', 'kN/m'], rows: r.lineales.map((l) => [l.concepto, num(l.gk, 2)]) },
    );
  }

  blocks.push({ kind: 'heading', level: 2, text: TITULO_HORIZONTALES_PLANO }, { kind: 'heading', level: 3, text: 'VIENTO (SEGÚN DB SE-AE)' });
  if (viento) {
    const vb = viento.vb ?? ZONAS_EOLICAS[viento.zonaEolica].vb;
    blocks.push({
      kind: 'kvTable',
      rows: [
        ['Zona eólica', `${viento.zonaEolica} (velocidad básica ${num(vb)} m/s)`],
        ['Grado de aspereza', `${viento.aspereza} (${ASPEREZAS[viento.aspereza].corta.toLowerCase()})`],
      ],
    });
  } else {
    blocks.push({ kind: 'paragraph', text: 'Ver el módulo Viento y nieve: sin publicación de viento para esta obra.' });
  }

  if (sismo) {
    const rows: [string, string][] = [
      ['Aceleración sísmica de cálculo', `${num(sismo.ac, 2)}g`],
      ['Coeficiente de contribución K', num(sismo.K, 2)],
    ];
    if (sismo.vidaUtil !== undefined) rows.push(['Vida útil', `${num(sismo.vidaUtil)} años`]);
    rows.push(['Ductilidad', `${sismo.ductilidad ? `${sismo.ductilidad}, ` : ''}μ = ${num(sismo.mu, 1)}`]);
    blocks.push({ kind: 'heading', level: 3, text: 'SISMO (SEGÚN NCSE-02)' }, { kind: 'kvTable', rows });
  }

  blocks.push(
    { kind: 'heading', level: 3, text: 'EJECUCIÓN' },
    {
      kind: 'table',
      head: ['Tipo de acción', 'Nivel de control', 'γ'],
      rows: [
        ['Permanentes', 'Normal', num(r.gamma.G, 2)],
        ['Variables', 'Normal', num(r.gamma.Q, 2)],
        ['Accidentales', 'Normal', num(r.gamma.A, 2)],
      ],
    },
  );
  return blocks;
}

// ── Predimensionado (sólo Excel) ────────────────────────────────────────────

export function cuadroPredimensionado(r: CargasResultado): Block[] {
  const zonas = r.plantas.flatMap((p) => p.zonas);
  const blocks: Block[] = [
    { kind: 'heading', level: 2, text: TITULO_PREDIMENSIONADO },
    {
      kind: 'table',
      head: ['Planta / zona', 'G', 'Q uso', 'Nieve', 'Gd', 'Qd', 'qd', 'Hipótesis'],
      rows: zonas.map((z) => [
        z.rotulo,
        num(z.G, 2),
        num(z.uso.qUso, 2),
        z.nieve !== null && z.nieve > 0 ? num(z.nieve, 2) : '-',
        num(z.Gd, 2),
        num(z.Qd, 2),
        num(z.qd, 2),
        HIPOTESIS_TEXTO[z.hipotesis],
      ]),
    },
  ];
  if (r.lineales.length > 0) {
    blocks.push({
      kind: 'table',
      caption: 'Cargas lineales',
      head: ['Elemento', 'gk (kN/m)', 'Gd (kN/m)'],
      rows: r.lineales.map((l) => [l.concepto, num(l.gk, 2), num(l.Gd, 2)]),
    });
  }
  blocks.push({
    kind: 'notes',
    items: [
      `Valores en kN/m². Gd = ${num(r.gamma.G, 2)}·G y Qd = ${num(r.gamma.Q, 2)}·Q, con Q la variable que manda en cada planta: el uso, o en cubiertas con nieve la combinación del DB SE 4.2.2 (categoría G: la mayor de las dos, no concomitantes; resto: la principal más ψ0 por la otra).`,
    ],
  });
  return blocks;
}

// ── Pestañas del Excel ──────────────────────────────────────────────────────

/**
 * Las pestañas del Excel del plano, partiendo los bloques de pantalla por sus
 * rótulos de segundo nivel, más el predimensionado en la suya. Una columna de
 * Excel tiene un ancho: los rótulos largos de las acciones horizontales
 * estirarían la columna de valores de las cargas por planta si compartieran hoja.
 */
export function seccionesCargasXlsx(plano: Block[], predimensionado: Block[]): { nombre: string; blocks: Block[] }[] {
  const plantas: Block[] = [];
  const lineales: Block[] = [];
  const horizontales: Block[] = [];
  let actual = plantas;
  for (const b of plano) {
    if (b.kind === 'heading' && b.level === 2) {
      if (b.text === TITULO_GRAVITATORIAS_PLANO) actual = plantas;
      else if (b.text === TITULO_LINEALES_PLANO) actual = lineales;
      else if (b.text === TITULO_HORIZONTALES_PLANO) actual = horizontales;
    }
    actual.push(b);
  }
  return [
    { nombre: 'Cargas por planta', blocks: plantas },
    { nombre: 'Cargas lineales', blocks: lineales },
    { nombre: 'Predimensionado', blocks: predimensionado },
    { nombre: 'Acciones horizontales', blocks: horizontales },
  ].filter((s) => s.blocks.length > 0);
}

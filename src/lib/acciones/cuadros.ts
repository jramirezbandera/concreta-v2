/**
 * Del resultado del motor a los cuadros.
 *
 * Misma frontera `Block[]` que el cuadro de materiales: React la pinta en
 * vivo, Word y Excel la exportan, y ninguno vuelve a decidir qué dice el
 * documento. Aquí sólo se compone y se formatea; los números ya vienen
 * resueltos de `viento.ts` y `nieve.ts`.
 *
 * Dos salidas del mismo resultado, como en materiales:
 *  - MEMORIA: la derivación entera, con la tabla z → ce → qe → F por planta y
 *    dirección, y los faldones de nieve con μ, acumulación y hielo.
 *  - PLANO: el bloque «Viento (según DB SE-AE)» del cuadro de acciones tal
 *    como lo rotula el estudio —zona, velocidad básica, grado de aspereza— más
 *    la fuerza por planta, y la fila de nieve.
 *
 * El tipo `Block` se importa del cuadro de materiales, que es donde nació; se
 * moverá a un sitio común cuando llegue la ficha DB SE, como dice su nota.
 */

import type { Block } from '../materiales/cuadros';
import type { NieveResultado, OrigenSk } from './nieve';
import {
  ASPEREZAS,
  type ExposicionNieve,
  type ZonaEolica,
  type ZonaInvernal,
} from './tablasAE';
import type { DireccionViento, OrigenQb, VientoResultado } from './viento';

export interface EmplazamientoCuadro {
  /** Nombre de la provincia. */
  provincia: string;
  municipio?: string;
  altitud: number | null;
  zonaEolica: ZonaEolica | null;
  zonaInvernal: ZonaInvernal | null;
}

/** Números a la española: coma decimal. */
export function num(valor: number, decimales = 0): string {
  return valor.toFixed(decimales).replace('.', ',');
}

const GUION = '-';

const ORIGEN_QB: Record<OrigenQb, string> = {
  zona: 'según la zona eólica, Anejo D.1',
  simplificado: 'valor simplificado del art. 3.3.2',
  manual: 'valor adoptado',
};

const ORIGEN_SK: Record<OrigenSk, string> = {
  'tabla3.8': 'tabla 3.8, capital de provincia',
  anejoE: 'tabla E.2, por zona y altitud',
  manual: 'valor adoptado',
};

const EXPOSICION: Record<ExposicionNieve, string> = {
  normal: 'Normal',
  protegida: 'Protegida de la acción del viento (−20 %)',
  expuesta: 'Fuertemente expuesta (+20 %)',
};

function lugar(e: EmplazamientoCuadro): string {
  const municipio = e.municipio?.trim();
  return municipio ? `${municipio} (${e.provincia})` : e.provincia;
}

// ── Viento ──────────────────────────────────────────────────────────────────

function tablaDireccion(d: DireccionViento): Block[] {
  const eje = d.eje.toUpperCase();
  return [
    {
      kind: 'heading',
      level: 3,
      text: `Viento según ${eje} — esbeltez H/d = ${num(d.esbeltez, 2)} → cp = ${num(d.cp, 2)}, cs = ${num(d.cs, 2)} (tabla 3.5)`,
    },
    {
      kind: 'table',
      head: ['Planta', 'z (m)', 'h trib. (m)', 'ce', 'qb·ce (kN/m²)', 'Presión (kN/m²)', 'Succión (kN/m²)', 'F (kN)'],
      rows: [
        ...d.plantas.map((p) => [
          p.nombre,
          num(p.z, 2),
          num(p.hTrib, 2),
          num(p.ce, 3),
          num(p.qe, 3),
          num(p.presion, 3),
          num(p.succion, 3),
          num(p.F, 1),
        ]),
        ['Total', '', '', '', '', '', '', num(d.Ftotal, 1)],
      ],
    },
  ];
}

export function cuadroVientoMemoria(r: VientoResultado, e: EmplazamientoCuadro): Block[] {
  const a = ASPEREZAS[r.aspereza];
  const zona = e.zonaEolica ?? GUION;
  const rows: [string, string][] = [
    ['Emplazamiento', lugar(e)],
    ['Zona eólica (figura D.1)', r.vb !== null ? `${zona} — velocidad básica vb = ${r.vb} m/s` : zona],
    ['Presión dinámica qb', `${num(r.qb, 2)} kN/m² (${ORIGEN_QB[r.qbOrigen]})`],
    ['Grado de aspereza del entorno', `${r.aspereza} — ${a.descripcion}`],
    ['Parámetros del entorno (tabla D.2)', `k = ${num(r.parametros.k, 3)}; L = ${num(r.parametros.L, 3)} m; Z = ${num(r.parametros.Z, 1)} m`],
    ['Coeficiente de exposición', 'ce = F·(F + 7k), F = k·ln(max(z, Z)/L), a la altura z de cada forjado (Anejo D.2)'],
    ['Altura de coronación H', `${num(r.H, 2)} m`],
    ['Dimensiones en planta', `${num(r.x.profundidad, 2)} × ${num(r.y.profundidad, 2)} m`],
    ['Fuerza por planta', 'F = (cp − cs) · qb · ce(z) · b · h_trib, con b la fachada perpendicular al viento'],
  ];
  return [
    { kind: 'heading', level: 2, text: 'ACCIÓN DEL VIENTO (DB SE-AE, art. 3.3 y Anejo D)' },
    { kind: 'kvTable', rows },
    ...tablaDireccion(r.x),
    ...tablaDireccion(r.y),
    { kind: 'notes', items: r.notas },
  ];
}

// ── Nieve ───────────────────────────────────────────────────────────────────

export function cuadroNieveMemoria(r: NieveResultado, e: EmplazamientoCuadro): Block[] {
  const rows: [string, string][] = [
    ['Emplazamiento', lugar(e)],
    ['Zona de clima invernal (figura E.2)', e.zonaInvernal !== null ? String(e.zonaInvernal) : GUION],
    ['Altitud', e.altitud !== null ? `${num(e.altitud)} m` : GUION],
    [
      'Sobrecarga de nieve sobre terreno horizontal sk',
      r.sk !== null ? `${num(r.sk, 2)} kN/m² (${ORIGEN_SK[r.skOrigen]})` : GUION,
    ],
    ['Exposición', EXPOSICION[exposicionDe(r)]],
  ];
  if (r.factorExposicion !== 1 && r.skEfectiva !== null) {
    rows.push(['sk corregida por exposición', `${num(r.skEfectiva, 2)} kN/m²`]);
  }

  const head = ['Faldón', 'Inclinación', 'μ', 'qn (kN/m²)', 'Asimétrica (kN/m²)', 'Limahoya, 2 m', 'Acumulación pd / pa (kN/m)', 'Hielo pn (kN/m)'];
  const filas = r.faldones.map((f) => [
    f.nombre,
    `${num(f.inclinacion)}º`,
    num(f.mu, 2),
    num(f.qn, 2),
    num(f.qnAsimetrica, 2),
    f.limahoya ? `μ = ${num(f.limahoya.mu, 2)} → ${num(f.limahoya.qn, 2)} kN/m²` : GUION,
    f.acumulacion ? `${num(f.acumulacion.pd, 2)} / ${num(f.acumulacion.pa, 2)}` : GUION,
    f.hielo !== undefined ? num(f.hielo, 2) : GUION,
  ]);

  return [
    { kind: 'heading', level: 2, text: 'CARGA DE NIEVE (DB SE-AE, art. 3.5 y Anejo E)' },
    { kind: 'kvTable', rows },
    { kind: 'paragraph', text: 'qn = μ · sk por faldón (3.2). Descarga pd = (1 − μ)·L·sk y acumulación pa = min(μ, 1)·pd en una banda de 2 m (3.4, 3.5).' },
    { kind: 'table', head, rows: filas },
    { kind: 'notes', items: r.notas },
  ];
}

/** La exposición no viaja en el resultado con nombre: se deduce del factor. */
function exposicionDe(r: NieveResultado): ExposicionNieve {
  if (r.factorExposicion < 1) return 'protegida';
  if (r.factorExposicion > 1) return 'expuesta';
  return 'normal';
}

// ── Plano ───────────────────────────────────────────────────────────────────

export const TITULO_VIENTO_PLANO = 'VIENTO (SEGÚN DB SE-AE)';
export const TITULO_NIEVE_PLANO = 'NIEVE (SEGÚN DB SE-AE)';
export const CAPTION_FUERZAS = 'Fuerza horizontal por planta';

/**
 * El bloque de acciones horizontales del plano, calcado del cuadro del
 * estudio: «Zona eólica: A (velocidad básica 26 m/s) · Grado de aspereza: IV
 * (zona urbana)», y debajo lo que el estudio hoy mete a mano en el programa:
 * la fuerza por planta en cada dirección.
 */
export function cuadroAccionesPlano(
  viento: VientoResultado | null,
  nieve: NieveResultado | null,
  e: EmplazamientoCuadro,
): Block[] {
  const blocks: Block[] = [];

  if (viento) {
    const a = ASPEREZAS[viento.aspereza];
    blocks.push(
      { kind: 'heading', level: 2, text: TITULO_VIENTO_PLANO },
      {
        kind: 'kvTable',
        rows: [
          [
            'Zona eólica',
            viento.vb !== null ? `${e.zonaEolica ?? GUION} (velocidad básica ${viento.vb} m/s)` : `${e.zonaEolica ?? GUION}`,
          ],
          ['Presión dinámica', `qb = ${num(viento.qb, 2)} kN/m²`],
          ['Grado de aspereza', `${viento.aspereza} (${a.corta.toLowerCase()})`],
          // Una fila por dirección: en el Excel del plano la columna de valores
          // tiene un ancho, y las dos direcciones en una celda se salían.
          ['Coeficientes eólicos según X', `cp = ${num(viento.x.cp, 2)} · cs = ${num(viento.x.cs, 2)}`],
          ['Coeficientes eólicos según Y', `cp = ${num(viento.y.cp, 2)} · cs = ${num(viento.y.cs, 2)}`],
        ],
      },
      {
        kind: 'table',
        caption: CAPTION_FUERZAS,
        head: ['Planta', 'z (m)', 'Fx (kN)', 'Fy (kN)'],
        rows: [
          ...viento.x.plantas.map((p, i) => [p.nombre, num(p.z, 2), num(p.F, 1), num(viento.y.plantas[i].F, 1)]),
          ['Total', '', num(viento.x.Ftotal, 1), num(viento.y.Ftotal, 1)],
        ],
      },
    );
  }

  if (nieve) {
    const rows: [string, string][] = [
      ['Zona de clima invernal', e.zonaInvernal !== null ? String(e.zonaInvernal) : GUION],
      ['Altitud', e.altitud !== null ? `${num(e.altitud)} m` : GUION],
      ['Nieve sobre terreno horizontal', nieve.sk !== null ? `sk = ${num(nieve.sk, 2)} kN/m²` : GUION],
    ];
    // Una fila por faldón, y sus bandas de limahoya y acumulación debajo. Las
    // etiquetas van cortas (≤ 33 caracteres) y los parámetros en la celda del
    // valor: en el Excel del plano la columna de etiquetas tiene un tope de
    // ancho y una etiqueta larga se corta sin avisar (se vio abriéndolo).
    const unico = nieve.faldones.length === 1;
    for (const f of nieve.faldones) {
      const quien = unico ? 'Carga de nieve en cubierta' : `Carga de nieve — ${f.nombre}`;
      rows.push([quien, `qn = ${num(f.qn, 2)} kN/m² (${num(f.inclinacion)}º, μ = ${num(f.mu, 2)})`]);
      if (f.limahoya) {
        rows.push([unico ? 'Limahoya (banda de 2 m)' : `${f.nombre} — limahoya (2 m)`, `qn = ${num(f.limahoya.qn, 2)} kN/m² (μ = ${num(f.limahoya.mu, 2)})`]);
      }
      if (f.acumulacion && f.acumulacion.pa > 0) {
        rows.push([unico ? 'Acumulación (banda de 2 m)' : `${f.nombre} — acumulación (2 m)`, `pa = ${num(f.acumulacion.pa, 2)} kN/m`]);
      }
      if (f.hielo !== undefined) {
        rows.push([unico ? 'Hielo en voladizos' : `${f.nombre} — hielo en voladizos`, `pn = ${num(f.hielo, 2)} kN/m`]);
      }
    }
    blocks.push({ kind: 'heading', level: 2, text: TITULO_NIEVE_PLANO }, { kind: 'kvTable', rows });
  }

  return blocks;
}

/**
 * Las pestañas del Excel del plano, por SUSTRACCIÓN de los bloques que se ven
 * en pantalla: viento, la tabla de fuerzas por planta y nieve, cada uno en la
 * suya. Una columna de Excel tiene un ancho: la columna de valores del bloque
 * de viento («IV (zona urbana, industrial o forestal)») dejaría estirada la
 * columna «z (m)» de la tabla de fuerzas si compartieran hoja.
 *
 * La hoja de fuerzas recibe un rótulo propio y pierde el `caption`: en
 * pantalla la tabla cuelga del bloque de viento y el caption la presenta;
 * suelta en su pestaña, el rótulo de la hoja ya dice lo que es y el caption
 * lo repetiría debajo. Es el único bloque que no viaja idéntico.
 */
export const TITULO_FUERZAS_XLSX = 'FUERZAS DE VIENTO POR PLANTA';

export function seccionesPlanoXlsx(blocks: Block[]): { nombre: string; blocks: Block[] }[] {
  const viento: Block[] = [];
  const fuerzas: Block[] = [];
  const nieve: Block[] = [];
  let actual = viento;
  for (const b of blocks) {
    if (b.kind === 'heading' && b.text === TITULO_NIEVE_PLANO) actual = nieve;
    else if (b.kind === 'heading' && b.text === TITULO_VIENTO_PLANO) actual = viento;
    if (b.kind === 'table' && b.caption === CAPTION_FUERZAS) {
      if (fuerzas.length === 0) fuerzas.push({ kind: 'heading', level: 2, text: TITULO_FUERZAS_XLSX });
      fuerzas.push({ kind: 'table', head: b.head, rows: b.rows });
      continue;
    }
    actual.push(b);
  }
  return [
    { nombre: 'Viento', blocks: viento },
    { nombre: 'Fuerzas por planta', blocks: fuerzas },
    { nombre: 'Nieve', blocks: nieve },
  ].filter((s) => s.blocks.length > 0);
}

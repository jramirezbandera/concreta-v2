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
import type { Cpe, DireccionResuelta } from './dosAguas';
import type { DireccionParamentos } from './paramentos';
import type { NieveResultado, OrigenSk } from './nieve';
import {
  ASPEREZAS,
  type ExposicionNieve,
  type ZonaEolica,
  type ZonaInvernal,
} from './tablasAE';
import type { CubiertaResuelta, DireccionViento, OrigenQb, ParamentosResueltos, VientoResultado } from './viento';

export interface EmplazamientoCuadro {
  /** Nombre de la provincia. */
  provincia: string;
  municipio?: string;
  altitud: number | null;
  /** Las zonas efectivas: las de la provincia o las forzadas por el proyectista. */
  zonaEolica: ZonaEolica | null;
  zonaInvernal: ZonaInvernal | null;
  /** Las zonas que da la provincia. Cuando no coinciden con las efectivas, el documento dice que están forzadas. */
  zonaEolicaProvincia?: ZonaEolica | null;
  zonaInvernalProvincia?: ZonaInvernal | null;
}

/** «(forzada por el proyectista; la provincia da la zona B)» o nada. */
function forzada(e: EmplazamientoCuadro, cual: 'eolica' | 'invernal', corta = false): string {
  const efectiva = cual === 'eolica' ? e.zonaEolica : e.zonaInvernal;
  const provincia = cual === 'eolica' ? e.zonaEolicaProvincia : e.zonaInvernalProvincia;
  if (efectiva === null || provincia === undefined || provincia === null || provincia === efectiva) return '';
  return corta ? ` (forzada; la provincia da ${provincia})` : ` (forzada por el proyectista; la provincia da la zona ${provincia})`;
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

/**
 * La tabla de una dirección desglosa: una fila por planta con la fuerza de su
 * banda, y debajo, si los hay, el rozamiento repartido y lo que hay por encima
 * del último forjado (hastial o faldones). Las filas suman el total; el plano
 * lleva la suma por planta, que es lo que va al programa.
 */
function tablaDireccion(d: DireccionViento): Block[] {
  const eje = d.eje.toUpperCase();
  const rows: string[][] = d.plantas.map((p) => [
    p.nombre,
    num(p.z, 2),
    num(p.hTrib, 2),
    num(p.ce, 3),
    num(p.qe, 3),
    num(p.presion, 3),
    num(p.succion, 3),
    num(p.Fbanda, 1),
  ]);
  const detalle: Block[] = [];
  if (d.rozamiento) {
    const r = d.rozamiento;
    const pct = num(r.fraccion * 100, 0);
    if (r.aplicado) {
      rows.push([`Rozamiento (cfr ${num(r.cfr, 2)}, ${num(r.area, 1)} m²)`, '', '', '', '', '', '', num(r.F, 1)]);
      detalle.push({
        kind: 'paragraph',
        text: `Rozamiento según ${eje} (art. 3.3.2-3): ${num(r.F, 1)} kN sobre ${num(r.area, 1)} m² de fachadas laterales y cubierta, el ${pct} % de la fuerza perpendicular, más del 10 %: repartido entre las plantas en proporción a su banda, y la cubierta lleva además el de la propia cubierta.`,
      });
    } else {
      detalle.push({
        kind: 'paragraph',
        text: `Rozamiento según ${eje} (art. 3.3.2-3): ${num(r.F, 1)} kN, el ${pct} % de la fuerza perpendicular, no llega al 10 %: se desprecia.`,
      });
    }
  }
  if (d.encima) {
    const c = d.encima;
    if (c.tipo === 'hastial') {
      rows.push([`Hastial → cubierta (${num(c.area, 2)} m²)`, num(c.z, 2), '', num(c.ce, 3), num(c.qe, 3), num(c.qe * d.cp, 3), num(c.qe * d.cs, 3), num(c.F, 1)]);
      detalle.push({
        kind: 'paragraph',
        text: `Hastial con viento según ${eje}: triángulo de ${num(c.ancho, 2)} m de base y ${num(c.altura, 2)} m hasta la coronación (${num(c.area, 2)} m²), con cp − cs = ${num(c.coeficiente, 2)} de la tabla 3.5 y qb·ce a ${num(c.z, 2)} m: F = ${num(c.F, 1)} kN, sumada al forjado de cubierta.`,
      });
    } else {
      rows.push([`Faldones D.6 → cubierta (${num(c.area, 2)} m² proy.)`, num(c.z, 2), '', num(c.ce, 3), num(c.qe, 3), '', '', num(c.F, 1)]);
      const contraria = c.Fcontraria !== undefined && c.Fcontraria < 0 ? ` y ${num(-c.Fcontraria, 1)} kN hacia barlovento con las posibilidades contrarias` : '';
      detalle.push({
        kind: 'paragraph',
        text: `Faldones con viento según ${eje}: resultante horizontal de las presiones de la tabla D.6 (Σ cpe·A·tan α) sobre ${num(c.area, 2)} m² de proyección vertical: ${num(c.F, 1)} kN hacia sotavento (coeficiente global equivalente ${num(c.coeficiente, 2)})${contraria}; la de sotavento se suma al forjado de cubierta.`,
      });
    }
  }
  rows.push(['Total', '', '', '', '', '', '', num(d.Ftotal, 1)]);
  return [
    {
      kind: 'heading',
      level: 3,
      text: `Viento según ${eje} — esbeltez h/d = ${num(d.esbeltez, 2)} → cp = ${num(d.cp, 2)}, cs = ${num(d.cs, 2)} (tabla 3.5); excentricidad ${num(d.excentricidad, 2)} m (3.3.2-2)`,
    },
    {
      kind: 'table',
      head: ['Planta', 'z (m)', 'h trib. (m)', 'ce', 'qb·ce (kN/m²)', 'Presión (kN/m²)', 'Succión (kN/m²)', 'F (kN)'],
      rows,
    },
    ...detalle,
  ];
}

export function cuadroVientoMemoria(r: VientoResultado, e: EmplazamientoCuadro): Block[] {
  const a = ASPEREZAS[r.aspereza];
  const zona = e.zonaEolica ?? GUION;
  const rows: [string, string][] = [
    ['Emplazamiento', lugar(e)],
    ['Zona eólica (figura D.1)', `${r.vb !== null ? `${zona} — velocidad básica vb = ${r.vb} m/s` : zona}${forzada(e, 'eolica')}`],
    ['Presión dinámica qb', `${num(r.qb, 2)} kN/m² (${ORIGEN_QB[r.qbOrigen]})`],
    ['Grado de aspereza del entorno', `${r.aspereza} — ${a.descripcion}`],
    ['Parámetros del entorno (tabla D.2)', `k = ${num(r.parametros.k, 3)}; L = ${num(r.parametros.L, 3)} m; Z = ${num(r.parametros.Z, 1)} m`],
    ['Coeficiente de exposición', 'ce = F·(F + 7k), F = k·ln(max(z, Z)/L), a la altura z de cada forjado (Anejo D.2)'],
    ['Altura del último forjado H', `${num(r.H, 2)} m`],
    ...(r.alturaEdificio !== r.H
      ? [['Altura del edificio h', `${num(r.alturaEdificio, 2)} m (la coronación de la cubierta; es la h de la esbeltez y de las figuras del Anejo D)`] as [string, string]]
      : []),
    ['Dimensiones en planta', `${num(r.x.profundidad, 2)} × ${num(r.y.profundidad, 2)} m`],
    [
      'Fuerza por planta',
      'F = (cp − cs) · qb · ce(z) · b · h_trib, con b la fachada perpendicular al viento y h_trib la banda de media planta por debajo y por encima del forjado; se le suma el rozamiento repartido y, en cubierta, el hastial o los faldones. La tabla de cada dirección desglosa los términos y el plano lleva la suma por planta.',
    ],
  ];
  return [
    { kind: 'heading', level: 2, text: 'ACCIÓN DEL VIENTO (DB SE-AE, art. 3.3 y Anejo D)' },
    { kind: 'kvTable', rows },
    ...tablaDireccion(r.x),
    ...tablaDireccion(r.y),
    ...(r.cubierta ? cuadroCubiertaMemoria(r.cubierta) : []),
    ...(r.paramentos ? cuadroParamentosMemoria(r.paramentos) : []),
    { kind: 'notes', items: r.notas },
  ];
}

// ── Cubierta a dos aguas ────────────────────────────────────────────────────

/** Un coeficiente con sus dos posibilidades: «-0,85 / +0,27»; con una sola, «-0,40» o «+0,70». */
export function textoCpe(c: Cpe, decimales = 2): string {
  const s = c.succion === null ? null : num(c.succion, decimales);
  const p = c.presion === null ? null : `+${num(c.presion, decimales)}`;
  if (s !== null && p !== null) return `${s} / ${p}`;
  return s ?? p ?? GUION;
}

/** Una presión con su signo (la succión ya viene negativa), o guion si esa posibilidad no existe. */
function conSigno(valor: number | null, decimales: number): string {
  if (valor === null) return GUION;
  return valor > 0 ? `+${num(valor, decimales)}` : num(valor, decimales);
}

/** «20º» o «17,5º». */
function grados(pendiente: number): string {
  return `${num(pendiente, Number.isInteger(pendiente) ? 0 : 1)}º`;
}

/** «Viento perpendicular a la cumbrera (θ = 0º, según Y)»: la dirección de la norma y el eje del módulo que le corresponde. */
export function rotuloDireccionCubierta(d: DireccionResuelta, cumbrera: 'x' | 'y'): string {
  const eje = d.direccion === 'perpendicular' ? (cumbrera === 'x' ? 'Y' : 'X') : cumbrera.toUpperCase();
  return d.direccion === 'perpendicular'
    ? `Viento perpendicular a la cumbrera (θ = 0º, según ${eje})`
    : `Viento paralelo a la cumbrera (θ = 90º, según ${eje})`;
}

function leyendaZonas(d: DireccionResuelta): Block {
  const quien = d.direccion === 'perpendicular' ? 'perpendicular' : 'paralelo';
  return {
    kind: 'paragraph',
    text: `Zonas de la figura D.6 con viento ${quien} a la cumbrera: ${d.zonas.map((z) => `${z.zona}, ${z.descripcion}`).join('; ')}.`,
  };
}

function tablaZonasMemoria(d: DireccionResuelta, cumbrera: 'x' | 'y'): Block {
  return {
    kind: 'table',
    caption: `${rotuloDireccionCubierta(d, cumbrera)} — b = ${num(d.b, 2)} m, d = ${num(d.d, 2)} m, e = min(b, 2h) = ${num(d.e, 2)} m`,
    head: ['Zona', 'Piezas y medidas (m)', 'Área (m²)', 'cpe,10', 'cpe,1', 'cpe (A, m²)', 'Succión (kN/m²)', 'Presión (kN/m²)'],
    rows: d.zonas.map((z) => [
      z.zona,
      `${z.piezas} × ${num(z.ancho, 2)} × ${num(z.fondo, 2)}`,
      num(z.area, 2),
      textoCpe(z.cpe10),
      textoCpe(z.cpe1),
      `${textoCpe(z.cpe)} (${num(z.A, 1)})`,
      conSigno(z.succion, 3),
      conSigno(z.presion, 3),
    ]),
  };
}

function cuadroCubiertaMemoria(c: CubiertaResuelta): Block[] {
  const rows: [string, string][] = [
    ['Pendiente de los faldones α', grados(c.pendiente)],
    ['Altura de coronación h', `${num(c.alturaCoronacion, 2)} m (el punto más alto de la cubierta)`],
    ['Cumbrera', `paralela al eje ${c.cumbrera.toUpperCase()}, ${num(c.perpendicular.b, 2)} m; ancho perpendicular ${num(c.perpendicular.d, 2)} m`],
    ['Coeficiente de exposición en coronación', `ce = ${num(c.ce, 3)} (Anejo D.2, z = h)`],
    ['Presión en coronación', `qb·ce = ${num(c.qe, 3)} kN/m²`],
    [
      'Área de influencia A',
      c.areaInfluencia === null
        ? 'la de cada zona en planta (estructura general, Anejo D.3-3)'
        : `${num(c.areaInfluencia, 2)} m² (la del elemento comprobado, Anejo D.3-3)`,
    ],
    ['Coeficiente adoptado', 'cpe,10 si A ≥ 10 m², cpe,1 si A ≤ 1 m² y entre medias cpe,A = cpe,1 + (cpe,10 − cpe,1)·log10 A (fórmula D.4)'],
  ];
  const resultante: Block[] = [];
  const res = c.perpendicular.resultante;
  if (res && res.area > 0) {
    resultante.push({
      kind: 'paragraph',
      text: `Resultante horizontal de los faldones con viento perpendicular a la cumbrera: ${num(res.haciaSotavento, 1)} kN hacia sotavento y ${num(-res.haciaBarlovento, 1)} kN hacia barlovento, sobre ${num(res.area, 2)} m² de proyección vertical (Σ cpe·A·tan α, cada cara entera en presión o en succión). La de sotavento va sumada al forjado de cubierta en la tabla de fuerzas por planta.`,
    });
  }
  return [
    { kind: 'heading', level: 3, text: `Cubierta a dos aguas — tabla D.6, pendiente ${grados(c.pendiente)}` },
    { kind: 'kvTable', rows },
    tablaZonasMemoria(c.perpendicular, c.cumbrera),
    leyendaZonas(c.perpendicular),
    ...resultante,
    tablaZonasMemoria(c.paralela, c.cumbrera),
    leyendaZonas(c.paralela),
  ];
}

export const TITULO_CUBIERTA_PLANO = 'CUBIERTA A DOS AGUAS (SEGÚN DB SE-AE)';

/**
 * El bloque de cubierta del plano: cinco datos y una tabla por dirección con
 * la presión de cada zona. Etiquetas cortas (≤ 33 caracteres) por el ancho
 * de columna del Excel, como en el bloque de nieve.
 */
function cuadroCubiertaPlano(c: CubiertaResuelta): Block[] {
  const rows: [string, string][] = [
    ['Pendiente de los faldones', grados(c.pendiente)],
    ['Altura de coronación', `h = ${num(c.alturaCoronacion, 2)} m`],
    ['Cumbrera', `paralela a ${c.cumbrera.toUpperCase()} (${num(c.perpendicular.b, 2)} m); ancho ${num(c.perpendicular.d, 2)} m`],
    ['Presión en coronación', `qb·ce = ${num(c.qe, 3)} kN/m² (ce = ${num(c.ce, 3)})`],
    ['Coeficientes de presión', c.areaInfluencia === null ? 'tabla D.6; A = la de cada zona' : `tabla D.6; A = ${num(c.areaInfluencia, 2)} m²`],
  ];
  const tabla = (d: DireccionResuelta): Block => ({
    kind: 'table',
    caption: rotuloDireccionCubierta(d, c.cumbrera),
    head: ['Zona', 'Área (m²)', 'cpe', 'Succión (kN/m²)', 'Presión (kN/m²)'],
    rows: d.zonas.map((z) => [z.zona, num(z.area, 2), textoCpe(z.cpe), conSigno(z.succion, 2), conSigno(z.presion, 2)]),
  });
  return [{ kind: 'heading', level: 2, text: TITULO_CUBIERTA_PLANO }, { kind: 'kvTable', rows }, tabla(c.perpendicular), tabla(c.paralela)];
}

// ── Paramentos verticales ───────────────────────────────────────────────────

/** «Paramentos con viento según X (h/d = 0,45; e = min(b, 2h) = 12,00 m)». */
export function rotuloParamentos(d: DireccionParamentos): string {
  return `Paramentos con viento según ${d.eje.toUpperCase()} (h/d = ${num(d.esbeltez, 2)}; e = min(b, 2h) = ${num(d.e, 2)} m)`;
}

function tablaParamentosMemoria(d: DireccionParamentos): Block {
  return {
    kind: 'table',
    caption: `${rotuloParamentos(d)} — d = ${num(d.d, 2)} m, b = ${num(d.b, 2)} m`,
    head: ['Zona', 'Dónde', 'Ancho (m)', 'Área (m²)', 'A (m²)', 'cpe', 'Presión (kN/m²)'],
    rows: d.zonas.map((z) => [
      z.zona,
      `${z.descripcion}${z.piezas > 1 ? ` (×${z.piezas})` : ''}`,
      num(z.ancho, 2),
      num(z.area, 2),
      num(z.A, 1),
      num(z.cpe, 2),
      conSigno(z.presion, 3),
    ]),
  };
}

function cuadroParamentosMemoria(p: ParamentosResueltos): Block[] {
  const rows: [string, string][] = [
    ['Altura del edificio h', `${num(p.h, 2)} m (la coronación)`],
    ['Altura de las fachadas', `${num(p.alturaFachada, 2)} m, hasta el último forjado (para las áreas)`],
    ['Coeficiente de exposición', `ce = ${num(p.ce, 3)} (Anejo D.2, z = h)`],
    ['Presión de referencia', `qb·ce = ${num(p.qe, 3)} kN/m²`],
    [
      'Área de influencia A',
      p.areaInfluencia === null
        ? 'la de cada zona (cerramientos grandes, Anejo D.3-3)'
        : `${num(p.areaInfluencia, 2)} m² (la del elemento comprobado, Anejo D.3-3)`,
    ],
    ['Coeficiente adoptado', 'tabla D.3 interpolada en h/d (5, 1, 0,25) y en A (10, 5, 2, 1 m²), Anejo D.3-2'],
  ];
  return [
    { kind: 'heading', level: 3, text: 'Paramentos verticales — tabla D.3' },
    { kind: 'kvTable', rows },
    tablaParamentosMemoria(p.x),
    tablaParamentosMemoria(p.y),
    {
      kind: 'paragraph',
      text: 'Zonas de la figura D.3: D, fachada de barlovento; E, fachada de sotavento; en las dos fachadas paralelas al viento, A los primeros e/10 desde la arista de barlovento, B hasta e y C el resto (d − e).',
    },
  ];
}

export const TITULO_PARAMENTOS_PLANO = 'PARAMENTOS VERTICALES (SEGÚN DB SE-AE)';

/** El bloque de fachadas del plano: tres datos y una tabla por dirección. Etiquetas ≤ 33 caracteres. */
function cuadroParamentosPlano(p: ParamentosResueltos): Block[] {
  const rows: [string, string][] = [
    ['Altura del edificio', `h = ${num(p.h, 2)} m`],
    ['Presión de referencia', `qb·ce = ${num(p.qe, 3)} kN/m² (ce = ${num(p.ce, 3)})`],
    ['Coeficientes de presión', p.areaInfluencia === null ? 'tabla D.3; A = la de cada zona' : `tabla D.3; A = ${num(p.areaInfluencia, 2)} m²`],
  ];
  const tabla = (d: DireccionParamentos): Block => ({
    kind: 'table',
    caption: rotuloParamentos(d),
    head: ['Zona', 'Ancho (m)', 'cpe', 'Presión (kN/m²)'],
    rows: d.zonas.map((z) => [z.zona, num(z.ancho, 2), num(z.cpe, 2), conSigno(z.presion, 2)]),
  });
  return [{ kind: 'heading', level: 2, text: TITULO_PARAMENTOS_PLANO }, { kind: 'kvTable', rows }, tabla(p.x), tabla(p.y)];
}

// ── Nieve ───────────────────────────────────────────────────────────────────

export function cuadroNieveMemoria(r: NieveResultado, e: EmplazamientoCuadro): Block[] {
  const rows: [string, string][] = [
    ['Emplazamiento', lugar(e)],
    ['Zona de clima invernal (figura E.2)', e.zonaInvernal !== null ? `${e.zonaInvernal}${forzada(e, 'invernal')}` : GUION],
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
    // Lo que la fuerza por planta lleva además de la banda de fachada, para
    // que el plano no parezca que se contradice con la memoria.
    const composicion: string[] = [];
    for (const d of [viento.x, viento.y]) {
      const eje = d.eje.toUpperCase();
      if (d.rozamiento?.aplicado) composicion.push(`rozamiento (${num(d.rozamiento.fraccion * 100, 0)} %) según ${eje}`);
      if (d.encima) composicion.push(`${d.encima.tipo === 'hastial' ? 'hastial' : 'faldones'} en cubierta según ${eje}`);
    }
    blocks.push(
      { kind: 'heading', level: 2, text: TITULO_VIENTO_PLANO },
      {
        kind: 'kvTable',
        rows: [
          [
            'Zona eólica',
            `${viento.vb !== null ? `${e.zonaEolica ?? GUION} (velocidad básica ${viento.vb} m/s)` : `${e.zonaEolica ?? GUION}`}${forzada(e, 'eolica', true)}`,
          ],
          ['Presión dinámica', `qb = ${num(viento.qb, 2)} kN/m²`],
          ['Grado de aspereza', `${viento.aspereza} (${a.corta.toLowerCase()})`],
          // Una fila por dirección: en el Excel del plano la columna de valores
          // tiene un ancho, y las dos direcciones en una celda se salían.
          ['Coeficientes eólicos según X', `cp = ${num(viento.x.cp, 2)} · cs = ${num(viento.x.cs, 2)}`],
          ['Coeficientes eólicos según Y', `cp = ${num(viento.y.cp, 2)} · cs = ${num(viento.y.cs, 2)}`],
          ...(composicion.length ? [['En la fuerza por planta', `banda de fachada más ${composicion.join(', ')}`] as [string, string]] : []),
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
    if (viento.cubierta) blocks.push(...cuadroCubiertaPlano(viento.cubierta));
    if (viento.paramentos) blocks.push(...cuadroParamentosPlano(viento.paramentos));
  }

  if (nieve) {
    const rows: [string, string][] = [
      ['Zona de clima invernal', e.zonaInvernal !== null ? `${e.zonaInvernal}${forzada(e, 'invernal', true)}` : GUION],
      ['Altitud', e.altitud !== null ? `${num(e.altitud)} m` : GUION],
      ['Nieve sobre terreno horizontal', nieve.sk !== null ? `sk = ${num(nieve.sk, 2)} kN/m²` : GUION],
    ];
    if (nieve.factorExposicion !== 1 && nieve.skEfectiva !== null) {
      rows.push(['Exposición', `${EXPOSICION[exposicionDe(nieve)]}: sk × ${num(nieve.factorExposicion, 1)} = ${num(nieve.skEfectiva, 2)} kN/m²`]);
    }
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
 * en pantalla: viento, la tabla de fuerzas por planta, la cubierta a dos
 * aguas y los paramentos si los hay, y nieve, cada uno en la suya. Una columna de Excel tiene un ancho: la columna de valores del bloque
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
  const cubierta: Block[] = [];
  const paramentos: Block[] = [];
  const nieve: Block[] = [];
  let actual = viento;
  for (const b of blocks) {
    if (b.kind === 'heading' && b.text === TITULO_NIEVE_PLANO) actual = nieve;
    else if (b.kind === 'heading' && b.text === TITULO_CUBIERTA_PLANO) actual = cubierta;
    else if (b.kind === 'heading' && b.text === TITULO_PARAMENTOS_PLANO) actual = paramentos;
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
    { nombre: 'Cubierta', blocks: cubierta },
    { nombre: 'Paramentos', blocks: paramentos },
    { nombre: 'Nieve', blocks: nieve },
  ].filter((s) => s.blocks.length > 0);
}

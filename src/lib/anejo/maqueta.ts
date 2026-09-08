/**
 * La maqueta del anejo: en qué orden van las piezas, cómo se numeran los
 * capítulos, qué dice la portada y cuántas páginas ocupa el índice.
 *
 * Todo puro y sin jsPDF, porque lo necesitan a la vez la pantalla —el
 * contador del panel derecho, antes de generar nada— y el dibujo del índice
 * (`lib/pdf/anejo.ts`). Que el contador y el documento salgan del MISMO plan
 * es lo que hace que «portada e índice: 2 páginas» sea verdad y no una
 * estimación: el índice no envuelve líneas (los títulos largos se truncan),
 * así que su altura es determinista y `planIndice` la calcula sin dibujar.
 *
 * La numeración se deriva del orden y de la casilla «incluir»: nadie la
 * teclea. Una pieza fuera del anejo no tiene número.
 */

import { provinciaDe } from '../acciones/provincias';
import type { Obra } from '../obra';
import { buscarAdaptador } from './modules';
import type { Pieza, SeccionAnejo } from './types';

export interface Seccion {
  id: SeccionAnejo;
  rotulo: string;
}

/** Las dos secciones del documento, en su orden. */
export const SECCIONES: readonly Seccion[] = [
  { id: 'memoria', rotulo: 'Memoria justificativa' },
  { id: 'piezas', rotulo: 'Cálculos de pieza' },
];

/** La sección de una pieza. Una de un módulo desconocido (otra versión de Concreta) va con las piezas. */
export function seccionDePieza(p: Pieza): SeccionAnejo {
  return buscarAdaptador(p.modulo)?.seccion ?? 'piezas';
}

/** El rótulo del capítulo del módulo que la produjo («Vigas de hormigón»). */
export function capituloDePieza(p: Pieza): string {
  return buscarAdaptador(p.modulo)?.capitulo ?? p.modulo;
}

/** Las piezas de una sección, en su orden. */
export function piezasDeSeccion(piezas: readonly Pieza[], seccion: SeccionAnejo): Pieza[] {
  return piezas.filter((p) => seccionDePieza(p) === seccion);
}

/** El orden del documento: memoria primero, piezas después, cada sección en su orden. */
export function enOrdenDeDocumento(piezas: readonly Pieza[]): Pieza[] {
  return SECCIONES.flatMap((s) => piezasDeSeccion(piezas, s.id));
}

export interface Capitulo {
  /** El id de la pieza. */
  id: string;
  pieza: Pieza;
  seccion: SeccionAnejo;
  capitulo: string;
  /** Número de capítulo en el documento, seguido desde 1. */
  numero: number;
}

/** Los capítulos del documento: las piezas incluidas, en orden, numeradas seguidas desde 1. */
export function capitulosDe(piezas: readonly Pieza[]): Capitulo[] {
  return enOrdenDeDocumento(piezas)
    .filter((p) => p.incluida)
    .map((p, i) => ({ id: p.id, pieza: p, seccion: seccionDePieza(p), capitulo: capituloDePieza(p), numero: i + 1 }));
}

/** Número de capítulo de cada pieza incluida, por id. Las excluidas no tienen. */
export function numerosDeCapitulo(piezas: readonly Pieza[]): ReadonlyMap<string, number> {
  return new Map(capitulosDe(piezas).map((c) => [c.id, c.numero]));
}

/**
 * Mueve una pieza dentro de su sección a la posición `a` (1 = la primera; se
 * acota al tamaño de la sección) y devuelve el orden completo de ids que
 * resulta, listo para `reordenarPiezas`. `null` si la pieza no existe o no
 * cambia de sitio. Una pieza nunca cambia de sección: la sección la decide el
 * módulo, no el usuario.
 */
export function moverEnSeccion(piezas: readonly Pieza[], id: string, a: number): string[] | null {
  const pieza = piezas.find((p) => p.id === id);
  if (!pieza) return null;
  const seccion = seccionDePieza(pieza);
  const propias = piezasDeSeccion(piezas, seccion);
  const desde = propias.findIndex((p) => p.id === id);
  const hasta = Math.min(Math.max(Math.trunc(a), 1), propias.length) - 1;
  if (hasta === desde) return null;
  const nuevas = propias.slice();
  nuevas.splice(desde, 1);
  nuevas.splice(hasta, 0, pieza);
  return SECCIONES.flatMap((s) => (s.id === seccion ? nuevas : piezasDeSeccion(piezas, s.id))).map((p) => p.id);
}

// ── La portada ───────────────────────────────────────────────────────────────

/** «Dos Hermanas (Sevilla)», «Sevilla», «Dos Hermanas» o vacío: lo que la obra sepa de sí misma. */
export function emplazamientoDe(obra: Obra | null): string {
  if (!obra) return '';
  const municipio = obra.municipio.trim();
  const provincia = obra.provincia ? provinciaDe(obra.provincia) : '';
  if (municipio && provincia && municipio.toLowerCase() !== provincia.toLowerCase()) return `${municipio} (${provincia})`;
  return municipio || provincia;
}

// ── El índice, en milímetros ─────────────────────────────────────────────────

/**
 * Las medidas del índice. Las comparten `planIndice` (que cuenta) y el dibujo
 * (que pinta en las posiciones que el plan devuelve): si alguien cambia una
 * aquí, cambian las dos cosas a la vez.
 */
export const MAQUETA_INDICE = {
  /** Margen de página: el de los documentos del capítulo Memorias. */
  M: 18,
  /** Donde empieza la primera entrada en la primera página del índice, bajo el rótulo «Índice». */
  yInicio: 18 + 14,
  /** Donde empieza en las páginas de continuación. */
  yContinuacion: 18 + 12,
  /** Alto de la cabecera de sección, con su aire. */
  altoSeccion: 10,
  /** Alto de cada entrada: el título y, debajo, el capítulo y las páginas. */
  altoEntrada: 9,
  /** Lo que no se pisa: `PAGE_H − M − FOOTER_RESERVE`, como en el resto de documentos. */
  suelo: 297 - 18 - 10,
} as const;

/** Página del índice (1 = la primera del índice, no del documento) y `y` en mm. */
export interface PosicionIndice {
  pagina: number;
  y: number;
}

export interface PlanIndice {
  /** Páginas que ocupa el índice. */
  paginas: number;
  secciones: { seccion: SeccionAnejo; rotulo: string; posicion: PosicionIndice }[];
  entradas: { id: string; posicion: PosicionIndice }[];
}

/**
 * Dónde va cada cosa del índice, sin dibujar nada. La cabecera de una sección
 * nunca se queda sola al pie de una página: salta con su primera entrada.
 */
export function planIndice(capitulos: readonly { id: string; seccion: SeccionAnejo }[]): PlanIndice {
  const m = MAQUETA_INDICE;
  let pagina = 1;
  let y: number = m.yInicio;
  const cabe = (alto: number) => y + alto <= m.suelo;
  const saltar = () => {
    pagina++;
    y = m.yContinuacion;
  };
  const plan: PlanIndice = { paginas: 1, secciones: [], entradas: [] };
  for (const s of SECCIONES) {
    const propias = capitulos.filter((c) => c.seccion === s.id);
    if (propias.length === 0) continue;
    if (!cabe(m.altoSeccion + m.altoEntrada)) saltar();
    plan.secciones.push({ seccion: s.id, rotulo: s.rotulo, posicion: { pagina, y } });
    y += m.altoSeccion;
    for (const c of propias) {
      if (!cabe(m.altoEntrada)) saltar();
      plan.entradas.push({ id: c.id, posicion: { pagina, y } });
      y += m.altoEntrada;
    }
  }
  plan.paginas = pagina;
  return plan;
}

/** Una línea del índice del documento, con la página en la que empieza de verdad. */
export interface EntradaIndice {
  id: string;
  numero: number;
  seccion: SeccionAnejo;
  titulo: string;
  capitulo: string;
  /** Primera página de la pieza en el documento entero, contando desde 1 (la portada). */
  pagina: number;
  paginas: number;
}

/**
 * Numera los capítulos a partir de `primeraPagina` (la que sigue a la portada
 * y al índice), con las páginas reales de cada pieza si se dan (`paginasPorId`)
 * o las que apuntó el índice si no.
 */
export function entradasDe(
  capitulos: readonly Capitulo[],
  paginasPorId: ReadonlyMap<string, number>,
  primeraPagina: number,
): EntradaIndice[] {
  let pagina = primeraPagina;
  return capitulos.map((c) => {
    const paginas = paginasPorId.get(c.id) ?? c.pieza.paginas;
    const e: EntradaIndice = {
      id: c.id,
      numero: c.numero,
      seccion: c.seccion,
      titulo: c.pieza.titulo,
      capitulo: c.capitulo,
      pagina,
      paginas,
    };
    pagina += paginas;
    return e;
  });
}

// ── El resumen del panel ─────────────────────────────────────────────────────

export interface ResumenAnejo {
  /** Piezas incluidas. */
  capitulos: number;
  /** Páginas que aportan, según el índice. */
  paginasCalculo: number;
  /** Páginas del índice (0 si no hay nada que generar). */
  paginasIndice: number;
  /** Portada + índice + cálculo; 0 si no hay nada que generar. */
  total: number;
}

export function resumenDe(piezas: readonly Pieza[]): ResumenAnejo {
  const capitulos = capitulosDe(piezas);
  if (capitulos.length === 0) return { capitulos: 0, paginasCalculo: 0, paginasIndice: 0, total: 0 };
  const paginasCalculo = capitulos.reduce((s, c) => s + c.pieza.paginas, 0);
  const paginasIndice = planIndice(capitulos).paginas;
  return { capitulos: capitulos.length, paginasCalculo, paginasIndice, total: 1 + paginasIndice + paginasCalculo };
}

// Instrumentación de jsPDF para auditar la MAQUETACIÓN de un PDF ya generado.
//
// Captura cada `text()` y cada regla horizontal (`line()`) con su geometría
// real: la anchura se MIDE con `getTextWidth` bajo la fuente activa en ese
// instante, no se estima. Sobre esa traza, `layoutViolations` comprueba que
// nada se solapa, que ninguna regla tacha un texto y que nada se sale del
// margen.
//
// Dos sutilezas que hacen que esto funcione de verdad:
//
//   1. jsPDF define `text()`/`line()` como propiedades de la INSTANCIA, no del
//      prototipo. Parchear `jsPDF.prototype` no intercepta nada: hay que
//      envolver el constructor (ver el `vi.mock` de pdfLayout.dom.test.ts).
//   2. Con la opción `maxWidth`, jsPDF parte la cadena él mismo y baja las
//      líneas siguientes. Aquí se reproduce ese troceado (`splitTextToSize` +
//      interlínea), porque si no: (a) se marcarían falsos desbordes en textos
//      que en realidad envuelven, y (b) se dejaría escapar el choque REAL de
//      una línea envuelta contra la fila de debajo.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { PAGE_W } from '../../lib/pdf/utils';

const PT2MM = 25.4 / 72;
const CAP_RATIO = 0.72;    // altura de mayúscula de Helvetica ≈ 0.72 em
const LINE_RATIO = 1.15;   // lineHeightFactor por defecto de jsPDF

export interface TextBox { page: number; x: number; y: number; w: number; h: number; t: string }
export interface HRule   { page: number; x1: number; x2: number; y: number }

export const texts: TextBox[] = [];
export const hrules: HRule[] = [];

export function resetProbe(): void {
  texts.length = 0;
  hrules.length = 0;
}

/** Envuelve una instancia de jsPDF para que registre todo lo que dibuja. */
export function instrument(doc: any): any {
  const origText = doc.text.bind(doc);
  const origLine = doc.line.bind(doc);

  doc.text = (txt: any, x: number, y: number, opts?: any) => {
    const page = doc.internal.getCurrentPageInfo().pageNumber as number;
    const size = doc.getFontSize();
    const lh = size * PT2MM * LINE_RATIO;
    const align = opts?.align ?? 'left';

    // Réplica del troceado interno de jsPDF: primero las líneas que ya vienen
    // dadas (array), luego el envoltorio por `maxWidth` de cada una.
    const given: string[] = Array.isArray(txt) ? txt.map(String) : [String(txt)];
    const lines: string[] = opts?.maxWidth
      ? given.flatMap((s) => doc.splitTextToSize(s, opts.maxWidth) as string[])
      : given;

    lines.forEach((s, i) => {
      const w = doc.getTextWidth(s);
      const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      texts.push({ page, x: left, y: y + i * lh, w, h: size * PT2MM * CAP_RATIO, t: s });
    });

    return origText(txt, x, y, opts);
  };

  doc.line = (x1: number, y1: number, x2: number, y2: number, ...rest: any[]) => {
    if (Math.abs(y1 - y2) < 0.01) {
      hrules.push({
        page: doc.internal.getCurrentPageInfo().pageNumber,
        x1: Math.min(x1, x2),
        x2: Math.max(x1, x2),
        y: y1,
      });
    }
    return origLine(x1, y1, x2, y2, ...rest);
  };

  return doc;
}

/**
 * Devuelve la lista de infracciones de maquetación (vacía = PDF sano).
 * `m` es el margen del módulo (varía: 15/18/20 mm).
 */
export function layoutViolations(m: number): string[] {
  const out: string[] = [];

  // ── A. Dos textos de la misma línea base se pisan ─────────────────────────
  // 0.3 mm de tolerancia: el kerning del último glifo no cuenta como choque.
  // Las celdas vacías (`doc.text('', x, y)`, habituales en un check sin valor)
  // no pintan nada: no pueden pisar a nadie ni ser pisadas.
  const byPage = new Map<number, TextBox[]>();
  for (const t of texts) {
    if (!t.t.trim()) continue;
    if (!byPage.has(t.page)) byPage.set(t.page, []);
    byPage.get(t.page)!.push(t);
  }
  for (const [page, arr] of byPage) {
    const sorted = [...arr].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        if (Math.abs(a.y - b.y) > 1.2) break;   // ya no comparten línea base
        if (a.x < b.x + b.w - 0.3 && b.x < a.x + a.w - 0.3) {
          out.push(`SOLAPE p${page} y=${a.y.toFixed(1)}: "${a.t}" pisa "${b.t}"`);
        }
      }
    }
  }

  // ── B. Una regla horizontal atraviesa la caja de un texto ─────────────────
  // 0.15 mm de holgura: apoyarse justo en la base o rozar el techo vale.
  for (const l of hrules) {
    for (const t of texts) {
      if (t.page !== l.page || !t.t.trim()) continue;
      const top = t.y - t.h;
      if (l.y > top + 0.15 && l.y < t.y - 0.15 && l.x1 < t.x + t.w && t.x < l.x2) {
        out.push(`REGLA p${l.page} y=${l.y.toFixed(2)} tacha "${t.t}"`);
      }
    }
  }

  // ── C. Texto fuera del margen derecho ─────────────────────────────────────
  for (const t of texts) {
    if (t.x + t.w > PAGE_W - m + 0.5) {
      out.push(`MARGEN p${t.page} "${t.t}" acaba en ${(t.x + t.w).toFixed(1)} mm (limite ${PAGE_W - m})`);
    }
  }

  return out;
}

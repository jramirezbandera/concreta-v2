// Invariante de MAQUETACIÓN: ningún PDF puede pisarse a sí mismo.
//
// Hermano de `latin1Encoding.dom.test.ts` — mojibake y descuadre son el mismo
// bug visto desde dos ángulos. Aquí se comprueban tres cosas sobre el PDF YA
// GENERADO (no sobre el código, así que atrapa también las cadenas largas que
// llegan desde `lib/calculations` y no de un literal del exportador):
//
//   A. SOLAPE — dos textos con la misma línea base ocupan el mismo hueco.
//   B. REGLA  — una línea horizontal cruza por dentro de las letras.
//   C. MARGEN — un texto se sale por la derecha.
//
// Origen (2026-07-14): el PDF de muros de contención tachaba la cabecera de su
// tabla con la propia regla superior (dibujada a `y - 0.5`, DENTRO de la altura
// de mayúscula) y el límite del armado transversal —`As,min = 565 mm²/m (30%
// As,long; mín. Ø12@20)`, 52 mm— se pintaba sin medir en una columna de 32 mm y
// se comía las columnas Ut% y Estado. Ambos patrones estaban copiados en otros
// módulos; este test los barre todos.
//
// La anchura de cada texto se MIDE con `getTextWidth` bajo la fuente activa (no
// se estima por nº de caracteres) y el troceado por `maxWidth` se reproduce
// igual que lo hace jsPDF. Ver `layoutProbe.ts`.
//
// Para volcar las infracciones a disco en vez de fallar (útil al triar):
//   PDF_LAYOUT_REPORT=1 npx vitest run --project unit src/test/pdf/pdfLayout

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';

import { PDF_CASES, allWarn, allFail } from './pdfCases';
import { layoutViolations, resetProbe, texts } from './layoutProbe';

// jsPDF cuelga text()/line() de la INSTANCIA, no del prototipo: hay que
// envolver el constructor para interceptarlos.
vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const { instrument } = await import('./layoutProbe');
  const Real = mod.default ?? mod.jsPDF;
  const Patched: any = function (...args: any[]) { return instrument(new Real(...args)); };
  return { ...mod, default: Patched, jsPDF: Patched };
});

const REPORT = !!process.env.PDF_LAYOUT_REPORT;
const report: string[] = [];

describe('PDF: nada se solapa, ninguna regla tacha texto, nada se sale del margen', () => {
  beforeEach(resetProbe);

  for (const { name, run, m, stressable } of PDF_CASES) {
    it(name, async () => {
      await run();
      expect(texts.length).toBeGreaterThan(15);   // el parche interceptó de verdad
      const violations = layoutViolations(m);
      if (REPORT) {
        report.push(`\n### ${name} (M=${m}) — ${violations.length}`, ...violations);
        return;
      }
      expect(violations).toEqual([]);
    }, 30_000);

    // Segunda pasada con el estado MÁS ANCHO ("ADVERTENCIA", 19 mm, frente a los
    // 10.4 de "CUMPLE") y Ut% de tres cifras. Los defaults salen casi todos
    // CUMPLE: sin esta variante el test mide el caso benigno y da por buena una
    // columna de estado que se rompe en cuanto una comprobación avisa — que es
    // exactamente lo que pasaba en composite / pile-cap / empresillado /
    // isolated-footing / fem.
    if (stressable === false) continue;
    for (const [label, tweak] of [['ADVERTENCIA', allWarn], ['INCUMPLE', allFail]] as const) {
      it(`${name} — con ${label} en todas las comprobaciones`, async () => {
        await run(tweak);
        expect(texts.length).toBeGreaterThan(15);
        const violations = layoutViolations(m);
        if (REPORT) {
          report.push(`\n### ${name} [${label}] (M=${m}) — ${violations.length}`, ...violations);
          return;
        }
        expect(violations).toEqual([]);
      }, 30_000);
    }
  }

  // El detector debe DETECTAR: si esto pasa, los tests de arriba no valen nada.
  it('el detector caza un solape y una regla que tacha', async () => {
    const jsPDF = (await import('jspdf')).default;
    const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Armado transversal zapata', 20, 50);   // ~45 mm de ancho...
    doc.text('ADVERT.', 40, 50);                     // ...y esto le cae dentro
    doc.line(20, 49, 100, 49);                       // regla por dentro de las letras
    const v = layoutViolations(20);
    expect(v.some((s) => s.startsWith('SOLAPE'))).toBe(true);
    expect(v.some((s) => s.startsWith('REGLA'))).toBe(true);
  });

  afterAll(async () => {
    if (!REPORT) return;
    const { writeFileSync } = await import('node:fs');
    writeFileSync('pdf-layout-report.txt', report.join('\n'), 'utf8');
  });
});

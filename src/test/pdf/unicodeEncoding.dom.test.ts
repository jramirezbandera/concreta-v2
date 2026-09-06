// Invariante de codificación de los PDF, comprobada sobre los BYTES del
// documento generado y no sobre el código — así atrapa cualquier `doc.text()`
// que alguien añada sin sanear, incluso si la cadena viene de
// `lib/calculations` y no de un literal.
//
// Los PDF embeben una Arimo subseteada (ver `lib/pdf/fuente.ts`), registrada
// con el nombre `helvetica` para que las 340 llamadas a `setFont()` la cojan
// sin tocarlas. Con ella, jsPDF escribe el texto como identificadores de glifo
// —`<00250046...> Tj`— y los símbolos técnicos viajan enteros.
//
// Lo que este test vigila son las dos formas de perder eso:
//
//   1. QUE SE PIERDA LA FUENTE. Un documento construido con `new jsPDF()` en
//      vez de `crearPdf()` vuelve a la Helvetica core sin avisar de nada: el
//      PDF sigue saliendo, sólo que «Δcdev» pasa a ser «?cdev». Se detecta
//      porque no habría ni una racha en hexadecimal.
//
//   2. QUE VUELVA EL UTF-16. Las fuentes core de jsPDF sólo hablan Latin-1, y
//      ante un carácter sin hueco en WinAnsi emiten la cadena ENTERA en
//      UTF-16BE: el visor la pinta byte a byte («E s b e l t e z») y ocupa el
//      DOBLE del ancho que declara `getTextWidth`, así que se sale de su
//      columna y pisa la siguiente. Mojibake y descuadre son el mismo bug.
//      Sigue estando vivo en los dos recuadros que se escriben en `courier`
//      —una fuente core, sin cara embebida—, y por eso ésos usan
//      `pdfStrLatin1` y no `pdfStr`.

import { describe, expect, it } from 'vitest';

import {
  rcBeamDefaults, rcColumnDefaults, steelBeamDefaults, steelColumnDefaults,
  retainingWallDefaults, punchingDefaults, compositeSectionDefaults, pileCapDefaults,
  empresalladoDefaults, isolatedFootingDefaults, timberBeamDefaults, forjadosDefaults,
  timberColumnDefaults, anchorPlateDefaults, micropilesDefaults, micropilesSoilDefaults,
} from '../../data/defaults';

import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';
import { calcPunching } from '../../lib/calculations/punching';
import { calcCompositeSection } from '../../lib/calculations/compositeSection';
import { calcPileCap } from '../../lib/calculations/pileCap';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { calcTimberBeam } from '../../lib/calculations/timberBeams';
import { calcForjados } from '../../lib/calculations/rcSlabs';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import {
  calcularEdificio, getCriticoEdificio, overallStatus, defaultMasonryState,
} from '../../lib/calculations/masonryWalls';

import { exportRCBeamsPDF } from '../../lib/pdf/rcBeams';
import { exportRCColumnsPDF } from '../../lib/pdf/rcColumns';
import { exportSteelBeamsPDF } from '../../lib/pdf/steelBeams';
import { exportSteelColumnsPDF } from '../../lib/pdf/steelColumns';
import { exportRetainingWallPDF } from '../../lib/pdf/retainingWall';
import { exportPunchingPDF } from '../../lib/pdf/punching';
import { exportCompositeSectionPDF } from '../../lib/pdf/compositeSection';
import { exportPileCapPDF } from '../../lib/pdf/pileCap';
import { exportEmpresalladoPDF } from '../../lib/pdf/empresillado';
import { exportIsolatedFootingPDF } from '../../lib/pdf/isolatedFooting';
import { exportTimberBeamsPDF } from '../../lib/pdf/timberBeams';
import { exportForjadosPDF } from '../../lib/pdf/forjados';
import { exportTimberColumnsPDF } from '../../lib/pdf/timberColumns';
import { exportAnchorPlatePDF } from '../../lib/pdf/anchorPlate';
import { exportMicropilesPDF } from '../../lib/pdf/micropiles';
import { exportMasonryWallsPDF } from '../../lib/pdf/masonryWalls';
import { exportFemAnalysisPDF } from '../../lib/pdf/femAnalysis';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { solveDesignModel } from '../../features/fem-analysis/solveDesignModel';

import { pdfBytes, rachasEmbebidas, utf16Runs } from './utf16';

/* eslint-disable @typescript-eslint/no-explicit-any */

const T = 'Elemento 1';

// (nombre, exportador ya cebado). Los 18 módulos.
const CASES: Array<[string, () => Promise<unknown>]> = [
  ['rc-beams (simple)', () => { const i = { ...rcBeamDefaults, mode: 'simple' as const }; return exportRCBeamsPDF(i, calcRCBeam(i), 'si', T); }],
  ['rc-beams (portico)', () => { const i = { ...rcBeamDefaults, mode: 'portico' as const }; return exportRCBeamsPDF(i, calcRCBeam(i), 'si', T); }],
  ['rc-columns', () => exportRCColumnsPDF(rcColumnDefaults, calcRCColumn(rcColumnDefaults), 'si', T)],
  ['steel-beams', () => exportSteelBeamsPDF(steelBeamDefaults, calcSteelBeam(steelBeamDefaults), 'si', T)],
  ['steel-columns', () => exportSteelColumnsPDF(steelColumnDefaults, calcSteelColumn(steelColumnDefaults) as any, 'si', T)],
  ['retaining-wall', () => exportRetainingWallPDF(retainingWallDefaults, calcRetainingWall(retainingWallDefaults) as any, 'si', T)],
  ['punching', () => exportPunchingPDF(punchingDefaults, calcPunching(punchingDefaults) as any, 'si', T)],
  ['composite-section', () => exportCompositeSectionPDF(compositeSectionDefaults, calcCompositeSection(compositeSectionDefaults) as any, 'si', T)],
  ['pile-cap', () => exportPileCapPDF(pileCapDefaults, calcPileCap(pileCapDefaults) as any, 'si', T)],
  ['empresillado', () => exportEmpresalladoPDF(empresalladoDefaults, calcEmpresillado(empresalladoDefaults) as any, 'si', T)],
  ['isolated-footing', () => exportIsolatedFootingPDF(isolatedFootingDefaults, calcIsolatedFooting(isolatedFootingDefaults) as any, 'si', T)],
  ['timber-beams', () => exportTimberBeamsPDF(timberBeamDefaults, calcTimberBeam(timberBeamDefaults) as any, 'si', T)],
  ['forjados', () => exportForjadosPDF(forjadosDefaults, calcForjados(forjadosDefaults) as any, 'si', T)],
  ['timber-columns', () => exportTimberColumnsPDF(timberColumnDefaults, calcTimberColumn(timberColumnDefaults) as any, 'si', T)],
  ['anchor-plate', () => exportAnchorPlatePDF(anchorPlateDefaults, calcAnchorPlate(anchorPlateDefaults) as any, 'si', T)],
  ['micropiles', () => exportMicropilesPDF(micropilesDefaults, micropilesSoilDefaults, calcMicropiles(micropilesDefaults, micropilesSoilDefaults) as any, T)],
  ['masonry-walls', () => {
    const state = defaultMasonryState();
    const r = calcularEdificio(state) as any;
    return exportMasonryWallsPDF({
      state,
      plantasCalc: r.plantas,
      critico: getCriticoEdificio(r.plantas),
      overall: overallStatus(r.plantas),
      invalid: null,
      system: 'si',
      title: T,
    } as any);
  }],
  ['fem-analysis', () => {
    const model = cloneDesignPreset('continuous');
    return exportFemAnalysisPDF(model, solveDesignModel(model), 'si', T);
  }],
];

describe('PDF: fuente embebida y ni un texto en UTF-16', () => {
  for (const [name, run] of CASES) {
    it(`${name}: escribe con la fuente embebida y sin UTF-16`, async () => {
      const pdf = await pdfBytes(run);
      expect(rachasEmbebidas(pdf)).toBeGreaterThan(0);
      expect(utf16Runs(pdf)).toEqual([]);
    }, 30_000);
  }

  it('rc-columns en sistema tecnico: igual', async () => {
    const pdf = await pdfBytes(() => exportRCColumnsPDF(rcColumnDefaults, calcRCColumn(rcColumnDefaults), 'tecnico', T));
    expect(rachasEmbebidas(pdf)).toBeGreaterThan(0);
    expect(utf16Runs(pdf)).toEqual([]);
  });

  // El detector debe DETECTAR: si esto pasa, el test de arriba no vale nada.
  // Aquí SÍ se construye el documento a mano, que es justo lo que se quiere
  // reproducir: un PDF con la Helvetica core y un carácter sin hueco.
  it('el detector caza una cadena UTF-16 de verdad', async () => {
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'normal');
    doc.text('Esbeltez λy = 40.4 (eje y)', 20, 20);   // λ: sin hueco en WinAnsi
    const blob = doc.output('blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let raw = '';
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    expect(utf16Runs(raw).join(' ')).toContain('Esbeltez');
  });

  // ...y NO debe saltar con los que sí tienen hueco en WinAnsi.
  it('no marca falsos positivos con — – ‰ • … (existen en WinAnsi)', async () => {
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'normal');
    doc.text('Concreta — app (CE) · 1.30\x89 • a\x85b 4Ø16 mm²', 20, 20);
    const blob = doc.output('blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let raw = '';
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    expect(utf16Runs(raw)).toEqual([]);
  });
});

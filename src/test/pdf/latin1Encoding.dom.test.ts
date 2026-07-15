// Invariante de codificación: NINGÚN texto del PDF puede salir en UTF-16.
//
// jsPDF sólo sabe escribir Latin-1 con las fuentes core (Helvetica). En cuanto
// una cadena contiene UN carácter SIN hueco en WinAnsi (λ ≤ ≥ ε σ ρ ∞ →…),
// jsPDF emite la cadena ENTERA como UTF-16BE:
//
//   "Esbeltez λy" -> \0E\0s\0b\0e\0l\0t\0e\0z\0 \x03» \0y
//
// El visor pinta cada byte como un glifo Latin-1: los NUL salen como huecos
// ("E s b e l t e z"), λ (0x03,0xBB) sale como "»" y ≤ (0x22,0x64) como '"d'.
// Y, sobre todo, el texto ocupa el DOBLE de ancho del que `getTextWidth`
// declara — así que se sale de su columna y pisa la siguiente. Mojibake y
// descuadre son EL MISMO bug.
//
// OJO: `— – ’ ‰ • …` SÍ tienen hueco en WinAnsi y jsPDF los emite como un byte;
// no disparan UTF-16. Los que lo disparan son los que `pdfStr` debe traducir.
//
// De ahí que todo texto deba pasar por `pdfStr` antes de `doc.text()`. Este test
// lo comprueba sobre los BYTES del PDF ya generado, no sobre el código, así que
// atrapa cualquier `doc.text()` que alguien añada sin sanear, incluso si la
// cadena problemática viene de `lib/calculations` y no de un literal.

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

import { pdfBytes, utf16Runs } from './utf16';

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

describe('PDF: todo el texto se emite en Latin-1 (nunca UTF-16)', () => {
  for (const [name, run] of CASES) {
    it(`${name}: sin texto UTF-16`, async () => {
      expect(utf16Runs(await pdfBytes(run))).toEqual([]);
    }, 30_000);
  }

  it('rc-columns en sistema tecnico: sin texto UTF-16', async () => {
    const pdf = await pdfBytes(() => exportRCColumnsPDF(rcColumnDefaults, calcRCColumn(rcColumnDefaults), 'tecnico', T));
    expect(utf16Runs(pdf)).toEqual([]);
  });

  // El detector debe DETECTAR: si esto pasa, el test de arriba no vale nada.
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

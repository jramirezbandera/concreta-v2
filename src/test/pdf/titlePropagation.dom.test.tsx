// Propagación del título de elemento al PDF — cobertura pan-módulo (Fase 2).
//
// Cada módulo expone una `*FallbackFilename()` (fuente única del nombre por
// defecto, usada por el exportador Y por el preview del TitlePromptModal) y
// construye el filename con `titledFilename(title, fallback)`. Aquí se verifica,
// para los 19 módulos, que:
//   · el fallback es un .pdf estable,
//   · un título con texto SIEMPRE gana (slug .pdf), sin importar el fallback,
//   · un título vacío / solo-símbolos cae al fallback.
// Además, un test de camino real (rc-columns) prueba que el exportador realmente
// enhebra title→filename y respeta la precedencia arg > inp.title.

import { describe, expect, it, beforeEach } from 'vitest';
import { titledFilename } from '../../lib/pdf/utils';

import { rcBeamsFallbackFilename } from '../../lib/pdf/rcBeams';
import { rcColumnsFallbackFilename } from '../../lib/pdf/rcColumns';
import { steelBeamsFallbackFilename } from '../../lib/pdf/steelBeams';
import { steelColumnsFallbackFilename } from '../../lib/pdf/steelColumns';
import { timberBeamsFallbackFilename } from '../../lib/pdf/timberBeams';
import { timberColumnsFallbackFilename } from '../../lib/pdf/timberColumns';
import { retainingWallFallbackFilename } from '../../lib/pdf/retainingWall';
import { punchingFallbackFilename } from '../../lib/pdf/punching';
import { pileCapFallbackFilename } from '../../lib/pdf/pileCap';
import { isolatedFootingFallbackFilename } from '../../lib/pdf/isolatedFooting';
import { forjadosFallbackFilename } from '../../lib/pdf/forjados';
import { empresalladoFallbackFilename } from '../../lib/pdf/empresillado';
import { anchorPlateFallbackFilename } from '../../lib/pdf/anchorPlate';
import { micropilesFallbackFilename } from '../../lib/pdf/micropiles';
import { compositeSectionFallbackFilename } from '../../lib/pdf/compositeSection';
import { masonryWallsFallbackFilename } from '../../lib/pdf/masonryWalls';
import { slopeStabilityFallbackFilename } from '../../lib/pdf/slopeStability';
import { femAnalysisFallbackFilename } from '../../lib/pdf/femAnalysis';
import { seismicNCSE02FallbackFilename } from '../../lib/pdf/seismicNCSE02';

import { rcBeamDefaults, rcColumnDefaults, pileCapDefaults, anchorPlateDefaults, steelColumnDefaults } from '../../data/defaults';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { exportRCColumnsPDF } from '../../lib/pdf/rcColumns';

// (módulo, fallback) para los 19 módulos. Los que dependen de inputs usan sus
// defaults; forjados depende del `result.variant`, y sismo del municipio (se
// pasa sin estado: el fallback sin sitio sigue siendo un .pdf válido).
const FALLBACKS: Array<[string, string]> = [
  ['rc-beams', rcBeamsFallbackFilename(rcBeamDefaults)],
  ['rc-columns', rcColumnsFallbackFilename()],
  ['steel-beams', steelBeamsFallbackFilename()],
  ['steel-columns', steelColumnsFallbackFilename(steelColumnDefaults)],
  ['timber-beams', timberBeamsFallbackFilename()],
  ['timber-columns', timberColumnsFallbackFilename()],
  ['retaining-wall', retainingWallFallbackFilename()],
  ['punching', punchingFallbackFilename()],
  ['pile-cap', pileCapFallbackFilename(pileCapDefaults)],
  ['isolated-footing', isolatedFootingFallbackFilename()],
  ['forjados', forjadosFallbackFilename({ variant: 'reticular' } as unknown as Parameters<typeof forjadosFallbackFilename>[0])],
  ['empresillado', empresalladoFallbackFilename()],
  ['anchor-plate', anchorPlateFallbackFilename(anchorPlateDefaults)],
  ['micropiles', micropilesFallbackFilename()],
  ['composite', compositeSectionFallbackFilename()],
  ['masonry', masonryWallsFallbackFilename()],
  ['slope', slopeStabilityFallbackFilename()],
  ['fem', femAnalysisFallbackFilename()],
  ['seismic-ncse02', seismicNCSE02FallbackFilename()],
];

describe('propagación título PDF — fallback filenames por módulo', () => {
  it('los 19 módulos exponen un fallback .pdf estable', () => {
    expect(FALLBACKS).toHaveLength(19);
    for (const [, fb] of FALLBACKS) {
      expect(fb).toMatch(/\.pdf$/);
      expect(fb.length).toBeGreaterThan(4);
    }
  });

  it.each(FALLBACKS)('%s: título con texto gana (slug .pdf) sobre el fallback', (_mod, fb) => {
    expect(titledFilename('Viga 1', fb)).toBe('viga-1.pdf');
    expect(titledFilename('Dintel de ventana', fb)).toBe('dintel-de-ventana.pdf');
    expect(titledFilename('Ñoño & Cía', fb)).toBe('nono-cia.pdf');
  });

  it.each(FALLBACKS)('%s: título vacío / solo-símbolos → fallback', (_mod, fb) => {
    expect(titledFilename('', fb)).toBe(fb);
    expect(titledFilename('   ', fb)).toBe(fb);
    expect(titledFilename('/// ??? ///', fb)).toBe(fb);
  });
});

describe('exportRCColumnsPDF — camino real title→filename (módulo no-vigas)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('el argumento title produce el filename slug', async () => {
    const inp = { ...rcColumnDefaults, title: '' };
    const pdf = await exportRCColumnsPDF(inp, calcRCColumn(inp), 'si', 'Pilar P3');
    expect(pdf.filename).toBe('pilar-p3.pdf');
    expect(pdf.pageCount).toBeGreaterThanOrEqual(1);
  });

  it('título vacío → filename por defecto con fecha', async () => {
    const inp = { ...rcColumnDefaults, title: '' };
    const pdf = await exportRCColumnsPDF(inp, calcRCColumn(inp), 'si', '');
    expect(pdf.filename).toMatch(/^concreta-pilar-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('sin argumento: usa el título persistido en inp.title', async () => {
    const inp = { ...rcColumnDefaults, title: 'Pilar 1' };
    const pdf = await exportRCColumnsPDF(inp, calcRCColumn(inp), 'si');
    expect(pdf.filename).toBe('pilar-1.pdf');
  });
});

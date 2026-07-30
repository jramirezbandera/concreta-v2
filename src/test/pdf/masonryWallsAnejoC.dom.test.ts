// Muros de fábrica · página "Datos de partida": qué se PUBLICA y con cuánto aire.
//
// Dos regresiones distintas, el mismo bloque de página 2:
//
//   1. En modo Personalizada · Anejo C, la página de datos de partida sólo
//      publicaba el fk GLOBAL. Las dos resistencias de las que se deriva —fb de
//      la pieza y fm del mortero, eq. C.1— no aparecían en ninguna parte de esa
//      página, así que el fk no era re-derivable por quien leyera el documento.
//      (La página condicional de trazabilidad sí las traía; la de datos, no.)
//
//   2. La regla de cada título de sección se pintaba 3 mm bajo su línea base,
//      con la primera fila de datos 5 mm bajo esa misma línea: a 8 pt la
//      mayúscula sube 2,03 mm, así que la regla nacía EXACTAMENTE en el techo de
//      las letras de la fila. `pdfLayout` NO lo cazaba —su check REGLA exige que
//      la regla entre 0,15 mm DENTRO de la caja del texto— y por eso se fue a
//      producción leyéndose pegada a la fila en vez de al título.
//
// El aire se mide sobre el PDF ya generado, instrumentando jsPDF igual que
// `pdfLayout.dom.test.ts` (ver layoutProbe.ts: la anchura y la altura de
// mayúscula de cada texto son las reales de la fuente activa).
//
// NOTA de alcance: `gluedRules` vive aquí, no en layoutProbe, porque el patrón
// "regla a ras del texto de debajo" está copiado en otros exportadores y
// generalizarlo barrería los 19 módulos de golpe. Merece su propia tanda.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { hrules, instrument, resetProbe, texts } from './layoutProbe';
import {
  calcularEdificio,
  defaultMasonryState,
  getCriticoEdificio,
  overallStatus,
  type MasonryWallState,
} from '../../lib/calculations/masonryWalls';

vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const Real = mod.default ?? mod.jsPDF;
  const Patched: any = function (...args: any[]) { return instrument(new Real(...args)); };
  return { ...mod, default: Patched, jsPDF: Patched };
});

/** Exporta el PDF de muros con el estado dado (mismo camino que el componente). */
async function render(state: MasonryWallState) {
  const { exportMasonryWallsPDF } = await import('../../lib/pdf/masonryWalls');
  const r = calcularEdificio(state) as any;
  expect(r.invalid).toBe(false);
  return exportMasonryWallsPDF({
    state,
    plantasCalc: r.plantas,
    critico: getCriticoEdificio(r.plantas),
    overall: overallStatus(r.plantas),
    invalid: null,
    system: 'si',
    title: 'Muro 1',
  });
}

const anejoCState = (fm: number): MasonryWallState => ({
  ...defaultMasonryState(),
  fabricaModo: 'custom',
  customMethod: 'anejoC',
  anejoC_tipoMuro: 'una_hoja_macizo',
  anejoC_fb: 10,
  anejoC_fm: fm,
  gamma_custom: 18,
});

/** Textos de la página 2 (Datos de partida) que contienen `needle`. */
const onDatosPage = (needle: string) =>
  texts.filter((t) => t.page === 2 && t.t.includes(needle));

/**
 * Reglas horizontales que nacen a menos de `minGap` mm del techo de un texto que
 * cruzan (o directamente por dentro de él). Una regla puede ir pegada al texto
 * de ARRIBA —es su subrayado— pero no al de abajo: ahí se lee como si tachara la
 * fila siguiente.
 */
function gluedRules(minGap = 1): string[] {
  const out: string[] = [];
  for (const l of hrules) {
    for (const t of texts) {
      if (t.page !== l.page || !t.t.trim()) continue;
      if (l.x1 >= t.x + t.w || t.x >= l.x2) continue;   // no se cruzan en x
      const top = t.y - t.h;
      if (l.y <= t.y && l.y > top - minGap) {
        out.push(`p${l.page} regla y=${l.y.toFixed(2)} a ${(top - l.y).toFixed(2)} mm de "${t.t}" (techo ${top.toFixed(2)})`);
      }
    }
  }
  return out;
}

describe('masonry-walls PDF · datos de partida', () => {
  beforeEach(resetProbe);

  it('Anejo C: publica fb de la pieza y fm del mortero, no solo el fk global', async () => {
    await render(anejoCState(5));
    // Etiquetas + valores introducidos, en la MISMA página que el fk global.
    expect(onDatosPage('fb (pieza)')).toHaveLength(1);
    expect(onDatosPage('fm (mortero)')).toHaveLength(1);
    expect(onDatosPage('10.0 N/mm²')).not.toHaveLength(0);   // fb introducido
    expect(onDatosPage('5.0 N/mm²')).not.toHaveLength(0);    // fm introducido
    expect(onDatosPage('fk (caracteristica)')).toHaveLength(1);
    // El tipo de muro (con su K) es el tercer input de eq. C.1: sin él, fk
    // tampoco se re-deriva. Va en fila propia a ancho completo.
    expect(onDatosPage('Tipo de muro')).toHaveLength(1);
    expect(onDatosPage('K = 0.60')).toHaveLength(1);
  });

  it('Anejo C con fm por encima del cap: publica el fm APLICADO además del introducido', async () => {
    // fb=10 ⇒ cap = min(20; 0,75·10) = 7,5. Con fm=25 introducido, el fk sale de
    // 7,5: publicar sólo el 25 dejaría un documento no re-derivable.
    await render(anejoCState(25));
    expect(onDatosPage('25.0 N/mm²')).not.toHaveLength(0);
    const nota = onDatosPage('fm aplicado en calculo');
    expect(nota).toHaveLength(1);
    expect(nota[0].t).toContain('7.5 N/mm²');
    expect(nota[0].t).toContain('min(20; 0,75·fb)');
  });

  it('Tabla 4.4: sigue publicando fb y fm como grados en N/mm² (rama intacta)', async () => {
    const state = defaultMasonryState();
    await render(state);
    expect(onDatosPage('fb (pieza)')).toHaveLength(1);
    expect(onDatosPage('fm (mortero)')).toHaveLength(1);
    expect(onDatosPage(`${state.fb} N/mm2`)).toHaveLength(1);
    expect(onDatosPage(`${state.fm} N/mm2`)).toHaveLength(1);
    // El modo tabla NO declara tipo de muro (eso es de Anejo C).
    expect(onDatosPage('Tipo de muro')).toHaveLength(0);
  });

  it('ninguna regla nace pegada al texto de debajo (Tabla 4.4)', async () => {
    await render(defaultMasonryState());
    expect(gluedRules()).toEqual([]);
  });

  it('ninguna regla nace pegada al texto de debajo (Anejo C, con página de trazabilidad)', async () => {
    await render(anejoCState(25));
    expect(gluedRules()).toEqual([]);
  });
});

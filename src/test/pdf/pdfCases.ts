// Catálogo de exportadores PDF cebados con sus defaults — fuente única para los
// tests que auditan el PDF ya generado (maquetación, codificación…).
//
// Cada caso es [nombre, exportador listo para await, margen del módulo]. El
// margen (`M`) NO es uniforme: 15 mm en steel-columns, 18 en los que llevan
// cabecera propia y 20 en el resto. Quien audite márgenes necesita el de cada
// módulo, no una constante global.

/* eslint-disable @typescript-eslint/no-explicit-any */

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
import { exportFem2DPDF } from '../../lib/pdf/fem2d';
import { fem2dUiDefaults, buildModelFromState } from '../../features/fem2d/uiState';
import { analyzeFem2D } from '../../features/fem2d/pipeline';

export interface PdfCase {
  name: string;
  /** Exporta el PDF. `t` transforma el resultado del motor antes de pintarlo. */
  run: (t?: ResultTweak) => Promise<unknown>;
  /** Margen del módulo en mm (`const M` de su exportador). */
  m: number;
  /** false si el módulo no expone `result.checks` (masonry, fem). */
  stressable?: boolean;
}

/** Transformación del resultado del motor antes de exportarlo. */
export type ResultTweak = (r: any) => any;

const ID: ResultTweak = (r) => r;

/**
 * Fuerza el estado MÁS ANCHO en todas las comprobaciones.
 *
 * Los defaults de casi todos los módulos salen "CUMPLE" (10.4 mm), pero la
 * etiqueta real más larga es "ADVERTENCIA" (19.0 mm) — y era justo la que no
 * cabía en las columnas de estado. Sin esto, el test de maquetación mediría
 * siempre el caso benigno y daría por buena una tabla que se rompe en cuanto
 * una comprobación avisa.
 *
 * `utilization = 0.999` (no 1.23) por dos motivos:
 *   · Hay módulos (rc-beams, forjados) que NO leen `status`: lo recalculan con
 *     `toStatus(utilization)`. Con 1.23 saldrían INCUMPLE (13.8 mm) y se
 *     escaparían de la prueba; con 0.999 caen en la banda de aviso
 *     (WARN_UTIL = 0.95 ≤ u < 1) y también rotulan ADVERTENCIA.
 *   · `(0.999 * 100).toFixed(0)` = "100" ⇒ la columna Ut% se mide con tres
 *     cifras, su caso ancho.
 *
 * Las filas neutras se dejan intactas: no llevan estado.
 */
export const allWarn: ResultTweak = (r) => forceStatus(r, 'warn', 0.999);

/**
 * Y el gemelo en INCUMPLIMIENTO. No es redundante: punching, forjados y los dos
 * de madera sólo rotulan la etiqueta cuando la utilización PASA de 1 (si no,
 * escriben el porcentaje en esa misma columna). Sin esta variante, su columna
 * "Ut% / Estado" nunca se mediría con una etiqueta dentro.
 */
export const allFail: ResultTweak = (r) => forceStatus(r, 'fail', 1.23);

/**
 * Reescribe el estado de TODA comprobación, esté donde esté.
 *
 * La recursión no es capricho: cada motor cuelga sus checks de un sitio.
 * rc-beams los guarda en `section.checks` (no en `result.checks`), así que una
 * versión que sólo mirase la raíz dejaría ese módulo sin cubrir — y sin avisar,
 * que es lo peligroso. Las filas neutras se dejan intactas: no llevan estado.
 */
function forceStatus(value: any, status: 'warn' | 'fail', util: number): any {
  if (Array.isArray(value)) return value.map((v) => forceStatus(v, status, util));
  if (!value || typeof value !== 'object') return value;
  const out: any = { ...value };
  for (const k of Object.keys(out)) {
    if (k === 'checks' && Array.isArray(out[k])) {
      out[k] = out[k].map((c: any) => (c?.neutral ? c : { ...c, status, utilization: util }));
    } else if (out[k] && typeof out[k] === 'object') {
      out[k] = forceStatus(out[k], status, util);
    }
  }
  return out;
}

const T = 'Elemento 1';

/** Muro con TODO el armado definido: es el único modo que emite los checks de
 *  armadura, entre ellos el límite largo que destapó el solape de columnas. */
const armedWall = {
  ...retainingWallDefaults,
  q: 10,
  diam_fv_int: 16, diam_fv_ext: 12, diam_fh: 12,
  diam_zs: 16, diam_zi: 16, diam_zt_inf: 12, diam_zt_sup: 12,
};

export const PDF_CASES: PdfCase[] = [
  { m: 20, name: 'rc-beams (simple)',  run: (t = ID) => { const i = { ...rcBeamDefaults, mode: 'simple' as const };  return exportRCBeamsPDF(i, t(calcRCBeam(i)), 'si', T); } },
  { m: 20, name: 'rc-beams (portico)', run: (t = ID) => { const i = { ...rcBeamDefaults, mode: 'portico' as const }; return exportRCBeamsPDF(i, t(calcRCBeam(i)), 'si', T); } },
  { m: 20, name: 'rc-columns',           run: (t = ID) => exportRCColumnsPDF(rcColumnDefaults, t(calcRCColumn(rcColumnDefaults)), 'si', T) },
  { m: 20, name: 'rc-columns (tecnico)', run: (t = ID) => exportRCColumnsPDF(rcColumnDefaults, t(calcRCColumn(rcColumnDefaults)), 'tecnico', T) },
  { m: 20, name: 'steel-beams',       run: (t = ID) => exportSteelBeamsPDF(steelBeamDefaults, t(calcSteelBeam(steelBeamDefaults)), 'si', T) },
  { m: 15, name: 'steel-columns',     run: (t = ID) => exportSteelColumnsPDF(steelColumnDefaults, t(calcSteelColumn(steelColumnDefaults)) as any, 'si', T) },
  { m: 20, name: 'punching',          run: (t = ID) => exportPunchingPDF(punchingDefaults, t(calcPunching(punchingDefaults)) as any, 'si', T) },
  { m: 20, name: 'composite-section', run: (t = ID) => exportCompositeSectionPDF(compositeSectionDefaults, t(calcCompositeSection(compositeSectionDefaults)) as any, 'si', T) },
  { m: 20, name: 'pile-cap',          run: (t = ID) => exportPileCapPDF(pileCapDefaults, t(calcPileCap(pileCapDefaults)) as any, 'si', T) },
  { m: 20, name: 'empresillado',      run: (t = ID) => exportEmpresalladoPDF(empresalladoDefaults, t(calcEmpresillado(empresalladoDefaults)) as any, 'si', T) },
  { m: 20, name: 'isolated-footing',  run: (t = ID) => exportIsolatedFootingPDF(isolatedFootingDefaults, t(calcIsolatedFooting(isolatedFootingDefaults)) as any, 'si', T) },
  { m: 20, name: 'timber-beams',      run: (t = ID) => exportTimberBeamsPDF(timberBeamDefaults, t(calcTimberBeam(timberBeamDefaults)) as any, 'si', T) },
  { m: 20, name: 'forjados',          run: (t = ID) => exportForjadosPDF(forjadosDefaults, t(calcForjados(forjadosDefaults)) as any, 'si', T) },
  { m: 20, name: 'timber-columns',    run: (t = ID) => exportTimberColumnsPDF(timberColumnDefaults, t(calcTimberColumn(timberColumnDefaults)) as any, 'si', T) },
  { m: 20, name: 'anchor-plate',      run: (t = ID) => exportAnchorPlatePDF(anchorPlateDefaults, t(calcAnchorPlate(anchorPlateDefaults)) as any, 'si', T) },
  { m: 18, name: 'micropiles',        run: (t = ID) => exportMicropilesPDF(micropilesDefaults, micropilesSoilDefaults, t(calcMicropiles(micropilesDefaults, micropilesSoilDefaults)) as any, T) },

  // Muro de contención — el módulo que destapó el bug. El modo dimensionamiento
  // (sin armado) no emite los checks de armadura: por sí solo no cazaba nada.
  { m: 18, name: 'retaining-wall (sin armado)', run: (t = ID) => exportRetainingWallPDF(retainingWallDefaults, t(calcRetainingWall(retainingWallDefaults)) as any, 'si', T) },
  { m: 18, name: 'retaining-wall (armado)',     run: (t = ID) => exportRetainingWallPDF(armedWall, t(calcRetainingWall(armedWall)) as any, 'si', T) },
  { m: 18, name: 'retaining-wall (tecnico)',    run: (t = ID) => exportRetainingWallPDF(armedWall, t(calcRetainingWall(armedWall)) as any, 'tecnico', T) },
  {
    m: 18,
    name: 'retaining-wall (alto: agua + pasiva + sismo)',
    // Máximo nº de comprobaciones: fuerza el salto de página CON cabecera de
    // tabla repetida en la página siguiente.
    run: (t = ID) => {
      const i = { ...armedWall, H: 8, hf: 1.0, tFuste: 0.6, bPunta: 1.2, bTalon: 3.0, df: 1.0,
                  usePassive: true, hasWater: true, hw: 5, Ab: 0.2, S: 1.3 };
      return exportRetainingWallPDF(i, t(calcRetainingWall(i)) as any, 'si', T);
    },
  },

  {
    m: 18,
    name: 'masonry-walls',
    // El estado no vive en `result.checks` (va por planta/muro): `allWarn` no
    // aplica. Su tabla la pinta `drawTable` de utils, que sí mide las columnas.
    stressable: false,
    run: () => {
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
    },
  },
  {
    m: 18,
    name: 'fem-analysis',
    // El estado va en `perBar` (resumen) y en `perBar[].checks` (por barra), no
    // en `result.checks`: se fuerza a mano en AMBOS sitios.
    run: (t = ID) => {
      const model = cloneDesignPreset('continuous');
      const solved = solveDesignModel(model) as any;
      // `t` reescribe los checks de cada barra (recursivo); el estado y la eta
      // del RESUMEN por barra viven en `perBar[].status/eta` y hay que forzarlos
      // aparte — si no, la tabla resumen seguiría midiéndose con "CUMPLE".
      const tweaked: any = t(solved);
      const stressed = t === ID ? solved : {
        ...tweaked,
        perBar: Object.fromEntries(
          Object.entries(tweaked.perBar).map(([id, b]: [string, any]) => [
            id,
            { ...b, status: b.checks?.[0]?.status ?? b.status, eta: b.checks?.[0]?.utilization ?? b.eta },
          ]),
        ),
      };
      return exportFemAnalysisPDF(model, stressed, 'si', T);
    },
  },

  // FEM 2D — el estado de cada barra vive en `checks.perMember[].status/eta`
  // (no en `result.checks`), así que el tweak genérico allWarn/allFail no aplica:
  // stressable:false. Se registran dos topologías porque exponen filas distintas
  // — el pórtico saca el axil de pilar y la esquina; la cercha saca "Compresion +
  // pandeo" de las diagonales (los nombres de comprobación más anchos) — y un
  // tercer caso 'custom' que ejercita la rama describeModel de estructura
  // editada (cabecera "Estructura personalizada" + fallback fem2d-estructura).
  {
    m: 18,
    name: 'fem2d (portico)',
    stressable: false,
    run: () => {
      const state = { ...fem2dUiDefaults(), templateId: 'portal-frame' as const };
      const model = buildModelFromState(state).model!;
      return exportFem2DPDF(model, analyzeFem2D(model), 'si', T);
    },
  },
  {
    m: 18,
    name: 'fem2d (cercha)',
    stressable: false,
    run: () => {
      const state = { ...fem2dUiDefaults(), templateId: 'pratt-truss' as const };
      const model = buildModelFromState(state).model!;
      return exportFem2DPDF(model, analyzeFem2D(model), 'si', T);
    },
  },
  {
    m: 18,
    name: 'fem2d (custom editado)',
    stressable: false,
    run: () => {
      const state = { ...fem2dUiDefaults(), templateId: 'gable' as const };
      const built = buildModelFromState(state).model!;
      const model = { ...built, templateId: 'custom' as const };
      return exportFem2DPDF(model, analyzeFem2D(model), 'si', T);
    },
  },
];

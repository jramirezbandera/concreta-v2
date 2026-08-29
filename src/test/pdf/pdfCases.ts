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
  rockfillWallDefaults,
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
import { calcRockfillWall } from '../../lib/calculations/rockfillWall';
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
import { exportRockfillWallPDF } from '../../lib/pdf/rockfillWall';
import { exportMasonryWallsPDF } from '../../lib/pdf/masonryWalls';
import { exportFemAnalysisPDF } from '../../lib/pdf/femAnalysis';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { solveDesignModel } from '../../features/fem-analysis/solveDesignModel';
import { exportFem2DPDF } from '../../lib/pdf/fem2d';
import { exportSeismicNCSE02PDF } from '../../lib/pdf/seismicNCSE02';
import { defaultSeismicState, evaluarSismo, newId, type SeismicState } from '../../features/seismic-ncse02/state';
import { fem2dUiDefaults, buildModelFromState } from '../../features/fem2d/uiState';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { setMemberMaterial } from '../../features/fem2d/modelOps';

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
  // Tres ramas del exportador que los defaults NO tocan: las dos líneas de carga
  // puntual en la columna de datos, el bloque de reacciones CON momento de
  // empotramiento (una sola reacción, fila Md extra) y la nota larga de
  // §6.1.7(3), que solo aparece con la carga a menos de h del apoyo y es la que
  // pone a prueba el envoltorio del texto. PDF_CASES cubre módulos, no ramas.
  {
    m: 20,
    name: 'timber-beams (mensula + carga puntual junto al apoyo)',
    run: (t = ID) => {
      const i = { ...timberBeamDefaults, beamType: 'cantilever' as const, L: 2.5, P_G: 8, P_Q: 12, aP: 0.2 };
      return exportTimberBeamsPDF(i, t(calcTimberBeam(i)) as any, 'si', T);
    },
  },
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

  // Muro de escollera / gaviones — el clon SVG no existe en jsdom (el exportador
  // lo tolera y omite la imagen); la tabla de checks y la de cortes sí se auditan.
  { m: 18, name: 'rockfill-wall (escollera)', run: (t = ID) => exportRockfillWallPDF(rockfillWallDefaults, t(calcRockfillWall(rockfillWallDefaults)) as any, 'si', T) },
  {
    m: 18,
    name: 'rockfill-wall (gaviones + agua + sismo)',
    run: (t = ID) => {
      const i = { ...rockfillWallDefaults, wallType: 'gaviones' as const, gammaAp: 16,
                  hasWater: true, hw: 2, Ab: 0.12, S: 1.0, q: 10 };
      return exportRockfillWallPDF(i, t(calcRockfillWall(i)) as any, 'si', T);
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
    // Muros de fábrica en modo Personalizada · Anejo C eq. C.1 — la rama que
    // NINGUNA fixture cubría, y por eso nadie vio que la referencia del motor
    // («Anejo C eq. C.1 · Una hoja · piezas macizas (grueso = tizón/soga)»,
    // 82 mm) se pintaba en una columna de 49 mm y se salía de la página. Añade
    // también la página condicional de trazabilidad fk y las filas fb/fm.
    // fm=25 fuerza el cap de la nota C.1 → mide la línea del fm aplicado.
    name: 'masonry-walls (anejo C, fm capped)',
    stressable: false,
    run: () => {
      const state = {
        ...defaultMasonryState(),
        fabricaModo: 'custom' as const,
        customMethod: 'anejoC' as const,
        anejoC_tipoMuro: 'una_hoja_macizo' as const,
        anejoC_fb: 10,
        anejoC_fm: 25,
        gamma_custom: 18,
      };
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
  // Pórtico MIXTO acero + HA + madera: la única fixture que mete las filas de
  // MADERA (σm/τ/kcrit/λrel/≤ …) y de HA por la auditoría latin1 + layout del
  // PDF. Sin ella, esos glifos y esas cadenas largas del motor de madera no se
  // renderizarían nunca en un test (el resto de casos fem2d son solo-acero).
  {
    m: 18,
    name: 'fem2d (mixto acero+HA+madera)',
    stressable: false,
    run: () => {
      const state = { ...fem2dUiDefaults(), templateId: 'portal-frame' as const };
      const built = buildModelFromState(state).model!;
      // v1 = dintel → madera (GL/C class rows); p1 = pilar → hormigón; p2 queda
      // en acero. Los tres materiales conviven en el mismo documento.
      const toTimber = setMemberMaterial(built, 'v1', 'timber');
      const toRc = toTimber.ok ? setMemberMaterial(toTimber.model, 'p1', 'rc') : toTimber;
      const model = { ...(toRc.ok ? toRc.model : built), templateId: 'custom' as const, snowOver1000m: true };
      return exportFem2DPDF(model, analyzeFem2D(model), 'si', T);
    },
  },

  // ── Sismo NCSE-02 ──────────────────────────────────────────────────────────
  //
  // Cuatro casos porque el módulo emite CUATRO documentos distintos, no cuatro
  // variantes del mismo: el completo, el de exención (sin cadena de fuerzas), el
  // de «la Norma rige pero el método simplificado no sirve» (sin números) y el
  // de reparto en forma larga. Registrar sólo el completo dejaría tres
  // maquetaciones enteras sin auditar — y la de exención es justamente la que
  // más se va a imprimir.
  //
  // `stressable: false`: el módulo no expone `result.checks` (su «estado» son
  // las dos puertas normativas), así que allWarn/allFail no tienen dónde morder.
  { m: 20, name: 'seismic-ncse02 (Granada, completo)', stressable: false,
    run: () => seismicPdf(defaultSeismicState()) },

  { m: 20, name: 'seismic-ncse02 (exento por importancia moderada)', stressable: false,
    run: () => seismicPdf({ ...defaultSeismicState(), importancia: 'moderada' }) },

  // 25 plantas incumplen el requisito (1) del art. 3.5.1 («inferior a veinte») y
  // su altura el (2) → la Norma rige, el método simplificado no, y el documento
  // sale sin cadena de fuerzas. Las plantas se construyen de verdad: `n` sale de
  // contar la tabla, no es un campo que se pueda declarar aparte.
  { m: 20, name: 'seismic-ncse02 (metodo simplificado no aplicable)', stressable: false,
    run: () => {
      const base = defaultSeismicState();
      return seismicPdf({
        ...base,
        H: 75,
        plantas: Array.from({ length: 25 }, (_, k) => ({
          ...base.plantas[0], id: newId(), nombre: `Planta ${k + 1}`, h: 3 * (k + 1),
        })),
      });
    },
  },

  // Diez planos resistentes: la matriz f_kj no cabe a lo ancho y el exportador
  // cae a la forma larga. Es otra tabla, y sin este caso nunca se mediría.
  { m: 20, name: 'seismic-ncse02 (reparto en forma larga, 10 planos)', stressable: false,
    run: () => {
      const base = defaultSeismicState();
      const elementos = Array.from({ length: 10 }, (_, j) => ({
        id: newId(), x: -10 + j * (20 / 9), k: 1 + j * 0.1,
      }));
      return seismicPdf({ ...base, x: { ...base.x, elementos } });
    },
  },
];

/** Ceba el exportador de sismo desde un estado: evalúa y exporta con título. */
function seismicPdf(state: SeismicState) {
  return exportSeismicNCSE02PDF({ state, evaluacion: evaluarSismo(state), title: T });
}

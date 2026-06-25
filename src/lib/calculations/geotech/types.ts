// Contrato de datos del módulo de estabilidad de taludes (Geotecnia).
//
// Frontera worker ↔ UI
// ────────────────────
// El Web Worker (pyslope.worker.ts) ejecuta PySlope sobre Pyodide y devuelve la
// geometría REAL de la corrida como JSON (json.dumps) — nunca PyProxy y nunca
// reconstruida en JS (defensibilidad legal, eng-review §9.4 #8 / §11.3). El
// adaptador (slope.ts) re-corre PySlope POR CHECK con los parámetros minorados y
// arma `SlopeResult` para la UI; el SVG dibuja `SlopeRun` tal cual.
//
// Unidades SI internas: m, grados (º), kPa, kN/m. Coordenadas en metros, mismo
// sistema que PySlope (x→derecha, y→arriba); la UI hace el flip de Y al pintar.

import type { CheckRow } from '../types';
import type { SlopeInputs } from '../../../data/defaults';

export type { SlopeInputs };

/** Círculo de rotura crítico (centro + radio), en metros. */
export interface SlopeCircle {
  cx: number;
  cy: number;
  r: number;
}

/** Un círculo de prueba de la malla de búsqueda con su FoS — uno por iteración
 *  (≈ `iterations`). Lo emite el worker desde `s._search` (sin fork) y lo dibuja
 *  la vista 2 (malla de centros / mapa de FoS, §10.8). */
export interface SlopeCircleFoS {
  cx: number;
  cy: number;
  r: number;
  fos: number;
}

export interface SlopePoint {
  x: number;
  y: number;
}

/** Una dovela. Geometría EXACTA emitida por el worker desde (cx,cy,r) + perfil del
 *  terreno + nº de dovelas. La física por dovela (peso/u/α) la expone el fork T1.1
 *  vía `s.get_critical_slice_data()` (arrays paralelos del círculo crítico) y la
 *  rellena el script de orquestación (T1.2). Opcional porque PySlope sin fork no
 *  la retiene en estructura pública (§11.3); presente cuando el fork ha aterrizado. */
export interface SlopeSlice {
  x: number;        // centro x de la dovela (m)
  xL: number;       // límite izquierdo (m)
  xR: number;       // límite derecho (m)
  yTop: number;     // cota del terreno sobre la dovela (m)
  yBase: number;    // cota de la superficie de rotura bajo la dovela (m)
  alpha?: number;   // inclinación de la base (rad) — física del círculo crítico (T1.1)
  weight?: number;  // peso de la dovela (kN) — física del círculo crítico (T1.1)
  u?: number;       // presión intersticial en la base (kPa) = γw·hw·cos²(talud) — método-indep. (T1.1)
}

/** Resultado geométrico de UNA corrida de PySlope. Lo consume el SVG (vista 1). */
export interface SlopeRun {
  fos: number;
  circle: SlopeCircle;
  entry: SlopePoint;             // corte del círculo con el terreno (lado talud)
  exit: SlopePoint;              // corte del círculo con el terreno (lado pie)
  slices: SlopeSlice[];
  failureProfile: SlopePoint[];  // arco discretizado entry→exit (para el <path>)
  groundProfile: SlopePoint[];   // rasante: coronación → cara → pie → llano
  limits: { left: number; right: number };  // set_analysis_limits (m)
  slicesN: number;
  method: string;                // 'bishop' | 'fellenius'
  /** Todos los círculos de prueba de la malla de búsqueda con su FoS (≈ iterations).
   *  Lo dibuja la vista 2 (malla de centros / mapa de FoS). */
  searchCircles: SlopeCircleFoS[];
}

/** Trazabilidad del cálculo — va a la cabecera y footers del PDF (§9.2 #3). */
export interface SlopeEngineMeta {
  pyslopeVersion: string;
  pyodideVersion: string;
  patchHash: string;             // hash del parche/vendor (deriva ⇒ golden falla)
  inputsHash: string;            // hash de los inputs de esta corrida
  mesh: { iterations: number; slices: number };
}

/** Resultado completo del adaptador para la UI. `valid:false` ⇒ datos fuera de
 *  invariantes (no se llamó al motor); `error` describe el fallo de cálculo. */
export interface SlopeResult {
  valid: boolean;
  error?: string;
  /** FoS estático característico (corrida base, sin minorar). */
  fos: number;
  /** Geometría de la corrida base — la que pinta el SVG. */
  run: SlopeRun;
  /** Comprobaciones normativas (Phase 1: 2 core). Cada una puede re-correr PySlope
   *  con parámetros reales (c'/γ, atan(tanφ'/γ), cargas ×1,3) — NO dividir FoS/γ. */
  checks: CheckRow[];
  engine: SlopeEngineMeta;
}

/** Estado de la máquina del solver async (botón "Calcular"). Eng-review §9.2 #1,
 *  design-review §10.3. `loading` = primer arranque de Pyodide; `computing` = una
 *  corrida; `stale` lo deriva la UI comparando fingerprints (no es estado del motor). */
export type SlopeEngineState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'computing'
  | 'error';

/** Opciones de una corrida que el adaptador pasa al worker. */
export interface SlopeRunOptions {
  /** Minoración del terreno para esta corrida: c' y tanφ' se dividen por estos
   *  factores ANTES de llamar a PySlope (re-correr por check, §9.2 #5). 1 = sin
   *  minorar (corrida característica). */
  gammaC?: number;     // factor sobre c'
  gammaPhi?: number;   // factor sobre tanφ'
  /** Factor sobre las cargas variables (EC7-DA3 set A2: ×1,3). 1 = sin mayorar. */
  loadFactor?: number;
}

// FEM 2D — Fase 0 del design doc "retirar el rol de barra del enrutado"
// (office-hours 2026-07-28), conservada como GUARDA PERMANENTE de la Fase 2:
// la derivación de decompose (birrotulada + sin carga de barra → elemento
// axial de 4 GDL) YA ES producción, y este test demuestra que es legítima —
// la formulación two-force derivada y la viga-columna birrotulada literal dan
// el mismo resultado en este solver.
//
// Codex objetó que la equivalencia es exacta en aritmética exacta pero este
// solver NO condensa: resuelve el sistema aumentado con términos EI/L³, EI/L²,
// EI/L, y con perfiles muy esbeltos el condicionamiento podría degradarse.
//
// Comprobación analítica previa (por si el número engaña). Filas de M=0 de los
// dos extremos liberados, en ejes locales [v_i, θ_i, v_j, θ_j]:
//     6EI/L²(v_i−v_j) + 4EI/L θ_i + 2EI/L θ_j = 0
//     6EI/L²(v_i−v_j) + 2EI/L θ_i + 4EI/L θ_j = 0
//   restando ⇒ θ_i = θ_j = θ ;  sustituyendo ⇒ θ = −(v_i−v_j)/L
//   y en la fila de v_i:  12EI/L³(v_i−v_j) + 6EI/L²(2θ) = 0  EXACTO.
// La rigidez transversal se anula sola: solo queda EA/L. Así que lo único que
// este test puede detectar es pérdida numérica, no un modelo distinto.
//
// Desde la Fase 2 la comparación vive en el nivel del ANÁLISIS: decompose
// deriva 'two-force' y aquí se fuerza la variante birrotulada volteando los
// elementos derivados — mismo modelo, mismas cargas, otra formulación. El
// barrido va con selfWeight:false (con él encendido el reparto de cargas
// también cambia y se medirían dos cosas a la vez); la regla del peso propio
// se testea aparte, abajo, contra la derivación REAL.

import { describe, expect, it } from 'vitest';
import {
  beamColumn,
  fem2dModel,
  memberUdl,
  node2d,
  nodeLoad,
  support2d,
  twoForce,
} from '../../features/fem2d/builder';
import { decompose2D, memberFormulation } from '../../features/fem2d/decompose';
import { solveFem2D } from '../../features/fem2d/pipeline';
import { solveAnalysis2D } from '../../features/fem2d/solver2d';
import type { Analysis2DModel } from '../../features/fem2d/analysis';
import { prattTrussTemplate } from '../../features/fem2d/templates';
import type { Fem2DModel } from '../../features/fem2d/types';

/** Criterio de aceptación del design doc: error RELATIVO A LA NORMA MÁXIMA del
 *  vector (nunca componente a componente: una celosía simétrica tiene
 *  componentes exactamente 0 y 0/0 haría fallar el spike por puro ruido). */
const TOL = 1e-6;

// ── Variante birrotulada (a nivel de análisis) ──────────────────────────────

/** Voltea todo elemento two-force DERIVADO a viga-columna birrotulada: mismas
 *  cargas, misma geometría, otra formulación. Es la transformación exacta que
 *  la derivación de decompose da por equivalente. */
function releasedAnalysis(analysis: Analysis2DModel): Analysis2DModel {
  return {
    ...analysis,
    elements: analysis.elements.map((el) =>
      el.elementType === 'two-force'
        ? { ...el, elementType: 'beam-column' as const, releaseI: true, releaseJ: true }
        : el,
    ),
  };
}

// ── Métrica ─────────────────────────────────────────────────────────────────

function relNorm(a: number[], b: number[]): number {
  expect(a.length).toBe(b.length);
  if (a.length === 0) return 0;
  let maxAbs = 0;
  let maxDiff = 0;
  for (let k = 0; k < a.length; k++) {
    maxAbs = Math.max(maxAbs, Math.abs(a[k]));
    maxDiff = Math.max(maxDiff, Math.abs(a[k] - b[k]));
  }
  // Vector idénticamente nulo en las dos variantes ⇒ diferencia relativa 0.
  return maxAbs === 0 ? maxDiff : maxDiff / maxAbs;
}

interface Vectors {
  N: number[];
  disp: number[];
  reac: number[];
}

/** Aplana el bundle en tres vectores comparables. Los ids de elemento son
 *  `${memberId}_e${k}` y los ids de barra no cambian entre variantes, así que
 *  el orden es el mismo — se ordena igualmente para no depender de ello. */
function vectors(analysis: Analysis2DModel): { v: Vectors; errors: string[] } {
  const r = solveAnalysis2D(analysis, { samplesPerElement: 5 });
  const errors = r.errors.filter((e) => e.severity === 'fail').map((e) => e.code);

  const N: number[] = [];
  for (const el of [...r.elements].sort((a, b) => a.elementId.localeCompare(b.elementId))) {
    for (const lc of Object.keys(el.samples.N).sort()) N.push(...el.samples.N[lc]);
  }

  const disp: number[] = [];
  for (const lc of Object.keys(r.displacementsByLc).sort()) {
    const byNode = r.displacementsByLc[lc];
    for (const id of Object.keys(byNode).sort()) {
      disp.push(byNode[id].ux, byNode[id].uy);
      // θ NO se compara: la biela no asigna GDL de giro donde la birrotulada
      // sí puede tener uno privado. Es una diferencia de contabilidad de GDL,
      // no de resultado — y los giros privados de una rótula no son un
      // resultado que la app muestre en ningún sitio.
    }
  }

  const reac: number[] = [];
  for (const lc of Object.keys(r.reactionsByLc).sort()) {
    for (const q of [...r.reactionsByLc[lc]].sort((a, b) => a.node.localeCompare(b.node))) {
      reac.push(q.Rx, q.Ry, q.Mr);
    }
  }

  return { v: { N, disp, reac }, errors };
}

// ── Barrido ─────────────────────────────────────────────────────────────────

const SPANS = [4, 6, 8, 12, 16, 20, 25, 30];
const HEIGHTS = [0.5, 0.8, 1.2, 1.5, 2, 3, 5];
const PANELS = [4, 6, 8, 10, 12];

function prattCase(span: number, height: number, nPanels: number): Fem2DModel {
  const model = prattTrussTemplate.build({
    ...prattTrussTemplate.defaults(),
    span,
    height,
    nPanels,
    webProfileKey: 'steel_L80x8', // el perfil esbelto de la objeción de Codex
  });
  // Peso propio APAGADO: ver cabecera. Con él encendido no compararíamos
  // formulaciones sino modelos de carga distintos.
  return { ...model, selfWeight: false };
}

/** Análisis derivado + su variante birrotulada, con guardas de decompose. */
function bothVariants(model: Fem2DModel): { base: Analysis2DModel; rel: Analysis2DModel } {
  const { analysis, errors } = decompose2D(model);
  expect(errors.filter((e) => e.severity === 'fail')).toEqual([]);
  // Premisa: la derivación produjo elementos two-force que voltear.
  expect(analysis.elements.some((el) => el.elementType === 'two-force')).toBe(true);
  return { base: analysis, rel: releasedAnalysis(analysis) };
}

describe('Fase 0 — biela vs viga-columna birrotulada (equivalencia numérica)', () => {
  it('la rigidez transversal de una birrotulada se anula: mismo N, δ y reacciones en TODO el barrido', () => {
    let worstN = 0;
    let worstD = 0;
    let worstR = 0;
    let worstCase = '';
    let cases = 0;
    let samplesCompared = 0;

    for (const span of SPANS) {
      for (const height of HEIGHTS) {
        for (const nPanels of PANELS) {
          // Panel muy corto frente al canto no es una Pratt razonable, pero se
          // deja entrar a propósito: son los casos peor condicionados.
          const { base, rel } = bothVariants(prattCase(span, height, nPanels));

          const a = vectors(base);
          const b = vectors(rel);

          expect(a.errors, `two-force ${span}/${height}/${nPanels}`).toEqual([]);
          expect(b.errors, `birrotulada ${span}/${height}/${nPanels}`).toEqual([]);

          // Guarda anti-vacío: comparar dos vectores vacíos también "pasa".
          // Sin esto el barrido entero sería un placebo.
          expect(a.v.N.length).toBeGreaterThan(0);
          expect(a.v.disp.length).toBeGreaterThan(0);
          expect(a.v.reac.length).toBeGreaterThan(0);
          expect(a.v.N.some((x) => Math.abs(x) > 1e-3)).toBe(true);
          expect(a.v.disp.some((x) => Math.abs(x) > 1e-9)).toBe(true);
          samplesCompared += a.v.N.length + a.v.disp.length + a.v.reac.length;

          const dN = relNorm(a.v.N, b.v.N);
          const dD = relNorm(a.v.disp, b.v.disp);
          const dR = relNorm(a.v.reac, b.v.reac);
          if (Math.max(dN, dD, dR) > Math.max(worstN, worstD, worstR)) {
            worstCase = `L=${span} h=${height} n=${nPanels}`;
          }
          worstN = Math.max(worstN, dN);
          worstD = Math.max(worstD, dD);
          worstR = Math.max(worstR, dR);
          cases++;
        }
      }
    }

    // Reportado como fallo intencionado si se quiere ver el número: el log de
    // vitest se traga los console.log en modo run, así que el resumen viaja en
    // el mensaje de la aserción, que sí se imprime cuando falla.
    const resumen =
      `[Fase 0] ${cases} casos · ${samplesCompared} valores comparados · ` +
      `peor N=${worstN.toExponential(2)} δ=${worstD.toExponential(2)} ` +
      `R=${worstR.toExponential(2)} (${worstCase})`;
     
    console.log(resumen);
    expect(cases).toBe(SPANS.length * HEIGHTS.length * PANELS.length);

    expect(worstN, resumen).toBeLessThan(TOL);
    expect(worstD).toBeLessThan(TOL);
    expect(worstR).toBeLessThan(TOL);
  });

  it('el caso más esbelto posible (L 80×8, panel 7.5 m, canto 0.5 m) tampoco se degrada', () => {
    const { base, rel } = bothVariants(prattCase(30, 0.5, 4));
    const a = vectors(base);
    const b = vectors(rel);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(relNorm(a.v.N, b.v.N)).toBeLessThan(TOL);
    expect(relNorm(a.v.disp, b.v.disp)).toBeLessThan(TOL);
  });
});

// ── Coste: GDL y tiempo de resolución en el tope de modelo ──────────────────
//
// El diseño acotaba el peor caso en 360 GDL (60·2 translacionales + 2 giros
// privados por cada una de las 120 barras, sin ningún θ compartido porque todos
// los extremos estarían liberados). Una celosía REAL no llega ahí: sus cordones
// son viga-columna sin rótula, así que además hay un θ compartido por nudo.
// Cuenta exacta de la Pratt de 30 paneles (60 nudos = tope, 117 barras):
//     biela        → 120 traslación + 60 θ compartidos              = 180 GDL
//     birrotulada  → 120 traslación + 60 θ compartidos + 118 privados = 298 GDL
// (59 barras de alma × 2 giros privados = 118.)

/** Pratt de n paneles construida a mano: la plantilla topa en 12 paneles por
 *  validate, y para medir el tope del modelo hacen falta 30. Misma topología
 *  que prattTrussTemplate — si esa cambia, esta hay que revisarla. */
function bigPratt(n: number, span: number, height: number): Fem2DModel {
  const panel = span / n;
  const web = { profileKey: 'steel_L80x8', steel: 'S275' as const };
  const chord = { profileKey: 'steel_IPE200', steel: 'S275' as const };

  const nodes = [
    ...Array.from({ length: n + 1 }, (_, i) => node2d(`b${i}`, i * panel, 0)),
    ...Array.from({ length: n - 1 }, (_, k) => node2d(`t${k + 1}`, (k + 1) * panel, height)),
  ];

  const members = [
    ...Array.from({ length: n }, (_, k) =>
      beamColumn(`ci${k + 1}`, `b${k}`, `b${k + 1}`, { steelSelection: { ...chord } }),
    ),
    ...Array.from({ length: n - 2 }, (_, k) =>
      beamColumn(`cs${k + 1}`, `t${k + 1}`, `t${k + 2}`, { steelSelection: { ...chord } }),
    ),
  ];
  const diagonals: Array<[string, string]> = [['b0', 't1']];
  for (let i = 1; i <= n / 2 - 1; i++) diagonals.push([`t${i}`, `b${i + 1}`]);
  for (let i = n / 2 + 1; i <= n - 1; i++) diagonals.push([`t${i}`, `b${i - 1}`]);
  diagonals.push([`t${n - 1}`, `b${n}`]);
  diagonals.forEach(([i, j], k) =>
    members.push(twoForce(`d${k + 1}`, i, j, { steelSelection: { ...web } })),
  );
  for (let i = 1; i <= n - 1; i++) {
    members.push(twoForce(`m${i}`, `b${i}`, `t${i}`, { steelSelection: { ...web } }));
  }

  const loads = [
    ...Array.from({ length: n - 2 }, (_, k) =>
      memberUdl(`u${k}`, `cs${k + 1}`, { lc: 'G' as const, wy: -3 }),
    ),
    nodeLoad('nl1', 't1', { lc: 'Q', useCategory: 'G1', Fy: -5 }),
    nodeLoad('nl2', `t${n - 1}`, { lc: 'Q', useCategory: 'G1', Fy: -5 }),
  ];

  return fem2dModel({
    templateId: 'custom',
    selfWeight: false,
    nodes,
    members,
    supports: [support2d('b0', 'pinned'), support2d(`b${n}`, 'roller')],
    loads,
  });
}

describe('Fase 0 — coste en el tope de modelo', () => {
  it('la birrotulada resuelve dentro de presupuesto con 60 nudos y 117 barras', () => {
    const model = bigPratt(30, 45, 2.5);
    expect(model.nodes.length).toBe(60); // FEM2D_MAX_NODES
    expect(model.members.length).toBe(117); // ≤ FEM2D_MAX_MEMBERS (120)
    const { base, rel } = bothVariants(model);

    // Muestreo INTERCALADO con MEDIANA, no media de una tanda seguida.
    //
    // Con la media, UNA sola pasada contaminada de diez (una pausa del GC, otro
    // job del runner compartido) arrastra el resultado: en CI se vio saltar la
    // birrotulada de 24 a 46 ms con la biela intacta en 4.1 ms → ×11.3 y test
    // en rojo, sin regresión ninguna (el techo absoluto de 250 ms ni se
    // acercó). La mediana descarta esa muestra en vez de promediarla, y
    // alternar A/B evita que una deriva del runner —turbo que decae, otro job
    // arrancando— castigue siempre a la serie que se mida en segundo lugar.
    const once = (analysis: Analysis2DModel): number => {
      const t0 = performance.now();
      solveAnalysis2D(analysis, { samplesPerElement: 41 });
      return performance.now() - t0;
    };
    const median = (xs: number[]): number =>
      [...xs].sort((p, q) => p - q)[(xs.length - 1) >> 1]; // nº impar de muestras

    const a = solveAnalysis2D(base, { samplesPerElement: 41 });
    const b = solveAnalysis2D(rel, { samplesPerElement: 41 });
    expect(a.errors.filter((e) => e.severity === 'fail')).toEqual([]);
    expect(b.errors.filter((e) => e.severity === 'fail')).toEqual([]);
    // La equivalencia también se sostiene en el tope, no solo en el barrido.
    expect(relNorm(vectors(base).v.N, vectors(rel).v.N)).toBeLessThan(TOL);

    // Precalentado: las primeras pasadas pagan el JIT y falsearían la medida.
    for (let k = 0; k < 3; k++) { once(base); once(rel); }
    const SAMPLES = 11;
    const sA: number[] = [];
    const sB: number[] = [];
    for (let k = 0; k < SAMPLES; k++) { sA.push(once(base)); sB.push(once(rel)); }

    const tA = median(sA);
    const tB = median(sB);
    const ratio = tB / tA;
    const msg =
      `[Fase 0 coste] mediana de ${SAMPLES}: biela ${tA.toFixed(1)} ms · ` +
      `birrotulada ${tB.toFixed(1)} ms · ×${ratio.toFixed(2)} (180 → 298 GDL)`;
     
    console.log(msg);

    // El criterio del design doc era "< 50 ms". Medido en la máquina de
    // desarrollo: 28.9 ms — pasa, pero con 1.7× de margen, así que fijarlo en
    // 50 ms haría parpadear el test en cualquier runner más lento. Lo que se
    // fija aquí es la RELACIÓN, que es independiente de la máquina: Gauss denso
    // es O(n³) y 298/180 predice ×4.5, así que cualquier cosa por debajo de ×10
    // confirma que el sobrecoste es el esperado y no algo patológico.
    expect(ratio, msg).toBeLessThan(10);
    // Y un techo absoluto muy holgado, solo para cazar una regresión gruesa.
    expect(tB, msg).toBeLessThan(250);
  });
});

// ── La regla del peso propio, contra la derivación REAL (Fase 0 → paso 4) ────

describe('Fase 2 — el peso propio NO cuenta como carga de barra en la derivación', () => {
  it('con selfWeight:true el montante sigue siendo biela (M = 0); una carga explícita lo hace flectar', () => {
    const withSw = prattTrussTemplate.build(prattTrussTemplate.defaults());
    expect(withSw.selfWeight).toBe(true);
    const m1 = withSw.members.find((m) => m.id === 'm1')!;
    // Regla de Fase 0 (Resultado 3), ya en producción: el peso propio se
    // agrupa mitad en cada nudo y NO convierte la barra a viga-columna — si lo
    // hiciera, toda celosía con peso propio pagaría los 298 GDL.
    expect(memberFormulation(withSw, m1)).toBe('two-force');

    const a = solveFem2D(withSw, { samplesPerElement: 21 });
    expect(a.errors.filter((e) => e.severity === 'fail')).toEqual([]);
    const mOf = (r: typeof a, memberId: string): number => {
      const el = r.elements.find((e) => e.designMemberId === memberId);
      if (!el) throw new Error(`sin elemento para ${memberId}`);
      return Math.max(...Object.values(el.samples.M).flat().map(Math.abs));
    };
    expect(mOf(a, 'm1')).toBeCloseTo(0, 12);

    // Una carga EXPLÍCITA del usuario sí cuenta: la barra pasa a viga-columna
    // birrotulada y FLECTA — el problema con el que se abrió el design doc.
    const loaded: Fem2DModel = {
      ...withSw,
      loads: [...withSw.loads, memberUdl('lx', 'm1', { lc: 'G', wy: -1 })],
    };
    expect(memberFormulation(loaded, loaded.members.find((m) => m.id === 'm1')!)).toBe('beam-column');
    const b = solveFem2D(loaded, { samplesPerElement: 21 });
    expect(b.errors.filter((e) => e.severity === 'fail')).toEqual([]);
    expect(mOf(b, 'm1')).toBeGreaterThan(0);
  });
});

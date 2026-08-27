// Tests de la cadena de fuerzas de la NCSE-02 (art. 3.7).
//
// Ubicación: proyecto `unit`, no `golden`. El design doc proponía
// `ncse02.golden.test.ts`, pero `tsconfig.app.json` EXCLUYE `**/*.golden.test.ts`
// del typecheck: ese proyecto existe porque Pyodide no arranca en jsdom, no como
// marca de "test de paridad". Aquí es matemática pura, así que va al proyecto
// normal y se typechequea, que es lo que interesa en el test más importante.

import { describe, expect, it } from "vitest";
import {
  COEF_TERRENO,
  FRACCION_MASA,
  amplificacionTerreno,
  calcularModo,
  calcularSismo,
  coefRespuesta,
  coefTerrenoPonderado,
  combinarSRSS,
  combinacionesDireccionales,
  elasticSpectrum,
  factorAmortiguamiento,
  factorDistribucion,
  formaModal,
  fuerzasPorPlanta,
  gammaTorsion,
  longitudExtrema,
  numeroModos,
  participacionModal,
  periodoFundamental,
  periodoModo,
  pesoSismicoPlanta,
  repartoPorElemento,
  resolverEmplazamiento,
  staticForceAlpha,
} from "../../lib/codes/seismic/ncse02";
import type {
  ElementoResistente,
  Estrato,
  PlantaResuelta,
  TipoTerreno,
} from "../../lib/codes/seismic/types";
import {
  CASO_GRANADA,
  CASO_MODOS,
  CASO_SISMO_ISA,
  CASO_TORSION_ISA,
  TF_FORMULAS_MODOS_XLSX,
  TOL_HOJA,
  TOL_NORMA,
} from "../fixtures/ncse02.fixtures";

// ── utilidades ───────────────────────────────────────────────────────────────

function cerca(got: number, exp: number, tol: number, ctx: string): void {
  const d = Math.abs(got - exp);
  const rel = Math.abs(exp) > 1e-12 ? d / Math.abs(exp) : d;
  expect(rel, `${ctx}: obtenido ${got}, esperado ${exp}`).toBeLessThan(tol);
}

function cercaArr(
  got: number[],
  exp: number[],
  tol: number,
  ctx: string,
): void {
  expect(got.length, `${ctx} · longitud`).toBe(exp.length);
  got.forEach((v, i) => cerca(v, exp[i], tol, `${ctx}[${i}]`));
}

/** Devuelve el tipo tabulado si C coincide; si no, un estrato único de 30 m. */
function terrenoDeC(C: number): TipoTerreno | Estrato[] {
  const tipo = (Object.keys(COEF_TERRENO) as TipoTerreno[]).find(
    (t) => COEF_TERRENO[t] === C,
  );
  return tipo ?? [{ C, espesor: 30 }];
}

type Caso = typeof CASO_MODOS | typeof CASO_SISMO_ISA | typeof CASO_GRANADA;

/** Pasa un fixture por la cadena, con su T_F y su nº de modos forzados. */
function correr(caso: Caso) {
  const e = caso.entrada;
  const emp = resolverEmplazamiento({
    ab: e.ab,
    K: e.K,
    importancia: e.rho === 1.3 ? "especial" : "normal",
    terreno: terrenoDeC(e.C),
  });
  const nu = factorAmortiguamiento(e.omega);
  const beta = coefRespuesta(nu, e.mu);
  const plantas: PlantaResuelta[] = e.h.map((h, i) => ({ h, P: e.P[i] }));
  const H = Math.max(...e.h);
  const modos = [];
  for (let i = 1; i <= e.nModos; i++) {
    modos.push(calcularModo(i, e.TF, plantas, H, emp.ac, beta, emp.TB));
  }
  const Vk = combinarSRSS(modos.map((m) => m.V));
  return { emp, nu, beta, plantas, H, modos, Vk, Fk: fuerzasPorPlanta(Vk) };
}

// ═════════════════════════════════════════════════════════════════════════════
// Emplazamiento (cap. 2)
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 cap. 2 · amplificación del terreno", () => {
  it("aplica C/1,25 cuando rho·ab <= 0,1 g", () => {
    expect(amplificacionTerreno(1.6, 1.0, 0.08)).toBeCloseTo(1.28, 12);
    expect(amplificacionTerreno(1.6, 1.0, 0.1)).toBeCloseTo(1.28, 12);
  });

  it("aplica S = 1,0 cuando rho·ab >= 0,4 g", () => {
    expect(amplificacionTerreno(2.0, 1.0, 0.4)).toBe(1.0);
    expect(amplificacionTerreno(1.0, 1.3, 0.35)).toBe(1.0);
  });

  it("en el tramo intermedio el corrector RESTA si C > 1,25", () => {
    // Es la trampa de signo: (1 − C/1,25) es negativo. Un error de unidades ahí
    // no falla ruidosamente, cambia el signo de la corrección.
    const S = amplificacionTerreno(1.3, 1.0, 0.23);
    expect(S).toBeLessThan(1.3 / 1.25);
    cerca(S, 1.022684, TOL_NORMA, "S terreno II con ab = 0,23");
  });

  it("en el tramo intermedio el corrector SUMA si C < 1,25", () => {
    const S = amplificacionTerreno(1.0, 1.0, 0.23);
    expect(S).toBeGreaterThan(1.0 / 1.25);
  });

  it("no divide ab entre g: es el fallo de Sismo_ISA.xlsx", () => {
    // Q12 de la hoja divide rho·ab entre 9,8116 con ab ya en unidades de g, y
    // deja S un 2,69% alta. Si alguien "arregla" el motor para que coincida con
    // la hoja, este test lo caza.
    const correcta = amplificacionTerreno(1.3, 1.0, 0.23);
    const deLaHoja = CASO_SISMO_ISA.hoja.S;
    expect(correcta).not.toBeCloseTo(deLaHoja, 4);
    cerca(
      deLaHoja / correcta,
      CASO_SISMO_ISA.hoja.factorError,
      TOL_NORMA,
      "factor de error de la hoja",
    );
  });
});

describe("NCSE-02 art. 2.4 · coeficiente del terreno por estratos", () => {
  it("pondera en los 30 m superiores", () => {
    const C = coefTerrenoPonderado([
      { C: 1.0, espesor: 10 },
      { C: 1.6, espesor: 20 },
    ]);
    cerca(C, (1.0 * 10 + 1.6 * 20) / 30, TOL_NORMA, "C ponderado");
  });

  it("ignora lo que pase de 30 m", () => {
    const a = coefTerrenoPonderado([{ C: 1.3, espesor: 100 }]);
    expect(a).toBeCloseTo(1.3, 12);
  });

  it("prolonga el último estrato si el perfil no llega a 30 m", () => {
    // Dejar el hueco a cero daría un C artificialmente bajo, que es el lado
    // inseguro: S más pequeña, fuerzas más pequeñas.
    const C = coefTerrenoPonderado([{ C: 2.0, espesor: 5 }]);
    expect(C).toBeCloseTo(2.0, 12);
  });

  it("no rompe con un perfil vacío", () => {
    expect(coefTerrenoPonderado([])).toBe(COEF_TERRENO.I);
  });
});

describe("NCSE-02 cap. 2 · períodos característicos y rho", () => {
  it("T_A = K·C/10 y T_B = K·C/2,5", () => {
    const e = resolverEmplazamiento({
      ab: 0.23,
      K: 1.0,
      importancia: "normal",
      terreno: "II",
    });
    cerca(e.TA, 0.13, TOL_NORMA, "T_A");
    cerca(e.TB, 0.52, TOL_NORMA, "T_B");
    expect(e.TB / e.TA).toBeCloseTo(4, 12);
  });

  it("rho vale 1,3 en importancia especial y 1,0 en el resto", () => {
    const esp = resolverEmplazamiento({
      ab: 0.1,
      K: 1,
      importancia: "especial",
      terreno: "I",
    });
    expect(esp.rho).toBe(1.3);
    cerca(esp.ac, esp.S * 1.3 * 0.1, TOL_NORMA, "ac especial");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Masas (art. 3.2)
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 3.2 · masa sísmica", () => {
  it("cuenta el peso propio y las permanentes al 100%", () => {
    expect(FRACCION_MASA.permanente).toBe(1.0);
    expect(FRACCION_MASA.tabiqueria).toBe(1.0);
    expect(FRACCION_MASA["uso-almacen"]).toBe(1.0);
    expect(FRACCION_MASA.agua).toBe(1.0);
  });

  it("fracciona las sobrecargas de uso según la categoría", () => {
    expect(FRACCION_MASA["uso-residencial"]).toBe(0.5);
    expect(FRACCION_MASA["uso-publico"]).toBe(0.6);
    expect(FRACCION_MASA["uso-aglomeracion"]).toBe(0.6);
    expect(FRACCION_MASA["nieve-persistente"]).toBe(0.5);
  });

  it("reproduce el desglose de la planta tipo del caso de Granada", () => {
    const t = CASO_GRANADA.cargas.tipo;
    const P = pesoSismicoPlanta({
      h: 3,
      area: CASO_GRANADA.cargas.area,
      componentes: [
        { categoria: "permanente", q: t.pesoPropio },
        { categoria: "permanente", q: t.permanente },
        { categoria: "tabiqueria", q: t.tabiqueria },
        { categoria: "uso-residencial", q: t.uso },
      ],
    });
    expect(P).toBe(CASO_GRANADA.entrada.P[0]);
  });

  it("respeta la exclusión de sobrecarga del art. 3.2", () => {
    const c = CASO_GRANADA.cargas.cubierta;
    const P = pesoSismicoPlanta({
      h: 30,
      area: CASO_GRANADA.cargas.area,
      componentes: [
        { categoria: "permanente", q: c.pesoPropio },
        { categoria: "permanente", q: c.permanente },
        { categoria: "uso-residencial", q: c.usoExcluida, excluida: true },
      ],
    });
    expect(P).toBe(CASO_GRANADA.entrada.P[9]);
  });

  it("el P explícito manda sobre el asistente de superficie", () => {
    const P = pesoSismicoPlanta({
      h: 3,
      area: 300,
      componentes: [{ categoria: "permanente", q: 8 }],
      P: 1234,
    });
    expect(P).toBe(1234);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Período fundamental y modos
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 3.7.2.2 · las cinco expresiones de T_F", () => {
  const g = TF_FORMULAS_MODOS_XLSX.entrada;
  const e = TF_FORMULAS_MODOS_XLSX.esperado;

  it("(1) muros de fábrica, con el /sqrt(L)", () => {
    cerca(periodoFundamental("fabrica", g)!, e.fabrica, TOL_NORMA, "T_F fábrica");
  });

  it("(2) pórticos de HA sin pantallas: 0,09·n", () => {
    cerca(periodoFundamental("porticos-ha", g)!, e.porticosHA, TOL_NORMA, "T_F HA");
  });

  it("(3) pórticos de HA con pantallas", () => {
    cerca(
      periodoFundamental("porticos-ha-pantallas", g)!,
      e.porticosHAPantallas,
      TOL_NORMA,
      "T_F HA con pantallas",
    );
  });

  it("(4) pórticos rígidos de acero: 0,11·n", () => {
    cerca(
      periodoFundamental("porticos-acero", g)!,
      e.porticosAcero,
      TOL_NORMA,
      "T_F acero",
    );
  });

  it("(5) acero con planos triangulados", () => {
    cerca(
      periodoFundamental("acero-triangulado", g)!,
      e.aceroTriangulado,
      TOL_NORMA,
      "T_F acero triangulado",
    );
  });

  it("devuelve null en vez de inventarse un T_F", () => {
    // Sistemas sin expresión tabulada, y fábrica sin dimensión en planta.
    expect(periodoFundamental("otro", g)).toBeNull();
    expect(periodoFundamental("adobe", g)).toBeNull();
    expect(periodoFundamental("fabrica", { ...g, L: 0 })).toBeNull();
  });

  it("T_F de fábrica depende de la dirección, el de pórticos de HA no", () => {
    const enX = periodoFundamental("fabrica", { n: 4, H: 12, L: 20, B: 10 })!;
    const enY = periodoFundamental("fabrica", { n: 4, H: 12, L: 8, B: 10 })!;
    expect(enX).not.toBeCloseTo(enY, 6);
    expect(periodoFundamental("porticos-ha", { n: 4, H: 12, L: 20, B: 10 })).toBe(
      periodoFundamental("porticos-ha", { n: 4, H: 12, L: 8, B: 10 }),
    );
  });
});

describe("NCSE-02 art. 3.7.2.1 · número de modos y T_i", () => {
  it("reparte 1 / 2 / 3 modos por los umbrales de la Norma", () => {
    expect(numeroModos(0.5)).toBe(1);
    expect(numeroModos(0.75)).toBe(1);
    expect(numeroModos(0.751)).toBe(2);
    expect(numeroModos(1.25)).toBe(2);
    expect(numeroModos(1.251)).toBe(3);
  });

  it("T_i = T_F/(2i−1)", () => {
    cerca(periodoModo(0.9, 1), 0.9, TOL_NORMA, "T_1");
    cerca(periodoModo(0.9, 2), 0.3, TOL_NORMA, "T_2");
    cerca(periodoModo(0.9, 3), 0.18, TOL_NORMA, "T_3");
  });

  it("los períodos difieren siempre más de un 10%, que es lo que pide el SRSS", () => {
    // Art. 3.6.2.4. Con T_i = T_F/(2i−1) el cociente es 1/3 y 1/5: nunca falla.
    for (const TF of [0.3, 0.9, 1.4, 2.2]) {
      expect(periodoModo(TF, 2) / periodoModo(TF, 1)).toBeLessThan(0.9);
      expect(periodoModo(TF, 3) / periodoModo(TF, 2)).toBeLessThan(0.9);
    }
  });
});

describe("NCSE-02 art. 2.5 y 3.7.3.1 · amortiguamiento y ductilidad", () => {
  it("nu = 1 con el 5% de amortiguamiento", () => {
    expect(factorAmortiguamiento(5)).toBeCloseTo(1, 12);
  });

  it("nu crece por debajo del 5% y decrece por encima", () => {
    expect(factorAmortiguamiento(4)).toBeGreaterThan(1);
    expect(factorAmortiguamiento(6)).toBeLessThan(1);
  });

  it("beta = nu/mu", () => {
    cerca(coefRespuesta(1, 3), 1 / 3, TOL_NORMA, "beta");
    cerca(coefRespuesta(1.1, 4), 1.1 / 4, TOL_NORMA, "beta");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LAS DOS ALPHAS — el fallo silencioso más caro del módulo
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 · las dos alphas son funciones distintas", () => {
  const TA = 0.13;
  const TB = 0.52;

  it("coinciden en TODO el rango por encima de T_A", () => {
    for (let T = TA; T <= 3; T += 0.01) {
      cerca(
        elasticSpectrum(T, TA, TB),
        staticForceAlpha(T, TB),
        1e-12,
        `T = ${T.toFixed(2)}`,
      );
    }
  });

  it("difieren por debajo de T_A, y sólo ahí", () => {
    for (const T of [0.01, 0.05, 0.077, 0.1, 0.129]) {
      expect(elasticSpectrum(T, TA, TB)).toBeLessThan(2.5);
      expect(staticForceAlpha(T, TB)).toBe(2.5);
    }
  });

  it("la rama descendente coincide algebraicamente: 2,5·T_B/T = K·C/T", () => {
    const K = 1.0;
    const C = 1.3;
    for (const T of [0.6, 1.0, 2.0]) {
      cerca(staticForceAlpha(T, TB), (K * C) / T, 1e-12, `K·C/T en T = ${T}`);
    }
  });

  it("la fábrica achaparrada del design doc cae del lado que muerde", () => {
    const TF = periodoFundamental("fabrica", { n: 4, H: 12, L: 20, B: 10 })!;
    cerca(TF, 0.077341, 1e-4, "T_F fábrica achaparrada");
    expect(TF).toBeLessThan(TA);
    const est = elasticSpectrum(TF, TA, TB);
    const din = staticForceAlpha(TF, TB);
    cerca(est, 1.8923, 1e-3, "alpha elástico");
    expect(din).toBe(2.5);
    // Usar el elástico daría fuerzas un 24% bajas.
    expect(1 - est / din).toBeCloseTo(0.243, 3);
  });

  it("la fábrica esbelta cae del lado que NO muerde", () => {
    // Si sólo se probara el caso de debajo, nadie se enteraría de que la
    // función cableada está mal cuando el edificio es esbelto.
    const TF = periodoFundamental("fabrica", { n: 8, H: 24, L: 5, B: 10 })!;
    cerca(TF, 0.5411, 1e-3, "T_F fábrica esbelta");
    expect(TF).toBeGreaterThan(TA);
    cerca(
      elasticSpectrum(TF, TA, TB),
      staticForceAlpha(TF, TB),
      1e-12,
      "las dos alphas en la esbelta",
    );
  });
});

describe("NCSE-02 · la cadena usa la alpha de las FUERZAS, no la del dibujo", () => {
  // Test de extremo a extremo, no de unidad: comparar las dos funciones por
  // separado no protege de nada, porque alguien puede cablear la mala dentro de
  // s_ik y seguir pasando. Esto pasa un edificio entero por la cadena.
  const plantas: PlantaResuelta[] = [
    { h: 3, P: 1000 },
    { h: 6, P: 1000 },
    { h: 9, P: 1000 },
    { h: 12, P: 1000 },
  ];
  const emp = resolverEmplazamiento({
    ab: 0.23,
    K: 1.0,
    importancia: "normal",
    terreno: "II",
  });
  const beta = coefRespuesta(factorAmortiguamiento(5), 3);
  const TF = periodoFundamental("fabrica", { n: 4, H: 12, L: 20, B: 10 })!;

  it("la fábrica achaparrada se calcula con alpha = 2,5", () => {
    const modo = calcularModo(1, TF, plantas, 12, emp.ac, beta, emp.TB);
    expect(modo.alpha).toBe(2.5);
  });

  it("el cortante basal es el que corresponde a 2,5, no al espectro elástico", () => {
    const modo = calcularModo(1, TF, plantas, 12, emp.ac, beta, emp.TB);
    const basal = modo.V[0];
    // El mismo edificio, con la alpha equivocada: todo es lineal en alpha, así
    // que el cortante saldría multiplicado por el cociente de las dos.
    const conElastico = (basal * elasticSpectrum(TF, emp.TA, emp.TB)) / 2.5;
    expect(basal).toBeGreaterThan(conElastico);
    expect(conElastico / basal).toBeCloseTo(0.757, 3);
    // Y el valor absoluto, para que cablear la función mala rompa esto:
    const esperado = plantas.reduce(
      (a, p, k) => a + emp.ac * 2.5 * beta * modo.eta[k] * p.P,
      0,
    );
    cerca(basal, esperado, 1e-12, "cortante basal con alpha = 2,5");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Forma modal, distribución y participación
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 3.7.3 · forma modal y distribución", () => {
  it("Phi vale 1 en cubierta para el modo 1", () => {
    expect(formaModal(1, 30, 30)).toBeCloseTo(1, 12);
    expect(formaModal(1, 0, 30)).toBeCloseTo(0, 12);
  });

  it("los modos altos cambian de signo en altura", () => {
    expect(formaModal(2, 30, 30)).toBeCloseTo(-1, 12);
    expect(formaModal(3, 30, 30)).toBeCloseTo(1, 12);
  });

  it("eta es invariante al factor de escala de las masas", () => {
    // Por eso g no aparece en la cadena y se trabaja en kN de principio a fin.
    const Phi = [0.3, 0.6, 1.0];
    const P = [1000, 1000, 800];
    const enKN = factorDistribucion(Phi, P);
    const enKg = factorDistribucion(
      Phi,
      P.map((p) => (p * 1000) / 9.81),
    );
    cercaArr(enKg, enKN, 1e-12, "eta invariante a la escala");
  });

  it("no produce NaN si la suma de P·Phi² es cero", () => {
    const eta = factorDistribucion([0, 0], [1000, 1000]);
    expect(eta.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("la participación modal del caso de Granada es la esperada", () => {
    const { modos } = correr(CASO_GRANADA);
    modos.forEach((m, i) =>
      cerca(
        m.participacion,
        CASO_GRANADA.participacion[i],
        TOL_NORMA,
        `participación modo ${i + 1}`,
      ),
    );
    cerca(
      modos.reduce((a, m) => a + m.participacion, 0),
      0.9174030082460958,
      TOL_NORMA,
      "participación total",
    );
  });

  it("no produce NaN con masa total nula", () => {
    expect(participacionModal([1, 1], [0, 0])).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Los tres casos completos
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 · Modos.xlsx, oráculo de paridad con 3 modos y SRSS", () => {
  const r = correr(CASO_MODOS);
  const e = CASO_MODOS.esperado;

  it("reproduce el emplazamiento", () => {
    cerca(r.emp.S, e.S, TOL_NORMA, "S");
    cerca(r.emp.ac, e.ac, TOL_NORMA, "ac");
    cerca(r.emp.TA, e.TA, TOL_NORMA, "T_A");
    cerca(r.emp.TB, e.TB, TOL_NORMA, "T_B");
    cerca(r.beta, e.beta, TOL_NORMA, "beta");
  });

  it.each([0, 1, 2])("reproduce el modo %i+1 entero", (i) => {
    const got = r.modos[i];
    const exp = e.modos[i];
    cerca(got.T, exp.T, TOL_NORMA, `T modo ${i + 1}`);
    expect(got.alpha).toBe(exp.alpha);
    cercaArr(got.Phi, exp.Phi, TOL_NORMA, `Phi modo ${i + 1}`);
    cercaArr(got.eta, exp.eta, TOL_NORMA, `eta modo ${i + 1}`);
    cercaArr(got.s, exp.s, TOL_NORMA, `s modo ${i + 1}`);
    cercaArr(got.F, exp.F, TOL_NORMA, `F modo ${i + 1}`);
    cercaArr(got.V, exp.V, TOL_NORMA, `V modo ${i + 1}`);
  });

  it("el modo 3 cae por debajo de T_A y aun así usa alpha = 2,5", () => {
    expect(r.modos[2].T).toBeLessThan(r.emp.TA);
    expect(r.modos[2].alpha).toBe(2.5);
    // La alpha del dibujo daría 1,825 ahí.
    cerca(
      elasticSpectrum(r.modos[2].T, r.emp.TA, r.emp.TB),
      1.825,
      1e-12,
      "alpha elástica del modo 3",
    );
  });

  it("combina por SRSS y reparte en fuerzas de planta", () => {
    cercaArr(r.Vk, e.Vk, TOL_NORMA, "V_k");
    cercaArr(r.Fk, e.Fk, TOL_NORMA, "F_k");
  });

  it("coincide con los cortantes por modo que imprime la hoja", () => {
    CASO_MODOS.hoja.V.forEach((V, i) =>
      cercaArr(r.modos[i].V, V, TOL_HOJA, `V de la hoja, modo ${i + 1}`),
    );
  });
});

describe("NCSE-02 · Sismo_ISA.xlsx, entradas reales y salidas recalculadas", () => {
  const r = correr(CASO_SISMO_ISA);
  const e = CASO_SISMO_ISA.esperado;

  it("da los valores de la Norma, no los de la hoja", () => {
    cerca(r.emp.S, e.S, TOL_NORMA, "S");
    cerca(r.emp.ac, e.ac, TOL_NORMA, "ac");
    cercaArr(r.modos[0].F, e.modos[0].F, TOL_NORMA, "F_1k");
    cercaArr(r.Vk, e.Vk, TOL_NORMA, "V_k");
  });

  it("diverge de la hoja exactamente en su error de unidades", () => {
    // No se afirma paridad: se afirma la divergencia y su causa, para que nadie
    // ajuste el motor hasta hacerlo coincidir con una hoja equivocada.
    const f = CASO_SISMO_ISA.hoja.factorError;
    // S es un numero puro de la hoja frente a uno calculado: no hay pi de por
    // medio y la razon sale exacta.
    cerca(CASO_SISMO_ISA.hoja.S / r.emp.S, f, TOL_NORMA, "factor en S");
    // Los F_1k de la hoja arrastran ADEMAS su pi truncado (3,1416) a traves de
    // Phi, asi que el cociente no es exactamente el factor de S: se desvia otro
    // ~1e-6. Por eso aqui la tolerancia es la de las hojas, no la de la Norma.
    CASO_SISMO_ISA.hoja.F.forEach((F, k) =>
      cerca(F / r.modos[0].F[k], f, TOL_HOJA, `factor en F_1k[${k}]`),
    );
  });

  it("el cortante basal es la suma de las fuerzas de planta, no s·P_total", () => {
    // La hoja llama "cortante basal" a J96 = s·P_total, que es un 12,6% mayor
    // porque supone el 100% de participación. El de verdad es la suma de F.
    const basal = r.Vk[0];
    cerca(
      basal,
      r.modos[0].F.reduce((a, b) => a + b, 0),
      1e-12,
      "cortante basal",
    );
    const Ptot = CASO_SISMO_ISA.entrada.P.reduce((a, b) => a + b, 0);
    const sPorPesoTotal = r.emp.ac * 2.5 * r.beta * Ptot;
    // O104 de la hoja arrastra su pi truncado igual que los F_1k.
    cerca(
      basal / sPorPesoTotal,
      CASO_SISMO_ISA.hoja.participacionModal,
      TOL_HOJA,
      "cociente = participación modal",
    );
  });
});

describe("NCSE-02 · Granada, la rama descendente de alpha", () => {
  const r = correr(CASO_GRANADA);
  const e = CASO_GRANADA.esperado;

  it("el modo 1 cae por encima de T_B y usa 2,5·T_B/T_i", () => {
    // Ninguno de los dos Excel ejercita esta rama: sus cinco períodos caen por
    // debajo de T_B. Este caso es el único que la toca.
    expect(r.modos[0].T).toBeGreaterThan(r.emp.TB);
    cerca(r.modos[0].alpha, e.modos[0].alpha, TOL_NORMA, "alpha modo 1");
    expect(r.modos[0].alpha).toBeLessThan(2.5);
    cerca(
      r.modos[0].alpha,
      (2.5 * r.emp.TB) / r.modos[0].T,
      1e-12,
      "alpha = 2,5·T_B/T_1",
    );
  });

  it("el modo 2 cae en el tramo plano", () => {
    expect(r.modos[1].T).toBeGreaterThan(r.emp.TA);
    expect(r.modos[1].T).toBeLessThan(r.emp.TB);
    expect(r.modos[1].alpha).toBe(2.5);
  });

  it("reproduce los dos modos y el SRSS", () => {
    r.modos.forEach((m, i) => {
      cercaArr(m.Phi, e.modos[i].Phi, TOL_NORMA, `Phi modo ${i + 1}`);
      cercaArr(m.eta, e.modos[i].eta, TOL_NORMA, `eta modo ${i + 1}`);
      cercaArr(m.F, e.modos[i].F, TOL_NORMA, `F modo ${i + 1}`);
      cercaArr(m.V, e.modos[i].V, TOL_NORMA, `V modo ${i + 1}`);
    });
    cercaArr(r.Vk, e.Vk, TOL_NORMA, "V_k");
    cercaArr(r.Fk, e.Fk, TOL_NORMA, "F_k");
  });

  it("T_F sale de 0,09·n y no es 0,9 exacto en coma flotante", () => {
    const TF = periodoFundamental("porticos-ha", { n: 10, H: 30, L: 20, B: 15 })!;
    expect(TF).toBe(CASO_GRANADA.entrada.TF);
    expect(TF).not.toBe(0.9);
    expect(numeroModos(TF)).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SRSS, fuerzas de planta, torsión y reparto
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 3.7.4 · SRSS y fuerzas de planta", () => {
  it("con un solo modo el SRSS es la identidad en valor absoluto", () => {
    expect(combinarSRSS([[3, -4]])).toEqual([3, 4]);
  });

  it("aplica V_(n+1) = 0 en la última planta", () => {
    const Fk = fuerzasPorPlanta([100, 60, 25]);
    expect(Fk[2]).toBe(25);
  });

  it("la suma de F_k reconstruye el cortante basal", () => {
    const Vk = CASO_GRANADA.esperado.Vk;
    const suma = fuerzasPorPlanta(Vk).reduce((a, b) => a + b, 0);
    cerca(suma, Vk[0], 1e-12, "suma de F_k");
  });

  it("NO recorta a cero una F_k negativa", () => {
    // El SRSS destruye el signo: el perfil combinado no tiene por qué ser
    // monótono. Es resultado legítimo, no un bug que haya que tapar.
    const Fk = fuerzasPorPlanta([100, 120, 50]);
    expect(Fk[0]).toBeLessThan(0);
    expect(Fk[0]).toBe(-20);
  });

  it("no rompe sin modos", () => {
    expect(combinarSRSS([])).toEqual([]);
  });
});

describe("NCSE-02 art. 3.7.5 · torsión", () => {
  it("reproduce los gamma_a de Sismo_ISA.xlsx", () => {
    for (const dir of [
      CASO_TORSION_ISA.longitudinal,
      CASO_TORSION_ISA.transversal,
    ]) {
      dir.x.forEach((x, j) =>
        cerca(gammaTorsion(x, dir.Le), dir.gamma[j], TOL_NORMA, `gamma x=${x}`),
      );
    }
  });

  it("usa el valor absoluto de x, pero sólo aquí", () => {
    expect(gammaTorsion(-9, 18)).toBe(gammaTorsion(9, 18));
    expect(gammaTorsion(0, 18)).toBe(1);
  });

  it("vale 1,3 justo en el plano extremo, |x| = L_e/2", () => {
    expect(gammaTorsion(9, 18)).toBeCloseTo(1.3, 12);
  });

  it("y SÍ pasa de 1,3 cuando el centro de rigidez no está centrado", () => {
    // El título anterior decía "no puede pasar de 1,3, porque |x| <= L_e/2", y
    // eso es falso: `x` se mide respecto al CENTRO DE TORSIÓN, no respecto al
    // punto medio de los planos extremos. Con un reparto asimétrico de
    // rigideces el centro se desplaza y el plano de un extremo queda a más de
    // L_e/2. El propio fixture ISA lo enseña: 1,3014.
    //
    // Que el invariante fuera falso no era grave por sí solo —el motor calcula
    // bien—, pero un test que afirma un invariante inexistente es peor que no
    // tenerlo: invita a "corregir" el motor hacia el tope equivocado.
    expect(gammaTorsion(9.01, 18)).toBeGreaterThan(1.3);
  });

  it("con L_e = 0 no aplica torsión en vez de dividir por cero", () => {
    expect(gammaTorsion(5, 0)).toBe(1);
    expect(Number.isFinite(gammaTorsion(5, 0))).toBe(true);
  });

  it("L_e sale de los dos elementos más extremos", () => {
    const els: ElementoResistente[] = [
      { id: "a", x: -10, k: 1 },
      { id: "b", x: 0, k: 1 },
      { id: "c", x: 10, k: 1 },
    ];
    expect(longitudExtrema(els)).toBe(20);
    expect(longitudExtrema([els[0]])).toBe(0);
    expect(longitudExtrema([])).toBe(0);
  });
});

describe("NCSE-02 art. 3.7.4 · reparto entre elementos resistentes", () => {
  const els: ElementoResistente[] = [
    { id: "P-1", x: -10, k: 1 },
    { id: "P-2", x: -5, k: 1 },
    { id: "P-3", x: 0, k: 1 },
    { id: "P-4", x: 5, k: 1 },
    { id: "P-5", x: 10, k: 1 },
  ];

  it("con rigideces iguales degenera en F_k / n_elem, que es lo que hace el Excel", () => {
    const r = repartoPorElemento(100, els, 20);
    r.forEach((e) => expect(e.fBase).toBeCloseTo(20, 12));
  });

  it("reparte por rigidez cuando no son iguales", () => {
    const desigual: ElementoResistente[] = [
      { id: "a", x: -5, k: 3 },
      { id: "b", x: 5, k: 1 },
    ];
    const r = repartoPorElemento(100, desigual, 10);
    expect(r[0].fBase).toBeCloseTo(75, 12);
    expect(r[1].fBase).toBeCloseTo(25, 12);
  });

  it("gamma_a AMPLIFICA: la suma de f_kj supera F_k", () => {
    // Al verlo por primera vez parece un error de suma. Es lo que dice la Norma.
    const Fk = 367.87;
    const r = repartoPorElemento(Fk, els, 20);
    const suma = r.reduce((a, e) => a + e.f, 0);
    expect(suma).toBeGreaterThan(Fk);
    cerca(suma / Fk, 5.9 / 5, 1e-9, "factor de amplificación");
  });

  it("no produce NaN con la suma de rigideces a cero", () => {
    const nulos: ElementoResistente[] = [
      { id: "a", x: -5, k: 0 },
      { id: "b", x: 5, k: 0 },
    ];
    const r = repartoPorElemento(100, nulos, 10);
    expect(r.every((e) => Number.isFinite(e.f))).toBe(true);
    expect(r.every((e) => e.f === 0)).toBe(true);
  });

  it("no rompe sin elementos", () => {
    expect(repartoPorElemento(100, [], 0)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Combinación direccional (art. 3.4)
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 3.4 · combinación direccional", () => {
  const casos = combinacionesDireccionales(1000, 800);

  it("son OCHO casos, no cuatro", () => {
    expect(casos).toHaveLength(8);
  });

  it("recorre el signo de la dirección principal, no sólo el de la secundaria", () => {
    // Una envolvente sin signo sirve para presentar cortantes de planta y para
    // nada más: en cuanto el resultado toca gravedad, el signo es el dato.
    const principalesX = casos.filter((c) => Math.abs(c.fx) === 1);
    expect(principalesX.map((c) => c.fx).filter((f) => f === 1)).toHaveLength(2);
    expect(principalesX.map((c) => c.fx).filter((f) => f === -1)).toHaveLength(2);
  });

  it("la secundaria entra siempre al 30%", () => {
    casos.forEach((c) => {
      const sec = Math.abs(c.fx) === 1 ? c.fy : c.fx;
      expect(Math.abs(sec)).toBeCloseTo(0.3, 12);
    });
  });

  it("no hay dos casos con la misma pareja de factores", () => {
    const claves = new Set(casos.map((c) => `${c.fx}|${c.fy}`));
    expect(claves.size).toBe(8);
  });

  it("aplica los factores a los cortantes de cada dirección", () => {
    const e1 = casos[0];
    cerca(e1.Vx, e1.fx * 1000, 1e-12, "V_x del caso 1");
    cerca(e1.Vy, e1.fy * 800, 1e-12, "V_y del caso 1");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Orquestador
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 · calcularSismo, cadena completa", () => {
  const els = (xs: number[]): ElementoResistente[] =>
    xs.map((x, i) => ({ id: `P-${i + 1}`, x, k: 1 }));

  const plantas = CASO_GRANADA.entrada.h.map((h, i) => {
    const cubierta = i === CASO_GRANADA.entrada.h.length - 1;
    const c = CASO_GRANADA.cargas;
    return {
      h,
      area: c.area,
      componentes: cubierta
        ? [
            { categoria: "permanente" as const, q: c.cubierta.pesoPropio },
            { categoria: "permanente" as const, q: c.cubierta.permanente },
            {
              categoria: "uso-residencial" as const,
              q: c.cubierta.usoExcluida,
              excluida: true,
            },
          ]
        : [
            { categoria: "permanente" as const, q: c.tipo.pesoPropio },
            { categoria: "permanente" as const, q: c.tipo.permanente },
            { categoria: "tabiqueria" as const, q: c.tipo.tabiqueria },
            { categoria: "uso-residencial" as const, q: c.tipo.uso },
          ],
    };
  });

  const res = calcularSismo({
    emplazamiento: { ab: 0.23, K: 1.0, importancia: "normal", terreno: "II" },
    estructura: { sistema: "porticos-ha", n: 10, H: 30, omega: 5, mu: 3 },
    plantas,
    x: { L: 20, B: 15, elementos: els([-7.5, -2.5, 2.5, 7.5]) },
    y: { L: 15, B: 20, elementos: els([-10, -5, 0, 5, 10]) },
  });

  it("las cargas por planta producen el peso sísmico del caso", () => {
    expect(res.pesoSismico).toBe(CASO_GRANADA.cargas.pesoSismicoTotal);
    expect(res.plantas.map((p) => p.P)).toEqual(CASO_GRANADA.entrada.P);
  });

  it("reproduce el cortante basal del caso de Granada", () => {
    cerca(
      res.x.cortanteBasal,
      CASO_GRANADA.esperado.Vk[0],
      TOL_NORMA,
      "cortante basal",
    );
    cercaArr(res.x.Fk, CASO_GRANADA.esperado.Fk, TOL_NORMA, "F_k");
  });

  it("elige 2 modos por el art. 3.7.2.1", () => {
    expect(res.x.nModos).toBe(2);
    expect(res.x.TFManual).toBe(false);
  });

  it("con pórticos de HA el T_F no depende de la dirección", () => {
    expect(res.x.TF).toBe(res.y.TF);
    cerca(res.y.cortanteBasal, res.x.cortanteBasal, 1e-12, "V basal en Y");
  });

  it("L_e es distinto por dirección y sale de los elementos de cada una", () => {
    expect(res.x.Le).toBe(15);
    expect(res.y.Le).toBe(20);
  });

  it("ordena las plantas de abajo arriba aunque lleguen desordenadas", () => {
    const desordenado = calcularSismo({
      emplazamiento: { ab: 0.23, K: 1.0, importancia: "normal", terreno: "II" },
      estructura: { sistema: "porticos-ha", n: 10, H: 30, omega: 5, mu: 3 },
      plantas: [...plantas].reverse(),
      x: { L: 20, B: 15, elementos: els([-7.5, 7.5]) },
      y: { L: 15, B: 20, elementos: els([-10, 10]) },
    });
    cerca(
      desordenado.x.cortanteBasal,
      res.x.cortanteBasal,
      1e-12,
      "cortante basal con plantas desordenadas",
    );
  });

  it("bloquea si el sistema no tiene expresión de T_F y no se da a mano", () => {
    const sinTF = calcularSismo({
      emplazamiento: { ab: 0.23, K: 1.0, importancia: "normal", terreno: "II" },
      estructura: { sistema: "otro", n: 4, H: 12, omega: 5, mu: 3 },
      plantas: [{ h: 3, P: 1000 }],
      x: { L: 20, B: 15, elementos: els([-5, 5]) },
      y: { L: 15, B: 20, elementos: els([-5, 5]) },
    });
    expect(sinTF.avisos.some((a) => a.id === "sin-expresion-tf")).toBe(true);
  });

  it("acepta el T_F del proyectista y lo marca como manual", () => {
    const manual = calcularSismo({
      emplazamiento: { ab: 0.23, K: 1.0, importancia: "normal", terreno: "II" },
      estructura: { sistema: "otro", n: 4, H: 12, omega: 5, mu: 3 },
      plantas: [{ h: 3, P: 1000 }],
      x: { L: 20, B: 15, elementos: els([-5, 5]), TFManual: 0.3 },
      y: { L: 15, B: 20, elementos: els([-5, 5]), TFManual: 0.3 },
    });
    expect(manual.x.TFManual).toBe(true);
    expect(manual.x.TF).toBe(0.3);
    expect(manual.x.avisos.some((a) => a.id === "sin-expresion-tf")).toBe(false);
  });

  it("avisa cuando no hay elementos resistentes en una dirección", () => {
    const sinEls = calcularSismo({
      emplazamiento: { ab: 0.23, K: 1.0, importancia: "normal", terreno: "II" },
      estructura: { sistema: "porticos-ha", n: 2, H: 6, omega: 5, mu: 3 },
      plantas: [{ h: 3, P: 1000 }, { h: 6, P: 800 }],
      x: { L: 20, B: 15, elementos: [] },
      y: { L: 15, B: 20, elementos: els([-5, 5]) },
    });
    expect(sinEls.x.avisos.some((a) => a.id === "sin-elementos")).toBe(true);
    expect(sinEls.y.avisos.some((a) => a.id === "sin-elementos")).toBe(false);
  });

  it("produce los ocho casos direccionales con los cortantes de cada eje", () => {
    expect(res.direccionales).toHaveLength(8);
    cerca(
      res.direccionales[0].Vx,
      res.x.cortanteBasal,
      1e-12,
      "V_x del caso E1",
    );
  });
});

// Tests de las DOS PUERTAS del módulo de sismo NCSE-02.
//
// Se escriben antes que el resto del motor por una razón concreta: de los
// caminos nuevos del módulo, éstos son los que fallan sin que nadie lo vea.
// Una exención falsa del art. 1.2.3 produce un proyecto visado sin
// justificación sísmica; una pasarela mal contada del art. 3.5.1 mete un
// edificio irregular en un método que no le corresponde. Ninguno de los dos
// lanza un error ni sale por pantalla.
//
// Los casos con nombre propio cubren el texto legal; el barrido del final es la
// red que atrapa lo que no se nos haya ocurrido enumerar.

import { describe, expect, it } from "vitest";
import {
  AB_EXENCION_ARRIOSTRADOS,
  AB_EXENCION_GENERAL,
  AC_CONTRAEXCEPCION,
  LIMITE_ALTURA_SIMPLIFICADO,
  LIMITE_PLANTAS_SIMPLIFICADO,
  checkApplicability,
  checkMetodoSimplificado,
  checkObligatoriedad,
} from "../../lib/codes/seismic/applicability";
import type {
  MetodoSimplificadoInput,
  ObligatoriedadInput,
} from "../../lib/codes/seismic/types";
import { CASO_MODOS, CASO_SISMO_ISA } from "../fixtures/ncse02.fixtures";

/** Edificio de partida: normal, ab alta, sin exención posible. */
function obl(over: Partial<ObligatoriedadInput> = {}): ObligatoriedadInput {
  return { importancia: "normal", ab: 0.12, n: 5, ...over };
}

/** Edificio de partida: cumple los seis requisitos del art. 3.5.1. */
function met(
  over: Partial<MetodoSimplificadoInput> = {},
): MetodoSimplificadoInput {
  return {
    importancia: "normal",
    n: 5,
    nTotal: 5,
    H: 17,
    regularidadGeometrica: true,
    soportesContinuos: true,
    regularidadMecanica: true,
    excentricidadDeclarada: true,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PUERTA 1 · art. 1.2.3 · ¿es obligatorio aplicar la Norma?
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 1.2.3 · las tres exenciones, y sólo esas tres", () => {
  it("exime la importancia moderada sea cual sea la aceleración", () => {
    for (const ab of [0.04, 0.12, 0.24]) {
      const r = checkObligatoriedad(obl({ importancia: "moderada", ab }));
      expect(r.estado).toBe("exenta");
      expect(r.motivo).toBe("importancia-moderada");
    }
  });

  it("exime importancia normal y especial cuando ab < 0,04 g", () => {
    for (const importancia of ["normal", "especial"] as const) {
      const r = checkObligatoriedad(obl({ importancia, ab: 0.039 }));
      expect(r.estado).toBe("exenta");
      expect(r.motivo).toBe("ab-inferior-0.04g");
    }
  });

  it("exime importancia normal con pórticos arriostrados y ab < 0,08 g", () => {
    const r = checkObligatoriedad(
      obl({ ab: 0.07, porticosBienArriostrados: true, n: 5 }),
    );
    expect(r.estado).toBe("exenta");
    expect(r.motivo).toBe("porticos-arriostrados-ab-inferior-0.08g");
  });

  it("NO extiende la tercera exención a la importancia especial", () => {
    const r = checkObligatoriedad(
      obl({ importancia: "especial", ab: 0.07, porticosBienArriostrados: true }),
    );
    expect(r.estado).toBe("obligatoria");
  });

  it("exige que los pórticos arriostrados estén declarados", () => {
    for (const flag of [undefined, false]) {
      const r = checkObligatoriedad(
        obl({ ab: 0.07, porticosBienArriostrados: flag }),
      );
      expect(r.estado).toBe("obligatoria");
    }
  });

  it("obliga cuando no cae en ninguna de las tres", () => {
    const r = checkObligatoriedad(obl({ ab: 0.12 }));
    expect(r.estado).toBe("obligatoria");
    expect(r.motivo).toBeNull();
  });
});

describe("NCSE-02 art. 1.2.3 · los umbrales en el borde exacto", () => {
  it('"inferior a 0,04 g" es estricto: 0,04 g NO exime', () => {
    const r = checkObligatoriedad(obl({ ab: AB_EXENCION_GENERAL }));
    expect(r.estado).toBe("obligatoria");
  });

  it('"inferior a 0,08 g" es estricto: 0,08 g NO exime', () => {
    const r = checkObligatoriedad(
      obl({ ab: AB_EXENCION_ARRIOSTRADOS, porticosBienArriostrados: true }),
    );
    expect(r.estado).toBe("obligatoria");
  });

  it("el ruido de coma flotante no compra una exención", () => {
    // 0,04 g menos una milbillonésima sigue siendo 0,04 g.
    const r = checkObligatoriedad(obl({ ab: AB_EXENCION_GENERAL - 1e-12 }));
    expect(r.estado).toBe("obligatoria");
  });

  it("una diferencia real por debajo del umbral sí exime", () => {
    const r = checkObligatoriedad(obl({ ab: 0.0399 }));
    expect(r.estado).toBe("exenta");
  });
});

describe("NCSE-02 art. 1.2.3 · la contraexcepción de las siete plantas", () => {
  const arriostrado = (n: number, ac?: number) =>
    checkObligatoriedad(
      obl({ ab: 0.07, porticosBienArriostrados: true, n, ac }),
    );

  it("obliga con más de siete plantas y ac >= 0,08 g", () => {
    expect(arriostrado(8, 0.09).estado).toBe("obligatoria");
  });

  it('"más de siete" es estricto: con siete plantas sigue exento', () => {
    const r = arriostrado(7, 0.09);
    expect(r.estado).toBe("exenta");
    expect(r.motivo).toBe("porticos-arriostrados-ab-inferior-0.08g");
  });

  it('"igual o mayor de 0,08 g" incluye el 0,08 g exacto', () => {
    expect(arriostrado(8, AC_CONTRAEXCEPCION).estado).toBe("obligatoria");
  });

  it("un ac de 0,08 g con ruido de redondeo también obliga", () => {
    // ac = S · rho · ab son tres multiplicaciones: el ruido es inevitable y no
    // puede decidir si la Norma se aplica.
    expect(arriostrado(8, AC_CONTRAEXCEPCION - 1e-12).estado).toBe(
      "obligatoria",
    );
  });

  it("mantiene la exención con ac por debajo de 0,08 g", () => {
    expect(arriostrado(8, 0.079).estado).toBe("exenta");
  });

  it("queda indeterminada mientras no haya ac, y dice qué le falta", () => {
    const r = arriostrado(8, undefined);
    expect(r.estado).toBe("indeterminada");
    expect(r.falta).toBe("ac");
  });

  it("no necesita ac cuando el edificio no llega a ocho plantas", () => {
    const r = arriostrado(7, undefined);
    expect(r.estado).toBe("exenta");
    expect(r.falta).toBeNull();
  });
});

describe("NCSE-02 art. 1.2.3 · el umbral va sobre ab, no sobre rho·ab", () => {
  it("exime importancia especial con ab = 0,035 g aunque rho·ab pase de 0,04", () => {
    // rho = 1,3 para importancia especial: rho·ab = 0,0455 g. Da igual.
    const r = checkObligatoriedad(obl({ importancia: "especial", ab: 0.035 }));
    expect(r.estado).toBe("exenta");
    expect(r.motivo).toBe("ab-inferior-0.04g");
  });
});

describe("NCSE-02 art. 1.2.3 · avisos y prohibiciones", () => {
  const ids = (r: { avisos: Array<{ id: string }> }) =>
    r.avisos.map((a) => a.id);

  it("avisa de terrenos inestables desde ab = 0,04 g", () => {
    expect(ids(checkObligatoriedad(obl({ ab: 0.04 })))).toContain(
      "terrenos-inestables",
    );
    expect(ids(checkObligatoriedad(obl({ ab: 0.03 })))).not.toContain(
      "terrenos-inestables",
    );
  });

  it("prohíbe adobe, tapial y mampostería en seco si la Norma se aplica", () => {
    for (const sistema of ["adobe", "tapial", "mamposteria-seco"] as const) {
      const r = checkObligatoriedad(obl({ ab: 0.12, sistema }));
      expect(r.estado).toBe("obligatoria");
      expect(ids(r)).toContain("material-prohibido");
    }
  });

  it("no prohíbe nada si la Norma no es de aplicación", () => {
    const r = checkObligatoriedad(
      obl({ importancia: "moderada", ab: 0.12, sistema: "adobe" }),
    );
    expect(ids(r)).not.toContain("material-prohibido");
  });

  it("limita la fábrica a cuatro alturas entre 0,08 g y 0,12 g", () => {
    expect(ids(checkObligatoriedad(obl({ ab: 0.1, n: 5, sistema: "fabrica" })))).toContain(
      "fabrica-max-4-alturas",
    );
    expect(ids(checkObligatoriedad(obl({ ab: 0.1, n: 4, sistema: "fabrica" })))).not.toContain(
      "fabrica-max-4-alturas",
    );
  });

  it("limita la fábrica a dos alturas desde 0,12 g", () => {
    expect(ids(checkObligatoriedad(obl({ ab: 0.12, n: 3, sistema: "fabrica" })))).toContain(
      "fabrica-max-2-alturas",
    );
    expect(ids(checkObligatoriedad(obl({ ab: 0.12, n: 2, sistema: "fabrica" })))).not.toContain(
      "fabrica-max-2-alturas",
    );
  });

  it("aplica el límite más severo, no los dos a la vez", () => {
    const r = checkObligatoriedad(obl({ ab: 0.13, n: 5, sistema: "fabrica" }));
    expect(ids(r)).toContain("fabrica-max-2-alturas");
    expect(ids(r)).not.toContain("fabrica-max-4-alturas");
  });
});

describe("NCSE-02 art. 1.2.3 · barrido: ninguna exención fuera de las tres", () => {
  it("no inventa exenciones en 1.800 combinaciones", () => {
    const IMPORTANCIAS = ["moderada", "normal", "especial"] as const;
    const ABS = [0.02, 0.039, 0.04, 0.06, 0.079, 0.08, 0.12, 0.24];
    const ACS = [undefined, 0.03, 0.079, 0.08, 0.3];
    const NS = [1, 4, 7, 8, 12];
    const ARR = [undefined, false, true];

    let exentas = 0;
    let indeterminadas = 0;
    let combinaciones = 0;

    for (const importancia of IMPORTANCIAS)
      for (const ab of ABS)
        for (const ac of ACS)
          for (const n of NS)
            for (const porticosBienArriostrados of ARR) {
              combinaciones++;
              const r = checkObligatoriedad({
                importancia,
                ab,
                ac,
                n,
                porticosBienArriostrados,
              });

              const ramaArriostrados =
                importancia === "normal" &&
                porticosBienArriostrados === true &&
                ab < AB_EXENCION_ARRIOSTRADOS &&
                ab >= AB_EXENCION_GENERAL;

              const contraexcepcionActiva =
                ramaArriostrados &&
                n > 7 &&
                ac !== undefined &&
                ac >= AC_CONTRAEXCEPCION;

              const debeSerExenta =
                importancia === "moderada" ||
                ab < AB_EXENCION_GENERAL ||
                (ramaArriostrados && !contraexcepcionActiva && !(n > 7 && ac === undefined));

              const debeSerIndeterminada =
                importancia !== "moderada" &&
                ab >= AB_EXENCION_GENERAL &&
                ramaArriostrados &&
                n > 7 &&
                ac === undefined;

              const contexto = JSON.stringify({
                importancia,
                ab,
                ac,
                n,
                porticosBienArriostrados,
              });

              if (debeSerIndeterminada) {
                expect(r.estado, contexto).toBe("indeterminada");
                indeterminadas++;
              } else if (debeSerExenta) {
                expect(r.estado, contexto).toBe("exenta");
                expect(r.motivo, contexto).not.toBeNull();
                exentas++;
              } else {
                expect(r.estado, contexto).toBe("obligatoria");
              }
            }

    expect(combinaciones).toBe(1800);
    // Que el barrido haya visitado de verdad los tres estados, y no esté
    // pasando por una rama sola.
    expect(exentas).toBeGreaterThan(0);
    expect(indeterminadas).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PUERTA 2 · art. 3.5.1 · ¿se puede usar el método simplificado?
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 art. 3.5.1 · los seis requisitos", () => {
  it("admite el método cuando se cumplen los seis", () => {
    const r = checkMetodoSimplificado(met());
    expect(r.aplicable).toBe(true);
    expect(r.via).toBe("requisitos");
    expect(r.bloqueo).toBeNull();
    expect(r.requisitos).toHaveLength(6);
    expect(r.requisitos.every((x) => x.cumple === true)).toBe(true);
  });

  it("no emite el aviso de torsión cuando entra por los requisitos", () => {
    const r = checkMetodoSimplificado(met({ nTotal: 4, n: 4 }));
    expect(r.via).toBe("requisitos");
    expect(r.avisos).toHaveLength(0);
  });

  it('requisito (1): "inferior a veinte" es estricto', () => {
    expect(
      checkMetodoSimplificado(met({ n: LIMITE_PLANTAS_SIMPLIFICADO - 1 }))
        .aplicable,
    ).toBe(true);
    const r = checkMetodoSimplificado(met({ n: LIMITE_PLANTAS_SIMPLIFICADO }));
    expect(r.aplicable).toBe(false);
    expect(r.requisitos[0].cumple).toBe(false);
  });

  it('requisito (2): "inferior a sesenta metros" es estricto', () => {
    expect(
      checkMetodoSimplificado(met({ H: LIMITE_ALTURA_SIMPLIFICADO - 0.01 }))
        .aplicable,
    ).toBe(true);
    const r = checkMetodoSimplificado(met({ H: LIMITE_ALTURA_SIMPLIFICADO }));
    expect(r.aplicable).toBe(false);
    expect(r.requisitos[1].cumple).toBe(false);
  });

  it("bloquea si el proyectista declara que (3), (4) o (5) no se cumplen", () => {
    const claves = [
      "regularidadGeometrica",
      "soportesContinuos",
      "regularidadMecanica",
    ] as const;
    for (const clave of claves) {
      const r = checkMetodoSimplificado(met({ [clave]: false }));
      expect(r.aplicable, clave).toBe(false);
      expect(r.bloqueo).toContain("no se cumplen los requisitos");
    }
  });

  it("bloquea, con otro mensaje, si (3), (4) o (5) están sin declarar", () => {
    const r = checkMetodoSimplificado(met({ regularidadMecanica: null }));
    expect(r.aplicable).toBe(false);
    expect(r.bloqueo).toContain("sin declarar");
    // Sin declarar no es lo mismo que incumplir: el mensaje no debe acusar.
    expect(r.bloqueo).not.toContain("no se cumplen los requisitos");
  });

  it("remite al análisis modal completo cuando bloquea", () => {
    const r = checkMetodoSimplificado(met({ n: 25 }));
    expect(r.bloqueo).toContain("3.6.2");
  });

  it("marca (3), (4) y (5) como declarados y (1) y (2) como numéricos", () => {
    const r = checkMetodoSimplificado(met());
    expect(r.requisitos.map((x) => x.tipo)).toEqual([
      "numerico",
      "numerico",
      "declarado",
      "declarado",
      "declarado",
      "declarado",
    ]);
  });
});

describe("NCSE-02 art. 3.5.1 · requisito (6), la excentricidad", () => {
  const conExc = (ex: number, ey: number, dim = 20) =>
    checkMetodoSimplificado(
      met({
        excentricidadDeclarada: null,
        excentricidad: {
          x: { e: ex, dimension: dim },
          y: { e: ey, dimension: dim },
        },
      }),
    );

  it("admite por debajo del 10% y lo resuelve numéricamente", () => {
    const r = conExc(1.98, 1.0); // 9,9% y 5%
    expect(r.aplicable).toBe(true);
    expect(r.requisitos[5].tipo).toBe("numerico");
    expect(r.requisitos[5].cumple).toBe(true);
  });

  it('"inferior al 10%" es estricto: el 10,0% exacto bloquea', () => {
    const r = conExc(2.0, 1.0);
    expect(r.aplicable).toBe(false);
    expect(r.requisitos[5].cumple).toBe(false);
  });

  it("comprueba cada dirección por separado", () => {
    const r = conExc(1.0, 2.5); // X al 5%, Y al 12,5%
    expect(r.aplicable).toBe(false);
    expect(r.requisitos[5].detalle).toContain("Y");
  });

  it("el detalle deja ver la dimensión con la que ha dividido", () => {
    // No es la de la propia dirección: los planos se reparten sobre el eje
    // transversal, así que la excentricidad que sale de ellos se mide contra la
    // dimensión en planta de ESE eje. Con «e/dim = 9,9 %» a secas, quien firma
    // la memoria no puede rehacer la división.
    const r = conExc(1.5, 1.5, 15);
    expect(r.requisitos[5].detalle).toContain("transversal 15,00 m");
  });

  it("usa el valor absoluto: la excentricidad negativa cuenta igual", () => {
    expect(conExc(-2.5, 1.0).aplicable).toBe(false);
  });

  it("una declaración no puede tapar una excentricidad medida que incumple", () => {
    const r = checkMetodoSimplificado(
      met({
        excentricidadDeclarada: true,
        excentricidad: {
          x: { e: 5, dimension: 20 },
          y: { e: 1, dimension: 20 },
        },
      }),
    );
    expect(r.aplicable).toBe(false);
    expect(r.requisitos[5].tipo).toBe("numerico");
  });

  it("con una sola dirección medida y correcta, cae a la declaración", () => {
    const r = checkMetodoSimplificado(
      met({
        excentricidadDeclarada: true,
        excentricidad: { x: { e: 1, dimension: 20 } },
      }),
    );
    expect(r.requisitos[5].tipo).toBe("declarado");
    expect(r.aplicable).toBe(true);
  });

  it("con una sola dirección medida que falla, ya basta para incumplir", () => {
    const r = checkMetodoSimplificado(
      met({
        excentricidadDeclarada: true,
        excentricidad: { x: { e: 5, dimension: 20 } },
      }),
    );
    expect(r.requisitos[5].tipo).toBe("numerico");
    expect(r.aplicable).toBe(false);
  });

  it("no produce NaN con dimensión nula: cae a la declaración", () => {
    const r = checkMetodoSimplificado(
      met({
        excentricidadDeclarada: true,
        excentricidad: { x: { e: 1, dimension: 0 } },
      }),
    );
    expect(r.requisitos[5].tipo).toBe("declarado");
    expect(r.requisitos[5].detalle).toBeUndefined();
    expect(r.aplicable).toBe(true);
  });
});

describe("NCSE-02 art. 3.5.1 · la pasarela de las cuatro plantas", () => {
  const sinDeclarar = {
    regularidadGeometrica: null,
    soportesContinuos: null,
    regularidadMecanica: null,
    excentricidadDeclarada: null,
  };

  it("admite un edificio normal de hasta cuatro plantas en total", () => {
    const r = checkMetodoSimplificado(
      met({ n: 4, nTotal: 4, H: 13, ...sinDeclarar }),
    );
    expect(r.aplicable).toBe(true);
    expect(r.via).toBe("pasarela-4-plantas");
  });

  it("emite el aviso de torsión del art. 3.7.5 al entrar por la pasarela", () => {
    const r = checkMetodoSimplificado(
      met({ n: 4, nTotal: 4, H: 13, ...sinDeclarar }),
    );
    const aviso = r.avisos.find((a) => a.id === "torsion-pasarela");
    expect(aviso).toBeDefined();
    expect(aviso?.articulo).toBe("3.7.5");
  });

  it("CUENTA LOS SÓTANOS: 4 plantas sobre rasante + 2 sótanos NO entran", () => {
    // El fallo silencioso más fácil de cometer de todo el módulo. La pasarela
    // dice "hasta cuatro plantas EN TOTAL", y es el único sitio de la Norma
    // que se mide así.
    const r = checkMetodoSimplificado(
      met({ n: 4, nTotal: 6, H: 13, ...sinDeclarar }),
    );
    expect(r.aplicable).toBe(false);
    expect(r.via).toBeNull();
  });

  it("no alcanza a la importancia especial", () => {
    const r = checkMetodoSimplificado(
      met({ importancia: "especial", n: 4, nTotal: 4, H: 13, ...sinDeclarar }),
    );
    expect(r.aplicable).toBe(false);
  });

  it("no alcanza a la importancia moderada", () => {
    const r = checkMetodoSimplificado(
      met({ importancia: "moderada", n: 4, nTotal: 4, H: 13, ...sinDeclarar }),
    );
    expect(r.aplicable).toBe(false);
  });

  it('"hasta cuatro" incluye el cuatro y excluye el cinco', () => {
    expect(
      checkMetodoSimplificado(met({ n: 4, nTotal: 4, H: 13, ...sinDeclarar }))
        .aplicable,
    ).toBe(true);
    expect(
      checkMetodoSimplificado(met({ n: 5, nTotal: 5, H: 16, ...sinDeclarar }))
        .aplicable,
    ).toBe(false);
  });

  it("no levanta los requisitos (1) ni (2), sólo del (3) al (6)", () => {
    const r = checkMetodoSimplificado(
      met({ n: 4, nTotal: 4, H: 61, ...sinDeclarar }),
    );
    expect(r.aplicable).toBe(false);
    expect(r.requisitos[1].cumple).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PUERTA COMPLETA · encadenado de las dos
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 · puerta completa", () => {
  it("no evalúa el método simplificado en un edificio exento", () => {
    const r = checkApplicability(obl({ importancia: "moderada" }), met());
    expect(r.obligatoriedad.estado).toBe("exenta");
    expect(r.metodoSimplificado).toBeNull();
    expect(r.puedeCalcular).toBe(false);
  });

  it("no calcula mientras la obligatoriedad esté indeterminada", () => {
    const r = checkApplicability(
      obl({ ab: 0.07, porticosBienArriostrados: true, n: 8 }),
      met({ n: 8, nTotal: 8, H: 25 }),
    );
    expect(r.obligatoriedad.estado).toBe("indeterminada");
    expect(r.puedeCalcular).toBe(false);
  });

  it("calcula cuando la Norma obliga y el método simplificado es válido", () => {
    const r = checkApplicability(obl(), met());
    expect(r.puedeCalcular).toBe(true);
  });

  it("no calcula si hay un bloqueo de material aunque el método sea válido", () => {
    const r = checkApplicability(obl({ sistema: "adobe" }), met());
    expect(r.metodoSimplificado?.aplicable).toBe(true);
    expect(r.puedeCalcular).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// El MOTIVO de no poder calcular, que no se puede deducir del booleano
// ═════════════════════════════════════════════════════════════════════════════
//
// Cinco causas distintas colapsaban en un unico `puedeCalcular === false`, y
// cada consumidor las volvia a inferir por su cuenta. El PDF infirio mal: con
// un edificio de adobe anunciaba "el metodo simplificado NO es aplicable" —que
// es falso, el metodo vale— y a continuacion imprimia los seis requisitos del
// art. 3.5.1 en CUMPLE. Un documento normativo contradiciendose en una pagina.

describe("NCSE-02 · el impedimento dice POR QUE, no solo que no", () => {
  it("es null exactamente cuando se puede calcular", () => {
    const r = checkApplicability(obl(), met());
    expect(r.puedeCalcular).toBe(true);
    expect(r.impedimento).toBeNull();
  });

  it("una prohibicion del art. 1.2.3 NO se presenta como fallo del art. 3.5.1", () => {
    for (const sistema of ["adobe", "tapial", "mamposteria-seco"] as const) {
      const r = checkApplicability(obl({ sistema }), met());
      // El metodo simplificado SI vale: el edificio cumple los seis requisitos.
      expect(r.metodoSimplificado?.aplicable, sistema).toBe(true);
      // Lo que impide calcular es el material, y el motivo lo dice.
      expect(r.impedimento?.motivo, sistema).toBe("prohibicion-art-1.2.3");
      expect(r.impedimento?.articulo, sistema).toBe("1.2.3");
      expect(r.impedimento?.texto, sistema).toMatch(/adobe|tapial|mamposter/i);
    }
  });

  it("la fabrica por encima de sus alturas tambien es prohibicion, no metodo", () => {
    // Art. 1.2.3: con ab >= 0,12 g la fabrica no pasa de dos alturas.
    const r = checkApplicability(
      obl({ sistema: "fabrica", ab: 0.13, n: 4 }),
      met({ n: 4, nTotal: 4, H: 12 }),
    );
    expect(r.metodoSimplificado?.aplicable).toBe(true);
    expect(r.impedimento?.motivo).toBe("prohibicion-art-1.2.3");
    expect(r.impedimento?.texto).toMatch(/dos alturas/i);
  });

  it("distingue exenta de indeterminada, que no son lo mismo", () => {
    const exenta = checkApplicability(obl({ importancia: "moderada" }), met());
    expect(exenta.impedimento?.motivo).toBe("norma-no-obligatoria");
    expect(exenta.impedimento?.texto).toMatch(/importancia moderada/i);

    const indet = checkApplicability(
      obl({ ab: 0.07, porticosBienArriostrados: true, n: 8 }),
      met({ n: 8, nTotal: 8, H: 25 }),
    );
    expect(indet.impedimento?.motivo).toBe("obligatoriedad-indeterminada");
    expect(indet.impedimento?.texto).toMatch(/ac/);
  });

  it("un incumplimiento real del art. 3.5.1 si es del art. 3.5.1", () => {
    const r = checkApplicability(obl({ n: 25 }), met({ n: 25, nTotal: 25, H: 80 }));
    expect(r.impedimento?.motivo).toBe("metodo-simplificado-no-aplicable");
    expect(r.impedimento?.articulo).toBe("3.5.1");
    expect(r.impedimento?.texto).toBe(r.metodoSimplificado?.bloqueo);
  });

  it("la prohibicion del material manda sobre el fallo del metodo", () => {
    // Con las dos cosas mal, lo que se nombra es la prohibicion: es la que no
    // se arregla declarando nada ni cambiando de metodo de calculo.
    const r = checkApplicability(
      obl({ sistema: "adobe", n: 25 }),
      met({ n: 25, nTotal: 25, H: 80 }),
    );
    expect(r.metodoSimplificado?.aplicable).toBe(false);
    expect(r.impedimento?.motivo).toBe("prohibicion-art-1.2.3");
  });

  it("barrido: impedimento y puedeCalcular son exactamente lo contrario", () => {
    // La invariante que sostiene todo esto. Si un dia se pudieran dar a la vez
    // —o faltar los dos—, cada consumidor volveria a inventarse el motivo, que
    // es de donde salio el veredicto falso del PDF.
    const SISTEMAS = ["porticos-ha", "fabrica", "adobe", "tapial", "otro"] as const;
    const IMPORTANCIAS = ["moderada", "normal", "especial"] as const;
    const ABS = [0.03, 0.04, 0.09, 0.13, 0.24];
    const NS = [2, 4, 8, 25];
    const DECLS = [true, false, null];

    let combinaciones = 0;
    let conImpedimento = 0;
    for (const sistema of SISTEMAS)
      for (const importancia of IMPORTANCIAS)
        for (const ab of ABS)
          for (const n of NS)
            for (const decl of DECLS) {
              combinaciones++;
              const r = checkApplicability(
                obl({ sistema, importancia, ab, n, ac: ab }),
                met({
                  importancia,
                  n,
                  nTotal: n,
                  H: n * 3,
                  regularidadGeometrica: decl,
                  soportesContinuos: decl,
                  regularidadMecanica: decl,
                  excentricidadDeclarada: decl,
                }),
              );
              const etiqueta = `${sistema}/${importancia}/${ab}/${n}/${decl}`;
              expect(r.puedeCalcular === (r.impedimento === null), etiqueta).toBe(true);
              if (r.impedimento) {
                conImpedimento++;
                // Un impedimento sin texto no sirve de nada a quien lo lee.
                expect(r.impedimento.texto.length, etiqueta).toBeGreaterThan(20);
                expect(r.impedimento.articulo, etiqueta).toMatch(/^\d/);
              }
            }

    expect(combinaciones).toBe(900);
    // Y el barrido ejercita de verdad las dos ramas, no solo una.
    expect(conImpedimento).toBeGreaterThan(0);
    expect(conImpedimento).toBeLessThan(combinaciones);
  });

  it("acumula los avisos de las dos puertas", () => {
    const r = checkApplicability(
      obl({ n: 4 }),
      met({
        n: 4,
        nTotal: 4,
        H: 13,
        regularidadGeometrica: null,
        soportesContinuos: null,
        regularidadMecanica: null,
        excentricidadDeclarada: null,
      }),
    );
    const ids = r.avisos.map((a) => a.id);
    expect(ids).toContain("terrenos-inestables"); // art. 1.2.3
    expect(ids).toContain("torsion-pasarela"); // art. 3.7.5
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Los dos edificios reales de las hojas del autor
// ═════════════════════════════════════════════════════════════════════════════

describe("NCSE-02 · las puertas sobre los casos reales de las hojas", () => {
  it("Modos.xlsx: 4 plantas con ab = 0,23 g, la Norma obliga", () => {
    const r = checkObligatoriedad({
      importancia: CASO_MODOS.aplicabilidad.importancia,
      ab: CASO_MODOS.entrada.ab,
      n: CASO_MODOS.aplicabilidad.n,
    });
    expect(r.estado).toBe("obligatoria");
  });

  it("Modos.xlsx: entra por la pasarela sin declarar nada, con aviso", () => {
    const r = checkMetodoSimplificado({
      importancia: CASO_MODOS.aplicabilidad.importancia,
      n: CASO_MODOS.aplicabilidad.n,
      nTotal: CASO_MODOS.aplicabilidad.nTotal,
      H: CASO_MODOS.aplicabilidad.H,
      regularidadGeometrica: null,
      soportesContinuos: null,
      regularidadMecanica: null,
      excentricidadDeclarada: null,
    });
    expect(r.aplicable).toBe(true);
    expect(r.via).toBe("pasarela-4-plantas");
  });

  it("Sismo_ISA.xlsx: 5 plantas, la pasarela ya no le vale", () => {
    const r = checkMetodoSimplificado({
      importancia: CASO_SISMO_ISA.aplicabilidad.importancia,
      n: CASO_SISMO_ISA.aplicabilidad.n,
      nTotal: CASO_SISMO_ISA.aplicabilidad.nTotal,
      H: CASO_SISMO_ISA.aplicabilidad.H,
      regularidadGeometrica: null,
      soportesContinuos: null,
      regularidadMecanica: null,
      excentricidadDeclarada: null,
    });
    expect(r.aplicable).toBe(false);
    expect(r.bloqueo).toContain("sin declarar");
  });

  it("Sismo_ISA.xlsx: con los seis declarados, sí calcula", () => {
    const r = checkApplicability(
      {
        importancia: CASO_SISMO_ISA.aplicabilidad.importancia,
        ab: CASO_SISMO_ISA.entrada.ab,
        n: CASO_SISMO_ISA.aplicabilidad.n,
      },
      {
        importancia: CASO_SISMO_ISA.aplicabilidad.importancia,
        n: CASO_SISMO_ISA.aplicabilidad.n,
        nTotal: CASO_SISMO_ISA.aplicabilidad.nTotal,
        H: CASO_SISMO_ISA.aplicabilidad.H,
        regularidadGeometrica: true,
        soportesContinuos: true,
        regularidadMecanica: true,
        excentricidadDeclarada: true,
      },
    );
    expect(r.puedeCalcular).toBe(true);
  });
});

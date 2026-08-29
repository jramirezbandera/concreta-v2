// Builder de traspaso muro → taludes (lib/calculations/geotech/slopePrefill.ts).
// Run: bun test src/test/calc/slopePrefill.test.ts
//
// El test que de verdad importa es el BARRIDO EN MATRIZ contra validateSlope:
// el builder fabrica un SlopeInputs que viaja por URL, y al otro lado Taludes lo
// pasa por validateSlope antes de dejar calcular. Si una combinación de
// geometría produce un modelo inválido, el usuario pulsa el botón y aterriza en
// un módulo bloqueado sin entender por qué. Los tests de mapeo campo a campo NO
// detectan eso.

import { describe, expect, it } from 'vitest';
import {
  slopeModelFromRockfill,
  slopeModelFromRetaining,
  FOUNDATION_PLACEHOLDER,
} from '../../lib/calculations/geotech/slopePrefill';
import { validateSlope } from '../../lib/calculations/geotech/validate';
import { calcRockfillWall } from '../../lib/calculations/rockfillWall';
import {
  rockfillWallDefaults,
  retainingWallDefaults,
  type RockfillWallInputs,
  type RetainingWallInputs,
  type SoilLayer,
} from '../../data/defaults';

const rockBase: RockfillWallInputs = { ...rockfillWallDefaults };
const wallBase: RetainingWallInputs = { ...retainingWallDefaults };

const rockModel = (over: Partial<RockfillWallInputs> = {}) => {
  const inp = { ...rockBase, ...over };
  return slopeModelFromRockfill(inp, calcRockfillWall(inp));
};

describe('slopeModelFromRockfill — mapeos', () => {
  it('escollera: el ángulo sale del talud del intradós', () => {
    const m = rockModel({ wallType: 'escollera', mIntra: 0.34 })!;
    expect(m).not.toBeNull();
    // atan(1/0.34) = 71.2°
    expect(m.angle).toBeCloseTo((Math.atan(1 / 0.34) * 180) / Math.PI, 3);
  });

  it('capa el ángulo a 85° cuando el intradós es vertical', () => {
    const m = rockModel({ wallType: 'escollera', mIntra: 0 })!;
    expect(m.angle).toBe(85);
    // PySlope exige angle < 90 — el cap no puede rozar el límite.
    expect(m.angle).toBeLessThan(90);
  });

  it('gaviones: el ángulo sale del escalonado del frente', () => {
    const m = rockModel({ wallType: 'gaviones' })!;
    expect(m.angle).toBeGreaterThan(0);
    expect(m.angle).toBeLessThanOrEqual(85);
  });

  it('φ del estrato es el del RELLENO, no el del muro ni el mínimo', () => {
    // Con el bloque rígido activo ningún arco atraviesa el cuerpo del muro, así
    // que el φ del material del muro no interviene.
    const m = rockModel({ phi: 45, phiRelleno: 28 })!;
    expect(m.strata[0].phi).toBe(28);
    const m2 = rockModel({ phi: 20, phiRelleno: 34 })!;
    expect(m2.strata[0].phi).toBe(34);
  });

  it('γ del estrato es el MÁXIMO de muro y relleno', () => {
    expect(rockModel({ gammaAp: 18, gammaSuelo: 21 })!.strata[0].gamma).toBe(21);
    expect(rockModel({ gammaAp: 23, gammaSuelo: 18 })!.strata[0].gamma).toBe(23);
  });

  it('traslada el nivel freático sólo cuando está activo', () => {
    expect(rockModel({ hasWater: true, hw: 1.7 })!.waterTableDepth).toBe(1.7);
    expect(rockModel({ hasWater: false, hw: 1.7 })!.waterTableDepth).toBeNull();
  });

  it('γ saturado va al MÁXIMO de muro y relleno saturado', () => {
    const m = rockModel({ hasWater: true, hw: 2, gammaAp: 18, gammaSat: 21 })!;
    expect(m.strata[1].gamma).toBe(21);
    const m2 = rockModel({ hasWater: true, hw: 2, gammaAp: 24, gammaSat: 21 })!;
    expect(m2.strata[1].gamma).toBe(24);
  });

  it('traslada la sobrecarga como udl, y sin q no emite cargas', () => {
    const conQ = rockModel({ q: 12 })!;
    expect(conQ.loads).toHaveLength(1);
    expect(conQ.loads[0]).toMatchObject({ kind: 'udl', magnitude: 12, offset: 0 });
    expect(rockModel({ q: 0 })!.loads).toHaveLength(0);
  });

  it('fija el contexto normativo de estabilidad global', () => {
    const m = rockModel()!;
    expect(m.context).toBe('global-foundation');
    expect(m.situation).toBe('persistent');
    expect(m.method).toBe('bishop');
  });

  it('emite el bloque rígido con los vuelos y la profundidad del cimiento', () => {
    const m = rockModel({ x0: 0.4, xT: 0.25 })!;
    expect(m.rigidBlock).toBeDefined();
    expect(m.rigidBlock!.padToe).toBe(0.4);   // vuelo de puntera
    expect(m.rigidBlock!.padHeel).toBe(0.25); // vuelo de talón
    expect(m.rigidBlock!.depth).toBeGreaterThan(0);
  });

  it('devuelve null si el resultado del muro no es válido', () => {
    const bad = { ...rockBase, H: -5 };
    expect(slopeModelFromRockfill(bad, calcRockfillWall(bad))).toBeNull();
  });

  it('devuelve null si el empotramiento frontal se come el desnivel', () => {
    expect(rockModel({ df: 99 })).toBeNull();
  });
});

describe('slopeModelFromRetaining — mapeos', () => {
  it('usa las propiedades del relleno (el hormigón se ignora)', () => {
    const m = slopeModelFromRetaining({ ...wallBase, gammaSuelo: 19, phi: 32 })!;
    expect(m.strata[0].gamma).toBe(19);
    expect(m.strata[0].phi).toBe(32);
    expect(m.strata[0].c).toBe(0);
  });

  it('el alzado es vertical → ángulo capado', () => {
    expect(slopeModelFromRetaining(wallBase)!.angle).toBe(85);
  });

  it('el bloque rígido usa los vuelos de la zapata', () => {
    const m = slopeModelFromRetaining({ ...wallBase, bPunta: 0.7, bTalon: 1.9 })!;
    expect(m.rigidBlock!.padToe).toBe(0.7);
    expect(m.rigidBlock!.padHeel).toBe(1.9);
    expect(m.rigidBlock!.depth).toBeCloseTo(wallBase.H + wallBase.hf, 6);
  });

  it('devuelve null si el desnivel expuesto no es positivo', () => {
    expect(slopeModelFromRetaining({ ...wallBase, df: 99 })).toBeNull();
  });
});

describe('núcleo compartido (DRY)', () => {
  it('ambos builders inyectan el MISMO material de cimentación placeholder', () => {
    // Va SIEMPRE el último: el nº de bandas del cuerpo depende de si el NF lo
    // parte, así que no se puede anclar a un índice fijo. El espesor SÍ difiere
    // entre muros (se ajusta al modelo); el material no.
    const last = (m: { strata: SoilLayer[] }) => m.strata[m.strata.length - 1];
    expect(last(rockModel()!)).toMatchObject(FOUNDATION_PLACEHOLDER);
    expect(last(slopeModelFromRetaining(wallBase)!)).toMatchObject(FOUNDATION_PLACEHOLDER);
  });

  // El espesor del placeholder no es un dato del material: se calcula para que
  // la columna de suelo termine en el fondo del modelo que sintetiza PySlope.
  // Un valor fijo pintaba estratos hasta 23,50 m bajo un muro de 3 m.
  describe('espesor del estrato de cimentación', () => {
    const depthOf = (m: { strata: SoilLayer[] }) =>
      m.strata.reduce((s, st) => s + st.thickness, 0);

    it('la profundidad total sale del tamaño del problema, no de una constante', () => {
      const bajo = slopeModelFromRetaining({ ...wallBase, H: 3 })!;
      const alto = slopeModelFromRetaining({ ...wallBase, H: 8 })!;
      expect(depthOf(alto)).toBeGreaterThan(depthOf(bajo));
    });

    it('un muro de 3 m no genera estratos de 23 m', () => {
      const m = slopeModelFromRetaining({ ...wallBase, H: 3 })!;
      expect(depthOf(m)).toBeLessThan(12);
      expect(depthOf(m)).toBeGreaterThanOrEqual(3 * m.height);
    });

    it('cubre el dominio que sintetiza PySlope (tot_h)', () => {
      for (const H of [1.2, 3, 6, 12]) {
        const m = slopeModelFromRetaining({ ...wallBase, H })!;
        const length = m.height / Math.tan((m.angle * Math.PI) / 180);
        const totH = Math.max(3 * m.height, 6, 2.5 * length);
        expect(depthOf(m)).toBeGreaterThanOrEqual(totH - 1e-6);
      }
    });

    it('nunca degenera aunque el cimiento sea desproporcionado', () => {
      // Muro bajo con canto de cimiento enorme: el cuerpo ya llena el modelo.
      const m = slopeModelFromRetaining({ ...wallBase, H: 1, hf: 8 })!;
      const foundation = m.strata[m.strata.length - 1];
      expect(foundation.thickness).toBeGreaterThanOrEqual(2);
      expect(validateSlope(m).valid).toBe(true);
    });
  });

  it('los ids de los estratos son correlativos desde 1', () => {
    for (const m of [rockModel()!, rockModel({ hasWater: true, hw: 2 })!, slopeModelFromRetaining(wallBase)!]) {
      expect(m.strata.map((s) => s.id)).toEqual(m.strata.map((_, i) => i + 1));
    }
  });

  it('ambos suben las iteraciones: el filtro descarta parte de la malla', () => {
    expect(rockModel()!.iterations).toBeGreaterThan(1000);
    expect(slopeModelFromRetaining(wallBase)!.iterations).toBeGreaterThan(1000);
  });
});

// ─── Reparto del cuerpo por el nivel freático ───────────────────────────────
//
// PySlope tiene un único unit_weight por material y resta u = γw·h por
// separado, así que bajo el NF el peso correcto es el SATURADO. Antes se
// pasaba sólo el seco y la masa sumergida salía infravalorada ~10%.

describe('reparto seco / saturado por el NF', () => {
  const H = rockfillWallDefaults.H;           // 4
  const hz = rockfillWallDefaults.hz;         // 1
  const bodyTotal = H + hz;                   // 5

  it('sin NF el cuerpo es UNA sola banda con el γ aparente', () => {
    const m = rockModel({ hasWater: false })!;
    expect(m.strata).toHaveLength(2);         // cuerpo + cimentación
    expect(m.strata[0].thickness).toBeCloseTo(bodyTotal, 6);
  });

  it('con el NF dentro del cuerpo emite DOS bandas, seca sobre saturada', () => {
    const m = rockModel({ hasWater: true, hw: 2, gammaAp: 18, gammaSuelo: 18, gammaSat: 20 })!;
    expect(m.strata).toHaveLength(3);         // seca + saturada + cimentación
    expect(m.strata[0].thickness).toBeCloseTo(2, 6);
    expect(m.strata[0].gamma).toBe(18);
    expect(m.strata[1].thickness).toBeCloseTo(bodyTotal - 2, 6);
    expect(m.strata[1].gamma).toBe(20);
  });

  it('las dos bandas comparten c′ y φ′: sólo cambia el peso', () => {
    const m = rockModel({ hasWater: true, hw: 2, phiRelleno: 31 })!;
    expect(m.strata[0].phi).toBe(31);
    expect(m.strata[1].phi).toBe(31);
    expect(m.strata[0].c).toBe(m.strata[1].c);
    expect(m.strata[0].gamma).not.toBe(m.strata[1].gamma);
  });

  it('el reparto conserva el espesor total del cuerpo', () => {
    for (const hw of [0.5, 1, 2.5, 4, 4.9]) {
      const m = rockModel({ hasWater: true, hw })!;
      const body = m.strata.slice(0, -1).reduce((s, st) => s + st.thickness, 0);
      expect(body).toBeCloseTo(bodyTotal, 6);
    }
  });

  it('NF en coronación (hw=0): todo el cuerpo saturado, sin banda de espesor 0', () => {
    const m = rockModel({ hasWater: true, hw: 0, gammaSat: 20 })!;
    expect(m.strata).toHaveLength(2);
    expect(m.strata[0].thickness).toBeCloseTo(bodyTotal, 6);
    expect(m.strata[0].gamma).toBe(20);
    expect(validateSlope(m).valid).toBe(true);
  });

  it('NF bajo la base del cimiento: cuerpo entero seco, una sola banda', () => {
    // El NF cae dentro del placeholder de cimentación, que NO se parte.
    const m = rockModel({ hasWater: true, hw: 12, gammaSuelo: 18, gammaSat: 20 })!;
    expect(m.strata).toHaveLength(2);
    expect(m.strata[0].gamma).toBe(18);
  });

  it('NF a ras de la base: no genera una banda degenerada', () => {
    const m = rockModel({ hasWater: true, hw: bodyTotal - 0.001 })!;
    expect(m.strata).toHaveLength(2);
    expect(validateSlope(m).valid).toBe(true);
  });

  it('muro HA: mismo reparto con su propio γsat', () => {
    const m = slopeModelFromRetaining({
      ...wallBase, hasWater: true, hw: 1.2, gammaSuelo: 19, gammaSat: 21,
    })!;
    expect(m.strata).toHaveLength(3);
    expect(m.strata[0].gamma).toBe(19);
    expect(m.strata[1].gamma).toBe(21);
    expect(m.strata[0].thickness).toBeCloseTo(1.2, 6);
  });

  it('ninguna banda queda por debajo del mínimo que PySlope tolera', () => {
    for (const hw of [0, 0.001, 0.04, 0.06, 2, 4.94, 4.96, 5, 5.5]) {
      const m = rockModel({ hasWater: true, hw })!;
      for (const st of m.strata) expect(st.thickness).toBeGreaterThanOrEqual(0.05);
      expect(validateSlope(m).valid).toBe(true);
    }
  });
});

// ─── El test que cierra el contrato de punta a punta ────────────────────────

describe('barrido en matriz — todo modelo prefabricado DEBE validar', () => {
  const wallTypes = ['escollera', 'gaviones'] as const;
  const mIntras = [0, 0.15, 0.34, 0.8, 1.5];
  const aligns = ['front', 'back'] as const;
  const dfs = [0, 0.5];
  // `false` = sin NF; los números son hw, e incluyen los bordes del reparto
  // seco/saturado (coronación, a ras de la base, y por debajo del cimiento).
  const waters = [false, 0, 0.03, 2, 4.98, 9] as const;
  const qs = [0, 25];

  for (const wallType of wallTypes) {
    for (const mIntra of mIntras) {
      for (const stepAlign of aligns) {
        for (const df of dfs) {
          for (const water of waters) {
            for (const q of qs) {
              const label = `${wallType} mI=${mIntra} ${stepAlign} df=${df} nf=${water} q=${q}`;
              it(`escollera/gaviones válido — ${label}`, () => {
                const model = rockModel({
                  wallType, mIntra, stepAlign, df, q,
                  hasWater: water !== false,
                  hw: water === false ? 0 : water,
                });
                if (model === null) return; // guard legítimo, no hay modelo que validar
                const v = validateSlope(model);
                expect(v.error ?? 'ok').toBe('ok');
                expect(v.valid).toBe(true);
                // Invariante que PySlope exige y validateSlope comprueba:
                const total = model.strata.reduce((s, st) => s + st.thickness, 0);
                expect(total).toBeGreaterThanOrEqual(model.height);
                expect(model.angle).toBeGreaterThan(0);
                expect(model.angle).toBeLessThan(90);
                // Ninguna banda degenerada, aunque el NF caiga en un borde.
                for (const st of model.strata) expect(st.thickness).toBeGreaterThan(0);
              });
            }
          }
        }
      }
    }
  }

  const Hs = [1.2, 3, 6];
  const hfs = [0.3, 0.9];
  const talons = [0, 1.5, 5];
  for (const H of Hs) {
    for (const hf of hfs) {
      for (const bTalon of talons) {
        for (const water of waters) {
          it(`muro HA válido — H=${H} hf=${hf} bTalon=${bTalon} nf=${water}`, () => {
            const model = slopeModelFromRetaining({
              ...wallBase, H, hf, bTalon,
              hasWater: water !== false,
              hw: water === false ? 0 : water,
            });
            if (model === null) return;
            const v = validateSlope(model);
            expect(v.error ?? 'ok').toBe('ok');
            expect(v.valid).toBe(true);
            const total = model.strata.reduce((s, st) => s + st.thickness, 0);
            expect(total).toBeGreaterThanOrEqual(model.height);
            for (const st of model.strata) expect(st.thickness).toBeGreaterThan(0);
          });
        }
      }
    }
  }
});

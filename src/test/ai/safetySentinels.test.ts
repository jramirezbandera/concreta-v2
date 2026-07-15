// FUGA 3 de la auditoría (2026-07-14) — los CENTINELAS geotécnicos.
//
// Hay campos donde `0` no significa "menos": significa APAGAR la comprobación.
// Una función de nivel monótona no puede expresarlo, así que el guardarraíl leía
// esas anulaciones como cambios CONSERVADORES y no avisaba de nada:
//
//   - taludes, `su → 0` en todos los estratos: la comprobación sin drenaje
//     DESAPARECE de la tabla (`hasUndrained` = algún estrato con su > 0). Si era la
//     que gobernaba y fallaba, el veredicto vuelca a CUMPLE.
//   - micropilotes, `su → 0`: quita el tope del fuste del estrato cohesivo Y la
//     penalización de pandeo. Y `mapLayer` convertía un `su_kPa: null` en 0 sin un
//     solo aviso: al modelo le bastaba con no reenviar el campo.
//   - micropilotes, `Cu`: no tenía NINGUNA regla, y con Cu ≥ 2 la arena floja
//     saturada deja de ser "terreno inestable" (capacidad a pandeo nula).
//   - taludes, `length = 0` de una banda: no es "cero metros", es una banda hasta
//     el límite del análisis — el caso MÁS cargado.
//
// El arreglo: `offIsUnsafe(zeroIsOff, …)` da a la posición "apagada" el nivel −∞, y
// —donde el peligro no es monótono— una SEGUNDA regla sobre el mismo campo con su
// propia `key`. Cada una dispara en un solo sentido, así que no se doble-reportan.

import { describe, it, expect } from 'vitest';
import { slopeStabilityAdapter } from '../../lib/ai/modules/slopeStability';
import { micropilesAdapter, micropilesAiDefaults } from '../../lib/ai/modules/micropiles';
import { slopeDefaults } from '../../data/defaults';
import { offIsUnbounded, offIsUnsafe, zeroIsOff, higherIsSafer } from '../../lib/ai/safety';

const SI = 'si' as const;
const p = (o: Record<string, unknown>) => ({ ...o, warnings: [] });

describe('los dos centinelas — apagar NO es lo mismo que no tener límite', () => {
  it('offIsUnsafe: la posición apagada es el nivel MÍNIMO, no el mínimo de la escala', () => {
    const level = offIsUnsafe(zeroIsOff, higherIsSafer);
    expect(level(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(level(null)).toBe(Number.NEGATIVE_INFINITY);
    expect(level(undefined)).toBe(Number.NEGATIVE_INFINITY);
    expect(level(5)).toBe(5);
    // Lo que importa: apagar SIEMPRE baja de nivel, incluso desde el valor más bajo.
    expect(level(0)).toBeLessThan(level(0.001)!);
  });

  it('offIsUnbounded: la posición "sin límite" es el nivel MÁXIMO (el caso más cargado)', () => {
    // El error fácil —y el que cometí escribiendo esto— es usar el mismo helper
    // para los dos. `su = 0` apaga una comprobación (−∞); `length = 0` es una banda
    // hasta el límite del análisis (+∞). Con el helper equivocado, acortar la banda
    // de 0 a 2 m se lee como una SUBIDA de carga y no avisa de nada.
    const level = offIsUnbounded(zeroIsOff, higherIsSafer);
    expect(level(0)).toBe(Number.POSITIVE_INFINITY);
    expect(level(2)).toBe(2);
    expect(level(2)).toBeLessThan(level(0)!); // 0 (infinita) es MÁS carga que 2 m
  });
});

describe('taludes — su = 0 borra la comprobación sin drenaje', () => {
  // Un perfil ya establecido (≠ defaults ⇒ el gate de fábrica está abierto).
  const arcilla = {
    ...slopeDefaults,
    strata: [
      { id: 1, type: 'cohesive' as const, thickness: 8, gamma: 19, c: 5, phi: 20, su: 60, Nspt: 0, rflim: 0 },
    ],
  };
  const anular = p({
    strata: [{ type: 'cohesive', thickness_m: 8, gamma_kNm3: 19, c_kPa: 5, phi_deg: 20, su_kPa: 0 }],
  });

  it('anular su → RIESGO (antes se leía como "más conservador" y pasaba limpio)', () => {
    const plan = slopeStabilityAdapter.buildPlan(anular, arcilla, SI);
    const r = plan.risks.find((x) => x.field === 'strata[0].su_anulada');
    expect(r).toBeDefined();
    expect(r!.why).toContain('DESACTIVA la comprobación sin drenaje');
    expect(r!.before).toBe('60 kN/m²');
    expect(r!.after).toBe('0 kN/m²');
  });

  it('anular su NO dispara ADEMÁS la regla de "subir su" (nada de doble reporte)', () => {
    const plan = slopeStabilityAdapter.buildPlan(anular, arcilla, SI);
    expect(plan.risks.filter((x) => x.field.startsWith('strata[0].su'))).toHaveLength(1);
  });

  it('bajar su de 60 a 40 (conservador de verdad) NO avisa', () => {
    const bajar = p({
      strata: [{ type: 'cohesive', thickness_m: 8, gamma_kNm3: 19, c_kPa: 5, phi_deg: 20, su_kPa: 40 }],
    });
    const plan = slopeStabilityAdapter.buildPlan(bajar, arcilla, SI);
    expect(plan.risks.filter((x) => x.field.startsWith('strata[0].su'))).toEqual([]);
  });

  it('SUBIR su sigue avisando por la regla de siempre (no la he roto)', () => {
    const subir = p({
      strata: [{ type: 'cohesive', thickness_m: 8, gamma_kNm3: 19, c_kPa: 5, phi_deg: 20, su_kPa: 120 }],
    });
    const plan = slopeStabilityAdapter.buildPlan(subir, arcilla, SI);
    expect(plan.risks.map((x) => x.field)).toContain('strata[0].su');
  });
});

describe('taludes — las sobrecargas ya no se pueden desactivar de tapadillo', () => {
  const conCarga = {
    ...slopeDefaults,
    loads: [{ id: 1, kind: 'udl' as const, magnitude: 20, offset: 0, length: 0 }],
  };

  it('acortar la banda: length 0 (hasta el límite) → 2 m es RECORTAR la carga, no ampliarla', () => {
    const plan = slopeStabilityAdapter.buildPlan(
      p({ loads: [{ kind: 'udl', magnitude: 20, offset_m: 0, length_m: 2 }] }), conCarga, SI,
    );
    const r = plan.risks.find((x) => x.field === 'loads[0].length');
    expect(r).toBeDefined();
    expect(r!.before).toBe('hasta el límite');
    expect(r!.after).toBe('2 m');
  });

  it('alejar la carga de la coronación → RIESGO (sale de la cuña de rotura)', () => {
    const plan = slopeStabilityAdapter.buildPlan(
      p({ loads: [{ kind: 'udl', magnitude: 20, offset_m: 15, length_m: 0 }] }), conCarga, SI,
    );
    expect(plan.risks.map((x) => x.field)).toContain('loads[0].offset');
  });

  it('convertir 20 kPa (banda) en 20 kN/m (línea) → RIESGO: cambian las unidades', () => {
    const plan = slopeStabilityAdapter.buildPlan(
      p({ loads: [{ kind: 'line', magnitude: 20, offset_m: 0, length_m: null }] }), conCarga, SI,
    );
    expect(plan.risks.map((x) => x.field)).toContain('loads[0].kind');
  });
});

describe('micropilotes — su = 0 y el interruptor Cu', () => {
  const perfil = {
    ...micropilesAiDefaults,
    // El perfil debe cubrir de la rasante a la punta (toeDepth = 17 m) o el
    // adapter salta el array entero.
    soil: [
      { id: 1, type: 'cohesive' as const, thickness: 20, gamma: 19, c: 0, phi: 0, Nspt: 15, su: 80, rflim: 0 },
    ],
  };
  const capa = (o: Record<string, unknown>) => ({
    type: 'cohesive', thickness_m: 20, gamma_kNm3: 19, c_kPa: 0, phi_deg: 0,
    Nspt: 15, su_kPa: 80, rflim_MPa: 0, Cu: null, ...o,
  });

  it('anular su → RIESGO (apaga el tope de fuste del estrato cohesivo)', () => {
    const plan = micropilesAdapter.buildPlan(p({ soil: [capa({ su_kPa: 0 })] }), perfil, SI);
    const r = plan.risks.find((x) => x.field === 'soil[0].su_anulada');
    expect(r).toBeDefined();
    expect(r!.why).toContain('DESACTIVA el tope de rozamiento por fuste');
  });

  it('OMITIR su (null) hace lo mismo por la puerta de atrás → RIESGO + aviso explícito', () => {
    // mapLayer convierte null en 0 en silencio: el modelo solo tiene que "olvidar"
    // el campo. Ahora eso produce riesgo Y warning.
    const plan = micropilesAdapter.buildPlan(p({ soil: [capa({ su_kPa: null })] }), perfil, SI);
    expect(plan.risks.map((x) => x.field)).toContain('soil[0].su_anulada');
    expect(plan.warnings.join(' ')).toContain('no se ha indicado su');
  });

  it('subir Cu de "sin dato" a 8 → RIESGO (saca la arena de "terreno inestable")', () => {
    const arena = {
      ...micropilesAiDefaults,
      soil: [{ id: 1, type: 'granular' as const, thickness: 20, gamma: 19, c: 0, phi: 30, Nspt: 8, su: 0, rflim: 0 }],
    };
    const plan = micropilesAdapter.buildPlan(
      p({ soil: [capa({ type: 'granular', phi_deg: 30, Nspt: 8, su_kPa: 0, Cu: 8 })] }), arena, SI,
    );
    const r = plan.risks.find((x) => x.field === 'soil[0].Cu');
    expect(r).toBeDefined();
    expect(r!.before).toBe('sin dato (→ < 2)');
    expect(r!.after).toBe('8');
    expect(r!.why).toContain('TERRENO INESTABLE');
  });
});

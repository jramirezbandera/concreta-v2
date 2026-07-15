// FUGA 2 de la auditoría (2026-07-14) — la puerta de escape de `'custom'`.
//
// `ordinalLevel(map)` devuelve `map[value] ?? null`, y `detectSafetyRisks` SALTA
// los niveles nulos (sin nivel no hay comparación posible, y no se inventa un
// riesgo). Los enums del payload incluían `'custom'`; los mapas ordinales, no.
// Y no es un olvido reparable dentro del ordinal: 'custom' NO PUEDE tener un
// nivel fijo, porque su nivel lo decide OTRO campo (β o ψ₂).
//
// El resultado era un atajo de dos claves que hacía cumplir el cálculo con
// `plan.risks` vacío — sin fila roja, sin checkbox, un clic:
//   - pilares de acero y sección compuesta: {bcType:'custom', beta:0.5} parte la
//     longitud de pandeo por dos (χ sube, el pilar "cumple");
//   - vigas de hormigón: {loadType:'custom', psi2Custom:0} deja Ms = |M_G| y la
//     fisuración se desvanece;
//   - vigas de madera: basta {loadType:'custom'} para caer de ψ₂ = 0.80 (almacén)
//     a 0.30 (el default) — y en madera la flecha es quien dimensiona.
//
// El arreglo vigila la MAGNITUD RESUELTA (`getBetaForBCType`, `psi2Quasi`,
// `psi2ForLoadType` — los mismos resolvedores que usa el motor), no el enum ni el
// campo delegado. Una sola regla cubre las tres puertas: cambiar el enum, cambiar
// el campo delegado, o ambos a la vez.

import { describe, it, expect } from 'vitest';
import { steelColumnsAdapter } from '../../lib/ai/modules/steelColumns';
import { compositeSectionAdapter } from '../../lib/ai/modules/compositeSection';
import { rcBeamsAdapter } from '../../lib/ai/modules/rcBeams';
import { timberBeamsAdapter } from '../../lib/ai/modules/timberBeams';
import {
  compositeSectionDefaults, rcBeamDefaults, steelColumnDefaults, timberBeamDefaults,
} from '../../data/defaults';
import { getBetaForBCType } from '../../lib/calculations/steelColumnBC';
import { psi2Quasi } from '../../lib/calculations/rcBeams';
import { psi2ForLoadType } from '../../lib/calculations/timberBeams';

const SI = 'si' as const;
const p = (o: Record<string, unknown>) => ({ ...o, warnings: [] });

/** El atajo: pasar a 'custom' y escribir el valor delegado en el mismo turno. */
const A_CUSTOM_BETA = p({ bcType: 'custom', beta_y: 0.5, beta_z: 0.5 });

describe('pilares de acero — β efectiva', () => {
  const current = { ...steelColumnDefaults }; // bcType 'pp' ⇒ β = 1.0

  it('el motor SÍ ve la rebaja: β efectiva 1.00 → 0.50', () => {
    // Verifica que la trampa es real antes de comprobar que se marca.
    expect(getBetaForBCType(current.bcType, current.beta_y, current.beta_z).beta_y).toBe(1.0);
    expect(getBetaForBCType('custom', 0.5, 0.5).beta_y).toBe(0.5);
  });

  it('{bcType:custom, β:0.5} con bcType ya tratado en el hilo → DOS riesgos (y_z)', () => {
    const plan = steelColumnsAdapter.buildPlan(A_CUSTOM_BETA, current, SI, new Set(['bcType']));
    expect(plan.risks.map((r) => r.field)).toEqual(['beta_y_efectiva', 'beta_z_efectiva']);
    expect(plan.risks[0].before).toBe('1.00');
    expect(plan.risks[0].after).toBe('0.50');
    expect(plan.risks[0].why).toContain('CONSTRUIDO');
  });

  it('cambiar la CONDICIÓN sin tocar β también baja la β efectiva → riesgo', () => {
    // bcType 'ff' (biempotrado) ⇒ β = 0.5, sin que el modelo escriba β. Antes lo
    // cubría el ordinal; ahora lo cubre la magnitud resuelta, incluida la β
    // DERIVADA que buildPlan escribe en `fields` SIN fila en `changes`.
    const plan = steelColumnsAdapter.buildPlan(p({ bcType: 'ff' }), current, SI, new Set(['bcType']));
    expect(plan.risks.map((r) => r.field)).toEqual(['beta_y_efectiva', 'beta_z_efectiva']);
  });

  it('subir la β efectiva (ménsula, β=2.0) NO es riesgo', () => {
    const plan = steelColumnsAdapter.buildPlan(p({ bcType: 'fc' }), current, SI, new Set(['bcType']));
    expect(plan.risks).toEqual([]);
  });

  it('un solo riesgo por eje: NO se doble-reporta con las reglas por campo', () => {
    // Las reglas por campo de bcType/beta_y/beta_z se RETIRARON al introducir la
    // magnitud resuelta: si alguien las reintrodujera, cada rebaja saldría dos
    // veces en la misma tarjeta.
    const plan = steelColumnsAdapter.buildPlan(A_CUSTOM_BETA, current, SI, new Set(['bcType']));
    expect(plan.risks).toHaveLength(2);
    expect(plan.risks.map((r) => r.field)).not.toContain('bcType');
    expect(plan.risks.map((r) => r.field)).not.toContain('beta_y');
  });
});

describe('sección compuesta — β efectiva (mismo resolvedor que el acero)', () => {
  const current = { ...compositeSectionDefaults };

  it('{bcType:custom, β:0.5} con el hilo enterado → riesgos', () => {
    const plan = compositeSectionAdapter.buildPlan(
      A_CUSTOM_BETA, current, SI, new Set(['bcType']),
    );
    expect(plan.risks.map((r) => r.field)).toEqual(['beta_y_efectiva', 'beta_z_efectiva']);
  });
});

describe('vigas de hormigón — ψ₂ efectivo (fisuración)', () => {
  const current = { ...rcBeamDefaults };

  it('el motor SÍ ve la rebaja: ψ₂ efectivo → 0 mata el término de sobrecarga', () => {
    expect(psi2Quasi({ ...current, loadType: 'custom', psi2Custom: 0 })).toBe(0);
  });

  it('{loadType:custom, psi2Custom:0} con loadType tratado en el hilo → RIESGO', () => {
    const plan = rcBeamsAdapter.buildPlan(
      p({ loadType: 'custom', psi2Custom: 0 }), current, SI, new Set(['loadType']),
    );
    expect(plan.risks.map((r) => r.field)).toContain('psi2_efectivo');
    expect(plan.risks.find((r) => r.field === 'psi2_efectivo')!.after).toBe('0.00');
  });

  it('bajar de categoría (parking → roof) también baja ψ₂ → riesgo', () => {
    const parking = { ...rcBeamDefaults, loadType: 'parking' as const };
    const plan = rcBeamsAdapter.buildPlan(p({ loadType: 'roof' }), parking, SI);
    expect(plan.risks.map((r) => r.field)).toContain('psi2_efectivo');
  });

  it('cambiar a una categoría con el MISMO ψ₂ (residential → office, 0.3) NO avisa', () => {
    // El ordinal por campo tampoco avisaba aquí, pero por casualidad: los dos
    // valen 0.3 en el mapa. La magnitud resuelta lo hace por construcción.
    const plan = rcBeamsAdapter.buildPlan(p({ loadType: 'office' }), current, SI, new Set(['loadType']));
    expect(plan.risks).toEqual([]);
  });
});

describe('vigas de madera — ψ₂ efectivo (flecha)', () => {
  // En madera la flecha suele gobernar, así que esta es la puerta más cara.
  const almacen = { ...timberBeamDefaults, loadType: 'storage' as const }; // ψ₂ = 0.80

  it('el motor SÍ ve la rebaja: 0.80 (almacén) → 0.30 (el default de custom)', () => {
    expect(psi2ForLoadType(almacen)).toBe(0.8);
    expect(psi2ForLoadType({ ...almacen, loadType: 'custom' })).toBe(timberBeamDefaults.psi2Custom);
  });

  it('basta {loadType:custom} para rebajar ψ₂ de 0.80 a 0.30 → RIESGO', () => {
    const plan = timberBeamsAdapter.buildPlan(p({ loadType: 'custom' }), almacen, SI);
    const r = plan.risks.find((x) => x.field === 'psi2_efectivo');
    expect(r).toBeDefined();
    expect(r!.before).toBe('0.80');
    expect(r!.after).toBe('0.30');
  });
});

// FUGA 4 de la auditoría (2026-07-14) — DATOS del problema que no tenían regla,
// más el único guardarraíl que apuntaba al LADO CONTRARIO.
//
// Un campo sin regla es diseño libre para el detector: el modelo lo cambia, el
// cálculo cumple y `plan.risks` sale vacío. Los que faltaban no eran menores —
// eran las rebajas de demanda más baratas de cada módulo.

import { describe, it, expect } from 'vitest';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import { timberBeamsAdapter } from '../../lib/ai/modules/timberBeams';
import { timberColumnsAdapter } from '../../lib/ai/modules/timberColumns';
import { punchingAdapter } from '../../lib/ai/modules/punching';
import { isolatedFootingAdapter } from '../../lib/ai/modules/isolatedFooting';
import { micropilesAdapter, micropilesAiDefaults } from '../../lib/ai/modules/micropiles';
import {
  isolatedFootingDefaults, punchingDefaults, steelBeamDefaults,
  timberBeamDefaults, timberColumnDefaults,
} from '../../data/defaults';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { BEAM_CASES } from '../../lib/calculations/beamCases';

const SI = 'si' as const;
const p = (o: Record<string, unknown>) => ({ ...o, warnings: [] });
const ids = (plan: { risks: { field: string }[] }) => plan.risks.map((r) => r.field);

describe('vigas de acero — el esquema estático no tenía NINGUNA regla', () => {
  // Una viga biapoyada declarada biempotrada: MEd −33%, flecha −70%. Era la rebaja
  // de demanda más barata del módulo, y salía sin una sola fila roja.
  const current = { ...steelBeamDefaults, beamType: 'ss' as const };

  it('el motor SÍ ve la rebaja (los coeficientes de BEAM_CASES)', () => {
    expect(BEAM_CASES.ss.MEd(1, 1) / BEAM_CASES.ff.MEd(1, 1)).toBeCloseTo(1.5, 3);   // −33%
    expect(BEAM_CASES.ff.k_defl / BEAM_CASES.ss.k_defl).toBeCloseTo(0.3, 2);          // −70%
  });

  it('biapoyada → biempotrada: RIESGO en momento y flecha', () => {
    const plan = steelBeamsAdapter.buildPlan(p({ beamType: 'ff' }), current, SI, new Set(['beamType']));
    expect(ids(plan)).toContain('esquema_MEd');
    expect(ids(plan)).toContain('esquema_flecha');
    // El cortante NO cambia entre ss y ff (wL/2 los dos): no se inventa un riesgo.
    expect(ids(plan)).not.toContain('esquema_cortante');
  });

  it('elsCombo: pasar a cuasipermanente multiplica la sobrecarga por ψ₂ → RIESGO', () => {
    const plan = steelBeamsAdapter.buildPlan(
      p({ elsCombo: 'quasi-permanent' }), current, SI, new Set(['elsCombo']),
    );
    expect(ids(plan)).toContain('elsCombo');
  });
});

describe('vigas de madera — el ordinal empataba ss y fp, y la flecha manda', () => {
  // El ordinal se construía con MEd, donde ss y fp son AMBAS wL²/8. Pero la flecha
  // de fp es un 59% menor. En madera la flecha suele dimensionar: "empotrada en el
  // muro" hacía cumplir la viga con riesgo CERO.
  const biapoyada = { ...timberBeamDefaults, beamType: 'ss' as const };

  it('el motor SÍ ve la rebaja: mismo M, 59% menos flecha', () => {
    expect(BEAM_CASES.fp.MEd(1, 1)).toBe(BEAM_CASES.ss.MEd(1, 1)); // el empate del ordinal viejo
    expect(BEAM_CASES.fp.k_defl / BEAM_CASES.ss.k_defl).toBeCloseTo(0.415, 2);
  });

  it('ss → fp: el momento EMPATA, pero la flecha cae → RIESGO de flecha', () => {
    const plan = timberBeamsAdapter.buildPlan(p({ beamType: 'fp' }), biapoyada, SI, new Set(['beamType']));
    expect(ids(plan)).toContain('esquema_flecha');
    expect(ids(plan)).not.toContain('esquema_MEd'); // empatan: no hay nada que avisar
  });
});

describe('pilares de madera — momentAxis no tenía regla', () => {
  const debil = { ...timberColumnDefaults, momentAxis: 'weak' as const };

  it('pasar el momento al eje FUERTE multiplica W por h/b → RIESGO', () => {
    const plan = timberColumnsAdapter.buildPlan(
      p({ momentAxis: 'strong' }), debil, SI, new Set(['momentAxis']),
    );
    expect(ids(plan)).toContain('momentAxis');
  });
});

describe('punzonamiento — isCircular no tenía regla', () => {
  const circular = { ...punchingDefaults, isCircular: true, position: 'interior' as const };

  it('declarar rectangular un pilar CIRCULAR alarga el perímetro crítico → RIESGO', () => {
    const plan = punchingAdapter.buildPlan(
      p({ isCircular: false }), circular, SI, new Set(['isCircular']),
    );
    expect(ids(plan)).toContain('isCircular');
  });
});

describe('zapatas — gamma_soil no tenía regla', () => {
  const current = { ...isolatedFootingDefaults, gamma_soil_kN_m3: 20 };

  it('aligerar las tierras sobre la zapata baja el axil de servicio → RIESGO', () => {
    const plan = isolatedFootingAdapter.buildPlan(
      p({ gamma_soil_kN_m3: 12 }), current, SI, new Set(['gamma_soil_kN_m3']),
    );
    expect(ids(plan)).toContain('gamma_soil_kN_m3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL BUG DE DIRECCIÓN INVERTIDA — la red estaba puesta, y apuntaba al revés.
// ─────────────────────────────────────────────────────────────────────────────
describe('zapatas — γ con las cargas MAYORADAS: el motor DIVIDE', () => {
  // `loadFactor` tenía `higherIsSafer`: solo marcaba las BAJADAS. Pero con
  // loadsAreFactored = true el motor hace N_sls = N/γ, así que SUBIR γ rebaja la
  // demanda de servicio — la del hundimiento, que es quien dimensiona la zapata.
  const mayoradas = { ...isolatedFootingDefaults, loadsAreFactored: true, loadFactor: 1.2 };

  it('el motor SÍ ve la rebaja: subir γ de 1.2 a 2.0 baja el hundimiento de 0.48 a 0.32', () => {
    const antes = calcIsolatedFooting(mayoradas);
    const despues = calcIsolatedFooting({ ...mayoradas, loadFactor: 2.0 });
    const bearing = (r: typeof antes) => r.checks.find((c) => c.id === 'bearing')!.utilization!;
    expect(bearing(antes)).toBeCloseTo(0.478, 2);
    expect(bearing(despues)).toBeCloseTo(0.324, 2); // ¡SUBIR γ hace que cumpla mejor!
    expect(bearing(despues)).toBeLessThan(bearing(antes));
  });

  it('SUBIR γ con cargas mayoradas → RIESGO (esto es lo que antes pasaba limpio)', () => {
    const plan = isolatedFootingAdapter.buildPlan(p({ loadFactor: 2.0 }), mayoradas, SI);
    const r = plan.risks.find((x) => x.field === 'demanda_servicio');
    expect(r).toBeDefined();
    expect(r!.before).toBe('83% de las cargas introducidas');
    expect(r!.after).toBe('50% de las cargas introducidas');
  });

  it('BAJAR γ sin mayorar sigue avisando (la dirección de antes, que sí era correcta)', () => {
    const servicio = { ...isolatedFootingDefaults, loadFactor: 1.5 };
    const plan = isolatedFootingAdapter.buildPlan(p({ loadFactor: 1.0 }), servicio, SI);
    expect(ids(plan)).toContain('demanda_calculo');
  });

  it('el toggle a "mayoradas" sigue avisando desde el default (alwaysCheck)', () => {
    const plan = isolatedFootingAdapter.buildPlan(
      p({ loadsAreFactored: true }), { ...isolatedFootingDefaults }, SI,
    );
    // Baja la demanda de servicio (N/γ) Y la de cálculo (deja de multiplicarse).
    expect(ids(plan)).toEqual(['demanda_servicio', 'demanda_calculo']);
  });
});

describe('micropilotes — φ NO es monótona (el rozamiento tiene un máximo)', () => {
  // El fuste va con K₀·tan(2φ/3) = (1 − sen φ)·tan(2φ/3), que TIENE UN MÁXIMO cerca
  // de 34°: 0.184 a 34°, 0.169 a 45°, 0.154 a 50°. Con `lowerIsSafer` sobre el
  // ÁNGULO, la regla marcaba subir φ de 45° a 50° (que en realidad REBAJA el fuste)
  // y dejaba pasar bajarlo de 50° a 34° (que lo SUBE un 20%).
  const arena = (phi: number) => ({
    ...micropilesAiDefaults,
    soil: [{ id: 1, type: 'granular' as const, thickness: 20, gamma: 19, c: 0, phi, Nspt: 30, su: 0, rflim: 0 }],
  });
  const capa = (phi: number) => ({
    type: 'granular', thickness_m: 20, gamma_kNm3: 19, c_kPa: 0, phi_deg: phi,
    Nspt: 30, su_kPa: 0, rflim_MPa: 0, Cu: null,
  });

  it('φ 30° → 34° sube el rozamiento → RIESGO', () => {
    const plan = micropilesAdapter.buildPlan(p({ soil: [capa(34)] }), arena(30), SI);
    expect(ids(plan)).toContain('soil[0].phi');
  });

  it('φ 50° → 34° BAJA el ángulo pero SUBE el rozamiento un 20% → RIESGO (antes: silencio)', () => {
    const plan = micropilesAdapter.buildPlan(p({ soil: [capa(34)] }), arena(50), SI);
    expect(ids(plan)).toContain('soil[0].phi');
  });

  it('φ 45° → 50° sube el ángulo pero BAJA el rozamiento → sin riesgo (antes: falso rojo)', () => {
    const plan = micropilesAdapter.buildPlan(p({ soil: [capa(50)] }), arena(45), SI);
    expect(ids(plan)).not.toContain('soil[0].phi');
  });
});

// Tests del adapter retaining-wall (src/lib/ai/modules/retainingWall.ts, ola 2):
// unidades mixtas (geometría en m, recubrimiento en mm), Ø = 0 como "zona sin
// definir" (modo dimensionado), gates (hasWater → hw; Ab = 0 → S), la tabla
// anti-trampa geotécnica completa (las dos direcciones conviven) y el aviso del
// núcleo central — con |e| ≥ B/3 el motor OMITE el bloque de armado entero.
//
// current = retainingWallDefaults: H=3 · hf=0.5 · tFuste=0.3 · punta 0.6 · talón
// 1.5 · HA-25 B500S · rec. 40 mm · γ=18 · φ=30 · δ=10 · q=0 · σadm=200 · μ=0.40 ·
// sin pasivo · sin NF · sin sismo · todo el armado sin definir (Ø=0).

import { describe, it, expect } from 'vitest';
import {
  retainingWallAdapter,
  summarizeRetainingWallResults,
  SEISMIC_GATE_REASON,
  WATER_GATE_REASON,
} from '../../lib/ai/modules/retainingWall';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { retainingWallDefaults, type RetainingWallInputs } from '../../data/defaults';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

type Payload = Record<string, unknown>;

function plan(
  partial: Payload = {},
  current: RetainingWallInputs = retainingWallDefaults,
): AiApplyPlan<RetainingWallInputs> {
  return retainingWallAdapter.buildPlan({ warnings: [], ...partial }, current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<RetainingWallInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<RetainingWallInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<RetainingWallInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('retainingWall adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => retainingWallAdapter.buildPlan([], retainingWallDefaults, SYSTEM)).toThrow(AiError);
  });

  it('hasWater con tipo incorrecto → null (no aplica)', () => {
    const p = retainingWallAdapter.buildPlan({ hasWater: 'si' }, retainingWallDefaults, SYSTEM);
    expect(p.fields.hasWater).toBeUndefined();
  });
});

describe('retainingWall adapter — unidades mixtas', () => {
  it('la geometría va en METROS, sin conversión', () => {
    const p = plan({ H_m: 4.5, bTalon_m: 2.2 });
    expect(p.fields).toMatchObject({ H: 4.5, bTalon: 2.2 });
    expect(changeFor(p, 'Altura contenida H')).toMatchObject({ before: '3.00 m', after: '4.50 m' });
  });

  it('el recubrimiento va en MILÍMETROS', () => {
    const p = plan({ cover_mm: 50 });
    expect(p.fields.cover).toBe(50);
    expect(changeFor(p, 'Recubrimiento')).toMatchObject({ before: '40 mm', after: '50 mm' });
  });

  it('un recubrimiento de 0.04 (metros mal convertidos) → skip, NO se aplica', () => {
    const p = plan({ cover_mm: 0.04 });
    expect(skipFor(p, 'Recubrimiento')?.reason).toContain('fuera del rango');
    expect(p.fields.cover).toBeUndefined();
  });

  it('valor igual al actual → skip ALREADY (nunca se aplica en silencio)', () => {
    expect(skipFor(plan({ phi_deg: 30 }), 'Rozamiento interno φ')?.reason).toBe(ALREADY);
  });
});

describe('retainingWall adapter — armado (Ø = 0 es "sin definir")', () => {
  it('Ø = 0 es un valor legítimo: la zona pasa a modo dimensionado', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, diam_fv_int: 16 };
    const p = plan({ diam_fv_int_mm: 0 }, current);
    expect(p.fields.diam_fv_int).toBe(0);
    expect(changeFor(p, 'Fuste vertical (trasdós) — Ø')?.after).toContain('sin definir');
  });

  it('Ø fuera del catálogo del muro → skip (aquí no hay Ø25)', () => {
    expect(skipFor(plan({ diam_zs_mm: 25 }), 'Zapata superior (talón) — Ø')?.reason)
      .toContain('no está entre los diámetros disponibles');
  });

  it('las 7 zonas de armado son proponibles', () => {
    const p = plan({
      diam_fv_int_mm: 16, sep_fv_int_mm: 150,
      diam_fv_ext_mm: 12, diam_fh_mm: 12, diam_zs_mm: 16,
      diam_zi_mm: 16, diam_zt_inf_mm: 12, diam_zt_sup_mm: 12,
    });
    expect(p.fields.diam_fv_int).toBe(16);
    expect(p.fields.sep_fv_int).toBe(150);
    expect(p.fields.diam_zt_sup).toBe(12);
  });
});

describe('retainingWall adapter — gates', () => {
  it('la profundidad del NF sin nivel freático → skip', () => {
    expect(skipFor(plan({ hw_m: 1.5 }), 'Profundidad del NF')?.reason).toBe(WATER_GATE_REASON);
  });

  it('hasWater=true en el mismo turno abre el gate de hw', () => {
    const p = plan({ hasWater: true, hw_m: 1.5 });
    expect(p.fields.hasWater).toBe(true);
    expect(p.fields.hw).toBe(1.5);
  });

  it('S sin sismo (Ab = 0) → skip', () => {
    expect(skipFor(plan({ S: 1.3 }), 'Amplificación del terreno S')?.reason).toBe(SEISMIC_GATE_REASON);
  });

  it('Ab > 0 en el mismo turno abre el gate de S', () => {
    const p = plan({ Ab: 0.12, S: 1.3 });
    expect(p.fields.Ab).toBe(0.12);
    expect(p.fields.S).toBe(1.3);
  });

  it('empuje pasivo sin empotramiento por delante → warning (no skip)', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, hf: 0.5, df: 0 };
    const p = plan({ usePassive: true }, { ...current, hf: 0 });
    expect(p.fields.usePassive).toBe(true);
    expect(p.warnings.some((w) => w.includes('empotramiento'))).toBe(true);
  });
});

describe('retainingWall adapter — la tabla anti-trampa geotécnica', () => {
  it('SUBIR φ es riesgo (baja Ka y con él todo el empuje)', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, phi: 28 };
    expect(riskFor(plan({ phi_deg: 38 }, current), 'phi')?.why).toContain('empuje activo');
  });

  it('BAJAR γ del relleno es riesgo (el empuje es proporcional a γ)', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, gammaSuelo: 20 };
    expect(riskFor(plan({ gammaSuelo_kNm3: 15 }, current), 'gammaSuelo')).toBeDefined();
  });

  it('subir σadm o μ es riesgo (los fija el geotécnico)', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, sigmaAdm: 150, mu: 0.35 };
    const p = plan({ sigmaAdm_kPa: 400, mu: 0.6 }, current);
    expect(riskFor(p, 'sigmaAdm')).toBeDefined();
    expect(riskFor(p, 'mu')).toBeDefined();
  });

  it('bajar la altura contenida o la sobrecarga es riesgo', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, H: 5, q: 10 };
    const p = plan({ H_m: 3, q_kNm2: 0 }, current);
    expect(riskFor(p, 'H')).toBeDefined();
    expect(riskFor(p, 'q')).toBeDefined();
  });

  it('quitar el nivel freático es riesgo (borra el empuje hidrostático)', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, hasWater: true };
    expect(riskFor(plan({ hasWater: false }, current), 'hasWater')?.why).toContain('hidrostático');
  });

  it('ponerlo NO es riesgo (vuelve al lado seguro)', () => {
    expect(plan({ hasWater: true }).risks).toEqual([]);
  });

  it('profundizar el NF es riesgo; subirlo no', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, hasWater: true, hw: 1.0 };
    expect(riskFor(plan({ hw_m: 4 }, current), 'hw')).toBeDefined();
    expect(plan({ hw_m: 0.5 }, current).risks).toEqual([]);
  });

  it('activar el empuje pasivo es riesgo AUNQUE venga del default (alwaysCheck)', () => {
    expect(riskFor(plan({ usePassive: true }), 'usePassive')?.why).toContain('CTE');
  });

  it('desactivarlo NO es riesgo', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, usePassive: true };
    expect(plan({ usePassive: false }, current).risks).toEqual([]);
  });

  it('agrandar la zapata o el fuste NUNCA es riesgo (es la salida legítima)', () => {
    const current: RetainingWallInputs = { ...retainingWallDefaults, bTalon: 2.0 };
    expect(plan({ bTalon_m: 3.0, hf_m: 0.8, tFuste_m: 0.45 }, current).risks).toEqual([]);
  });
});

describe('retainingWall adapter — snapshot', () => {
  it('defaults → 35 claves sin confirmar', () => {
    const snap = JSON.parse(retainingWallAdapter.snapshot(retainingWallDefaults));
    expect(snap.valores.H_m).toBe(3);
    expect(snap.valores.cover_mm).toBe(40);
    expect(snap.valores.diam_fv_int_mm).toBe(0);
    expect(snap.valores.title).toBeUndefined();
    expect(snap.sin_confirmar).toHaveLength(35);
  });

  it('un dato del terreno tocado sale de sin_confirmar', () => {
    const snap = JSON.parse(retainingWallAdapter.snapshot({ ...retainingWallDefaults, phi: 34 }));
    expect(snap.sin_confirmar).not.toContain('phi_deg');
    expect(snap.sin_confirmar).toContain('delta_deg');
  });
});

describe('retainingWall adapter — resumen de resultados', () => {
  it('extras: empujes, factores de seguridad y tensiones', () => {
    const s = summarizeRetainingWallResults(calcRetainingWall(retainingWallDefaults));
    expect(s.text).toContain('Ka =');
    expect(s.text).toContain('FS vuelco =');
    expect(s.text).toContain('σmax =');
  });

  it('con sismo, los FS mostrados son los SÍSMICOS', () => {
    const s = summarizeRetainingWallResults(
      calcRetainingWall({ ...retainingWallDefaults, Ab: 0.16, S: 1.3 }),
    );
    expect(s.text).toContain('SÍSMICOS');
    expect(s.text).toContain('kh =');
  });

  it('fuera del núcleo central (|e| ≥ B/3): avisa de que NO se ha comprobado el armado', () => {
    // Talón mínimo → resultante muy excéntrica.
    const r = calcRetainingWall({ ...retainingWallDefaults, H: 6, bTalon: 0.1, bPunta: 0.1 });
    expect(r.checks.some((c) => c.id === 'fuste-bending')).toBe(false);
    const s = summarizeRetainingWallResults(r);
    expect(s.text).toContain('núcleo central');
    expect(s.text).toContain('No faltan comprobaciones');
  });

  it('un muro que incumple se resume como fail, no como invalid', () => {
    const s = summarizeRetainingWallResults(
      calcRetainingWall({ ...retainingWallDefaults, H: 6, sigmaAdm: 60 }),
    );
    expect(s.verdict).toBe('fail');
  });

  it('entrada inválida → invalid (error != null)', () => {
    const s = summarizeRetainingWallResults(calcRetainingWall({ ...retainingWallDefaults, H: 0 }));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});

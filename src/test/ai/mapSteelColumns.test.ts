// Tests del adapter steel-columns (src/lib/ai/modules/steelColumns.ts, ola 1):
// validación cruzada familia↔tamaño (catálogo de la familia FINAL; 2UPN usa
// getSizesUPN, CHS ignora `size`), conversión Ly/Lz m→mm, gate del bloque CHS,
// β derivado de bcType (sincronizado en fields SIN fila de cambio) y reglas de
// seguridad (bcType ordinal por β).
//
// current = steelColumnDefaults: HEB 200 · S275 · Ly=Lz=3500 mm · bcType='pp' ·
// βy=βz=1.0 · Ned=400 · My=50 · Mz=8. system = 'si'.

import { describe, it, expect } from 'vitest';
import {
  steelColumnsAdapter,
  summarizeSteelColumnResults,
  BETA_GATE_REASON,
  CHS_ONLY_REASON,
  CHS_SIZE_REASON,
  RHS_B_REASON,
} from '../../lib/ai/modules/steelColumns';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { steelColumnDefaults, type SteelColumnInputs } from '../../data/defaults';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { getSizesUPN } from '../../data/steelProfiles';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

interface Payload {
  sectionType: string | null; size: number | null; steel: string | null;
  tubo_h_mm: number | null; tubo_b_mm: number | null; tubo_t_mm: number | null; tubo_proceso: string | null;
  Ly_m: number | null; Lz_m: number | null;
  bcType: string | null; beta_y: number | null; beta_z: number | null;
  Ned_kN: number | null; My_kNm: number | null; Mz_kNm: number | null;
  warnings: string[];
}

function makePayload(partial: Partial<Payload> = {}): Payload {
  return {
    sectionType: null, size: null, steel: null,
    tubo_h_mm: null, tubo_b_mm: null, tubo_t_mm: null, tubo_proceso: null,
    Ly_m: null, Lz_m: null, bcType: null, beta_y: null, beta_z: null,
    Ned_kN: null, My_kNm: null, Mz_kNm: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: SteelColumnInputs = steelColumnDefaults,
): AiApplyPlan<SteelColumnInputs> {
  return steelColumnsAdapter.buildPlan(makePayload(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<SteelColumnInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<SteelColumnInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<SteelColumnInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('steelColumns adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => steelColumnsAdapter.buildPlan('x', steelColumnDefaults, SYSTEM)).toThrow(AiError);
  });
});

describe('steelColumns adapter — validación cruzada familia ↔ tamaño', () => {
  it('tamaño inexistente en la familia vigente → skip con el catálogo en el motivo', () => {
    const p = plan({ size: 999 });
    expect(skipFor(p, 'Tamaño del perfil')?.reason).toContain('no está en el catálogo');
    expect(p.fields.size).toBeUndefined();
  });

  it('el tamaño se valida contra la familia PROPUESTA, no la vigente', () => {
    // 2UPN sí tiene 380 (catálogo UPN); HEB no.
    expect(getSizesUPN()).toContain(380);
    const p = plan({ sectionType: '2UPN', size: 380 });
    expect(p.fields.sectionType).toBe('2UPN');
    expect(p.fields.size).toBe(380);
    expect(changeFor(p, 'Tamaño del perfil')?.after).toBe('2UPN 380');
  });

  it('cambio de familia SIN tamaño y con el vigente inválido → auto-ajuste + warning', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, sectionType: 'HEB', size: 1000 };
    const p = plan({ sectionType: 'IPE' }, current);
    expect(p.fields.size).toBe(80); // primer IPE del catálogo
    expect(p.warnings.join(' ')).toContain('se ajusta al primero disponible');
  });

  it('cambio de familia SIN tamaño con el vigente válido → se conserva (sin warning)', () => {
    const p = plan({ sectionType: 'HEA' }); // HEA 200 existe
    expect(p.fields.size).toBeUndefined();
    expect(p.warnings).toEqual([]);
  });

  it('familia desconocida → skip', () => {
    expect(skipFor(plan({ sectionType: 'UPE' }), 'Familia del perfil')?.reason).toContain('desconocida');
  });
});

describe('steelColumns adapter — gate de tubos', () => {
  it('con CHS propuesto, `size` se salta (el tubo se define con tubo_h/tubo_t)', () => {
    const p = plan({ sectionType: 'CHS', size: 200, tubo_h_mm: 219.1, tubo_t_mm: 10 });
    expect(skipFor(p, 'Tamaño del perfil')?.reason).toBe(CHS_SIZE_REASON);
    expect(p.fields.chs_D).toBe(219.1);
    expect(p.fields.chs_t).toBe(10);
  });

  it('con SHS propuesto, tubo_h/tubo_t van a rhs_h/rhs_t (y tubo_b se salta)', () => {
    // Valores ≠ defaults (rhs_h 150 / rhs_t 8): un valor igual al vigente se
    // saltaría con ALREADY, que no es lo que se prueba aquí.
    const p = plan({ sectionType: 'SHS', tubo_h_mm: 160, tubo_b_mm: 120, tubo_t_mm: 6 });
    expect(p.fields.sectionType).toBe('SHS');
    expect(p.fields.rhs_h).toBe(160);
    expect(p.fields.rhs_t).toBe(6);
    expect(skipFor(p, 'Ancho del tubo b')?.reason).toBe(RHS_B_REASON);
    expect(p.fields.rhs_b).toBeUndefined();
  });

  it('con RHS propuesto, las tres dimensiones aplican', () => {
    const p = plan({ sectionType: 'RHS', tubo_h_mm: 200, tubo_b_mm: 120, tubo_t_mm: 10, tubo_proceso: 'hot-finished' });
    expect(p.fields.rhs_h).toBe(200);
    expect(p.fields.rhs_b).toBe(120);
    expect(p.fields.rhs_t).toBe(10);
    expect(p.fields.rhs_process).toBe('hot-finished');
  });

  it('con perfil abierto vigente, los datos del tubo se saltan', () => {
    const p = plan({ tubo_h_mm: 200, tubo_t_mm: 8, tubo_proceso: 'cold-formed' });
    expect(skipFor(p, 'Dimensión del tubo h/D')?.reason).toBe(CHS_ONLY_REASON);
    expect(skipFor(p, 'Espesor del tubo t')?.reason).toBe(CHS_ONLY_REASON);
    expect(skipFor(p, 'Proceso del tubo')?.reason).toBe(CHS_ONLY_REASON);
    expect(p.fields.chs_D).toBeUndefined();
    expect(p.fields.rhs_h).toBeUndefined();
  });
});

describe('steelColumns adapter — longitudes de pandeo (m → mm)', () => {
  it('convierte metros a mm', () => {
    const p = plan({ Ly_m: 4, Lz_m: 2.5 });
    expect(p.fields.Ly).toBe(4000);
    expect(p.fields.Lz).toBe(2500);
    expect(changeFor(p, 'Longitud de pandeo Lz')).toMatchObject({ before: '3.50 m', after: '2.50 m' });
  });

  it('valor igual al actual (3.5 m) → ALREADY', () => {
    expect(skipFor(plan({ Ly_m: 3.5 }), 'Longitud de pandeo Ly')?.reason).toBe(ALREADY);
  });

  it('fuera de rango → skip sin clamp', () => {
    expect(skipFor(plan({ Ly_m: 0 }), 'Longitud de pandeo Ly')?.reason).toContain('fuera del rango');
  });
});

describe('steelColumns adapter — β derivado de la condición de apoyo', () => {
  it('β propuesto sin bcType="custom" → skip', () => {
    expect(skipFor(plan({ beta_y: 0.5 }), 'Coef. pandeo βy')?.reason).toBe(BETA_GATE_REASON);
  });

  it('cambiar bcType sincroniza β en fields (sin fila propia de cambio) + warning', () => {
    const p = plan({ bcType: 'ff' });
    expect(p.fields.bcType).toBe('ff');
    expect(p.fields.beta_y).toBe(0.5);
    expect(p.fields.beta_z).toBe(0.5);
    // β es CONSECUENCIA de bcType, no una decisión: no duplica fila en la tabla.
    expect(changeFor(p, 'Coef. pandeo βy')).toBeUndefined();
    expect(p.warnings.join(' ')).toContain('La condición de apoyo fija β');
  });

  it('con bcType="custom" propuesto, β sí se aplica', () => {
    const p = plan({ bcType: 'custom', beta_y: 0.85, beta_z: 1.2 });
    expect(p.fields.beta_y).toBe(0.85);
    expect(p.fields.beta_z).toBe(1.2);
    expect(changeFor(p, 'Coef. pandeo βy')).toMatchObject({ before: '1.00', after: '0.85' });
  });
});

describe('steelColumns adapter — esfuerzos', () => {
  it('momento negativo → valor absoluto + warning (el motor lo normaliza)', () => {
    const p = plan({ Mz_kNm: -20 });
    expect(p.fields.Mz_Ed).toBe(20);
    expect(p.warnings.join(' ')).toContain('valor absoluto');
  });

  it('axil negativo → skip por rango', () => {
    expect(skipFor(plan({ Ned_kN: -100 }), 'Axil N_Ed')?.reason).toContain('fuera del rango');
  });
});

describe('steelColumns adapter — reglas de seguridad', () => {
  it('"empotrar" un pilar biarticulado (pf → ff) → riesgo, UNA fila POR EJE', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, bcType: 'pf' };
    const p = plan({ bcType: 'ff' }, current);
    // El riesgo vive sobre la β EFECTIVA (fuga 2), no sobre `bcType`: así cubre
    // también el atajo `{bcType:'custom', beta:0.5}`, que el ordinal dejaba pasar.
    // Una fila por eje es lo que permite cazar un cambio ASIMÉTRICO en 'custom'
    // (β_y arriba, β_z abajo): una sola magnitud agregada se lo tragaría.
    expect(p.risks.map((r) => r.field)).toEqual(['beta_y_efectiva', 'beta_z_efectiva']);
    expect(p.risks[0].why).toContain('nudos reales');
    expect(p.risks[0].before).toBe('0.70');
    expect(p.risks[0].after).toBe('0.50');
  });

  it('pasar a ménsula (fc, β=2.0) NO es riesgo: es más conservador', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, bcType: 'ff' };
    expect(plan({ bcType: 'fc' }, current).risks).toEqual([]);
  });

  it('acortar una longitud de pandeo fijada → riesgo', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, Lz: 5000 };
    expect(riskFor(plan({ Lz_m: 2 }, current), 'Lz')?.why).toContain('arriostramientos');
  });

  it('rebajar esfuerzos fijados → riesgo', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, Ned: 900, My_Ed: 120 };
    expect(riskFor(plan({ Ned_kN: 400 }, current), 'Ned')).toBeDefined();
    expect(riskFor(plan({ My_kNm: 20 }, current), 'My_Ed')).toBeDefined();
  });

  it('subir el perfil o el acero NUNCA es riesgo (es la vía legítima)', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, size: 240 };
    expect(plan({ sectionType: 'HEB', size: 300, steel: 'S355' }, current).risks).toEqual([]);
  });

  it('rebajar β con bcType="custom" vigente → riesgo (solo el eje que baja)', () => {
    const current: SteelColumnInputs = { ...steelColumnDefaults, bcType: 'custom', beta_z: 1.5 };
    const p = plan({ beta_z: 0.7 }, current);
    expect(p.risks.map((r) => r.field)).toEqual(['beta_z_efectiva']);
  });
});

describe('steelColumns adapter — snapshot', () => {
  it('Ly/Lz se serializan en METROS (unidades del payload)', () => {
    const snap = JSON.parse(steelColumnsAdapter.snapshot(steelColumnDefaults));
    expect(snap.valores.Ly_m).toBe(3.5);
    expect(snap.valores.Lz_m).toBe(3.5);
    expect(snap.valores.sectionType).toBe('HEB');
    expect(snap.sin_confirmar).toHaveLength(15);
  });

  it('la comparación con el default se hace en mm (sin ruido de redondeo)', () => {
    const snap = JSON.parse(steelColumnsAdapter.snapshot({ ...steelColumnDefaults, Lz: 2500 }));
    expect(snap.valores.Lz_m).toBe(2.5);
    expect(snap.sin_confirmar).not.toContain('Lz_m');
    expect(snap.sin_confirmar).toContain('Ly_m');
  });
});

describe('steelColumns adapter — resumen de resultados', () => {
  it('cálculo válido → veredicto + extras de utilización y pandeo', () => {
    const s = summarizeSteelColumnResults(calcSteelColumn(steelColumnDefaults));
    expect(s.verdict).not.toBe('invalid');
    expect(s.text).toContain('Utilización gobernante');
    expect(s.text).toContain('λ̄y');
  });

  it('sección clase 4 / perfil inexistente → invalid (error != null)', () => {
    const s = summarizeSteelColumnResults(
      calcSteelColumn({ ...steelColumnDefaults, size: 999 }),
    );
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});

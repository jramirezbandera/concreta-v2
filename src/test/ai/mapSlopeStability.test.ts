// Adapter IA de Taludes (ola 3 — arrays ×2 + cálculo MANUAL):
//   - Par del nivel freático (sinNivelFreatico/nfProfundidad_m): la clave
//     interna waterTableDepth usa null como "sin NF" y colisionaría con el
//     null del payload ("sin cambio").
//   - Arrays strata/loads con REEMPLAZO completo (Σespesores ≥ altura,
//     coherencia granular, [] válido en loads = quitar sobrecargas).
//   - Riesgos: geometría real (height/angle), NF (quitar/profundizar),
//     situación/contexto ordinales, estratos con γ en dirección TALUD
//     (bajar γ = riesgo — opuesto a micropilotes) y eliminación de cargas.
//   - summarizeSlopeResults con TRES estados (sin calcular/fresco/stale) —
//     fixture de SlopeResult: el motor real es Pyodide asíncrono.
//   - resultsRecalc: 'manual' (único módulo).
// current = slopeDefaults: H=5, β=30°, seco, 1 estrato cohesivo de 20 m,
// sin cargas, bishop, persistente, excavación.

import { describe, expect, it } from 'vitest';
import {
  slopeStabilityAdapter,
  summarizeSlopeResults,
  SLOPE_STALE_NOTICE,
} from '../../lib/ai/modules/slopeStability';
import type { SlopeResult } from '../../lib/calculations/geotech/types';
import { slopeDefaults, type SlopeInputs, type SlopeLoad, type SoilLayer } from '../../data/defaults';

const DEFAULTS = slopeDefaults;

type Payload = Record<string, unknown>;

const PAYLOAD_KEYS = [
  'height_m', 'angle_deg', 'sinNivelFreatico', 'nfProfundidad_m',
  'method', 'situation', 'context', 'strata', 'loads',
] as const;

function makePayload(overrides: Payload = {}): Payload {
  const base: Payload = { warnings: [] };
  for (const k of PAYLOAD_KEYS) base[k] = null;
  return { ...base, ...overrides };
}

function plan(overrides: Payload = {}, current: SlopeInputs = DEFAULTS) {
  return slopeStabilityAdapter.buildPlan(makePayload(overrides), current, 'si');
}

function changeFor(p: ReturnType<typeof plan>, label: string) {
  return p.changes.find((c) => c.label === label);
}
function skipFor(p: ReturnType<typeof plan>, label: string) {
  return p.skipped.find((s) => s.label === label);
}

function stratumPayload(overrides: Payload = {}): Payload {
  return {
    type: 'cohesive', thickness_m: 20, gamma_kNm3: 19,
    c_kPa: 10, phi_deg: 28, su_kPa: null,
    ...overrides,
  };
}

// ── Nivel freático (el par) ───────────────────────────────────────────────────

describe('nivel freático: par sinNivelFreatico / nfProfundidad_m', () => {
  const CON_NF: SlopeInputs = { ...DEFAULTS, waterTableDepth: 2.5 };

  it('profundidad aplica como waterTableDepth interno', () => {
    const p = plan({ sinNivelFreatico: false, nfProfundidad_m: 4 });
    expect(p.fields.waterTableDepth).toBe(4);
    expect(changeFor(p, 'Nivel freático')).toMatchObject({
      before: 'Sin NF (seco)', after: '4 m bajo coronación',
    });
  });

  it('sinNivelFreatico=true quita el NF (waterTableDepth = null en fields)', () => {
    const p = plan({ sinNivelFreatico: true }, CON_NF);
    expect('waterTableDepth' in p.fields).toBe(true);
    expect(p.fields.waterTableDepth).toBeNull();
    expect(changeFor(p, 'Nivel freático')?.after).toBe('Sin NF (seco)');
  });

  it('seco + sinNivelFreatico=true → ALREADY', () => {
    const p = plan({ sinNivelFreatico: true });
    expect(skipFor(p, 'Nivel freático')?.reason).toBe('Ya coincide con el valor actual');
  });

  it('contradicción (true + profundidad) → warning y se ignora la profundidad', () => {
    const p = plan({ sinNivelFreatico: true, nfProfundidad_m: 3 }, CON_NF);
    expect(p.fields.waterTableDepth).toBeNull();
    expect(p.warnings.some((w) => w.includes('se ignora la profundidad'))).toBe(true);
  });

  it('false sin profundidad → skip pidiendo el dato', () => {
    const p = plan({ sinNivelFreatico: false });
    expect(skipFor(p, 'Nivel freático')?.reason).toMatch(/falta su profundidad/);
  });

  it('el par ausente entero cuenta UNA vez en notFound', () => {
    const p = plan({});
    expect(p.notFound.filter((l) => l === 'Nivel freático')).toHaveLength(1);
  });
});

// ── Arrays ────────────────────────────────────────────────────────────────────

describe('strata: reemplazo completo', () => {
  it('perfil válido reemplaza con ids 1..n y granular fuerza c/su=0', () => {
    const p = plan({
      strata: [
        { type: 'granular', thickness_m: 3, gamma_kNm3: 18, c_kPa: 5, phi_deg: 32, su_kPa: null },
        stratumPayload({ thickness_m: 17 }),
      ],
    });
    const strata = p.fields.strata as SoilLayer[];
    expect(strata.map((l) => l.id)).toEqual([1, 2]);
    expect(strata[0]).toMatchObject({ type: 'granular', c: 0, su: 0, Nspt: 0, rflim: 0 });
    expect(p.warnings.some((w) => w.includes("c' y su se fuerzan a 0"))).toBe(true);
  });

  it('Σespesores < altura del talud EFECTIVA → skip', () => {
    const p = plan({ height_m: 12, strata: [stratumPayload({ thickness_m: 8 })] });
    expect(skipFor(p, 'Estratigrafía')?.reason).toMatch(/no cubren la altura del talud \(12 m\)/);
  });

  it('elemento inválido → skip del array entero', () => {
    const p = plan({ strata: [stratumPayload(), stratumPayload({ gamma_kNm3: 5 })] });
    expect(skipFor(p, 'Estratigrafía')?.reason).toMatch(/Estrato 2: γ 5.*no se aplica ningún estrato/);
  });

  it('lista idéntica a la vigente (otros ids) → ALREADY', () => {
    const p = plan({ strata: [stratumPayload()] });
    expect(skipFor(p, 'Estratigrafía')?.reason).toBe('Ya coincide con el valor actual');
  });
});

describe('loads: reemplazo completo', () => {
  const CON_CARGA: SlopeInputs = {
    ...DEFAULTS,
    loads: [{ id: 1, kind: 'udl', magnitude: 10, offset: 0, length: 0 }],
  };

  it('añadir cargas aplica con ids 1..n; line con length se ignora con warning', () => {
    const p = plan({
      loads: [
        { kind: 'udl', magnitude: 15, offset_m: 1, length_m: 4 },
        { kind: 'line', magnitude: 50, offset_m: 2, length_m: 3 },
      ],
    });
    const loads = p.fields.loads as SlopeLoad[];
    expect(loads).toHaveLength(2);
    expect(loads[0]).toMatchObject({ id: 1, kind: 'udl', magnitude: 15, offset: 1, length: 4 });
    expect(loads[1].length).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('length_m solo aplica'))).toBe(true);
  });

  it('lista vacía [] = quitar todas las sobrecargas → aplica y marca riesgo de eliminación', () => {
    const p = plan({ loads: [] }, CON_CARGA);
    expect(p.fields.loads).toEqual([]);
    expect(changeFor(p, 'Sobrecargas en coronación')?.after).toBe('sin sobrecargas');
    const removal = p.risks.find((r) => r.field === 'loads.__removed');
    expect(removal).toMatchObject({ label: 'Sobrecargas', before: '1', after: '0' });
  });

  it('magnitud fuera de rango → skip del array', () => {
    const p = plan({ loads: [{ kind: 'udl', magnitude: 5000, offset_m: 0, length_m: 0 }] });
    expect(skipFor(p, 'Sobrecargas en coronación')?.reason).toMatch(/fuera del rango/);
  });
});

// ── Riesgos ───────────────────────────────────────────────────────────────────

describe('riesgos de seguridad', () => {
  it('bajar altura/ángulo confirmados marca (rediseño consciente vía interlock)', () => {
    const current: SlopeInputs = { ...DEFAULTS, height: 8, angle: 45 };
    const p = plan({ height_m: 5, angle_deg: 30 }, current);
    expect(p.risks.map((r) => r.field)).toEqual(['height', 'angle']);
    expect(p.risks[0].why).toMatch(/REDISEÑANDO/);
  });

  it('quitar el NF establecido o profundizarlo marca; añadir agua no', () => {
    const conNF: SlopeInputs = { ...DEFAULTS, waterTableDepth: 2 };
    expect(plan({ sinNivelFreatico: true }, conNF).risks.map((r) => r.field)).toEqual(['waterTableDepth']);
    expect(plan({ nfProfundidad_m: 6 }, conNF).risks.map((r) => r.field)).toEqual(['waterTableDepth']);
    expect(plan({ nfProfundidad_m: 1 }, conNF).risks).toEqual([]);
    // gate anti-ruido: añadir NF sobre el default seco no marca
    expect(plan({ sinNivelFreatico: false, nfProfundidad_m: 3 }).risks).toEqual([]);
  });

  it('relajar situación/contexto confirmados marca', () => {
    const current: SlopeInputs = { ...DEFAULTS, situation: 'transient', context: 'global-foundation' };
    const p = plan({ situation: 'extraordinary', context: 'excavation' }, current);
    expect(p.risks.map((r) => r.field).sort()).toEqual(['context', 'situation']);
  });

  it('estratos tocados: bajar γ marca (dirección TALUD) y subir c/su/φ marca', () => {
    const touched: SlopeInputs = {
      ...DEFAULTS,
      strata: [{ id: 1, type: 'cohesive', thickness: 20, gamma: 19, c: 10, phi: 28, Nspt: 0, su: 60, rflim: 0 }],
    };
    const gammaDown = plan({ strata: [stratumPayload({ gamma_kNm3: 17, su_kPa: 60 })] }, touched);
    expect(gammaDown.risks.map((r) => r.field)).toEqual(['strata[0].gamma']);
    const better = plan({ strata: [stratumPayload({ c_kPa: 30, phi_deg: 34, su_kPa: 120 })] }, touched);
    expect(better.risks.map((r) => r.field).sort()).toEqual(['strata[0].c', 'strata[0].phi', 'strata[0].su']);
  });

  it('gate de fábrica: la primera estratigrafía sobre el default no marca', () => {
    const p = plan({ strata: [stratumPayload({ c_kPa: 40, gamma_kNm3: 17 })] });
    expect(p.risks).toEqual([]);
  });
});

// ── Snapshot y metadatos ──────────────────────────────────────────────────────

describe('snapshot {valores, sin_confirmar}', () => {
  const snapshotOf = (c: SlopeInputs) =>
    JSON.parse(slopeStabilityAdapter.snapshot(c)) as {
      valores: Record<string, unknown>;
      sin_confirmar: string[];
    };

  it('valores cubre las claves del schema (sin warnings), arrays en forma de payload', () => {
    const snap = snapshotOf(DEFAULTS);
    const schemaKeys = Object.keys(
      (slopeStabilityAdapter.payloadSchema as { properties: Record<string, unknown> }).properties,
    ).filter((k) => k !== 'warnings');
    expect(Object.keys(snap.valores)).toEqual(schemaKeys);
    expect(snap.valores.sinNivelFreatico).toBe(true);
    expect(snap.valores.nfProfundidad_m).toBeNull();
    expect((snap.valores.strata as unknown[])).toHaveLength(1);
    expect(snap.valores.loads).toEqual([]);
  });

  it('estado de fábrica → todo sin_confirmar; NF tocado saca el PAR', () => {
    expect(snapshotOf(DEFAULTS).sin_confirmar).toEqual([
      'height_m', 'angle_deg', 'sinNivelFreatico', 'nfProfundidad_m',
      'method', 'situation', 'context', 'strata', 'loads',
    ]);
    const conNF = snapshotOf({ ...DEFAULTS, waterTableDepth: 3 });
    expect(conNF.sin_confirmar).not.toContain('sinNivelFreatico');
    expect(conNF.sin_confirmar).not.toContain('nfProfundidad_m');
  });

  it('metadatos: id, label y resultsRecalc MANUAL', () => {
    expect(slopeStabilityAdapter.id).toBe('slope-stability');
    expect(slopeStabilityAdapter.label).toBe('Estabilidad de taludes');
    expect(slopeStabilityAdapter.resultsRecalc).toBe('manual');
    expect(slopeStabilityAdapter.promptRules).toContain('Calcular');
  });
});

// ── Resumen de resultados (3 estados) ─────────────────────────────────────────

/** Fixture mínimo de SlopeResult (el motor real es Pyodide asíncrono). */
function slopeResultFixture(overrides: Partial<SlopeResult> = {}): SlopeResult {
  return {
    valid: true,
    fos: 1.62,
    run: {} as SlopeResult['run'],
    engine: {} as SlopeResult['engine'],
    checks: [
      {
        id: 'fos-static', description: 'FoS estático (γ_R = 1.5)',
        value: 'FoS = 1.62', limit: '≥ 1.50', utilization: 1.5 / 1.62,
        status: 'ok', article: 'CTE DB-SE-C 7.2.2.1',
      },
      {
        id: 'fos-ec7-da3', description: 'EC7 DA-3',
        value: 'FoS_d = 1.10', limit: '≥ 1.00', utilization: 1 / 1.1,
        status: 'ok', article: 'EC7 Anejo A',
      },
    ],
    ...overrides,
  };
}

describe('summarizeSlopeResults — tres estados', () => {
  it('sin corrida (null) → invalid con "SIN CALCULAR" (y sin tarjeta de diagnóstico)', () => {
    const s = summarizeSlopeResults(null, false);
    expect(s.verdict).toBe('invalid');
    expect(s.text.startsWith('SIN CALCULAR')).toBe(true);
    expect(s.text).toContain('"Calcular"');
  });

  it('corrida fresca → resumen normal con el FoS como línea extra', () => {
    const s = summarizeSlopeResults(slopeResultFixture(), false);
    expect(s.verdict).toBe('ok');
    expect(s.text).toContain('VEREDICTO GLOBAL');
    expect(s.text).toContain('FoS estático (característico) = 1.62');
    expect(s.text).not.toContain(SLOPE_STALE_NOTICE);
  });

  it('corrida stale → AVISO como primera línea y MISMO verdict que la corrida', () => {
    const failing = slopeResultFixture({
      fos: 1.1,
      checks: [{
        id: 'fos-static', description: 'FoS estático (γ_R = 1.5)',
        value: 'FoS = 1.10', limit: '≥ 1.50', utilization: 1.5 / 1.1,
        status: 'fail', article: 'CTE DB-SE-C 7.2.2.1',
      }],
    });
    const s = summarizeSlopeResults(failing, true);
    expect(s.verdict).toBe('fail');
    expect(s.text.split('\n')[0]).toBe(SLOPE_STALE_NOTICE);
    expect(s.text).toContain('INCUMPLE');
  });

  it('corrida con error del motor → invalid (discriminador error != null)', () => {
    const s = summarizeSlopeResults(slopeResultFixture({ valid: false, error: 'PySlope: no convergió', checks: [] }), false);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});

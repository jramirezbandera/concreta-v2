// Adapter IA de Micropilotes (ola 3 — fases A+B: escalares + estratigrafía):
//   - Rangos de MICROPILES_INPUT_LIMITS y profundidades con cross-check
//     punta > cabeza (convención: positivas DESDE LA RASANTE).
//   - Catálogo de tubos PIRESA por label EXACTO + sentinel custom (gate de
//     customTubeDe/E) y gates de los overrides (CR/structuralCover solo en
//     modo manual).
//   - Array `soil` con REEMPLAZO completo: coherencia granular (c=su=0),
//     Σespesores ≥ punta, elemento inválido → skip del array entero, ids 1..n.
//   - Riesgos: escalares (módulos E, NF, presión, vida útil, ordinales por
//     factor normativo, overrides alwaysCheck) y de estrato (mejorar el
//     terreno = riesgo, γ con dirección OPUESTA a taludes).
//   - Snapshot combinado escalares+soil y summarize con el motor real.
// current = micropilesAiDefaults (FTUX del Excel: cabeza 1 m, punta 17 m,
// Ø88,9 × 9 mm, 4 estratos, NF 7,5 m).

import { describe, expect, it } from 'vitest';
import {
  micropilesAdapter,
  micropilesAiDefaults,
  summarizeMicropilesResults,
  type MicropilesAiInputs,
} from '../../lib/ai/modules/micropiles';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import { micropilesSoilDefaults, type SoilLayer } from '../../data/defaults';

const DEFAULTS = micropilesAiDefaults;

interface SoilPayload {
  type?: string | null;
  thickness_m?: number | null;
  gamma_kNm3?: number | null;
  c_kPa?: number | null;
  phi_deg?: number | null;
  su_kPa?: number | null;
  Nspt?: number | null;
  rflim_MPa?: number | null;
  Cu?: number | null;
}

type Payload = Record<string, unknown>;

const PAYLOAD_KEYS = [
  'topDepth_m', 'toeDepth_m', 'drillDiameter_mm', 'waterTableDepth_m',
  'injectionPressure_kPa', 'designLoad_kN', 'effort', 'method', 'groutType',
  'concreteGrade_MPa', 'tube', 'customTubeDe_mm', 'customTubeE_mm', 'steelGrade_MPa',
  'execution', 'corrosionEnv', 'designLifeYears', 'connection', 'application', 'duration',
  'crManualOverride', 'CR', 'coverManualOverride', 'structuralCover_mm',
  'baseMoment_kNm', 'baseShear_kN', 'soilModulusTop_kNm2', 'soilModulusEmbed_kNm2',
  'soil',
] as const;

function makePayload(overrides: Payload = {}): Payload {
  const base: Payload = { warnings: [] };
  for (const k of PAYLOAD_KEYS) base[k] = null;
  return { ...base, ...overrides };
}

function plan(overrides: Payload = {}, current: MicropilesAiInputs = DEFAULTS) {
  return micropilesAdapter.buildPlan(makePayload(overrides), current, 'si');
}

function changeFor(p: ReturnType<typeof plan>, label: string) {
  return p.changes.find((c) => c.label === label);
}
function skipFor(p: ReturnType<typeof plan>, label: string) {
  return p.skipped.find((s) => s.label === label);
}

/** Estrato de payload completo: granular 5 m por defecto. */
function soilPayload(overrides: SoilPayload = {}): SoilPayload {
  return {
    type: 'granular', thickness_m: 5, gamma_kNm3: 19,
    c_kPa: null, phi_deg: 25, su_kPa: null, Nspt: 15, rflim_MPa: 0.1, Cu: null,
    ...overrides,
  };
}

/** Perfil válido que cubre la punta de fábrica (17 m): 4×5 m = 20 m. */
function validSoil(): SoilPayload[] {
  return [soilPayload(), soilPayload(), soilPayload(), soilPayload()];
}

// ── Profundidades y convención de rasante ─────────────────────────────────────

describe('profundidades (positivas desde rasante)', () => {
  it('cabeza y punta se aplican con cross-check punta > cabeza', () => {
    const p = plan({ topDepth_m: 2, toeDepth_m: 20 });
    expect(p.fields).toMatchObject({ topDepth: 2, toeDepth: 20 });
  });

  it('punta por encima de la cabeza EFECTIVA → skip con motivo', () => {
    const p = plan({ toeDepth_m: 0.5 });
    expect(skipFor(p, 'Profundidad de punta')?.reason).toMatch(/fuera del rango/);
    // Propuesta internamente contradictoria (cabeza 3, punta 2): la cabeza se
    // skipea contra la punta propuesta; la punta (2 > cabeza vigente 1) aplica.
    const p2 = plan({ topDepth_m: 3, toeDepth_m: 2 });
    expect(skipFor(p2, 'Profundidad de cabeza')?.reason).toMatch(/por encima de la punta/);
    expect(p2.fields.toeDepth).toBe(2);
    // Punta propuesta bajo la cabeza vigente sin tocar la cabeza → skip de la punta.
    const p3 = plan({ toeDepth_m: 1 }, { ...DEFAULTS, topDepth: 1.5 });
    expect(skipFor(p3, 'Profundidad de punta')?.reason).toMatch(/por debajo de la cabeza/);
  });

  it('cabeza por debajo de la punta efectiva → skip', () => {
    const p = plan({ topDepth_m: 18 });
    expect(skipFor(p, 'Profundidad de cabeza')?.reason).toMatch(/por encima de la punta/);
  });
});

// ── Catálogos y gates ─────────────────────────────────────────────────────────

describe('tubo PIRESA y gate del custom', () => {
  it('label exacto del catálogo aplica; variantes del label ni se parsean (null)', () => {
    const ok = plan({ tube: 'Ø101,6 × 7 mm' });
    expect(ok.fields.tube).toBe('Ø101,6 × 7 mm');
    // '101.6x7' no es un valor del enum → parsePayload lo deja null → notFound
    const bad = plan({ tube: '101.6x7' });
    expect(bad.fields.tube).toBeUndefined();
    expect(bad.notFound).toContain('Armadura tubular');
  });

  it('customTubeDe/E sin tube="custom" efectivo → skip con motivo', () => {
    const p = plan({ customTubeDe_mm: 120, customTubeE_mm: 8 });
    expect(skipFor(p, 'Ø exterior del tubo custom')?.reason).toMatch(/tube="custom"/);
    expect(skipFor(p, 'Espesor del tubo custom')?.reason).toMatch(/tube="custom"/);
  });

  it('tube="custom" + medidas en el mismo turno aplican juntos', () => {
    const p = plan({ tube: 'custom', customTubeDe_mm: 120, customTubeE_mm: 8 });
    expect(p.fields).toMatchObject({ tube: 'custom', customTubeDe: 120, customTubeE: 8 });
    expect(changeFor(p, 'Armadura tubular')?.after).toBe('Personalizado');
  });
});

describe('gates de los overrides (CR / recubrimiento)', () => {
  it('CR con modo automático efectivo → skip explicando el modo', () => {
    const p = plan({ CR: 12 });
    expect(skipFor(p, 'CR de pandeo manual')?.reason).toMatch(/automático/);
  });

  it('crManualOverride=true + CR aplican juntos', () => {
    const p = plan({ crManualOverride: true, CR: 12 });
    expect(p.fields).toMatchObject({ crManualOverride: true, CR: 12 });
    expect(changeFor(p, 'Modo del CR de pandeo')).toMatchObject({ before: 'Automático', after: 'Manual' });
  });

  it('structuralCover con modo automático efectivo → skip', () => {
    const p = plan({ structuralCover_mm: 40 });
    expect(skipFor(p, 'Recubrimiento estructural r')?.reason).toMatch(/automático/);
  });
});

describe('enums normativos con labels humanos en la tarjeta', () => {
  it('ejecución y corrosión muestran los labels de la Guía', () => {
    const p = plan({ execution: 'casing-lost', corrosionEnv: 'fill-aggressive-loose' });
    expect(changeFor(p, 'Ejecución')).toMatchObject({
      before: 'NF bajo punta, sin revestir, sin lodos',
      after: 'Camisa perdida (tubería in situ)',
    });
    expect(changeFor(p, 'Entorno de corrosión')?.after).toMatch(/Rellenos agresivos/);
  });

  it('vida útil fuera de la Tabla 2.4 → skip', () => {
    const p = plan({ designLifeYears: 40 });
    expect(skipFor(p, 'Vida útil')?.reason).toMatch(/no es una vida útil/);
  });
});

// ── Array soil ────────────────────────────────────────────────────────────────

describe('soil: reemplazo completo de la estratigrafía', () => {
  it('perfil válido reemplaza con ids 1..n', () => {
    const p = plan({ soil: validSoil() });
    const soil = p.fields.soil as SoilLayer[];
    expect(soil).toHaveLength(4);
    expect(soil.map((l) => l.id)).toEqual([1, 2, 3, 4]);
    expect(changeFor(p, 'Estratigrafía')?.after).toMatch(/4 estratos/);
  });

  it('coherencia granular: c y su se fuerzan a 0 con warning', () => {
    const p = plan({ soil: [soilPayload({ c_kPa: 25, su_kPa: 50 }), ...validSoil().slice(1)] });
    const soil = p.fields.soil as SoilLayer[];
    expect(soil[0]).toMatchObject({ c: 0, su: 0 });
    expect(p.warnings.some((w) => w.includes("c' y su se fuerzan a 0"))).toBe(true);
  });

  it('Cu en cohesivo se ignora con warning; en granular se acepta', () => {
    const p = plan({
      soil: [
        soilPayload({ Cu: 8 }),
        soilPayload({ type: 'cohesive', phi_deg: 22, su_kPa: 80, Cu: 8 }),
        soilPayload(), soilPayload(),
      ],
    });
    const soil = p.fields.soil as SoilLayer[];
    expect(soil[0].Cu).toBe(8);
    expect(soil[1].Cu).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('Cu solo aplica a granulares'))).toBe(true);
  });

  it('perfil que no cubre hasta la punta efectiva → skip con motivo', () => {
    const p = plan({ soil: [soilPayload(), soilPayload()] }); // 10 m < 17 m
    expect(skipFor(p, 'Estratigrafía')?.reason).toMatch(/no cubren hasta la punta \(17 m\)/);
  });

  it('la punta propuesta en el MISMO turno gobierna el cross-check', () => {
    const p = plan({ toeDepth_m: 9, soil: [soilPayload(), soilPayload()] }); // 10 m ≥ 9 m
    expect(p.fields.soil).toBeDefined();
  });

  it('elemento inválido → skip del array ENTERO', () => {
    const p = plan({ soil: [soilPayload(), soilPayload({ gamma_kNm3: 45 })] });
    expect(skipFor(p, 'Estratigrafía')?.reason).toMatch(/Estrato 2: γ 45.*no se aplica ningún estrato/);
    expect(p.fields.soil).toBeUndefined();
  });
});

// ── Riesgos ───────────────────────────────────────────────────────────────────

describe('riesgos de seguridad — escalares', () => {
  it('mejorar módulos del terreno / profundizar NF / acortar vida útil marcan (sobre valores confirmados)', () => {
    const current: MicropilesAiInputs = {
      ...DEFAULTS, soilModulusTop: 8000, waterTableDepth: 6, designLifeYears: 75,
    };
    const p = plan({ soilModulusTop_kNm2: 20000, waterTableDepth_m: 12, designLifeYears: 25 }, current);
    expect(p.risks.map((r) => r.field)).toEqual(['waterTableDepth', 'designLifeYears', 'soilModulusTop']);
  });

  it('ordinales por factor normativo: relajar la ejecución confirmada marca', () => {
    const current: MicropilesAiInputs = { ...DEFAULTS, execution: 'wt-above-no-casing-no-mud' };
    const p = plan({ execution: 'casing-recoverable' }, current);
    expect(p.risks.map((r) => r.field)).toEqual(['execution']);
    expect(p.risks[0].why).toMatch(/Fe menor/);
  });

  it('PUNTO CIEGO conocido: duration/application en su default (que ES el lado conservador) no marcan', () => {
    // Como β=1.0 en pilares: 'long' y 'new' son a la vez el default de fábrica
    // y el valor real más común — el gate anti-ruido no puede distinguir un
    // valor confirmado idéntico al default, así que la relajación desde ahí
    // pasa sin aviso. La cubre la regla 7 del prompt.
    const p = plan({ duration: 'short', application: 'existing' });
    expect(p.risks).toEqual([]);
    expect(changeFor(p, 'Duración de la carga')).toBeDefined();
    expect(changeFor(p, 'Aplicación')).toBeDefined();
  });

  it('los overrides marcan SIEMPRE al pasar a manual (alwaysCheck), incluso desde el default', () => {
    const p = plan({ crManualOverride: true, coverManualOverride: true });
    expect(p.risks.map((r) => r.field)).toEqual(['crManualOverride', 'coverManualOverride']);
    expect(p.risks[0].why).toMatch(/automático a manual/);
  });

  it('volver a automático NO marca (es el lado seguro)', () => {
    const current: MicropilesAiInputs = { ...DEFAULTS, crManualOverride: true };
    const p = plan({ crManualOverride: false }, current);
    expect(p.risks).toEqual([]);
  });
});

describe('riesgos de seguridad — estratos (dato geotécnico)', () => {
  /** Perfil TOCADO (≠ fábrica) para abrir el gate del array. */
  const touchedSoil: SoilLayer[] = [
    { id: 1, type: 'granular', thickness: 10, gamma: 19, c: 0, phi: 25, Nspt: 15, su: 0, rflim: 0.1 },
    { id: 2, type: 'cohesive', thickness: 10, gamma: 20, c: 15, phi: 22, Nspt: 20, su: 60, rflim: 0.08 },
  ];
  const current: MicropilesAiInputs = { ...DEFAULTS, soil: touchedSoil };
  const proposedBase: SoilPayload[] = [
    soilPayload({ thickness_m: 10 }),
    soilPayload({ type: 'cohesive', thickness_m: 10, gamma_kNm3: 20, c_kPa: 15, phi_deg: 22, su_kPa: 60, Nspt: 20, rflim_MPa: 0.08 }),
  ];

  it('subir γ marca (dirección OPUESTA a taludes: más γ = más fuste)', () => {
    const proposed = [{ ...proposedBase[0], gamma_kNm3: 22 }, proposedBase[1]];
    const p = plan({ soil: proposed }, current);
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({ field: 'soil[0].gamma', label: 'Estrato 1 — peso específico γ' });
  });

  it('subir rflim y su marca; bajar es conservador y no marca', () => {
    const up = [proposedBase[0], { ...proposedBase[1], rflim_MPa: 0.25, su_kPa: 120 }];
    const pUp = plan({ soil: up }, current);
    expect(pUp.risks.map((r) => r.field).sort()).toEqual(['soil[1].rflim', 'soil[1].su']);
    const down = [proposedBase[0], { ...proposedBase[1], rflim_MPa: 0.05, su_kPa: 30 }];
    expect(plan({ soil: down }, current).risks).toEqual([]);
  });

  it('quitar estratos marca el riesgo agregado de eliminación', () => {
    const p = plan({ toeDepth_m: 9, soil: [proposedBase[0]] }, current);
    const removal = p.risks.find((r) => r.field === 'soil.__removed');
    expect(removal).toMatchObject({ label: 'Estratos', before: '2', after: '1' });
  });

  it('gate de fábrica: primera estratigrafía sobre el perfil default no marca', () => {
    // current = defaults (4 estratos del Excel) — proponer un perfil "mejor" no avisa.
    const p = plan({ soil: [soilPayload({ gamma_kNm3: 22, thickness_m: 20 })] });
    expect(p.risks).toEqual([]);
  });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe('snapshot {valores, sin_confirmar}', () => {
  const snapshotOf = (c: MicropilesAiInputs) =>
    JSON.parse(micropilesAdapter.snapshot(c)) as {
      valores: Record<string, unknown>;
      sin_confirmar: string[];
    };

  it('valores cubre TODAS las claves del schema (sin warnings), soil en forma de payload', () => {
    const snap = snapshotOf(DEFAULTS);
    const schemaKeys = Object.keys(
      (micropilesAdapter.payloadSchema as { properties: Record<string, unknown> }).properties,
    ).filter((k) => k !== 'warnings');
    expect(Object.keys(snap.valores)).toEqual(schemaKeys);
    const soil = snap.valores.soil as Record<string, unknown>[];
    expect(soil).toHaveLength(4);
    expect(soil[0]).toMatchObject({ type: 'granular', thickness_m: 3.3, gamma_kNm3: 19 });
  });

  it('estado de fábrica → sin_confirmar completo; estrato tocado saca soil', () => {
    expect(snapshotOf(DEFAULTS).sin_confirmar).toContain('soil');
    const touched: MicropilesAiInputs = {
      ...DEFAULTS,
      soil: [{ ...micropilesSoilDefaults[0], gamma: 21 }, ...micropilesSoilDefaults.slice(1)],
    };
    expect(snapshotOf(touched).sin_confirmar).not.toContain('soil');
  });

  it('metadatos del adapter', () => {
    expect(micropilesAdapter.id).toBe('micropiles');
    expect(micropilesAdapter.label).toBe('Micropilotes');
    expect(micropilesAdapter.resultsRecalc).toBeUndefined(); // recálculo vivo
  });
});

// ── Resumen de resultados (motor real) ────────────────────────────────────────

describe('summarizeMicropilesResults', () => {
  it('FTUX del Excel: extraLines con Rfc teórico/empírico, CR y longitud', () => {
    const r = calcMicropiles(DEFAULTS, DEFAULTS.soil);
    expect(r.valid).toBe(true);
    const s = summarizeMicropilesResults(r);
    expect(s.text).toContain('VEREDICTO GLOBAL');
    // Los valores exactos son del motor (ground truth propio de sus tests):
    // el summarize debe citarlos VERBATIM, no recalcularlos.
    expect(s.text).toContain(`Rfc teórico = ${r.RfcTheoretical.toFixed(1)} kN`);
    expect(s.text).toContain(`empírico = ${r.RfcEmpirical.toFixed(1)} kN`);
    expect(s.text).toMatch(/empírico = 675\.\d kN/);      // ≈ 675.17 (Excel de referencia)
    expect(s.text).toContain('CR adoptado');
    expect(s.text).toContain('Longitud bajo cabeza L = 16.00 m');
  });

  it('cálculo inválido (punta bajo el perfil) → verdict invalid', () => {
    const shortSoil: SoilLayer[] = [
      { id: 1, type: 'granular', thickness: 5, gamma: 19, c: 0, phi: 25, Nspt: 15, su: 0, rflim: 0.1 },
    ];
    const r = calcMicropiles(DEFAULTS, shortSoil);
    expect(r.error).toBeDefined();
    const s = summarizeMicropilesResults(r);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});

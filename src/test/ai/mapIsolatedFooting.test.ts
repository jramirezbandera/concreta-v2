// Tests del adapter isolated-footing (src/lib/ai/modules/isolatedFooting.ts,
// T2.4): trampa loadsAreFactored, unidades en m SIN conversión (estado ya en
// m), catálogos por módulo (fyk solo 400/500), momentos negativos → abs +
// warning, rangos sin clamp, notFound completo, snapshot
// ({valores, sin_confirmar}: claves del schema + las que siguen en su default)
// y parseo defensivo (no-objeto → AiError). Funciones puras, sin mocks.
//
// current = isolatedFootingDefaults: B=L=1.8 · h=0.6 · bc=hc=0.4 · Df=0.8 ·
// cover 60 · σadm 200 kPa · sin mayorar · γ=1.35 · N=300 · Mx=My=H=0 · HA-25 ·
// B500 · Øx=Øy=16/200 · γsoil=18 · μ=0.5. system = 'si'.

import { describe, it, expect } from 'vitest';
import {
  isolatedFootingAdapter,
  FACTORED_UNKNOWN_WARNING,
  summarizeIsolatedFootingResults,
} from '../../lib/ai/modules/isolatedFooting';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { isolatedFootingDefaults, type IsolatedFootingInputs } from '../../data/defaults';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { overallStatus } from '../../lib/calculations/checkFormat';
import { formatQuantity } from '../../lib/units/format';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

/** Forma del payload del módulo (espejo del schema, para overrides tipados). */
interface Payload {
  loadsAreFactored: boolean | null;
  loadFactor: number | null;
  N_kN: number | null; Mx_kNm: number | null; My_kNm: number | null; H_kN: number | null;
  B_m: number | null; L_m: number | null; h_m: number | null;
  bc_m: number | null; hc_m: number | null; Df_m: number | null;
  cover_mm: number | null; sigma_adm_kPa: number | null;
  fck_MPa: number | null; fyk_MPa: number | null;
  phi_x_mm: number | null; s_x_mm: number | null; phi_y_mm: number | null; s_y_mm: number | null;
  gamma_soil_kN_m3: number | null; mu_friction: number | null;
  warnings: string[];
}

/** Payload todo-null + warnings vacíos, con overrides parciales. */
function makeExtraction(partial: Partial<Payload> = {}): Payload {
  return {
    loadsAreFactored: null, loadFactor: null,
    N_kN: null, Mx_kNm: null, My_kNm: null, H_kN: null,
    B_m: null, L_m: null, h_m: null, bc_m: null, hc_m: null, Df_m: null,
    cover_mm: null, sigma_adm_kPa: null,
    fck_MPa: null, fyk_MPa: null,
    phi_x_mm: null, s_x_mm: null, phi_y_mm: null, s_y_mm: null,
    gamma_soil_kN_m3: null, mu_friction: null,
    warnings: [],
    ...partial,
  };
}

function plan(
  partial: Partial<Payload> = {},
  current: IsolatedFootingInputs = isolatedFootingDefaults,
): AiApplyPlan<IsolatedFootingInputs> {
  return isolatedFootingAdapter.buildPlan(makeExtraction(partial), current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<IsolatedFootingInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<IsolatedFootingInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);

const TOGGLE_LABEL = 'Tipo de cargas (sin mayorar/mayoradas)';

/** Los 22 labels del payload, en el ORDER del contrato. */
const ALL_LABELS = [
  TOGGLE_LABEL, 'Coef. de mayoración γ', 'Axil N', 'Momento Mx', 'Momento My',
  'Horizontal H', 'Ancho de zapata B', 'Largo de zapata L', 'Canto de zapata h',
  'Ancho de pilar bc', 'Canto de pilar hc', 'Profundidad Df', 'Recubrimiento',
  'Tensión admisible σadm', 'Hormigón fck', 'Acero fyk',
  'Diámetro barras x', 'Separación barras x', 'Diámetro barras y', 'Separación barras y',
  'Peso específico del terreno', 'Coef. de rozamiento μ',
];

describe('isolatedFootingAdapter — trampa loadsAreFactored', () => {
  it('cargas con toggle null → cargas aplicadas + warning del conmutador + toggle intacto', () => {
    const p = plan({ N_kN: 600, Mx_kNm: 40 });
    // Las cargas SÍ se aplican…
    expect(p.fields.N).toBe(600);
    expect(p.fields.Mx).toBe(40);
    // …pero el conmutador NO se toca y se avisa de forma destacada.
    expect(p.fields).not.toHaveProperty('loadsAreFactored');
    expect(p.warnings).toContain(FACTORED_UNKNOWN_WARNING);
    expect(p.warnings.join(' ')).toMatch(/conmutador/);
    // La clave quedó resuelta por el warning: no va a notFound.
    expect(p.notFound).not.toContain(TOGGLE_LABEL);
  });

  it('loadsAreFactored true explícito (difiere del current false) → en fields, sin warning', () => {
    const p = plan({ loadsAreFactored: true, N_kN: 800 });
    expect(p.fields.loadsAreFactored).toBe(true);
    expect(p.fields.N).toBe(800);
    expect(changeFor(p, TOGGLE_LABEL)).toMatchObject({
      field: 'loadsAreFactored', before: 'Sin mayorar', after: 'Mayoradas',
    });
    expect(p.warnings).toEqual([]);
  });

  it('loadsAreFactored false explícito (igual al current) → skipped "Ya coincide"', () => {
    const p = plan({ loadsAreFactored: false, N_kN: 800 });
    expect(p.fields).not.toHaveProperty('loadsAreFactored');
    expect(skipFor(p, TOGGLE_LABEL)).toEqual({ label: TOGGLE_LABEL, reason: ALREADY });
    // Con toggle explícito NO hay warning del conmutador.
    expect(p.warnings).toEqual([]);
  });

  it('toggle null SIN cargas → nada que avisar: label del toggle en notFound', () => {
    const p = plan({ B_m: 2.5 });
    expect(p.warnings).toEqual([]);
    expect(p.notFound).toContain(TOGGLE_LABEL);
  });
});

describe('isolatedFootingAdapter — geometría en m SIN conversión', () => {
  it('B_m 2.5 → fields.B === 2.5 (m directos) con change "1.80 m → 2.50 m"', () => {
    const p = plan({ B_m: 2.5 });
    expect(p.fields).toEqual({ B: 2.5 });
    expect(changeFor(p, 'Ancho de zapata B')).toEqual({
      field: 'B', label: 'Ancho de zapata B', before: '1.80 m', after: '2.50 m',
    });
    expect(p.skipped).toEqual([]);
  });

  it('cover_mm 50 → fields.cover === 50 (mm directos)', () => {
    const p = plan({ cover_mm: 50 });
    expect(p.fields).toEqual({ cover: 50 });
    expect(changeFor(p, 'Recubrimiento')).toMatchObject({ before: '60 mm', after: '50 mm' });
  });

  it('B_m 12 (fuera de rango [0.4, 10]) → skipped con motivo legible, sin clamp', () => {
    const p = plan({ B_m: 12 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Ancho de zapata B')!.reason).toMatch(/fuera del rango/);
    expect(p.notFound).not.toContain('Ancho de zapata B');
  });

  it('B_m 1.8 (igual al current) → skipped "Ya coincide"', () => {
    const p = plan({ B_m: 1.8 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Ancho de zapata B')).toEqual({ label: 'Ancho de zapata B', reason: ALREADY });
  });
});

describe('isolatedFootingAdapter — catálogos del módulo', () => {
  it('fyk 600 → skipped (el panel de zapatas solo ofrece 400/500), nunca aplicado', () => {
    const p = plan({ fyk_MPa: 600 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Acero fyk')).toBeDefined();
    expect(skipFor(p, 'Acero fyk')!.reason).toContain('600');
    expect(skipFor(p, 'Acero fyk')!.reason).toMatch(/400 o 500/);
    expect(p.notFound).not.toContain('Acero fyk');
  });

  it('fyk 400 válido → aplicado con labels B500 → B400', () => {
    const p = plan({ fyk_MPa: 400 });
    expect(p.fields).toEqual({ fyk: 400 });
    expect(changeFor(p, 'Acero fyk')).toMatchObject({ before: 'B500', after: 'B400' });
  });

  it('fck 28 (fuera del catálogo) → skipped; fck 30 → aplicado', () => {
    const bad = plan({ fck_MPa: 28 });
    expect(bad.fields).toEqual({});
    expect(skipFor(bad, 'Hormigón fck')!.reason).toMatch(/catálogo/);

    const ok = plan({ fck_MPa: 30 });
    expect(ok.fields).toEqual({ fck: 30 });
    expect(changeFor(ok, 'Hormigón fck')).toMatchObject({ before: 'HA-25', after: 'HA-30' });
  });

  it('phi_x 14 (no es diámetro comercial) → skipped por catálogo', () => {
    const p = plan({ phi_x_mm: 14 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Diámetro barras x')!.reason).toMatch(/catálogo/);
  });
});

describe('isolatedFootingAdapter — momentos y rangos', () => {
  it('Mx_kNm -80 → fields.Mx === 80 (valor absoluto) + warning', () => {
    // loadsAreFactored explícito (= current → skip) para aislar el warning del
    // valor absoluto del warning de la trampa del conmutador.
    const p = plan({ Mx_kNm: -80, loadsAreFactored: false });
    expect(p.fields).toEqual({ Mx: 80 });
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toMatch(/negativo/);
    expect(p.warnings[0]).toMatch(/valor absoluto/);
    expect(changeFor(p, 'Momento Mx')).toMatchObject({ field: 'Mx' });
  });

  it('sigma_adm_kPa 5000 (fuera de rango [20, 2000]) → skipped, sin clamp', () => {
    const p = plan({ sigma_adm_kPa: 5000 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Tensión admisible σadm')!.reason).toMatch(/fuera del rango/);
    expect(p.notFound).not.toContain('Tensión admisible σadm');
  });

  it('sigma_adm_kPa 196.13 válido → fields.sigma_adm en kPa internos', () => {
    const p = plan({ sigma_adm_kPa: 196.13 });
    expect(p.fields).toEqual({ sigma_adm: 196.13 });
  });

  it('N_kN negativo → skipped por rango [0, 50000]', () => {
    const p = plan({ N_kN: -100 });
    expect(p.fields).toEqual({});
    expect(skipFor(p, 'Axil N')!.reason).toMatch(/fuera del rango/);
  });

  it('loadFactor 1.5 → aplicado; loadFactor 3 → skipped por rango [1.0, 2.0]', () => {
    const ok = plan({ loadFactor: 1.5 });
    expect(ok.fields).toEqual({ loadFactor: 1.5 });

    const bad = plan({ loadFactor: 3 });
    expect(bad.fields).toEqual({});
    expect(skipFor(bad, 'Coef. de mayoración γ')!.reason).toMatch(/fuera del rango/);
  });
});

describe('isolatedFootingAdapter — payload todo-null', () => {
  it('fields y changes vacíos; notFound = exactamente los 22 labels en ORDER', () => {
    const p = plan();
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(p.notFound).toEqual(ALL_LABELS);
    expect(p.warnings).toEqual([]);
  });
});

describe('isolatedFootingAdapter — warnings y parseo defensivo', () => {
  it('los warnings del LLM se propagan tal cual, ANTES que los del mapper', () => {
    const p = plan({ warnings: ['convertí 2 kg/cm² a 196 kPa'], Mx_kNm: -80, loadsAreFactored: false });
    expect(p.warnings).toHaveLength(2);
    expect(p.warnings[0]).toBe('convertí 2 kg/cm² a 196 kPa');
    expect(p.warnings[1]).toMatch(/valor absoluto/);
  });

  it("payload no-objeto → AiError('bad-response')", () => {
    for (const raw of ['hola', 42, null, [1, 2]]) {
      let caught: unknown = null;
      try {
        isolatedFootingAdapter.buildPlan(raw, isolatedFootingDefaults, SYSTEM);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AiError);
      expect((caught as AiError).kind).toBe('bad-response');
    }
  });

  it('campos con tipo inválido → null defensivo (van a notFound, sin throw)', () => {
    const p = isolatedFootingAdapter.buildPlan(
      { ...makeExtraction(), B_m: 'ancho', loadsAreFactored: 'sí', warnings: 'no-array' },
      isolatedFootingDefaults,
      SYSTEM,
    );
    expect(p.fields).toEqual({});
    expect(p.warnings).toEqual([]);
    expect(p.notFound).toEqual(ALL_LABELS);
  });

  it('NUNCA produce title ni claves ajenas al payload, ni con payload completo', () => {
    const p = plan({
      loadsAreFactored: true, loadFactor: 1.5,
      N_kN: 900, Mx_kNm: 60, My_kNm: 30, H_kN: 45,
      B_m: 2.4, L_m: 2.6, h_m: 0.7, bc_m: 0.45, hc_m: 0.5, Df_m: 1.2,
      cover_mm: 50, sigma_adm_kPa: 250,
      fck_MPa: 30, fyk_MPa: 400,
      phi_x_mm: 20, s_x_mm: 150, phi_y_mm: 12, s_y_mm: 250,
      gamma_soil_kN_m3: 20, mu_friction: 0.6,
    });
    const allowed = new Set([
      'loadsAreFactored', 'loadFactor', 'N', 'Mx', 'My', 'H',
      'B', 'L', 'h', 'bc', 'hc', 'Df', 'cover', 'sigma_adm',
      'fck', 'fyk', 'phi_x', 's_x', 'phi_y', 's_y', 'gamma_soil_kN_m3', 'mu_friction',
    ]);
    for (const k of Object.keys(p.fields)) expect(allowed.has(k), `campo inesperado: ${k}`).toBe(true);
    expect(p.fields).not.toHaveProperty('title');
    // Todo extraído y distinto del current: 22 changes, nada en notFound.
    expect(p.changes).toHaveLength(22);
    expect(p.notFound).toEqual([]);
  });
});

describe('isolatedFootingAdapter — snapshot', () => {
  /** {"valores":{…},"sin_confirmar":[…]} — contrato congelado del snapshot. */
  interface Snapshot {
    valores: Record<string, unknown>;
    sin_confirmar: string[];
  }
  const snapshotOf = (c: IsolatedFootingInputs) =>
    JSON.parse(isolatedFootingAdapter.snapshot(c)) as Snapshot;

  /** Las 22 claves del payload (sin warnings), en el ORDER del contrato. */
  const ALL_KEYS = [
    'loadsAreFactored', 'loadFactor', 'N_kN', 'Mx_kNm', 'My_kNm', 'H_kN',
    'B_m', 'L_m', 'h_m', 'bc_m', 'hc_m', 'Df_m', 'cover_mm', 'sigma_adm_kPa',
    'fck_MPa', 'fyk_MPa', 'phi_x_mm', 's_x_mm', 'phi_y_mm', 's_y_mm',
    'gamma_soil_kN_m3', 'mu_friction',
  ];

  it('snapshot(defaults) = JSON con "valores" (MISMAS claves del payload, valores humanos) y "sin_confirmar"', () => {
    const snap = snapshotOf(isolatedFootingDefaults);
    expect(Object.keys(snap).sort()).toEqual(['sin_confirmar', 'valores']);
    expect(snap.valores).toEqual({
      loadsAreFactored: false, loadFactor: 1.35,
      N_kN: 300, Mx_kNm: 0, My_kNm: 0, H_kN: 0,
      B_m: 1.8, L_m: 1.8, h_m: 0.6, bc_m: 0.4, hc_m: 0.4, Df_m: 0.8,
      cover_mm: 60, sigma_adm_kPa: 200,
      fck_MPa: 25, fyk_MPa: 500,
      phi_x_mm: 16, s_x_mm: 200, phi_y_mm: 16, s_y_mm: 200,
      gamma_soil_kN_m3: 18, mu_friction: 0.5,
    });
    // Las claves de "valores" coinciden una a una con las del payloadSchema (sin warnings).
    const schemaProps = Object.keys(
      (isolatedFootingAdapter.payloadSchema as { properties: Record<string, unknown> }).properties,
    ).filter((k) => k !== 'warnings');
    expect(Object.keys(snap.valores).sort()).toEqual(schemaProps.sort());
  });

  it('formulario recién abierto (defaults) → TODAS las claves en sin_confirmar, en el orden de valores', () => {
    const snap = snapshotOf(isolatedFootingDefaults);
    expect(snap.sin_confirmar).toEqual(ALL_KEYS);
    expect(snap.sin_confirmar).toEqual(Object.keys(snap.valores));
  });

  it('B y N tocados → B_m/N_kN FUERA de sin_confirmar; el resto dentro (orden preservado)', () => {
    const snap = snapshotOf({ ...isolatedFootingDefaults, B: 2.5, N: 900 });
    expect(snap.valores.B_m).toBe(2.5);
    expect(snap.valores.N_kN).toBe(900);
    expect(snap.sin_confirmar).not.toContain('B_m');
    expect(snap.sin_confirmar).not.toContain('N_kN');
    expect(snap.sin_confirmar).toEqual(ALL_KEYS.filter((k) => k !== 'B_m' && k !== 'N_kN'));
  });

  it('loadsAreFactored (booleano) tocado → fuera de sin_confirmar', () => {
    const snap = snapshotOf({ ...isolatedFootingDefaults, loadsAreFactored: true });
    expect(snap.valores.loadsAreFactored).toBe(true);
    expect(snap.sin_confirmar).not.toContain('loadsAreFactored');
    expect(snap.sin_confirmar).toEqual(ALL_KEYS.filter((k) => k !== 'loadsAreFactored'));
  });

  it('title (metadato de documento) no entra en el snapshot', () => {
    const snap = snapshotOf({ ...isolatedFootingDefaults, title: 'Zapata Z1' });
    expect(snap.valores).not.toHaveProperty('title');
    expect(snap.sin_confirmar).toEqual(ALL_KEYS);
  });

  it('metadatos del adapter: id, label y placeholder de zapata', () => {
    expect(isolatedFootingAdapter.id).toBe('isolated-footing');
    expect(isolatedFootingAdapter.label).toBe('Zapata aislada');
    expect(isolatedFootingAdapter.placeholder).toMatch(/[Zz]apata/);
    expect(isolatedFootingAdapter.promptRules).toMatch(/loadsAreFactored/);
    expect(isolatedFootingAdapter.promptRules).toMatch(/98\.07/);
  });
});

// Guardarraíles de seguridad (src/lib/ai/safety.ts + FOOTING_SAFETY_RULES): los
// riesgos MARCAN, no bloquean — el cambio se aplica igual y el bloqueo vive en la
// UI (ProposalCard). En zapatas tienen regla los DATOS del problema: las cargas
// (N/Mx/My/H), su naturaleza (loadsAreFactored, con `alwaysCheck`) y su coeficiente
// (loadFactor), el terreno (σadm y μ — `lowerIsSafer`: lo peligroso es SUBIRLOS) y
// el recubrimiento. La geometría (B/L/h) y el armado son DISEÑO: sin regla.
describe('isolatedFootingAdapter — guardarraíles de seguridad (risks)', () => {
  const soilPress = (v: number) => formatQuantity(v, 'soilPressure', SYSTEM);

  it('loadsAreFactored false → true con `alwaysCheck`: riesgo AUNQUE false sea el valor de fábrica', () => {
    // El caso más peligroso del módulo: marcar como "mayoradas" unas cargas de
    // servicio hace que el motor deje de aplicarles γ y toda la demanda cae.
    //
    // Desde la auditoría (2026-07-14) el riesgo NO vive sobre los campos
    // `loadsAreFactored`/`loadFactor` sino sobre las dos DEMANDAS que el motor
    // deriva de ellos: la dirección de γ depende del toggle (con cargas mayoradas
    // el motor DIVIDE por γ), así que ninguna regla por campo puede ser correcta.
    // El toggle baja las dos demandas a la vez, y por eso ahora salen dos filas.
    const p = plan({ loadsAreFactored: true }); // current = defaults (false, sin confirmar)
    expect(p.fields).toEqual({ loadsAreFactored: true }); // marca, no bloquea

    expect(p.risks.map((r) => r.field)).toEqual(['demanda_servicio', 'demanda_calculo']);
    expect(p.risks[0]).toMatchObject({
      field: 'demanda_servicio',
      before: '100% de las cargas introducidas',
      after: '74% de las cargas introducidas',   // N/1.35
    });
    expect(p.risks[1]).toMatchObject({
      field: 'demanda_calculo',
      before: '135% de las cargas introducidas', // N·1.35
      after: '100% de las cargas introducidas',
    });
    expect(changeFor(p, TOGGLE_LABEL)).toBeDefined(); // la fila del cambio sigue ahí
    expect(p.risks[0].why).toMatch(/γ/);
  });

  it('loadsAreFactored true → false (el sentido seguro) → SIN riesgo', () => {
    const current: IsolatedFootingInputs = { ...isolatedFootingDefaults, loadsAreFactored: true };
    const p = plan({ loadsAreFactored: false }, current);
    expect(p.fields).toEqual({ loadsAreFactored: false });
    expect(changeFor(p, TOGGLE_LABEL)).toMatchObject({ before: 'Mayoradas', after: 'Sin mayorar' });
    expect(p.risks).toEqual([]);
  });

  it('SUBIR σadm confirmada (250 → 400 kPa) → riesgo; bajarla (250 → 150) → ninguno', () => {
    const current: IsolatedFootingInputs = { ...isolatedFootingDefaults, sigma_adm: 250 };

    const sube = plan({ sigma_adm_kPa: 400 }, current);
    expect(sube.fields).toEqual({ sigma_adm: 400 });
    expect(sube.risks).toHaveLength(1);
    expect(sube.risks[0]).toMatchObject({
      field: 'sigma_adm', label: 'Tensión admisible σadm',
      before: soilPress(250), after: soilPress(400),
    });
    expect(sube.risks[0].why).toMatch(/geotécnico/i);

    const baja = plan({ sigma_adm_kPa: 150 }, current);
    expect(baja.fields).toEqual({ sigma_adm: 150 });
    expect(baja.risks).toEqual([]);
  });

  it('SUBIR μ de rozamiento confirmado (0.35 → 0.6) → riesgo (lo fija el estudio geotécnico)', () => {
    const current: IsolatedFootingInputs = { ...isolatedFootingDefaults, mu_friction: 0.35 };
    const p = plan({ mu_friction: 0.6 }, current);
    expect(p.fields).toEqual({ mu_friction: 0.6 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'mu_friction', label: 'Coef. de rozamiento μ', before: '0.35', after: '0.60',
    });
  });

  it('bajar las cargas CONFIRMADAS (N/Mx/My/H) → un riesgo por carga, en el orden de changes', () => {
    // Mx/My/H tienen default 0: para que cuenten como confirmadas el estado de
    // partida debe traerlas > 0 (si no, el gate anti-ruido las deja pasar).
    const current: IsolatedFootingInputs = {
      ...isolatedFootingDefaults, N: 900, Mx: 60, My: 30, H: 45,
    };
    const p = plan(
      { loadsAreFactored: false, N_kN: 500, Mx_kNm: 20, My_kNm: 10, H_kN: 15 },
      current,
    );
    expect(p.fields).toEqual({ N: 500, Mx: 20, My: 10, H: 15 });
    expect(p.risks.map((r) => r.field)).toEqual(['N', 'Mx', 'My', 'H']);
    expect(p.risks.map((r) => r.field)).toEqual(p.changes.map((c) => c.field));
    expect(p.risks[0]).toMatchObject({ before: '900.00 kN', after: '500.00 kN' });
    expect(p.risks[1]).toMatchObject({ before: '60.00 kNm', after: '20.00 kNm' });
    expect(p.risks[2]).toMatchObject({ before: '30.00 kNm', after: '10.00 kNm' });
    expect(p.risks[3]).toMatchObject({ before: '45.00 kN', after: '15.00 kN' });
  });

  it('bajar el coef. de mayoración CONFIRMADO (γ 1.5 → 1.0) → riesgo (baja TODA la demanda a la vez)', () => {
    // Cargas SIN mayorar: el motor multiplica (N_elu = N·γ), así que bajar γ rebaja
    // la demanda de CÁLCULO. La de servicio no se mueve (multiplicador 1).
    const current: IsolatedFootingInputs = { ...isolatedFootingDefaults, loadFactor: 1.5 };
    const p = plan({ loadFactor: 1.0 }, current);
    expect(p.fields).toEqual({ loadFactor: 1 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'demanda_calculo',
      before: '150% de las cargas introducidas',
      after: '100% de las cargas introducidas',
    });
  });

  it('bajar el recubrimiento CONFIRMADO (70 → 40 mm) → riesgo (lo fija la durabilidad)', () => {
    const current: IsolatedFootingInputs = { ...isolatedFootingDefaults, cover: 70 };
    const p = plan({ cover_mm: 40 }, current);
    expect(p.fields).toEqual({ cover: 40 });
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({
      field: 'cover', label: 'Recubrimiento', before: '70 mm', after: '40 mm',
    });
  });

  it('GATE ANTI-RUIDO: con el estado en DEFAULTS, bajar N (300 → 200) NO genera riesgo', () => {
    // N sigue en su valor de fábrica → nadie lo fijó → rellenar el formulario
    // con el dato del enunciado no es debilitar un valor ya establecido.
    const p = plan({ loadsAreFactored: false, N_kN: 200 });
    expect(p.fields).toEqual({ N: 200 });
    expect(changeFor(p, 'Axil N')).toMatchObject({ before: '300.00 kN', after: '200.00 kN' });
    expect(p.risks).toEqual([]);
  });

  it('agrandar la zapata (B/L/h) y reforzar el armado → SIN riesgo: es LA salida legítima', () => {
    // Df = 1.0 en el estado: el canto propuesto (0.9) sigue por debajo, así que la
    // invariante h ≤ Df no se dispara y el canto se aplica (ver la 5ª familia).
    const current: IsolatedFootingInputs = {
      ...isolatedFootingDefaults, N: 900, sigma_adm: 250, B: 2, L: 2, h: 0.6, Df: 1.0,
    };
    const p = plan({ B_m: 2.8, L_m: 3, h_m: 0.9, phi_x_mm: 20, s_x_mm: 150 }, current);
    expect(p.fields).toEqual({ B: 2.8, L: 3, h: 0.9, phi_x: 20, s_x: 150 });
    expect(p.changes).toHaveLength(5);
    expect(p.risks).toEqual([]);
  });

  it('plan sin cambios peligrosos → risks = [] (campo SIEMPRE presente, nunca undefined)', () => {
    expect(plan().risks).toEqual([]);
    expect(plan({ fck_MPa: 30 }).risks).toEqual([]);
  });
});

describe('summarizeIsolatedFootingResults — resumen de resultados (motor real, T2.4)', () => {
  it('defaults → verdict coherente con overallStatus(checks) + extras de distribución y rigidez', () => {
    const res = calcIsolatedFooting(isolatedFootingDefaults);
    expect(res.error).toBeUndefined();

    const s = summarizeIsolatedFootingResults(res);
    expect(s.verdict).toBe(overallStatus(res.checks));
    expect(s.text).toContain('VEREDICTO GLOBAL:');

    // Extra 1: distribución + tensiones, computado con el propio resultado
    // (determinista, sin números mágicos). Defaults sin momentos → trapecial.
    expect(res.distributionType).toBe('trapezoidal');
    const distLine =
      'Distribución de tensiones: trapecial — '
      + `σmax=${formatQuantity(res.sigma_max, 'soilPressure', 'si')}, `
      + `σmin=${formatQuantity(res.sigma_min, 'soilPressure', 'si')}`;
    expect(s.text).toContain(distLine);

    // Extra 2: defaults → vuelo máx 0.7 m ≤ 2h = 1.2 m → rígida.
    expect(res.isRigid).toBe(true);
    expect(s.text).toContain('Comportamiento: zapata rígida (vuelo máx ≤ 2h)');
  });

  it('vuelco en fallo (Mx=500) → fail, NUNCA invalid (valid:false SIN error), con la línea del FS', () => {
    const res = calcIsolatedFooting({ ...isolatedFootingDefaults, Mx: 500 });
    // Precondición del caso: el `valid` divergente de zapatas — incumple SIN error.
    expect(res.error).toBeUndefined();
    expect(res.valid).toBe(false);
    expect(res.checks.find((c) => c.id === 'overturn-y')?.status).toBe('fail');

    const s = summarizeIsolatedFootingResults(res);
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('INCUMPLE');
    expect(s.text).not.toContain('CÁLCULO NO VÁLIDO');

    // La línea del FS de vuelco sale como [INCUMPLE].
    const fsLine = s.text.split('\n').find((l) => l.includes('Vuelco dir. y'));
    expect(fsLine).toBeDefined();
    expect(fsLine).toContain('[INCUMPLE]');
    expect(fsLine).toContain('FS =');

    // Los extras se emiten también con valid:false (el discriminador es error),
    // y formatQuantity presenta σmax=Infinity como '∞'.
    expect(res.distributionType).toBe('overturning_fail');
    expect(s.text).toContain('Distribución de tensiones: vuelco geométrico');
    expect(s.text).toContain('σmax=∞');
    expect(s.text).toMatch(/Comportamiento: zapata (rígida|flexible)/);
  });

  it('geometría imposible (bc ≥ B) → invalid con "CÁLCULO NO VÁLIDO" y SIN extras', () => {
    const res = calcIsolatedFooting({ ...isolatedFootingDefaults, bc: 2 });
    expect(res.error).toBe('El pilar debe ser menor que la zapata');

    const s = summarizeIsolatedFootingResults(res);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
    expect(s.text).toContain('El pilar debe ser menor que la zapata');
    expect(s.text).not.toContain('Distribución de tensiones');
    expect(s.text).not.toContain('Comportamiento: zapata');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5ª FAMILIA de la auditoría (2026-07-14) — propuestas que dejan el módulo
// INVÁLIDO. El motor rechaza h > Df, bc ≥ B y hc ≥ L. buildPlan revierte los
// miembros PROPUESTOS de una pareja que quedaría inválida (vuelven a su valor
// vigente, que era válido) y los explica en `skipped`. Solo toca lo propuesto.
// current: B=L=1.8 · h=0.6 · bc=hc=0.4 · Df=0.8.
// ─────────────────────────────────────────────────────────────────────────────
describe('isolatedFooting — invariantes de pareja (nunca dejar el módulo inválido)', () => {
  const CANTO = 'Canto de zapata h';
  const DF = 'Profundidad Df';
  const BC = 'Ancho de pilar bc';
  const B = 'Ancho de zapata B';

  /** El estado FINAL tras aplicar el plan pasa el motor (sin EdificioInvalid por geometría). */
  const finalIsValid = (p: AiApplyPlan<IsolatedFootingInputs>, current = isolatedFootingDefaults) => {
    const res = calcIsolatedFooting({ ...current, ...p.fields });
    return res.error == null || !/Df|menor que la zapata/.test(res.error);
  };

  it('subir el canto por encima de Df (solo h) → h REVERTIDO, no aplicado, con motivo que cita Df', () => {
    const p = plan({ h_m: 1.0 }); // Df sigue en 0.8
    expect(p.fields).not.toHaveProperty('h');
    expect(changeFor(p, CANTO)).toBeUndefined();
    expect(skipFor(p, CANTO)?.reason).toMatch(/no puede superar la profundidad de cimentación Df/);
    expect(skipFor(p, CANTO)?.reason).toMatch(/propón TAMBIÉN una Df mayor/);
    expect(finalIsValid(p)).toBe(true);
  });

  it('la pareja COHERENTE (más canto Y más Df) SÍ se aplica', () => {
    const p = plan({ h_m: 1.5, Df_m: 2.0 }); // h < Df ⇒ válido
    expect(p.fields.h).toBe(1.5);
    expect(p.fields.Df).toBe(2.0);
    expect(skipFor(p, CANTO)).toBeUndefined();
    expect(finalIsValid(p)).toBe(true);
  });

  it('pareja propuesta pero incoherente (h=1.5 > Df=1.0) → se revierten LOS DOS', () => {
    const p = plan({ h_m: 1.5, Df_m: 1.0 });
    expect(p.fields).not.toHaveProperty('h');
    expect(p.fields).not.toHaveProperty('Df');
    expect(skipFor(p, CANTO)).toBeDefined();
    expect(skipFor(p, DF)).toBeDefined();
  });

  it('el pilar no puede ser ≥ que la zapata: bc=2.0 con B=1.8 → bc revertido', () => {
    const p = plan({ bc_m: 2.0 });
    expect(p.fields).not.toHaveProperty('bc');
    expect(skipFor(p, BC)?.reason).toMatch(/debe ser MENOR que la zapata/);
    expect(finalIsValid(p)).toBe(true);
  });

  it('agrandar pilar Y zapata a la vez (bc<B) SÍ se aplica', () => {
    const p = plan({ bc_m: 2.0, B_m: 2.5 });
    expect(p.fields.bc).toBe(2.0);
    expect(p.fields.B).toBe(2.5);
    expect(skipFor(p, BC)).toBeUndefined();
    expect(skipFor(p, B)).toBeUndefined();
  });

  it('la reversión es QUIRÚRGICA: solo la pareja rota; un campo ajeno válido se aplica', () => {
    const p = plan({ h_m: 1.0, cover_mm: 45 }); // h rompe h≤Df; cover es ajeno
    expect(p.fields).not.toHaveProperty('h');
    expect(p.fields.cover).toBe(45); // el ajeno se conserva
  });

  it('estado del usuario YA inválido (h>Df): un cambio ajeno no genera skip espurio ni se bloquea', () => {
    const roto: IsolatedFootingInputs = { ...isolatedFootingDefaults, h: 1.2, Df: 1.0 };
    const p = plan({ cover_mm: 50 }, roto);
    expect(p.fields.cover).toBe(50);        // el cambio ajeno pasa
    expect(skipFor(p, CANTO)).toBeUndefined(); // nadie propuso h ⇒ no se toca
    expect(skipFor(p, DF)).toBeUndefined();
  });
});

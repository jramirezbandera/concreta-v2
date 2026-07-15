// Tests del adapter steel-beams (src/lib/ai/modules/steelBeams.ts):
// snapshot = {valores, sin_confirmar} — valores en unidades humanas con
// exactamente las claves extraíbles del payload schema, sin_confirmar con las
// claves cuyo valor de estado sigue siendo el default del módulo; buildPlan
// delega en parseExtraction + buildApplyPlan (unidades humanas → SI interno) y
// propaga notes; payload no-objeto → AiError('bad-response');
// STEEL_PROMPT_RULES sin el framing one-shot.

import { describe, it, expect } from 'vitest';
import { steelBeamsAdapter, summarizeSteelBeamResults } from '../../lib/ai/modules/steelBeams';
import { STEEL_BEAM_EXTRACTION_SCHEMA, STEEL_PROMPT_RULES } from '../../lib/ai/schema';
import { AiError } from '../../lib/ai/types';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { deriveFromLoads } from '../../lib/calculations/loadGen';
import { steelBeamDefaults, type SteelBeamInputs } from '../../data/defaults';

const SYSTEM = 'si' as const;

/** Las 12 claves extraíbles del payload (schema menos warnings/notes). */
const EXTRACTABLE_KEYS = [
  'tipo', 'size', 'steel', 'beamType', 'L_m', 'Lcr_m', 'deflLimit',
  'elsCombo', 'useCategory', 'gk_kNm2', 'qk_kNm2', 'bTrib_m',
];

/** Payload todo-null + warnings vacíos, con overrides parciales. */
function makePayload(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tipo: null, size: null, steel: null, beamType: null,
    L_m: null, Lcr_m: null, deflLimit: null, elsCombo: null,
    useCategory: null, gk_kNm2: null, qk_kNm2: null, bTrib_m: null,
    warnings: [],
    notes: null,
    ...partial,
  };
}

describe('steelBeamsAdapter — identidad y contrato', () => {
  it('id, label, payloadSchema (referencia intacta) y placeholder', () => {
    expect(steelBeamsAdapter.id).toBe('steel-beams');
    expect(steelBeamsAdapter.label).toBe('Vigas de acero');
    expect(steelBeamsAdapter.payloadSchema).toBe(STEEL_BEAM_EXTRACTION_SCHEMA);
    expect(steelBeamsAdapter.promptRules).toBe(STEEL_PROMPT_RULES);
    expect(steelBeamsAdapter.placeholder).toContain('Viga biapoyada de 8 m de luz');
  });

  it('las claves extraíbles coinciden con las properties del schema menos warnings/notes', () => {
    const props = Object.keys(STEEL_BEAM_EXTRACTION_SCHEMA.properties as Record<string, unknown>);
    expect(props.filter((k) => k !== 'warnings' && k !== 'notes').sort())
      .toEqual([...EXTRACTABLE_KEYS].sort());
  });
});

/** Snapshot parseado: contrato {valores, sin_confirmar}. */
interface Snap {
  valores: Record<string, unknown>;
  sin_confirmar: string[];
}
function snap(current: SteelBeamInputs): Snap {
  return JSON.parse(steelBeamsAdapter.snapshot(current)) as Snap;
}

describe('steelBeamsAdapter.snapshot', () => {
  it('es JSON válido con exactamente las claves del contrato {valores, sin_confirmar}', () => {
    const parsed: unknown = JSON.parse(steelBeamsAdapter.snapshot(steelBeamDefaults));
    expect(typeof parsed).toBe('object');
    expect(Object.keys(parsed as Record<string, unknown>)).toEqual(['valores', 'sin_confirmar']);
  });

  it('valores tiene exactamente las claves extraíbles del schema', () => {
    expect(Object.keys(snap(steelBeamDefaults).valores).sort()).toEqual([...EXTRACTABLE_KEYS].sort());
  });

  it('valores en unidades humanas (L_m 6 en m, no 6000 mm)', () => {
    expect(snap(steelBeamDefaults).valores).toEqual({
      tipo: 'IPE',
      size: 300,
      steel: 'S275',
      beamType: 'ss',
      L_m: 6,            // 6000 mm → 6 m
      Lcr_m: 6,          // 6000 mm → 6 m
      deflLimit: 300,
      elsCombo: 'characteristic',
      useCategory: 'A1',
      gk_kNm2: 1.0,      // directo (ya en kN/m²)
      qk_kNm2: 2.0,
      bTrib_m: 3.0,      // directo (ya en m)
    });
  });

  it('formulario recién abierto (defaults) → TODAS las claves en sin_confirmar, en el orden de valores', () => {
    const s = snap(steelBeamDefaults);
    expect(s.sin_confirmar).toEqual(EXTRACTABLE_KEYS);              // orden determinista
    expect(s.sin_confirmar).toEqual(Object.keys(s.valores));        // = orden de valores
  });

  it('campos tocados por el usuario (L, gk) salen de sin_confirmar; el resto sigue dentro', () => {
    const s = snap({ ...steelBeamDefaults, L: 8000, gk: 3.5 });
    expect(s.valores.L_m).toBe(8);        // unidad humana
    expect(s.valores.gk_kNm2).toBe(3.5);
    expect(s.sin_confirmar).not.toContain('L_m');
    expect(s.sin_confirmar).not.toContain('gk_kNm2');
    expect(s.sin_confirmar).toEqual(EXTRACTABLE_KEYS.filter((k) => k !== 'L_m' && k !== 'gk_kNm2'));
  });

  it('la comparación es sobre el valor de ESTADO, no el humano (Lcr 6001 mm → confirmado)', () => {
    const s = snap({ ...steelBeamDefaults, Lcr: 6001 });
    expect(s.sin_confirmar).not.toContain('Lcr_m');
    expect(s.sin_confirmar).toContain('L_m');   // L intacta
  });

  it('campos no extraíbles del estado (title, MEd…) no afectan al snapshot', () => {
    expect(snap({ ...steelBeamDefaults, title: 'Viga 1', MEd: 999, Mser: 123 }))
      .toEqual(snap(steelBeamDefaults));
  });
});

describe('steelBeamsAdapter.buildPlan', () => {
  it('payload {L_m: 8, resto null} → fields.L = 8000 mm (SI interno) y change presente', () => {
    const plan = steelBeamsAdapter.buildPlan(makePayload({ L_m: 8 }), steelBeamDefaults, SYSTEM);
    expect(plan.fields.L).toBe(8000);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      field: 'L', label: 'Luz L', before: '6.00 m', after: '8.00 m',
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it('propaga notes desde el payload', () => {
    const plan = steelBeamsAdapter.buildPlan(
      makePayload({ notes: 'Se asumió forjado de oficinas.' }),
      steelBeamDefaults,
      SYSTEM,
    );
    expect(plan.notes).toBe('Se asumió forjado de oficinas.');
  });

  it('notes null → plan.notes null', () => {
    const plan = steelBeamsAdapter.buildPlan(makePayload(), steelBeamDefaults, SYSTEM);
    expect(plan.notes).toBeNull();
  });

  // risks es un campo REQUERIDO del contrato AiApplyPlan: el adapter debe
  // propagar lo que detecta el mapper (detalle fino en mapExtraction.test.ts).
  it('propaga los riesgos de seguridad del mapper (bajar un gk confirmado)', () => {
    const current: SteelBeamInputs = { ...steelBeamDefaults, gk: 4.0 };
    const plan = steelBeamsAdapter.buildPlan(makePayload({ gk_kNm2: 2.0 }), current, SYSTEM);
    expect(plan.fields.gk).toBe(2);   // se aplica: los riesgos marcan, no bloquean
    expect(plan.risks).toHaveLength(1);
    expect(plan.risks[0]).toMatchObject({
      field: 'gk', label: 'Carga permanente gk', before: '4.00 kN/m²', after: '2.00 kN/m²',
    });
  });

  it('propuesta que no reduce la seguridad (L 6 → 8 m) → plan.risks vacío', () => {
    const plan = steelBeamsAdapter.buildPlan(makePayload({ L_m: 8 }), steelBeamDefaults, SYSTEM);
    expect(plan.risks).toEqual([]);
  });

  it('payload no-objeto → AiError("bad-response") vía parseExtraction', () => {
    for (const bad of ['texto', 42, null, [1, 2]]) {
      let caught: unknown;
      try {
        steelBeamsAdapter.buildPlan(bad, steelBeamDefaults, SYSTEM);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AiError);
      expect((caught as AiError).kind).toBe('bad-response');
    }
  });
});

/**
 * Inputs efectivos como los construye steel-beams/index.tsx: esfuerzos
 * MEd/VEd/VEd_interaction/Mser derivados de las cargas superficiales con
 * deriveFromLoads (el motor calcSteelBeam los espera ya puestos).
 */
function effective(base: SteelBeamInputs): SteelBeamInputs {
  const d = deriveFromLoads(base);
  return { ...base, MEd: d.MEd, VEd: d.VEd, VEd_interaction: d.VEd_interaction, Mser: d.Mser };
}

describe('summarizeSteelBeamResults — resumen de resultados (motor real)', () => {
  it('defaults (IPE 300, 6 m) cumple → verdict ok y línea dominante al final', () => {
    const r = calcSteelBeam(effective(steelBeamDefaults));
    expect(r.valid).toBe(true);
    const s = summarizeSteelBeamResults(r);
    expect(s.verdict).toBe('ok');
    expect(s.text).toContain('Comprobación dominante');
    const last = s.text.trimEnd().split('\n').at(-1);
    expect(last).toMatch(/^Comprobación dominante: .+ \(η=\d+%\)$/);
    expect(last).toContain(`(η=${Math.round(r.utilization * 100)}%)`);
  });

  it('IPE 200 con L = 12 m falla → verdict fail con líneas [INCUMPLE] (y sigue siendo válido: línea dominante presente)', () => {
    const r = calcSteelBeam(effective({ ...steelBeamDefaults, size: 200, L: 12000, Lcr: 12000 }));
    expect(r.valid).toBe(true);
    const s = summarizeSteelBeamResults(r);
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('[INCUMPLE]');
    expect(s.text).toContain('Comprobación dominante');
  });

  it('perfil inexistente (IPE 999) → verdict invalid con "CÁLCULO NO VÁLIDO" y sin línea dominante', () => {
    const r = calcSteelBeam({ ...steelBeamDefaults, size: 999 });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Perfil no encontrado');
    const s = summarizeSteelBeamResults(r);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
    expect(s.text).not.toContain('Comprobación dominante');
  });
});

describe('STEEL_PROMPT_RULES — sin framing one-shot', () => {
  it('no contiene "Recibirás" ni "exclusivamente con el JSON"', () => {
    expect(STEEL_PROMPT_RULES).not.toContain('Recibirás');
    expect(STEEL_PROMPT_RULES).not.toContain('exclusivamente con el JSON');
  });

  it('conserva el contenido técnico clave del módulo', () => {
    expect(STEEL_PROMPT_RULES).toContain('kN/m²');
    expect(STEEL_PROMPT_RULES).toContain('peso propio');
    expect(STEEL_PROMPT_RULES).toContain('biempotrada');
    expect(STEEL_PROMPT_RULES).toContain('250/300/400/500/600');
    expect(STEEL_PROMPT_RULES).toContain('A1');
  });
});

describe('STEEL_PROMPT_RULES — contrato de cargas (una permanente + una variable)', () => {
  it('declara que gk y qk son los ÚNICOS campos de carga (no hay nieve ni viento)', () => {
    expect(STEEL_PROMPT_RULES).toContain('CONTRATO DE CARGAS');
    expect(STEEL_PROMPT_RULES).toMatch(/ÚNICOS campos de carga/);
    expect(STEEL_PROMPT_RULES).toMatch(/No hay campos de nieve, viento/);
  });

  it('gk ACUMULA y qk es ENVOLVENTE que nunca disminuye por una acción menor', () => {
    expect(STEEL_PROMPT_RULES).toMatch(/permanentes se ACUMULAN/);
    expect(STEEL_PROMPT_RULES).toMatch(/variables NO se acumulan/);
    expect(STEEL_PROMPT_RULES).toContain('ENVOLVENTE');
    expect(STEEL_PROMPT_RULES).toMatch(/NUNCA disminuye/);
    // acción nueva menor → null + warning, no sustitución:
    expect(STEEL_PROMPT_RULES).toMatch(/MENOR que la vigente[\s\S]*deja qk_kNm2 en null/);
  });

  it('recoge la no concomitancia de la categoría G y la combinación ψ0 cuando sí concurren', () => {
    expect(STEEL_PROMPT_RULES).toContain('CTE DB-SE-AE 3.1.1');
    expect(STEEL_PROMPT_RULES).toMatch(/NO es concomitante con nieve ni viento/);
    expect(STEEL_PROMPT_RULES).toMatch(/gobierna la MAYOR/);
    expect(STEEL_PROMPT_RULES).toContain('ψ0,i·Qk,i');
  });

  it('explica el rechazo del qk por debajo de la categoría y el escape por "Personalizada"', () => {
    expect(STEEL_PROMPT_RULES).toMatch(/RECHAZA un qk_kNm2 inferior/);
    expect(STEEL_PROMPT_RULES).toContain('"Personalizada"');
  });

  it('el viento de succión y las acciones no representables se declaran, no se meten en qk', () => {
    expect(STEEL_PROMPT_RULES).toMatch(/SUCCIÓN/);
    expect(STEEL_PROMPT_RULES).toMatch(/NO caben en qk_kNm2/);
    expect(STEEL_PROMPT_RULES).toContain('pendiente fuera del módulo');
  });
});

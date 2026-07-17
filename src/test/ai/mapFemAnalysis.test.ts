// Tests del adapter IA de FEM 1D (ola 5) — el único módulo cuyo payload es una
// PROYECCIÓN de un modelo estructural anidado (vanos/apoyos/cargas ←→
// DesignModel). Cubre: reconstrucción con ids preservados y arrastre posicional
// de armado, todo-o-nada por array, cross-check con validateModel, la trampa
// del signo de Py (positivo = HACIA ABAJO), riesgos con gate anti-ruido, el
// snapshot con bandera de plantilla y la guarda de uniones de Anthropic.

import { describe, it, expect } from 'vitest';
import {
  FEM_PAYLOAD_SCHEMA,
  femAnalysisAdapter,
  summarizeFemResults,
} from '../../lib/ai/modules/femAnalysis';
import { buildChatSchema } from '../../lib/ai/chatSchema';
import {
  ANTHROPIC_UNION_LIMIT,
  countAnthropicUnions,
} from '../../lib/ai/providers/schemaConvert';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import { validateModel } from '../../features/fem-analysis/invariants';
import { solveDesignModel } from '../../features/fem-analysis/solveDesignModel';
import { toStatus } from '../../lib/calculations/types';
import type {
  ArmadoHA,
  DesignModel,
  PointNodeLoad,
  SolveResult,
  UdlLoad,
} from '../../features/fem-analysis/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vanos: null,
    apoyos: null,
    cargas: null,
    peso_propio: null,
    warnings: [],
    ...overrides,
  };
}

function plan(
  overrides: Record<string, unknown>,
  current: DesignModel = cloneDesignPreset('continuous'),
  confirmed?: ReadonlySet<string>,
) {
  return femAnalysisAdapter.buildPlan(makePayload(overrides), current, 'si', confirmed);
}

/** Item de `vanos` con todo null (= conservar) salvo lo indicado. */
function vano(longitud_m: number | null = null, rest: Record<string, unknown> = {}) {
  return {
    longitud_m, material: null, b_cm: null, h_cm: null, fck: null, perfil: null, acero: null,
    ...rest,
  };
}

/** Item de `cargas` completo (repartida G de 10 kN/m en el vano 1 por defecto). */
function carga(rest: Record<string, unknown> = {}) {
  return {
    tipo: 'repartida', objetivo: 1, valor: 10, dir: 'abajo',
    pos: null, desde: null, hasta: null, hipotesis: 'G', categoria_uso: null,
    ...rest,
  };
}

function skipFor(p: ReturnType<typeof plan>, label: string) {
  return p.skipped.find((s) => s.label.includes(label));
}

const CONTINUOUS_CARGAS = [carga({ objetivo: 1 }), carga({ objetivo: 2 }), carga({ objetivo: 3 })];

// ── Construcción y reemplazo ──────────────────────────────────────────────────

describe('femAnalysis — reconstrucción del modelo', () => {
  it('construye una viga de 3 vanos desde la plantilla de 1 vano', () => {
    const current = cloneDesignPreset('beam');
    const p = plan({
      vanos: [vano(5), vano(5), vano(5)],
      apoyos: ['articulado', 'deslizante', 'deslizante', 'deslizante'],
      cargas: CONTINUOUS_CARGAS,
    }, current);

    expect(p.fields.nodes?.map((n) => n.x)).toEqual([0, 5, 10, 15]);
    expect(p.fields.nodes?.every((n) => n.y === 0)).toBe(true);
    expect(p.fields.bars).toHaveLength(3);
    // El vano 1 conserva la barra existente; los nuevos acuñan ids sin colisión.
    expect(p.fields.bars?.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    expect(p.fields.bars?.every((b) => b.material === 'rc')).toBe(true);
    expect(p.fields.supports).toHaveLength(4);
    expect(p.fields.loads).toHaveLength(3);
    expect(p.changes.map((c) => c.field)).toEqual(['vanos', 'apoyos', 'cargas']);
    // La plantilla no está establecida y el hilo no la trató: sin riesgos.
    expect(p.risks).toEqual([]);
    // El modelo candidato es válido para el solver.
    const candidate = { ...current, ...p.fields } as DesignModel;
    expect(validateModel(candidate).ok).toBe(true);
  });

  it('solo cargas: no toca nodos, barras ni apoyos', () => {
    const p = plan({ cargas: CONTINUOUS_CARGAS.map((c) => ({ ...c, valor: 12 })) });
    expect(p.fields.loads).toHaveLength(3);
    expect(p.fields.nodes).toBeUndefined();
    expect(p.fields.bars).toBeUndefined();
    expect(p.fields.supports).toBeUndefined();
  });

  it('vanos con todo null = conservar → skip "ya coincide"', () => {
    const p = plan({ vanos: [vano(), vano(), vano()] });
    expect(p.fields.bars).toBeUndefined();
    expect(skipFor(p, 'Vanos')?.reason).toContain('coincide');
  });

  it('arrastre posicional: añadir un vano conserva el armado tuneado de los existentes', () => {
    const current = cloneDesignPreset('continuous');
    const tuned: ArmadoHA = { ...(current.bars[1].vano_armado as ArmadoHA), tens_nBars: 6 };
    current.bars[1] = { ...current.bars[1], vano_armado: tuned };

    const p = plan({ vanos: [vano(), vano(), vano(), vano(4)] }, current);
    expect(p.fields.bars?.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(p.fields.bars?.[1].vano_armado?.tens_nBars).toBe(6);
    // El vano nuevo recibe el armado por defecto, no el tuneado.
    expect(p.fields.bars?.[3].vano_armado?.tens_nBars).toBe(4);
    expect(p.fields.nodes?.map((n) => n.x)).toEqual([0, 5, 10, 15, 19]);
    expect(p.fields.nodes?.[4].id).toBe('n5');
    // Nada que podar: cargas y apoyos existentes sobreviven tal cual.
    expect(p.fields.loads).toBeUndefined();
    expect(p.fields.supports).toBeUndefined();
  });

  it('quitar un vano PODA las cargas y apoyos huérfanos con aviso', () => {
    const p = plan({ vanos: [vano(), vano()] });
    expect(p.fields.bars).toHaveLength(2);
    // El apoyo de n4 y la carga de b3 desaparecen con la geometría.
    expect(p.fields.supports).toHaveLength(3);
    expect(p.fields.loads).toHaveLength(2);
    expect(p.warnings.some((w) => w.includes('apoyo(s) eliminados'))).toBe(true);
    expect(p.warnings.some((w) => w.includes('carga(s) eliminadas'))).toBe(true);
  });

  it('todo-o-nada: una carga con objetivo fuera de rango invalida la lista entera', () => {
    const p = plan({ cargas: [carga(), carga({ objetivo: 5 })] });
    expect(p.fields.loads).toBeUndefined();
    expect(skipFor(p, 'Cargas')?.reason).toContain('vano 5 no existe');
  });

  it('apoyos con longitud distinta de vanos+1 → skip con el número esperado', () => {
    const p = plan({ apoyos: ['articulado', 'deslizante', 'deslizante'] });
    expect(p.fields.supports).toBeUndefined();
    expect(skipFor(p, 'Apoyos')?.reason).toContain('4 entradas');
  });

  it('ménsula: apoyos [empotrado, libre] + vano de acero', () => {
    const current = cloneDesignPreset('beam');
    const p = plan({
      vanos: [vano(3, { material: 'steel', perfil: 'IPE 240', acero: 'S275' })],
      apoyos: ['empotrado', 'libre'],
    }, current);
    expect(p.fields.supports).toEqual([{ node: 'n1', type: 'fixed' }]);
    expect(p.fields.bars?.[0].material).toBe('steel');
    expect(p.fields.bars?.[0].steelSelection?.profileKey).toBe('steel_IPE240');
    expect(p.warnings.some((w) => w.includes('pasa a acero'))).toBe(true);
    expect(validateModel({ ...current, ...p.fields } as DesignModel).ok).toBe(true);
  });

  it('apoyo "muelle" mapea a spring (round-trip de modelos existentes)', () => {
    const p = plan({ apoyos: ['muelle', 'deslizante', 'deslizante', 'deslizante'] });
    expect(p.fields.supports?.[0].type).toBe('spring');
  });

  it('cross-check del validador: quitar todos los apoyos se descarta con su mensaje', () => {
    const p = plan({ apoyos: ['libre', 'libre', 'libre', 'libre'] });
    expect(p.fields.supports).toBeUndefined();
    expect(skipFor(p, 'Apoyos')?.reason).toContain('inestable');
    expect(skipFor(p, 'Apoyos')?.reason).toContain('modelo inválido');
  });

  it('puntual_nudo con dir "abajo" produce Py POSITIVO (positivo = hacia abajo)', () => {
    const abajo = plan({ cargas: [carga({ tipo: 'puntual_nudo', objetivo: 2, valor: 20, hipotesis: 'Q', categoria_uso: 'B' })] });
    expect((abajo.fields.loads?.[0] as PointNodeLoad).Py).toBe(20);
    const arriba = plan({ cargas: [carga({ tipo: 'puntual_nudo', objetivo: 2, valor: 20, dir: 'arriba' })] });
    expect((arriba.fields.loads?.[0] as PointNodeLoad).Py).toBe(-20);
  });

  it('sobrecarga Q sin categoría → useCategory B con aviso; categoría con G se ignora', () => {
    const q = plan({ cargas: [carga({ hipotesis: 'Q' })] });
    expect((q.fields.loads?.[0] as UdlLoad).useCategory).toBe('B');
    expect(q.warnings.some((w) => w.includes('se asume B'))).toBe(true);

    const g = plan({ cargas: [carga({ hipotesis: 'G', categoria_uso: 'C1' })] });
    expect((g.fields.loads?.[0] as UdlLoad).useCategory).toBeUndefined();
    expect(g.warnings.some((w) => w.includes('se ignora'))).toBe(true);
  });

  it('perfil fuera del catálogo invalida el array; fck sobre un vano de acero solo avisa', () => {
    const current = cloneDesignPreset('cantilever'); // 1 vano de acero
    const malo = plan({ vanos: [vano(3, { material: 'steel', perfil: 'UPN 200' })] }, current);
    expect(malo.fields.bars).toBeUndefined();
    expect(skipFor(malo, 'Vanos')?.reason).toContain('fuera del catálogo');

    const inerte = plan({ vanos: [vano(4, { fck: 30 })] }, current);
    expect(inerte.fields.bars).toHaveLength(1);
    expect(inerte.warnings.some((w) => w.includes('no aplican'))).toBe(true);
  });

  it('repartida parcial: desde/hasta van al par from/to del UDL', () => {
    const p = plan({ cargas: [carga({ desde: 0.25, hasta: 0.75 })] });
    const l = p.fields.loads?.[0] as UdlLoad;
    expect(l.from).toBe(0.25);
    expect(l.to).toBe(0.75);
    const invalida = plan({ cargas: [carga({ desde: 0.8, hasta: 0.2 })] });
    expect(invalida.fields.loads).toBeUndefined();
  });
});

// ── Riesgos ───────────────────────────────────────────────────────────────────

describe('femAnalysis — guardarraíles', () => {
  const CONF = new Set(['cargas', 'vanos', 'peso_propio']);

  it('bajar la magnitud de una carga establecida es riesgo', () => {
    const p = plan({ cargas: [carga({ valor: 5 }), carga({ objetivo: 2 }), carga({ objetivo: 3 })] }, undefined, CONF);
    expect(p.risks.map((r) => r.field)).toContain('cargas[0].valor');
  });

  it('Q→G dispara el centinela de γ ELU (1.5→1.35), no el de persistencia', () => {
    const current = cloneDesignPreset('cantilever'); // carga Q en nudo 2
    const p = plan({
      cargas: [carga({ tipo: 'puntual_nudo', objetivo: 2, valor: 15, hipotesis: 'G' })],
    }, current, CONF);
    const fields = p.risks.map((r) => r.field);
    expect(fields).toContain('cargas[0].hipotesis_elu');
    expect(fields).not.toContain('cargas[0].hipotesis_persistencia');
  });

  it('G→W dispara el centinela de persistencia ψ₂ (1.0→0), no el de γ', () => {
    const p = plan({
      cargas: [carga({ hipotesis: 'W' }), carga({ objetivo: 2 }), carga({ objetivo: 3 })],
    }, undefined, CONF);
    const fields = p.risks.map((r) => r.field);
    expect(fields).toContain('cargas[0].hipotesis_persistencia');
    expect(fields).not.toContain('cargas[0].hipotesis_elu');
  });

  it('eliminar cargas establecidas genera el riesgo agregado de eliminación', () => {
    const p = plan({ cargas: [carga(), carga({ objetivo: 2 })] }, undefined, CONF);
    expect(p.risks.map((r) => r.field)).toContain('cargas.__removed');
  });

  it('la poda por cambio de geometría también cuenta como eliminación (hilo confirmado)', () => {
    const p = plan({ vanos: [vano(), vano()] }, undefined, CONF);
    expect(p.risks.map((r) => r.field)).toContain('cargas.__removed');
  });

  it('desactivar el peso propio establecido es riesgo', () => {
    const p = plan({ peso_propio: false }, undefined, CONF);
    expect(p.risks.map((r) => r.field)).toEqual(['selfWeight']);
  });

  it('acortar la luz de un vano establecido es riesgo; la sección es diseño libre', () => {
    const p = plan({ vanos: [vano(4, { b_cm: 25, h_cm: 40 }), vano(), vano()] }, undefined, CONF);
    expect(p.risks.map((r) => r.field)).toEqual(['vanos[0].longitud_m']);
  });

  it('gate anti-ruido: sobre la plantilla virgen y sin hilo, los mismos cambios no marcan nada', () => {
    const bajada = plan({ cargas: [carga({ valor: 5 }), carga({ objetivo: 2 })] });
    expect(bajada.risks).toEqual([]);
    const sinPeso = plan({ peso_propio: false });
    expect(sinPeso.risks).toEqual([]);
    const corta = plan({ vanos: [vano(4), vano(), vano()] });
    expect(corta.risks).toEqual([]);
  });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe('femAnalysis — snapshot', () => {
  it('proyecta la plantilla continua con bandera de plantilla y todo sin confirmar', () => {
    const snap = JSON.parse(femAnalysisAdapter.snapshot(cloneDesignPreset('continuous')));
    expect(snap.valores.vanos).toHaveLength(3);
    expect(snap.valores.vanos[0]).toMatchObject({ longitud_m: 5, material: 'rc', b_cm: 30, h_cm: 50 });
    expect(snap.valores.apoyos).toEqual(['articulado', 'deslizante', 'deslizante', 'deslizante']);
    expect(snap.valores.cargas).toHaveLength(3);
    expect(snap.valores.peso_propio).toBe(true);
    // Contexto de solo lectura DENTRO de valores (decorateSnapshot poda hermanas).
    expect(snap.valores.armados).toHaveLength(3);
    expect(snap.valores.modelo_de_plantilla).toBe(true);
    expect(snap.sin_confirmar.sort()).toEqual(['apoyos', 'cargas', 'peso_propio', 'vanos']);
  });

  it('al tocar una carga, "cargas" sale de sin_confirmar y cae la bandera', () => {
    const model = cloneDesignPreset('continuous');
    model.loads = model.loads.map((l, i) =>
      i === 0 && l.kind === 'udl' ? { ...l, w: 18 } : l);
    const snap = JSON.parse(femAnalysisAdapter.snapshot(model));
    expect(snap.sin_confirmar).not.toContain('cargas');
    expect(snap.valores.modelo_de_plantilla).toBe(false);
  });

  it('la ménsula de acero expone acero_detalles y Py como carga "abajo"', () => {
    const snap = JSON.parse(femAnalysisAdapter.snapshot(cloneDesignPreset('cantilever')));
    expect(snap.valores.acero_detalles).toHaveLength(1);
    expect(snap.valores.cargas[0]).toMatchObject({
      tipo: 'puntual_nudo', objetivo: 2, valor: 15, dir: 'abajo', hipotesis: 'Q', categoria_uso: 'B',
    });
  });

  it('presetCode desconocido ⇒ todo establecido (sin_confirmar vacío)', () => {
    const model = { ...cloneDesignPreset('beam'), presetCode: 'custom' };
    const snap = JSON.parse(femAnalysisAdapter.snapshot(model));
    expect(snap.sin_confirmar).toEqual([]);
    expect(snap.valores.modelo_de_plantilla).toBe(false);
  });
});

// ── Guarda de uniones (límite duro de Anthropic) ──────────────────────────────

describe('femAnalysis — schema', () => {
  it('el schema del chat cabe en el límite de uniones de Anthropic', () => {
    const unions = countAnthropicUnions(buildChatSchema(FEM_PAYLOAD_SCHEMA));
    expect(unions).toBeGreaterThan(0);
    expect(unions).toBeLessThanOrEqual(ANTHROPIC_UNION_LIMIT);
  });
});

// ── Resumen de resultados ─────────────────────────────────────────────────────

describe('femAnalysis — summarizeFemResults', () => {
  it('solver pendiente (chunk en vuelo) → SIN CALCULAR con verdict invalid', () => {
    const pending: SolveResult = {
      reactions: [], errors: [], perBar: {}, maxEta: 0, status: 'pending',
    };
    const s = summarizeFemResults(cloneDesignPreset('beam'), pending);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('SIN CALCULAR');
  });

  it('errores de validación → invalid con el mensaje del validador', () => {
    const model = { ...cloneDesignPreset('beam'), supports: [] };
    const s = summarizeFemResults(model, solveDesignModel(model));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('inestable');
  });

  it('el veredicto del chat coincide con el badge del módulo (toStatus(maxEta))', () => {
    const model = cloneDesignPreset('continuous');
    const result = solveDesignModel(model);
    const s = summarizeFemResults(model, result);
    expect(result.status).toBe(toStatus(result.maxEta));
    expect(s.verdict).toBe(result.status);
    expect(s.text).toContain('Vano 1');
    expect(s.text).toContain('Reacciones (ELU)');
    expect(s.text).toContain('η máximo global');
  });
});

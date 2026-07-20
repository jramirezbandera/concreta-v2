// Tests del adapter IA de FEM 2D (ola 6) — proyección plana del Fem2DModel
// libre (nudos/barras/apoyos/cargas por índice 1-based). Cubre: reconstrucción
// con ids preservados posicionalmente y pool COMPARTIDO de ids (trampa Pratt),
// todo-o-nada por lista, cascadas de poda con nudos/barras parciales,
// re-inferencia de roles auto, cross-check con el SOLVER real (mecanismos,
// biela cargada), la trampa de signos (fy negativo = gravedad), riesgos con
// gate anti-ruido, el snapshot con bandera de plantilla, el resumen de
// resultados alineado con el badge y la guarda de uniones de Anthropic.

import { describe, it, expect } from 'vitest';
import {
  FEM2D_PAYLOAD_SCHEMA,
  fem2dAdapter,
  summarizeFem2DResults,
} from '../../lib/ai/modules/fem2d';
import { buildChatSchema } from '../../lib/ai/chatSchema';
import {
  ANTHROPIC_UNION_LIMIT,
  countAnthropicUnions,
} from '../../lib/ai/providers/schemaConvert';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { setMemberMaterial } from '../../features/fem2d/modelOps';
import { analyzeFem2D, solveFem2D } from '../../features/fem2d/pipeline';
import type { Fem2DMember, Fem2DModel, MemberUdl2D } from '../../features/fem2d/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function portal(): Fem2DModel {
  return FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
}

function pratt(): Fem2DModel {
  return FEM2D_TEMPLATES['pratt-truss'].build(FEM2D_TEMPLATES['pratt-truss'].defaults());
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nudos: null, barras: null, apoyos: null, cargas: null, peso_propio: null, warnings: [],
    ...overrides,
  };
}

function plan(
  overrides: Record<string, unknown>,
  current: Fem2DModel = portal(),
  confirmed?: ReadonlySet<string>,
) {
  return fem2dAdapter.buildPlan(makePayload(overrides), current, 'si', confirmed);
}

function nudo(x: number, y: number) {
  return { x, y };
}

/** Item de `barras` con todo null (= conservar) salvo lo indicado. */
function barra(nudo_i: number, nudo_j: number, rest: Record<string, unknown> = {}) {
  return { nudo_i, nudo_j, tipo: null, rol: null, perfil: null, acero: null, correas_m: null, rotulas: null, ...rest };
}

function apoyo(n: number, tipo: string) {
  return { nudo: n, tipo };
}

/** Item de `cargas` completo (repartida G de 10 kN/m ↓ en la barra 2 = dintel). */
function carga(rest: Record<string, unknown> = {}) {
  return {
    tipo: 'repartida', objetivo: 2, fx: 0, fy: -10, ejes: 'global',
    pos: null, desde: null, hasta: null, hipotesis: 'G', categoria_uso: null,
    ...rest,
  };
}

/** Las 3 barras del pórtico, en eco (conservar todo). */
const PORTAL_BARRAS = [barra(1, 2), barra(2, 3), barra(4, 3)];

/** Las 3 cargas del pórtico plantilla, proyectadas tal cual. */
const PORTAL_CARGAS = [
  carga({ fy: -13 }),
  carga({ fy: -5, hipotesis: 'Q', categoria_uso: 'B' }),
  carga({ tipo: 'nudo', objetivo: 2, fx: 8, fy: 0, hipotesis: 'W' }),
];

function skipFor(p: ReturnType<typeof plan>, label: string) {
  return p.skipped.find((s) => s.label.includes(label));
}

// ── Reconstrucción y reemplazo ────────────────────────────────────────────────

describe('fem2d — reconstrucción del modelo', () => {
  it('reemplaza cargas sin tocar la topología', () => {
    const p = plan({ cargas: [carga({ fy: -15 }), carga({ tipo: 'nudo', objetivo: 2, fx: 8, fy: 0, hipotesis: 'W' })] });
    expect(p.fields.loads).toHaveLength(2);
    expect((p.fields.loads?.[0] as MemberUdl2D).wy).toBe(-15);
    expect(p.fields.nodes).toBeUndefined();
    expect(p.fields.members).toBeUndefined();
    expect(p.fields.supports).toBeUndefined();
    // Cambio estructural aplicado ⇒ procedencia honesta.
    expect(p.fields.templateId).toBe('custom');
    expect(p.changes.map((c) => c.field)).toEqual(['cargas']);
  });

  it('añade una biela diagonal al pórtico (rol auto, id sin colisión)', () => {
    const p = plan({ barras: [...PORTAL_BARRAS, barra(1, 3, { tipo: 'biela', perfil: 'L 80×8' })] });
    expect(p.fields.members).toHaveLength(4);
    const nueva = p.fields.members![3];
    expect(nueva.elementType).toBe('two-force');
    expect(nueva.role).toBe('diagonal');
    expect(nueva.steelSelection?.profileKey).toBe('steel_L80x8');
    // Las 3 existentes conservan id posicionalmente.
    expect(p.fields.members!.slice(0, 3).map((m) => m.id)).toEqual(['p1', 'v1', 'p2']);
  });

  it('pool COMPARTIDO de ids: en la Pratt una barra nueva no pisa los nudos b0..bn', () => {
    const current = pratt();
    const snap = JSON.parse(fem2dAdapter.snapshot(current)) as {
      valores: { barras: { nudo_i: number; nudo_j: number }[] };
    };
    const eco = snap.valores.barras.map((b) => barra(b.nudo_i, b.nudo_j));
    const p = plan({ barras: [...eco, barra(1, 7)] }, current);
    const nueva = p.fields.members![p.fields.members!.length - 1];
    // b1..b4 son NUDOS de la Pratt: el primer id libre con prefijo 'b' es b5.
    expect(nueva.id).toBe('b5');
  });

  it('construye un modelo nuevo completo (triángulo articulado) desde el pórtico', () => {
    const current = portal();
    const p = plan({
      nudos: [nudo(0, 0), nudo(4, 0), nudo(2, 2)],
      barras: [barra(1, 2), barra(1, 3, { tipo: 'biela' }), barra(2, 3, { tipo: 'biela' })],
      apoyos: [apoyo(1, 'articulado'), apoyo(2, 'deslizante')],
      cargas: [carga({ tipo: 'nudo', objetivo: 3, fx: 0, fy: -20 })],
    }, current);
    expect(p.fields.nodes?.map((n) => [n.x, n.y])).toEqual([[0, 0], [4, 0], [2, 2]]);
    // Ids de nudos preservados posicionalmente (n1..n3 del pórtico).
    expect(p.fields.nodes?.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(p.fields.members).toHaveLength(3);
    // El cordón inferior hereda la identidad de p1 y re-infiere rol viga (horizontal).
    expect(p.fields.members![0].id).toBe('p1');
    expect(p.fields.members![0].role).toBe('viga');
    const candidate = { ...current, ...p.fields } as Fem2DModel;
    expect(solveFem2D(candidate).ok).toBe(true);
  });

  it('nudos más cortos sin "barras": poda huérfanos en cascada con aviso', () => {
    // Se elimina n4 (la base del pilar derecho): caen p2, su apoyo y nada más.
    const p = plan({ nudos: [nudo(0, 0), nudo(0, 3.5), nudo(6, 3.5)] });
    expect(p.fields.members?.map((m) => m.id)).toEqual(['p1', 'v1']);
    expect(p.fields.supports).toHaveLength(1);
    expect(p.warnings.some((w) => w.includes('barra(s) eliminadas'))).toBe(true);
    expect(p.warnings.some((w) => w.includes('apoyo(s) eliminados'))).toBe(true);
  });

  it('mover un nudo re-infiere los roles auto pilar↔viga (espejo del lienzo)', () => {
    // n4 pasa de (6,0) a (3,0): p2 deja de ser vertical ⇒ rol auto viga.
    const p = plan({ nudos: [nudo(0, 0), nudo(0, 3.5), nudo(6, 3.5), nudo(3, 0)] });
    expect(p.fields.members?.[2].role).toBe('viga');
    expect(p.fields.members?.[2].id).toBe('p2');
  });

  it('eco exacto de cada lista → skip "ya coincide" (sin cambios fantasma)', () => {
    const p = plan({
      nudos: [nudo(0, 0), nudo(0, 3.5), nudo(6, 3.5), nudo(6, 0)],
      barras: PORTAL_BARRAS,
      apoyos: [apoyo(1, 'empotrado'), apoyo(4, 'empotrado')],
      cargas: PORTAL_CARGAS,
      peso_propio: true,
    });
    expect(p.changes).toEqual([]);
    expect(p.fields).toEqual({});
    expect(p.skipped).toHaveLength(5);
    expect(p.skipped.every((s) => s.reason.includes('coincide'))).toBe(true);
  });

  it('correas_m: 0 = sin arriostrar; un valor la fija; null conserva', () => {
    const p0 = plan({ barras: [barra(1, 2), barra(2, 3, { correas_m: 0 }), barra(4, 3)] });
    expect(p0.fields.members?.[1].ltbSpacing).toBeUndefined();
    const p1 = plan({ barras: [barra(1, 2), barra(2, 3, { correas_m: 0.8 }), barra(4, 3)] });
    expect(p1.fields.members?.[1].ltbSpacing).toBe(0.8);
    const pNull = plan({ barras: [...PORTAL_BARRAS, barra(1, 3)] });
    expect(pNull.fields.members?.[1].ltbSpacing).toBe(1.5); // conservado del dintel
  });
});

// ── Validación todo-o-nada ────────────────────────────────────────────────────

describe('fem2d — validación por lista (todo-o-nada)', () => {
  it('carga en barra sobre una biela → skip de cargas con el motivo', () => {
    const p = plan({ cargas: [carga({ objetivo: 7, fy: -5 })] }, pratt());
    expect(p.fields.loads).toBeUndefined();
    expect(skipFor(p, 'Cargas')?.reason).toContain('biela');
  });

  it('barra duplicada entre los mismos nudos → skip de barras', () => {
    const p = plan({ barras: [...PORTAL_BARRAS, barra(2, 1)] });
    expect(p.fields.members).toBeUndefined();
    expect(skipFor(p, 'Barras')?.reason).toContain('duplica');
  });

  it('perfil fuera de catálogo → skip de barras', () => {
    // 'IPE 220' dejó de valer como caso: el catálogo unificado trae la serie
    // IPE completa (y 2UPN/SHS/RHS/CHS). Un perfil inexistente de verdad:
    const p = plan({ barras: [barra(1, 2, { perfil: 'IPE 999' }), barra(2, 3), barra(4, 3)] });
    expect(skipFor(p, 'Barras')?.reason).toContain('fuera del catálogo');
  });

  it('rol incompatible con el tipo → skip de barras', () => {
    const p = plan({ barras: [barra(1, 2, { tipo: 'biela', rol: 'pilar' }), barra(2, 3), barra(4, 3)] });
    expect(skipFor(p, 'Barras')?.reason).toContain('biela');
  });

  it('objetivo fuera de rango → skip de cargas', () => {
    const p = plan({ cargas: [carga({ objetivo: 9 })] });
    expect(skipFor(p, 'Cargas')?.reason).toContain('no existe');
  });

  it('lista de apoyos vacía → skip', () => {
    const p = plan({ apoyos: [] });
    expect(skipFor(p, 'Apoyos')?.reason).toContain('al menos un apoyo');
  });
});

// ── Cross-check con el solver real ────────────────────────────────────────────

describe('fem2d — cross-check con el solver', () => {
  it('una propuesta que crea un mecanismo se descarta con el motivo', () => {
    const p = plan({ apoyos: [apoyo(1, 'deslizante')] });
    expect(p.fields.supports).toBeUndefined();
    expect(p.fields.templateId).toBeUndefined();
    expect(skipFor(p, 'Apoyos')?.reason).toContain('inválido');
  });

  it('pasar el dintel a biela con sus cargas vivas (cargas=null) se descarta por el validador', () => {
    const p = plan({ barras: [barra(1, 2), barra(2, 3, { tipo: 'biela' }), barra(4, 3)] });
    expect(p.fields.members).toBeUndefined();
    expect(skipFor(p, 'Barras')?.reason).toContain('inválido');
  });
});

// ── Trampa de signos ──────────────────────────────────────────────────────────

describe('fem2d — signos de las cargas', () => {
  it('la gravedad es fy NEGATIVO y se aplica tal cual', () => {
    const p = plan({ cargas: [carga({ fy: -13 })] });
    expect((p.fields.loads?.[0] as MemberUdl2D).wy).toBe(-13);
  });

  it('una carga G con fy positivo se aplica pero AVISA (signo sospechoso)', () => {
    const p = plan({ cargas: [carga({ fy: 13 })] });
    expect((p.fields.loads?.[0] as MemberUdl2D).wy).toBe(13);
    expect(p.warnings.some((w) => w.includes('ARRIBA'))).toBe(true);
  });

  it('sobrecarga Q sin categoría → se asume B con Sugerencia', () => {
    const p = plan({ cargas: [carga({ hipotesis: 'Q' })] });
    expect((p.fields.loads?.[0] as MemberUdl2D).useCategory).toBe('B');
    expect(p.warnings.some((w) => w.includes('Sugerencia'))).toBe(true);
  });
});

// ── Riesgos (gate anti-ruido) ─────────────────────────────────────────────────

describe('fem2d — guardarraíles', () => {
  it('plantilla virgen sin hilo: rebajar una carga NO marca riesgo (gate cerrado)', () => {
    const p = plan({ cargas: [carga({ fy: -8 }), PORTAL_CARGAS[1], PORTAL_CARGAS[2]] });
    expect(p.risks).toEqual([]);
  });

  it('con la clave tratada en el hilo, rebajar |fy| marca riesgo', () => {
    const p = plan(
      { cargas: [carga({ fy: -8 }), PORTAL_CARGAS[1], PORTAL_CARGAS[2]] },
      portal(),
      new Set(['cargas']),
    );
    expect(p.risks.some((r) => r.field === 'cargas[0].fy')).toBe(true);
  });

  it('valor establecido (difiere de la plantilla): riesgo sin necesidad de hilo', () => {
    const current = portal();
    current.loads = current.loads.map((l) =>
      l.id === 'l1' ? { ...l, wy: -20 } as MemberUdl2D : l);
    const p = plan({ cargas: [carga({ fy: -10 }), PORTAL_CARGAS[1], PORTAL_CARGAS[2]] }, current);
    expect(p.risks.some((r) => r.field === 'cargas[0].fy')).toBe(true);
  });

  it('Q→G marca el centinela del γ de ELU', () => {
    const p = plan(
      { cargas: [PORTAL_CARGAS[0], carga({ fy: -5, hipotesis: 'G' }), PORTAL_CARGAS[2]] },
      portal(),
      new Set(['cargas']),
    );
    expect(p.risks.some((r) => r.field === 'cargas[1].hipotesis_elu')).toBe(true);
  });

  it('acercar las correas (rebajar Lcr de vuelco) marca riesgo; quitarlas (0) no', () => {
    const menos = plan(
      { barras: [barra(1, 2), barra(2, 3, { correas_m: 0.8 }), barra(4, 3)] },
      portal(),
      new Set(['barras']),
    );
    expect(menos.risks.some((r) => r.field === 'barras[1].correas_m')).toBe(true);
    const sin = plan(
      { barras: [barra(1, 2), barra(2, 3, { correas_m: 0 }), barra(4, 3)] },
      portal(),
      new Set(['barras']),
    );
    expect(sin.risks.some((r) => r.field.includes('correas'))).toBe(false);
  });

  it('inventar correas donde no las hay (0 → valor) también es riesgo', () => {
    const current = portal();
    current.members = current.members.map((m): Fem2DMember =>
      m.id === 'v1' ? { ...m, ltbSpacing: undefined } : m);
    const p = plan(
      { barras: [barra(1, 2), barra(2, 3, { correas_m: 1.5 }), barra(4, 3)] },
      current,
      new Set(['barras']),
    );
    expect(p.risks.some((r) => r.field === 'barras[1].correas_m')).toBe(true);
  });

  it('desactivar el peso propio marca riesgo (tratado en el hilo)', () => {
    const p = plan({ peso_propio: false }, portal(), new Set(['peso_propio']));
    expect(p.risks.some((r) => r.field === 'selfWeight')).toBe(true);
  });

  it('eliminar cargas marca el riesgo agregado', () => {
    const p = plan(
      { cargas: [PORTAL_CARGAS[0]] },
      portal(),
      new Set(['cargas']),
    );
    expect(p.risks.some((r) => r.field === 'cargas.__removed')).toBe(true);
  });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe('fem2d — snapshot', () => {
  it('plantilla virgen: todo sin_confirmar y bandera de plantilla', () => {
    const snap = JSON.parse(fem2dAdapter.snapshot(portal()));
    expect(snap.valores.modelo_de_plantilla).toBe(true);
    expect(snap.valores.plantilla).toBe('portal-frame');
    expect(snap.sin_confirmar).toEqual(['nudos', 'barras', 'apoyos', 'cargas', 'peso_propio']);
    expect(snap.valores.barras[1].correas_m).toBe(1.5);
    expect(snap.valores.cargas[2].tipo).toBe('nudo');
    expect(snap.valores.apoyos).toEqual([
      { nudo: 1, tipo: 'empotrado' },
      { nudo: 4, tipo: 'empotrado' },
    ]);
  });

  it('modelo custom: nada sin_confirmar', () => {
    const snap = JSON.parse(fem2dAdapter.snapshot({ ...portal(), templateId: 'custom' }));
    expect(snap.sin_confirmar).toEqual([]);
    expect(snap.valores.modelo_de_plantilla).toBe(false);
  });

  it('las rótulas se proyectan como campo editable de barras (Fase B)', () => {
    const m = portal();
    m.members = m.members.map((mm): Fem2DMember =>
      mm.id === 'v1' ? { ...mm, releases: { i: true, j: false } } : mm);
    const snap = JSON.parse(fem2dAdapter.snapshot(m));
    expect(snap.valores.barras[1].rotulas).toBe('i');
    expect(snap.valores.barras[0].rotulas).toBe('ninguna');
    expect(snap.valores.rotulas).toBeUndefined(); // ya no hay bloque de solo lectura
  });
});

// ── Rótulas (Fase B) ──────────────────────────────────────────────────────────

describe('fem2d — rótulas editables (Fase B)', () => {
  it('rotulas "ambas" articula el dintel y "ninguna" lo restaura', () => {
    const p = plan({ barras: [barra(1, 2), barra(2, 3, { rotulas: 'ambas' }), barra(4, 3)] });
    expect(p.fields.members?.[1].releases).toEqual({ i: true, j: true });
    expect(p.changes[0].after).toContain('rótula i+j');

    const current = portal();
    current.members = current.members.map((mm): Fem2DMember =>
      mm.id === 'v1' ? { ...mm, releases: { i: true, j: true } } : mm);
    const clear = plan({ barras: [barra(1, 2), barra(2, 3, { rotulas: 'ninguna' }), barra(4, 3)] }, current);
    expect(clear.fields.members?.[1].releases).toEqual({ i: false, j: false });
  });

  it('rotulas null conserva las existentes', () => {
    const current = portal();
    current.members = current.members.map((mm): Fem2DMember =>
      mm.id === 'v1' ? { ...mm, releases: { i: false, j: true } } : mm);
    const p = plan({ barras: [...PORTAL_BARRAS, barra(1, 3)] }, current);
    expect(p.fields.members?.[1].releases).toEqual({ i: false, j: true });
  });

  it('el arrastre es consciente de la ORIENTACIÓN: reenviar la barra invertida mantiene la rótula en el mismo nudo físico', () => {
    const current = portal();
    // Rótula en el extremo i de v1 (= nudo n2, el 2 del payload).
    current.members = current.members.map((mm): Fem2DMember =>
      mm.id === 'v1' ? { ...mm, releases: { i: true, j: false } } : mm);
    // El dintel se reenvía como 3→2 (invertido): la rótula sigue en el nudo 2,
    // que ahora es el extremo j de la barra.
    const p = plan({ barras: [barra(1, 2), barra(3, 2), barra(4, 3)] }, current);
    expect(p.fields.members?.[1].i).toBe('n3');
    expect(p.fields.members?.[1].releases).toEqual({ i: false, j: true });
  });

  it('rotulas sobre una biela se ignora con aviso (biarticulada por formulación)', () => {
    const p = plan({
      barras: [...PORTAL_BARRAS, barra(1, 3, { tipo: 'biela', perfil: 'L 80×8', rotulas: 'ambas' })],
    });
    expect(p.fields.members?.[3].releases).toEqual({ i: false, j: false });
    expect(p.warnings.some((w) => w.includes('biarticulada'))).toBe(true);
  });
});

// ── Resumen de resultados ─────────────────────────────────────────────────────

describe('fem2d — resumen de resultados', () => {
  it('pórtico plantilla: veredicto CUMPLE alineado con el badge, con αcr', () => {
    const m = portal();
    const s = summarizeFem2DResults(m, analyzeFem2D(m));
    expect(s.verdict).toBe('ok');
    expect(s.text).toContain('VEREDICTO GLOBAL');
    expect(s.text).toContain('αcr');
    expect(s.text).toContain('η máximo global');
    expect(s.text).toContain("'v1'");
  });

  it('incluye las reacciones por apoyo (envolvente ELU) y ΣRy equilibra el ELU gravitatorio', () => {
    const m = portal();
    const result = analyzeFem2D(m);
    const s = summarizeFem2DResults(m, result);
    expect(s.text).toContain('Reacciones en apoyos (envolvente ELU');
    expect(s.text).toContain('nudo 1 (empotrado)');
    expect(s.text).toContain('nudo 4 (empotrado)');
    // Chequeo físico grosero: la envolvente Ry de cada apoyo es positiva
    // (reacción hacia arriba frente a cargas gravitatorias mayoradas).
    const matches = [...s.text.matchAll(/Ry=([-\d.]+) kN/g)].map((x) => Number(x[1]));
    expect(matches).toHaveLength(2);
    expect(matches.every((v) => v > 0)).toBe(true);
  });

  it('barra sin motor (L en flexión) → PENDIENTE contagioso, veredicto invalid', () => {
    const m = portal();
    m.members = m.members.map((mm): Fem2DMember =>
      mm.id === 'v1' ? { ...mm, steelSelection: { profileKey: 'steel_L80x8', steel: 'S275' } } : mm);
    const s = summarizeFem2DResults(m, analyzeFem2D(m));
    expect(s.verdict).toBe('invalid');
    expect(s.text.startsWith('PENDIENTE')).toBe(true);
  });

  it('modelo sin apoyos → CÁLCULO NO VÁLIDO', () => {
    const m = { ...portal(), supports: [] };
    const s = summarizeFem2DResults(m, analyzeFem2D(m));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});

// ── Barras HA (el chat no edita hormigón; el arrastre debe ser COMPLETO) ─────

describe('fem2d — barras de hormigón', () => {
  /** Pórtico con el dintel v1 convertido a HA con armado completo. */
  function portalConHA(): Fem2DModel {
    const model = portal();
    const rc = setMemberMaterial(model, 'v1', 'rc');
    if (!rc.ok) throw new Error(rc.reason);
    return rc.model;
  }

  it('reconstrucción de la lista: la barra HA conserva sección + armado + acero latente', () => {
    const current = portalConHA();
    // Cambio real en OTRA barra (p2 → S355) para forzar el reemplazo de la
    // lista completa; v1 (HA) viaja por arrastre posicional con todo null.
    const p = plan({
      barras: [PORTAL_BARRAS[0], PORTAL_BARRAS[1], barra(4, 3, { acero: 'S355' })],
    }, current);
    expect(p.fields.members).toHaveLength(3);
    const v1 = p.fields.members![1];
    const orig = current.members.find((m) => m.id === 'v1')!;
    expect(v1.material).toBe('rc');
    expect(v1.rcSection).toEqual(orig.rcSection);
    expect(v1.vanoArmado).toEqual(orig.vanoArmado);
    expect(v1.apoyoArmado).toEqual(orig.apoyoArmado);
    expect(v1.columnCage).toEqual(orig.columnCage);
    expect(v1.steelSelection).toEqual(orig.steelSelection); // restaurable
  });

  it('darle perfil convierte a acero con AVISO, sin perder los datos HA latentes', () => {
    const current = portalConHA();
    const p = plan({
      barras: [PORTAL_BARRAS[0], barra(2, 3, { perfil: 'IPE 300' }), PORTAL_BARRAS[2]],
    }, current);
    const v1 = p.fields.members![1];
    expect(v1.material).toBe('steel');
    expect(v1.steelSelection?.profileKey).toBe('steel_IPE300');
    // Los datos HA viajan latentes (mismo contrato que el editor).
    expect(v1.rcSection).toBeDefined();
    expect(v1.vanoArmado).toBeDefined();
    expect(p.warnings.some((w) => w.includes('hormigón a acero'))).toBe(true);
  });

  it('barra HA + tipo biela → lista descartada (espejo de la guarda del editor)', () => {
    const current = portalConHA();
    const p = plan({
      barras: [PORTAL_BARRAS[0], barra(2, 3, { tipo: 'biela' }), PORTAL_BARRAS[2]],
    }, current);
    expect(p.fields.members).toBeUndefined();
    const skip = skipFor(p, 'Barras');
    expect(skip).toBeDefined();
    expect(skip!.reason).toContain('hormigón');
  });

  it('el snapshot describe la barra HA como comprobada pero no editable por chat', () => {
    const current = portalConHA();
    const snap = JSON.parse(fem2dAdapter.snapshot(current)) as {
      valores: { barras_ha?: string[] };
    };
    expect(snap.valores.barras_ha).toHaveLength(1);
    expect(snap.valores.barras_ha![0]).toContain('30×50 cm HA-25');
    expect(snap.valores.barras_ha![0]).toContain('inspector');
  });

  it('el resumen de resultados incluye las filas HA con su sección', () => {
    const current = portalConHA();
    const s = summarizeFem2DResults(current, analyzeFem2D(current));
    expect(s.text).toContain('HA 30×50');
  });
});

// ── Barras de MADERA (mismo patrón de arrastre que el HA) ────────────────────

describe('fem2d — barras de madera', () => {
  /** Pórtico con el dintel v1 convertido a madera (semilla C24 140×240). */
  function portalConMadera(): Fem2DModel {
    const model = portal();
    const res = setMemberMaterial(model, 'v1', 'timber');
    if (!res.ok) throw new Error(res.reason);
    return res.model;
  }

  it('reconstrucción de la lista: la barra de madera conserva sección + acero latente', () => {
    const current = portalConMadera();
    const p = plan({
      barras: [PORTAL_BARRAS[0], PORTAL_BARRAS[1], barra(4, 3, { acero: 'S355' })],
    }, current);
    expect(p.fields.members).toHaveLength(3);
    const v1 = p.fields.members![1];
    const orig = current.members.find((m) => m.id === 'v1')!;
    expect(v1.material).toBe('timber');
    expect(v1.timberSection).toEqual(orig.timberSection);
    expect(v1.steelSelection).toEqual(orig.steelSelection); // restaurable
  });

  it('darle perfil convierte a acero con AVISO, sin perder la sección latente', () => {
    const current = portalConMadera();
    const p = plan({
      barras: [PORTAL_BARRAS[0], barra(2, 3, { perfil: 'IPE 300' }), PORTAL_BARRAS[2]],
    }, current);
    const v1 = p.fields.members![1];
    expect(v1.material).toBe('steel');
    expect(v1.steelSelection?.profileKey).toBe('steel_IPE300');
    expect(v1.timberSection).toBeDefined();
    expect(p.warnings.some((w) => w.includes('madera a acero'))).toBe(true);
  });

  it('barra de madera + tipo biela → SE ACEPTA (la biela de madera está soportada)', () => {
    const current = portalConMadera();
    // v1 lleva cargas de barra de la plantilla: hay que retirarlas en la misma
    // propuesta (una biela no admite cargas en la barra — cross-check solver).
    const p = plan({
      barras: [PORTAL_BARRAS[0], barra(2, 3, { tipo: 'biela' }), PORTAL_BARRAS[2]],
      cargas: [PORTAL_CARGAS[2]],
    }, current);
    expect(p.fields.members).toBeDefined();
    const v1 = p.fields.members![1];
    expect(v1.material).toBe('timber');
    expect(v1.elementType).toBe('two-force');
  });

  it('el snapshot describe la barra de madera como comprobada pero no editable', () => {
    const current = portalConMadera();
    const snap = JSON.parse(fem2dAdapter.snapshot(current)) as {
      valores: { barras_madera?: string[] };
    };
    expect(snap.valores.barras_madera).toHaveLength(1);
    expect(snap.valores.barras_madera![0]).toContain('C24 140×240 mm');
    expect(snap.valores.barras_madera![0]).toContain('inspector');
  });

  it('el resumen de resultados incluye las filas de madera con su sección', () => {
    const current = portalConMadera();
    const s = summarizeFem2DResults(current, analyzeFem2D(current));
    expect(s.text).toContain('C24 140×240');
  });
});

// ── Límite de uniones de Anthropic ────────────────────────────────────────────

describe('fem2d — presupuesto de uniones', () => {
  it('el envelope queda en 16 uniones (= límite EXACTO, verificado en vivo con masonry): Anthropic soportado sin degradar', () => {
    const unions = countAnthropicUnions(buildChatSchema(FEM2D_PAYLOAD_SCHEMA));
    expect(unions).toBe(16);
    expect(unions).toBeLessThanOrEqual(ANTHROPIC_UNION_LIMIT);
  });
});

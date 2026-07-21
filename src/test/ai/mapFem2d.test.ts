// Tests del adapter IA de FEM 2D (ola 6) — proyección plana del Fem2DModel
// libre (nudos/barras/apoyos/cargas por índice 1-based). Cubre: reconstrucción
// con ids preservados posicionalmente y pool COMPARTIDO de ids (trampa Pratt),
// todo-o-nada por lista, cascadas de poda con nudos/barras parciales,
// re-inferencia de roles auto, cross-check con el SOLVER real (mecanismos,
// biela cargada), la trampa de signos (fy negativo = gravedad), riesgos con
// gate anti-ruido, el snapshot con bandera de plantilla, el resumen de
// resultados alineado con el badge y la guarda de uniones de Anthropic.

import { describe, it, expect } from "vitest";
import {
  FEM2D_PAYLOAD_SCHEMA,
  fem2dAdapter,
  summarizeFem2DResults,
} from "../../lib/ai/modules/fem2d";
import { buildChatSchema } from "../../lib/ai/chatSchema";
import { MAX_HISTORY_TURNS } from "../../lib/ai/chatHistory";
import {
  ANTHROPIC_UNION_LIMIT,
  countAnthropicUnions,
} from "../../lib/ai/providers/schemaConvert";
import { FEM2D_TEMPLATES } from "../../features/fem2d/templates";
import { setMemberMaterial } from "../../features/fem2d/modelOps";
import { analyzeFem2D, solveFem2D } from "../../features/fem2d/pipeline";
import type {
  Fem2DMember,
  Fem2DModel,
  MemberUdl2D,
  NodeLoad2D,
} from "../../features/fem2d/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function portal(): Fem2DModel {
  return FEM2D_TEMPLATES["portal-frame"].build(
    FEM2D_TEMPLATES["portal-frame"].defaults(),
  );
}

function pratt(): Fem2DModel {
  return FEM2D_TEMPLATES["pratt-truss"].build(
    FEM2D_TEMPLATES["pratt-truss"].defaults(),
  );
}

function makePayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    nudos: null,
    barras: null,
    apoyos: null,
    cargas: null,
    peso_propio: null,
    warnings: [],
    ...overrides,
  };
}

function plan(
  overrides: Record<string, unknown>,
  current: Fem2DModel = portal(),
  confirmed?: ReadonlySet<string>,
) {
  return fem2dAdapter.buildPlan(
    makePayload(overrides),
    current,
    "si",
    confirmed,
  );
}

function nudo(x: number, y: number) {
  return { x, y };
}

/** Item de `barras` con todo null (= conservar) salvo lo indicado. */
function barra(
  nudo_i: number,
  nudo_j: number,
  rest: Record<string, unknown> = {},
) {
  return {
    nudo_i,
    nudo_j,
    tipo: null,
    rol: null,
    perfil: null,
    acero: null,
    correas_m: null,
    rotulas: null,
    ...rest,
  };
}

function apoyo(n: number, tipo: string) {
  return { nudo: n, tipo };
}

/** Item de `cargas` completo (repartida G de 10 kN/m ↓ en la barra 2 = dintel). */
function carga(rest: Record<string, unknown> = {}) {
  return {
    tipo: "repartida",
    objetivo: 2,
    fx: 0,
    fy: -10,
    ejes: "global",
    pos: null,
    desde: null,
    hasta: null,
    hipotesis: "G",
    categoria_uso: null,
    ...rest,
  };
}

/** Las 3 barras del pórtico, en eco (conservar todo). */
const PORTAL_BARRAS = [barra(1, 2), barra(2, 3), barra(4, 3)];

/** Las 3 cargas del pórtico plantilla, proyectadas tal cual. */
const PORTAL_CARGAS = [
  carga({ fy: -13 }),
  carga({ fy: -5, hipotesis: "Q", categoria_uso: "B" }),
  carga({ tipo: "nudo", objetivo: 2, fx: 8, fy: 0, hipotesis: "W" }),
];

function skipFor(p: ReturnType<typeof plan>, label: string) {
  return p.skipped.find((s) => s.label.includes(label));
}

// ── Reconstrucción y reemplazo ────────────────────────────────────────────────

describe("fem2d — reconstrucción del modelo", () => {
  it("reemplaza cargas sin tocar la topología", () => {
    const p = plan({
      cargas: [
        carga({ fy: -15 }),
        carga({ tipo: "nudo", objetivo: 2, fx: 8, fy: 0, hipotesis: "W" }),
      ],
    });
    expect(p.fields.loads).toHaveLength(2);
    expect((p.fields.loads?.[0] as MemberUdl2D).wy).toBe(-15);
    expect(p.fields.nodes).toBeUndefined();
    expect(p.fields.members).toBeUndefined();
    expect(p.fields.supports).toBeUndefined();
    // Cambio estructural aplicado ⇒ procedencia honesta.
    expect(p.fields.templateId).toBe("custom");
    expect(p.changes.map((c) => c.field)).toEqual(["cargas"]);
  });

  it("añade una biela diagonal al pórtico (rol auto, id sin colisión)", () => {
    const p = plan({
      barras: [
        ...PORTAL_BARRAS,
        barra(1, 3, { tipo: "biela", perfil: "L 80×8" }),
      ],
    });
    expect(p.fields.members).toHaveLength(4);
    const nueva = p.fields.members![3];
    expect(nueva.elementType).toBe("two-force");
    expect(nueva.role).toBe("diagonal");
    expect(nueva.steelSelection?.profileKey).toBe("steel_L80x8");
    // Las 3 existentes conservan id posicionalmente.
    expect(p.fields.members!.slice(0, 3).map((m) => m.id)).toEqual([
      "p1",
      "v1",
      "p2",
    ]);
  });

  it("pool COMPARTIDO de ids: en la Pratt una barra nueva no pisa los nudos b0..bn", () => {
    const current = pratt();
    const snap = JSON.parse(fem2dAdapter.snapshot(current)) as {
      valores: { barras: { nudo_i: number; nudo_j: number }[] };
    };
    const eco = snap.valores.barras.map((b) => barra(b.nudo_i, b.nudo_j));
    const p = plan({ barras: [...eco, barra(1, 7)] }, current);
    const nueva = p.fields.members![p.fields.members!.length - 1];
    // b1..b4 son NUDOS de la Pratt: el primer id libre con prefijo 'b' es b5.
    expect(nueva.id).toBe("b5");
  });

  it("construye un modelo nuevo completo (triángulo articulado) desde el pórtico", () => {
    const current = portal();
    const p = plan(
      {
        nudos: [nudo(0, 0), nudo(4, 0), nudo(2, 2)],
        barras: [
          barra(1, 2),
          barra(1, 3, { tipo: "biela" }),
          barra(2, 3, { tipo: "biela" }),
        ],
        apoyos: [apoyo(1, "articulado"), apoyo(2, "deslizante")],
        cargas: [carga({ tipo: "nudo", objetivo: 3, fx: 0, fy: -20 })],
      },
      current,
    );
    expect(p.fields.nodes?.map((n) => [n.x, n.y])).toEqual([
      [0, 0],
      [4, 0],
      [2, 2],
    ]);
    // Ids de nudos preservados posicionalmente (n1..n3 del pórtico).
    expect(p.fields.nodes?.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(p.fields.members).toHaveLength(3);
    // El cordón inferior hereda la identidad de p1 y re-infiere rol viga (horizontal).
    expect(p.fields.members![0].id).toBe("p1");
    expect(p.fields.members![0].role).toBe("viga");
    const candidate = { ...current, ...p.fields } as Fem2DModel;
    expect(solveFem2D(candidate).ok).toBe(true);
  });

  it('nudos más cortos sin "barras": poda huérfanos en cascada con aviso', () => {
    // Se elimina n4 (la base del pilar derecho): caen p2, su apoyo y nada más.
    const p = plan({ nudos: [nudo(0, 0), nudo(0, 3.5), nudo(6, 3.5)] });
    expect(p.fields.members?.map((m) => m.id)).toEqual(["p1", "v1"]);
    expect(p.fields.supports).toHaveLength(1);
    expect(p.warnings.some((w) => w.includes("barra(s) eliminadas"))).toBe(
      true,
    );
    expect(p.warnings.some((w) => w.includes("apoyo(s) eliminados"))).toBe(
      true,
    );
  });

  it("mover un nudo re-infiere los roles auto pilar↔viga (espejo del lienzo)", () => {
    // n4 pasa de (6,0) a (3,0): p2 deja de ser vertical ⇒ rol auto viga.
    const p = plan({
      nudos: [nudo(0, 0), nudo(0, 3.5), nudo(6, 3.5), nudo(3, 0)],
    });
    expect(p.fields.members?.[2].role).toBe("viga");
    expect(p.fields.members?.[2].id).toBe("p2");
  });

  it('eco exacto de cada lista → skip "ya coincide" (sin cambios fantasma)', () => {
    const p = plan({
      nudos: [nudo(0, 0), nudo(0, 3.5), nudo(6, 3.5), nudo(6, 0)],
      barras: PORTAL_BARRAS,
      apoyos: [apoyo(1, "empotrado"), apoyo(4, "empotrado")],
      cargas: PORTAL_CARGAS,
      peso_propio: true,
    });
    expect(p.changes).toEqual([]);
    expect(p.fields).toEqual({});
    expect(p.skipped).toHaveLength(5);
    expect(p.skipped.every((s) => s.reason.includes("coincide"))).toBe(true);
  });

  it("correas_m: 0 = sin arriostrar; un valor la fija; null conserva", () => {
    const p0 = plan({
      barras: [barra(1, 2), barra(2, 3, { correas_m: 0 }), barra(4, 3)],
    });
    expect(p0.fields.members?.[1].ltbSpacing).toBeUndefined();
    const p1 = plan({
      barras: [barra(1, 2), barra(2, 3, { correas_m: 0.8 }), barra(4, 3)],
    });
    expect(p1.fields.members?.[1].ltbSpacing).toBe(0.8);
    const pNull = plan({ barras: [...PORTAL_BARRAS, barra(1, 3)] });
    expect(pNull.fields.members?.[1].ltbSpacing).toBe(1.5); // conservado del dintel
  });
});

// ── Validación todo-o-nada ────────────────────────────────────────────────────

describe("fem2d — carga de barra sobre biela (coacción, no veto)", () => {
  // Antes se rechazaba y el veto en bloque tumbaba las cuatro listas: era el
  // bucle sin salida del camino "descríbela con IA" (incidente 2026-07-20).
  // Ahora se reparte como cargas de nudo estáticamente equivalentes — la misma
  // idealización que el peso propio de bielas en decompose.ts.
  function bielaFixture() {
    const current = pratt();
    const m = current.members[6];
    expect(m.elementType).toBe("two-force"); // premisa del caso
    const nodeById = new Map(current.nodes.map((n) => [n.id, n]));
    const a = nodeById.get(m.i)!;
    const b = nodeById.get(m.j)!;
    return { current, m, a, b, L: Math.hypot(b.x - a.x, b.y - a.y) };
  }

  it("repartida sobre biela → dos cargas de nudo con la resultante w·L al 50 %, con aviso", () => {
    const { current, m, L } = bielaFixture();
    const p = plan({ cargas: [carga({ objetivo: 7, fy: -5 })] }, current);
    expect(skipFor(p, "Cargas")).toBeUndefined();
    const loads = p.fields.loads as NodeLoad2D[];
    expect(loads).toHaveLength(2);
    expect(loads.every((l) => l.kind === "node")).toBe(true);
    expect(loads.map((l) => l.node).sort()).toEqual([m.i, m.j].sort());
    const half = (-5 * L) / 2;
    expect(loads[0].Fy).toBeCloseTo(half, 2);
    expect(loads[1].Fy).toBeCloseTo(half, 2);
    expect(
      p.warnings.some((w) => w.includes("biela") && w.includes("se reparte")),
    ).toBe(true);
  });

  it("puntual_barra sobre biela: reparto por palanca (1-pos al nudo i, pos al j)", () => {
    const { current, m } = bielaFixture();
    const p = plan(
      {
        cargas: [
          carga({
            tipo: "puntual_barra",
            objetivo: 7,
            fx: 0,
            fy: -8,
            pos: 0.25,
          }),
        ],
      },
      current,
    );
    const byNode = new Map(
      (p.fields.loads as NodeLoad2D[]).map((l) => [l.node, l]),
    );
    expect(byNode.get(m.i)?.Fy).toBeCloseTo(-6, 2);
    expect(byNode.get(m.j)?.Fy).toBeCloseTo(-2, 2);
  });

  it("puntual_barra en pos 0 → una sola carga de nudo (la componente nula no se emite)", () => {
    const { current, m } = bielaFixture();
    const p = plan(
      {
        cargas: [
          carga({ tipo: "puntual_barra", objetivo: 7, fx: 0, fy: -8, pos: 0 }),
        ],
      },
      current,
    );
    const loads = p.fields.loads as NodeLoad2D[];
    expect(loads).toHaveLength(1);
    expect(loads[0].node).toBe(m.i);
    expect(loads[0].Fy).toBe(-8);
  });

  it("repartida en ejes LOCAL sobre biela: componentes rotadas a globales (resultante conservada)", () => {
    const { current, a, b, L } = bielaFixture();
    const c = (b.x - a.x) / L;
    const s = (b.y - a.y) / L;
    const p = plan(
      { cargas: [carga({ objetivo: 7, fx: 0, fy: -2, ejes: "local" })] },
      current,
    );
    const loads = p.fields.loads as NodeLoad2D[];
    const sumFx = loads.reduce((t, l) => t + l.Fx, 0);
    const sumFy = loads.reduce((t, l) => t + l.Fy, 0);
    expect(sumFx).toBeCloseTo(2 * s * L, 1); // gx = fx·c − fy·s = 2s
    expect(sumFy).toBeCloseTo(-2 * c * L, 1); // gy = fx·s + fy·c = −2c
  });

  it("repartida PARCIAL sobre biela: resultante en el centroide del tramo", () => {
    const { current, m, L } = bielaFixture();
    const W = -4 * 0.5 * L; // w · longitud cargada
    const p = plan(
      { cargas: [carga({ objetivo: 7, fx: 0, fy: -4, desde: 0.5, hasta: 1 })] },
      current,
    );
    const byNode = new Map(
      (p.fields.loads as NodeLoad2D[]).map((l) => [l.node, l]),
    );
    expect(byNode.get(m.i)?.Fy).toBeCloseTo(0.25 * W, 2);
    expect(byNode.get(m.j)?.Fy).toBeCloseTo(0.75 * W, 2);
  });
});

describe("fem2d — validación por lista (todo-o-nada)", () => {
  it("barra duplicada entre los mismos nudos → skip de barras", () => {
    const p = plan({ barras: [...PORTAL_BARRAS, barra(2, 1)] });
    expect(p.fields.members).toBeUndefined();
    expect(skipFor(p, "Barras")?.reason).toContain("duplica");
  });

  it("perfil fuera de catálogo → skip de barras", () => {
    // 'IPE 220' dejó de valer como caso: el catálogo unificado trae la serie
    // IPE completa (y 2UPN/SHS/RHS/CHS). Un perfil inexistente de verdad:
    const p = plan({
      barras: [barra(1, 2, { perfil: "IPE 999" }), barra(2, 3), barra(4, 3)],
    });
    expect(skipFor(p, "Barras")?.reason).toContain("fuera del catálogo");
  });

  it("rol de flexión sobre una biela se COACCIONA al rol axil con aviso (no tumba la lista)", () => {
    // El modelo llama 'cordon' a los cordones-biela de una celosía una y otra
    // vez: rechazarlo tumbaba la lista entera y con ella toda la propuesta.
    const p = plan({
      barras: [...PORTAL_BARRAS, barra(1, 3, { tipo: "biela", rol: "cordon" })],
    });
    expect(p.fields.members).toHaveLength(4);
    expect(p.fields.members![3].elementType).toBe("two-force");
    expect(p.fields.members![3].role).toBe("diagonal");
    expect(p.fields.members![3].roleManual).toBeUndefined();
    expect(
      p.warnings.some(
        (w) => w.includes("rol 'cordon'") && w.includes("'diagonal'"),
      ),
    ).toBe(true);
  });

  it("rol axil sobre una viga-columna también se coacciona (auto por geometría)", () => {
    const p = plan({
      barras: [...PORTAL_BARRAS, barra(1, 3, { rol: "montante" })],
    });
    expect(p.fields.members![3].elementType).toBe("beam-column");
    expect(p.fields.members![3].role).toBe("viga");
    expect(p.warnings.some((w) => w.includes("rol 'montante'"))).toBe(true);
  });

  it("objetivo fuera de rango → skip de cargas", () => {
    const p = plan({ cargas: [carga({ objetivo: 9 })] });
    expect(skipFor(p, "Cargas")?.reason).toContain("no existe");
  });

  it("lista de apoyos vacía → skip", () => {
    const p = plan({ apoyos: [] });
    expect(skipFor(p, "Apoyos")?.reason).toContain("al menos un apoyo");
  });
});

// ── Atomicidad del bloque estructural ─────────────────────────────────────────
// Sin atomicidad, "nudos aplicados + barras rechazadas" llegaba al cross-check
// como candidato incoherente y se descartaba TODO con ids internos del solver
// ('Barra cs1: nodo t2 no existe') — el bucle sin salida del incidente del
// asistente (2026-07-20): el chat aplicaba los nudos pero nunca las barras.

describe("fem2d — atomicidad del bloque estructural", () => {
  it("nudos válidos + barras inválidas → NADA se aplica, con el motivo raíz (sin sopa de ids del solver)", () => {
    const p = plan({
      nudos: [nudo(0, 0), nudo(4, 0), nudo(2, 2)],
      barras: [
        barra(1, 2, { perfil: "IPE 999" }),
        barra(1, 3, { tipo: "biela" }),
        barra(2, 3, { tipo: "biela" }),
      ],
      apoyos: [apoyo(1, "articulado"), apoyo(2, "deslizante")],
      cargas: [carga({ tipo: "nudo", objetivo: 3, fx: 0, fy: -20 })],
    });
    expect(p.fields).toEqual({});
    expect(p.changes).toEqual([]);
    expect(skipFor(p, "Barras")?.reason).toContain("fuera del catálogo");
    expect(skipFor(p, "Nudos")?.reason).toContain("No se aplica en bloque");
    expect(skipFor(p, "Apoyos")?.reason).toContain("forma bloque");
    expect(skipFor(p, "Cargas")?.reason).toContain("forma bloque");
    // Todos los skips llevan la clave del payload: es lo que permite a
    // decorateSnapshot retirarlos de pendientes_de_aplicar y realimentarlos
    // como errores_propuesta_anterior.
    expect(skipFor(p, "Barras")?.field).toBe("barras");
    expect(skipFor(p, "Nudos")?.field).toBe("nudos");
    expect(skipFor(p, "Apoyos")?.field).toBe("apoyos");
    expect(skipFor(p, "Cargas")?.field).toBe("cargas");
    expect(
      p.skipped.every((s) => !s.reason.includes("dejaría el modelo inválido")),
    ).toBe(true);
  });

  it("nudos inválidos → el resto se salta por dependencia, sin errores fantasma", () => {
    const p = plan({
      nudos: [nudo(0, 0), nudo(0, 0.0005), nudo(2, 2)],
      barras: [barra(1, 2), barra(2, 3)],
      apoyos: [apoyo(1, "articulado")],
      cargas: [carga({ objetivo: 1 })],
    });
    expect(p.fields).toEqual({});
    expect(skipFor(p, "Nudos")?.reason).toContain("coincide con el nudo");
    expect(skipFor(p, "Barras")?.reason).toContain('forma bloque con "Nudos');
    expect(skipFor(p, "Cargas")?.reason).toContain("forma bloque");
  });

  it('repro croquis: cercha completa con bielas rol "cordon" sobre un modelo casi vacío → TODO se aplica', () => {
    const base = portal();
    const current: Fem2DModel = {
      ...base,
      templateId: "custom",
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 8, y: 0 },
        { id: "n3", x: 4, y: 4 },
        { id: "n4", x: 2, y: 2 },
        { id: "n5", x: 6, y: 2 },
      ],
      members: [],
      supports: [
        { node: "n1", type: "pinned" },
        { node: "n2", type: "pinned" },
      ],
      loads: [],
    };
    const p = plan(
      {
        nudos: [
          nudo(0, 0),
          nudo(8, 0),
          nudo(4, 4),
          nudo(2, 2),
          nudo(6, 2),
          nudo(4, 0),
        ],
        barras: [
          barra(1, 4, { rol: "cordon" }), // faldón izq. viga-columna: lleva la repartida
          barra(4, 3, { tipo: "biela", rol: "cordon" }), // coacción → diagonal
          barra(3, 5, { tipo: "biela", rol: "cordon" }),
          barra(5, 2, { tipo: "biela", rol: "cordon" }),
          barra(1, 6, { tipo: "biela", rol: "cordon" }), // cordón inferior
          barra(6, 2, { tipo: "biela", rol: "cordon" }),
          barra(6, 3, { tipo: "biela", rol: "montante" }), // montante central (compatible)
          barra(4, 6, { tipo: "biela" }),
          barra(5, 6, { tipo: "biela" }),
        ],
        apoyos: [apoyo(1, "articulado"), apoyo(2, "deslizante")],
        cargas: [
          carga({ tipo: "nudo", objetivo: 3, fx: 0, fy: -10 }),
          carga({ tipo: "nudo", objetivo: 6, fx: 0, fy: -8 }),
          carga({ objetivo: 1, fx: 0, fy: -3 }),
        ],
      },
      current,
    );
    expect(p.changes.map((c) => c.field).sort()).toEqual([
      "apoyos",
      "barras",
      "cargas",
      "nudos",
    ]);
    expect(p.fields.members).toHaveLength(9);
    expect(p.fields.loads).toHaveLength(3);
    expect(p.skipped).toEqual([]);
    // La coacción avisa pero no bloquea:
    expect(p.warnings.some((w) => w.includes("rol 'cordon'"))).toBe(true);
    const candidate = { ...current, ...p.fields } as Fem2DModel;
    expect(solveFem2D(candidate).ok).toBe(true);
  });

  it("repro incidente 2026-07-20: cercha TODO bielas con la repartida sobre un cordón-biela → TODO se aplica", () => {
    // El caso literal del chat "modela esta estructura": Gemini dibuja la
    // celosía entera con bielas y cuelga los 3 kN/m de la barra 1 (biela).
    // Antes: veto de cargas → veto en bloque → "0 cambios" y bucle sin salida.
    const base = portal();
    const current: Fem2DModel = {
      ...base,
      templateId: "custom",
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 8, y: 0 },
        { id: "n3", x: 4, y: 4 },
        { id: "n4", x: 2, y: 2 },
        { id: "n5", x: 6, y: 2 },
      ],
      members: [],
      supports: [
        { node: "n1", type: "pinned" },
        { node: "n2", type: "pinned" },
      ],
      loads: [],
    };
    const p = plan(
      {
        nudos: [
          nudo(0, 0),
          nudo(8, 0),
          nudo(4, 4),
          nudo(2, 2),
          nudo(6, 2),
          nudo(4, 0),
        ],
        barras: [
          barra(1, 4, { tipo: "biela", rol: "cordon" }), // ← lleva la repartida
          barra(4, 3, { tipo: "biela", rol: "cordon" }),
          barra(3, 5, { tipo: "biela", rol: "cordon" }),
          barra(5, 2, { tipo: "biela", rol: "cordon" }),
          barra(1, 6, { tipo: "biela", rol: "cordon" }),
          barra(6, 2, { tipo: "biela", rol: "cordon" }),
          barra(6, 3, { tipo: "biela", rol: "montante" }),
          barra(4, 6, { tipo: "biela" }),
          barra(5, 6, { tipo: "biela" }),
        ],
        apoyos: [apoyo(1, "articulado"), apoyo(2, "deslizante")],
        cargas: [
          carga({ tipo: "nudo", objetivo: 3, fx: 0, fy: -10 }),
          carga({ tipo: "nudo", objetivo: 6, fx: 0, fy: -8 }),
          carga({ objetivo: 1, fx: 0, fy: -3 }), // repartida sobre la biela 1
        ],
      },
      current,
    );
    expect(p.changes.map((c) => c.field).sort()).toEqual([
      "apoyos",
      "barras",
      "cargas",
      "nudos",
    ]);
    expect(p.skipped).toEqual([]);
    // La repartida se reparte en los nudos 1 y 4 de la biela: 3 nudo-cargas
    // del payload → 4 cargas de nudo reconstruidas.
    expect(p.fields.loads).toHaveLength(4);
    expect(
      p.warnings.some((w) => w.includes("biela") && w.includes("se reparte")),
    ).toBe(true);
    const candidate = { ...current, ...p.fields } as Fem2DModel;
    expect(solveFem2D(candidate).ok).toBe(true);
  });
});

// ── Cross-check con el solver real ────────────────────────────────────────────

describe("fem2d — cross-check con el solver", () => {
  it("una propuesta que crea un mecanismo se descarta con el motivo", () => {
    const p = plan({ apoyos: [apoyo(1, "deslizante")] });
    expect(p.fields.supports).toBeUndefined();
    expect(p.fields.templateId).toBeUndefined();
    expect(skipFor(p, "Apoyos")?.reason).toContain("inválido");
  });

  it("pasar el dintel a biela con sus cargas vivas (cargas=null) se descarta por el validador", () => {
    const p = plan({
      barras: [barra(1, 2), barra(2, 3, { tipo: "biela" }), barra(4, 3)],
    });
    expect(p.fields.members).toBeUndefined();
    expect(skipFor(p, "Barras")?.reason).toContain("inválido");
  });
});

// ── Trampa de signos ──────────────────────────────────────────────────────────

describe("fem2d — signos de las cargas", () => {
  it("la gravedad es fy NEGATIVO y se aplica tal cual", () => {
    const p = plan({ cargas: [carga({ fy: -13 })] });
    expect((p.fields.loads?.[0] as MemberUdl2D).wy).toBe(-13);
  });

  it("una carga G con fy positivo se aplica pero AVISA (signo sospechoso)", () => {
    const p = plan({ cargas: [carga({ fy: 13 })] });
    expect((p.fields.loads?.[0] as MemberUdl2D).wy).toBe(13);
    expect(p.warnings.some((w) => w.includes("ARRIBA"))).toBe(true);
  });

  it("sobrecarga Q sin categoría → se asume B con Sugerencia", () => {
    const p = plan({ cargas: [carga({ hipotesis: "Q" })] });
    expect((p.fields.loads?.[0] as MemberUdl2D).useCategory).toBe("B");
    expect(p.warnings.some((w) => w.includes("Sugerencia"))).toBe(true);
  });
});

// ── Riesgos (gate anti-ruido) ─────────────────────────────────────────────────

describe("fem2d — guardarraíles", () => {
  it("plantilla virgen sin hilo: rebajar una carga NO marca riesgo (gate cerrado)", () => {
    const p = plan({
      cargas: [carga({ fy: -8 }), PORTAL_CARGAS[1], PORTAL_CARGAS[2]],
    });
    expect(p.risks).toEqual([]);
  });

  it("con la clave tratada en el hilo, rebajar |fy| marca riesgo", () => {
    const p = plan(
      { cargas: [carga({ fy: -8 }), PORTAL_CARGAS[1], PORTAL_CARGAS[2]] },
      portal(),
      new Set(["cargas"]),
    );
    expect(p.risks.some((r) => r.field === "cargas[0].fy")).toBe(true);
  });

  it("valor establecido (difiere de la plantilla): riesgo sin necesidad de hilo", () => {
    const current = portal();
    current.loads = current.loads.map((l) =>
      l.id === "l1" ? ({ ...l, wy: -20 } as MemberUdl2D) : l,
    );
    const p = plan(
      { cargas: [carga({ fy: -10 }), PORTAL_CARGAS[1], PORTAL_CARGAS[2]] },
      current,
    );
    expect(p.risks.some((r) => r.field === "cargas[0].fy")).toBe(true);
  });

  it("Q→G marca el centinela del γ de ELU", () => {
    const p = plan(
      {
        cargas: [
          PORTAL_CARGAS[0],
          carga({ fy: -5, hipotesis: "G" }),
          PORTAL_CARGAS[2],
        ],
      },
      portal(),
      new Set(["cargas"]),
    );
    expect(p.risks.some((r) => r.field === "cargas[1].hipotesis_elu")).toBe(
      true,
    );
  });

  it("acercar las correas (rebajar Lcr de vuelco) marca riesgo; quitarlas (0) no", () => {
    const menos = plan(
      { barras: [barra(1, 2), barra(2, 3, { correas_m: 0.8 }), barra(4, 3)] },
      portal(),
      new Set(["barras"]),
    );
    expect(menos.risks.some((r) => r.field === "barras[1].correas_m")).toBe(
      true,
    );
    const sin = plan(
      { barras: [barra(1, 2), barra(2, 3, { correas_m: 0 }), barra(4, 3)] },
      portal(),
      new Set(["barras"]),
    );
    expect(sin.risks.some((r) => r.field.includes("correas"))).toBe(false);
  });

  it("inventar correas donde no las hay (0 → valor) también es riesgo", () => {
    const current = portal();
    current.members = current.members.map(
      (m): Fem2DMember => (m.id === "v1" ? { ...m, ltbSpacing: undefined } : m),
    );
    const p = plan(
      { barras: [barra(1, 2), barra(2, 3, { correas_m: 1.5 }), barra(4, 3)] },
      current,
      new Set(["barras"]),
    );
    expect(p.risks.some((r) => r.field === "barras[1].correas_m")).toBe(true);
  });

  it("desactivar el peso propio marca riesgo (tratado en el hilo)", () => {
    const p = plan({ peso_propio: false }, portal(), new Set(["peso_propio"]));
    expect(p.risks.some((r) => r.field === "selfWeight")).toBe(true);
  });

  it("eliminar cargas marca el riesgo agregado", () => {
    const p = plan(
      { cargas: [PORTAL_CARGAS[0]] },
      portal(),
      new Set(["cargas"]),
    );
    expect(p.risks.some((r) => r.field === "cargas.__removed")).toBe(true);
  });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe("fem2d — snapshot", () => {
  it("plantilla virgen: todo sin_confirmar y bandera de plantilla", () => {
    const snap = JSON.parse(fem2dAdapter.snapshot(portal()));
    expect(snap.valores.modelo_de_plantilla).toBe(true);
    expect(snap.valores.plantilla).toBe("portal-frame");
    expect(snap.sin_confirmar).toEqual([
      "nudos",
      "barras",
      "apoyos",
      "cargas",
      "peso_propio",
    ]);
    expect(snap.valores.barras[1].correas_m).toBe(1.5);
    expect(snap.valores.cargas[2].tipo).toBe("nudo");
    expect(snap.valores.apoyos).toEqual([
      { nudo: 1, tipo: "empotrado" },
      { nudo: 4, tipo: "empotrado" },
    ]);
  });

  it("modelo custom: nada sin_confirmar", () => {
    const snap = JSON.parse(
      fem2dAdapter.snapshot({ ...portal(), templateId: "custom" }),
    );
    expect(snap.sin_confirmar).toEqual([]);
    expect(snap.valores.modelo_de_plantilla).toBe(false);
  });

  it("las rótulas se proyectan como campo editable de barras (Fase B)", () => {
    const m = portal();
    m.members = m.members.map(
      (mm): Fem2DMember =>
        mm.id === "v1" ? { ...mm, releases: { i: true, j: false } } : mm,
    );
    const snap = JSON.parse(fem2dAdapter.snapshot(m));
    expect(snap.valores.barras[1].rotulas).toBe("i");
    expect(snap.valores.barras[0].rotulas).toBe("ninguna");
    expect(snap.valores.rotulas).toBeUndefined(); // ya no hay bloque de solo lectura
  });
});

// ── Rótulas (Fase B) ──────────────────────────────────────────────────────────

describe("fem2d — rótulas editables (Fase B)", () => {
  it('rotulas "ambas" articula el dintel y "ninguna" lo restaura', () => {
    const p = plan({
      barras: [barra(1, 2), barra(2, 3, { rotulas: "ambas" }), barra(4, 3)],
    });
    expect(p.fields.members?.[1].releases).toEqual({ i: true, j: true });
    expect(p.changes[0].after).toContain("rótula i+j");

    const current = portal();
    current.members = current.members.map(
      (mm): Fem2DMember =>
        mm.id === "v1" ? { ...mm, releases: { i: true, j: true } } : mm,
    );
    const clear = plan(
      {
        barras: [barra(1, 2), barra(2, 3, { rotulas: "ninguna" }), barra(4, 3)],
      },
      current,
    );
    expect(clear.fields.members?.[1].releases).toEqual({ i: false, j: false });
  });

  it("rotulas null conserva las existentes", () => {
    const current = portal();
    current.members = current.members.map(
      (mm): Fem2DMember =>
        mm.id === "v1" ? { ...mm, releases: { i: false, j: true } } : mm,
    );
    const p = plan({ barras: [...PORTAL_BARRAS, barra(1, 3)] }, current);
    expect(p.fields.members?.[1].releases).toEqual({ i: false, j: true });
  });

  it("el arrastre es consciente de la ORIENTACIÓN: reenviar la barra invertida mantiene la rótula en el mismo nudo físico", () => {
    const current = portal();
    // Rótula en el extremo i de v1 (= nudo n2, el 2 del payload).
    current.members = current.members.map(
      (mm): Fem2DMember =>
        mm.id === "v1" ? { ...mm, releases: { i: true, j: false } } : mm,
    );
    // El dintel se reenvía como 3→2 (invertido): la rótula sigue en el nudo 2,
    // que ahora es el extremo j de la barra.
    const p = plan(
      { barras: [barra(1, 2), barra(3, 2), barra(4, 3)] },
      current,
    );
    expect(p.fields.members?.[1].i).toBe("n3");
    expect(p.fields.members?.[1].releases).toEqual({ i: false, j: true });
  });

  it("rotulas sobre una biela se ignora con aviso (biarticulada por formulación)", () => {
    const p = plan({
      barras: [
        ...PORTAL_BARRAS,
        barra(1, 3, { tipo: "biela", perfil: "L 80×8", rotulas: "ambas" }),
      ],
    });
    expect(p.fields.members?.[3].releases).toEqual({ i: false, j: false });
    expect(p.warnings.some((w) => w.includes("biarticulada"))).toBe(true);
  });
});

// ── Resumen de resultados ─────────────────────────────────────────────────────

describe("fem2d — resumen de resultados", () => {
  it("pórtico plantilla: veredicto CUMPLE alineado con el badge, con αcr", () => {
    const m = portal();
    const s = summarizeFem2DResults(m, analyzeFem2D(m));
    expect(s.verdict).toBe("ok");
    expect(s.text).toContain("VEREDICTO GLOBAL");
    expect(s.text).toContain("αcr");
    expect(s.text).toContain("η máximo global");
    expect(s.text).toContain("'v1'");
  });

  it("incluye las reacciones por apoyo (envolvente ELU) y ΣRy equilibra el ELU gravitatorio", () => {
    const m = portal();
    const result = analyzeFem2D(m);
    const s = summarizeFem2DResults(m, result);
    expect(s.text).toContain("Reacciones en apoyos (envolvente ELU");
    expect(s.text).toContain("nudo 1 (empotrado)");
    expect(s.text).toContain("nudo 4 (empotrado)");
    // Chequeo físico grosero: la envolvente Ry de cada apoyo es positiva
    // (reacción hacia arriba frente a cargas gravitatorias mayoradas).
    const matches = [...s.text.matchAll(/Ry=([-\d.]+) kN/g)].map((x) =>
      Number(x[1]),
    );
    expect(matches).toHaveLength(2);
    expect(matches.every((v) => v > 0)).toBe(true);
  });

  it("barra sin motor (L en flexión) → PENDIENTE contagioso, veredicto invalid", () => {
    const m = portal();
    m.members = m.members.map(
      (mm): Fem2DMember =>
        mm.id === "v1"
          ? {
              ...mm,
              steelSelection: { profileKey: "steel_L80x8", steel: "S275" },
            }
          : mm,
    );
    const s = summarizeFem2DResults(m, analyzeFem2D(m));
    expect(s.verdict).toBe("invalid");
    expect(s.text.startsWith("PENDIENTE")).toBe(true);
  });

  it("modelo sin apoyos → CÁLCULO NO VÁLIDO", () => {
    const m = { ...portal(), supports: [] };
    const s = summarizeFem2DResults(m, analyzeFem2D(m));
    expect(s.verdict).toBe("invalid");
    expect(s.text).toContain("CÁLCULO NO VÁLIDO");
  });
});

// ── Barras HA (el chat no edita hormigón; el arrastre debe ser COMPLETO) ─────

describe("fem2d — barras de hormigón", () => {
  /** Pórtico con el dintel v1 convertido a HA con armado completo. */
  function portalConHA(): Fem2DModel {
    const model = portal();
    const rc = setMemberMaterial(model, "v1", "rc");
    if (!rc.ok) throw new Error(rc.reason);
    return rc.model;
  }

  it("reconstrucción de la lista: la barra HA conserva sección + armado + acero latente", () => {
    const current = portalConHA();
    // Cambio real en OTRA barra (p2 → S355) para forzar el reemplazo de la
    // lista completa; v1 (HA) viaja por arrastre posicional con todo null.
    const p = plan(
      {
        barras: [
          PORTAL_BARRAS[0],
          PORTAL_BARRAS[1],
          barra(4, 3, { acero: "S355" }),
        ],
      },
      current,
    );
    expect(p.fields.members).toHaveLength(3);
    const v1 = p.fields.members![1];
    const orig = current.members.find((m) => m.id === "v1")!;
    expect(v1.material).toBe("rc");
    expect(v1.rcSection).toEqual(orig.rcSection);
    expect(v1.vanoArmado).toEqual(orig.vanoArmado);
    expect(v1.apoyoArmado).toEqual(orig.apoyoArmado);
    expect(v1.columnCage).toEqual(orig.columnCage);
    expect(v1.steelSelection).toEqual(orig.steelSelection); // restaurable
  });

  it("darle perfil convierte a acero con AVISO, sin perder los datos HA latentes", () => {
    const current = portalConHA();
    const p = plan(
      {
        barras: [
          PORTAL_BARRAS[0],
          barra(2, 3, { perfil: "IPE 300" }),
          PORTAL_BARRAS[2],
        ],
      },
      current,
    );
    const v1 = p.fields.members![1];
    expect(v1.material).toBe("steel");
    expect(v1.steelSelection?.profileKey).toBe("steel_IPE300");
    // Los datos HA viajan latentes (mismo contrato que el editor).
    expect(v1.rcSection).toBeDefined();
    expect(v1.vanoArmado).toBeDefined();
    expect(p.warnings.some((w) => w.includes("hormigón a acero"))).toBe(true);
  });

  it("barra HA + tipo biela → lista descartada (espejo de la guarda del editor)", () => {
    const current = portalConHA();
    const p = plan(
      {
        barras: [
          PORTAL_BARRAS[0],
          barra(2, 3, { tipo: "biela" }),
          PORTAL_BARRAS[2],
        ],
      },
      current,
    );
    expect(p.fields.members).toBeUndefined();
    const skip = skipFor(p, "Barras");
    expect(skip).toBeDefined();
    expect(skip!.reason).toContain("hormigón");
  });

  it("el snapshot describe la barra HA como comprobada pero no editable por chat", () => {
    const current = portalConHA();
    const snap = JSON.parse(fem2dAdapter.snapshot(current)) as {
      valores: { barras_ha?: string[] };
    };
    expect(snap.valores.barras_ha).toHaveLength(1);
    expect(snap.valores.barras_ha![0]).toContain("30×50 cm HA-25");
    expect(snap.valores.barras_ha![0]).toContain("inspector");
  });

  it("el resumen de resultados incluye las filas HA con su sección", () => {
    const current = portalConHA();
    const s = summarizeFem2DResults(current, analyzeFem2D(current));
    expect(s.text).toContain("HA 30×50");
  });
});

// ── Barras de MADERA (mismo patrón de arrastre que el HA) ────────────────────

describe("fem2d — barras de madera", () => {
  /** Pórtico con el dintel v1 convertido a madera (semilla C24 140×240). */
  function portalConMadera(): Fem2DModel {
    const model = portal();
    const res = setMemberMaterial(model, "v1", "timber");
    if (!res.ok) throw new Error(res.reason);
    return res.model;
  }

  it("reconstrucción de la lista: la barra de madera conserva sección + acero latente", () => {
    const current = portalConMadera();
    const p = plan(
      {
        barras: [
          PORTAL_BARRAS[0],
          PORTAL_BARRAS[1],
          barra(4, 3, { acero: "S355" }),
        ],
      },
      current,
    );
    expect(p.fields.members).toHaveLength(3);
    const v1 = p.fields.members![1];
    const orig = current.members.find((m) => m.id === "v1")!;
    expect(v1.material).toBe("timber");
    expect(v1.timberSection).toEqual(orig.timberSection);
    expect(v1.steelSelection).toEqual(orig.steelSelection); // restaurable
  });

  it("darle perfil convierte a acero con AVISO, sin perder la sección latente", () => {
    const current = portalConMadera();
    const p = plan(
      {
        barras: [
          PORTAL_BARRAS[0],
          barra(2, 3, { perfil: "IPE 300" }),
          PORTAL_BARRAS[2],
        ],
      },
      current,
    );
    const v1 = p.fields.members![1];
    expect(v1.material).toBe("steel");
    expect(v1.steelSelection?.profileKey).toBe("steel_IPE300");
    expect(v1.timberSection).toBeDefined();
    expect(p.warnings.some((w) => w.includes("madera a acero"))).toBe(true);
  });

  it("barra de madera + tipo biela → SE ACEPTA (la biela de madera está soportada)", () => {
    const current = portalConMadera();
    // v1 lleva cargas de barra de la plantilla: hay que retirarlas en la misma
    // propuesta (una biela no admite cargas en la barra — cross-check solver).
    const p = plan(
      {
        barras: [
          PORTAL_BARRAS[0],
          barra(2, 3, { tipo: "biela" }),
          PORTAL_BARRAS[2],
        ],
        cargas: [PORTAL_CARGAS[2]],
      },
      current,
    );
    expect(p.fields.members).toBeDefined();
    const v1 = p.fields.members![1];
    expect(v1.material).toBe("timber");
    expect(v1.elementType).toBe("two-force");
  });

  it("el snapshot describe la barra de madera como comprobada pero no editable", () => {
    const current = portalConMadera();
    const snap = JSON.parse(fem2dAdapter.snapshot(current)) as {
      valores: { barras_madera?: string[] };
    };
    expect(snap.valores.barras_madera).toHaveLength(1);
    expect(snap.valores.barras_madera![0]).toContain("C24 140×240 mm");
    expect(snap.valores.barras_madera![0]).toContain("inspector");
  });

  it("el resumen de resultados incluye las filas de madera con su sección", () => {
    const current = portalConMadera();
    const s = summarizeFem2DResults(current, analyzeFem2D(current));
    expect(s.text).toContain("C24 140×240");
  });
});

// ── Límite de uniones de Anthropic ────────────────────────────────────────────

describe("fem2d — presupuesto de uniones", () => {
  it("el envelope queda en 16 uniones (= límite EXACTO, verificado en vivo con masonry): Anthropic soportado sin degradar", () => {
    const unions = countAnthropicUnions(buildChatSchema(FEM2D_PAYLOAD_SCHEMA));
    expect(unions).toBe(16);
    expect(unions).toBeLessThanOrEqual(ANTHROPIC_UNION_LIMIT);
  });
});

// El bucle de amnesia del 2026-07-21 (OpenAI, croquis de pórtico con voladizos):
// la entrevista a una-pregunta-por-turno superaba la ventana de historial sin
// emitir NINGUNA proposal, así que ningún dato confirmado persistía (la memoria
// del hilo solo arrastra propuestas) y el modelo re-preguntaba en círculo. El
// contrato exige la regla CHECKPOINT (reenviar el modelo acumulado en proposal,
// con provisionales estables) y la ventana ampliada para la entrevista larga.
describe("fem2d — contrato anti-amnesia de la entrevista", () => {
  it("promptRules mandan el checkpoint: proposal acumulada por turno, provisionales 'Sugerencia:' estables y extracción del croquis al verlo", () => {
    expect(fem2dAdapter.promptRules).toContain("CHECKPOINT DE ENTREVISTA");
    expect(fem2dAdapter.promptRules).toContain("pendientes_de_aplicar");
    expect(fem2dAdapter.promptRules).toMatch(/modelo ACUMULADO/);
    expect(fem2dAdapter.promptRules).toMatch(/RECORTADO/);
    expect(fem2dAdapter.promptRules).toMatch(/provisional razonable/);
    expect(fem2dAdapter.promptRules).toMatch(/croquis[\s\S]*MISMO turno/);
  });

  it("ventana de historial ampliada respecto al default (entrevista larga)", () => {
    expect(fem2dAdapter.historyTurns).toBe(20);
    expect(fem2dAdapter.historyTurns).toBeGreaterThan(MAX_HISTORY_TURNS);
  });
});

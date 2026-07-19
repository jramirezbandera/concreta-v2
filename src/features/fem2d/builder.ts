// FEM 2D — headless model builder (Lane A)
//
// Convenience factories so solver tests (Lane B) and the parametric
// templates can assemble models with minimal boilerplate and explicit,
// stable ids. This is NOT the user-facing editor (there is none in v1 —
// parametric-first, eng-review D8); it is the test/authoring surface.
//
// validateModel2DBasic() covers structural sanity only (refs, lengths,
// element-type/load compatibility, size caps). Full solve-time invariants
// (mechanism detection, support sufficiency) belong to the solver phase.

import {
  FEM2D_MAX_MEMBERS,
  FEM2D_MAX_NODES,
  MIN_MEMBER_LENGTH_M,
} from './types';
import type {
  ElementType2D,
  Fem2DLoad,
  Fem2DMember,
  Fem2DModel,
  Fem2DNode,
  Fem2DSupport,
  LoadCase,
  LoadFrame2D,
  MemberRole,
  ModelError,
  RcSection,
  Steel2DSelection,
  Support2DType,
  UseCategoryCode,
} from './types';

/** Default profile for builder members — matches the 1D module's default. */
export const DEFAULT_STEEL_2D: Steel2DSelection = {
  profileKey: 'steel_IPE240',
  steel: 'S275',
};

// ── Factories ───────────────────────────────────────────────────────────────

export function node2d(id: string, x: number, y: number): Fem2DNode {
  return { id, x, y };
}

interface MemberOpts {
  role?: MemberRole;
  steelSelection?: Steel2DSelection;
  rcSection?: RcSection;
  releases?: { i: boolean; j: boolean };
  ltbSpacing?: number;
}

function member(
  id: string,
  i: string,
  j: string,
  elementType: ElementType2D,
  defaultRole: MemberRole,
  opts: MemberOpts = {},
): Fem2DMember {
  const material = opts.rcSection ? 'rc' : 'steel';
  return {
    id,
    i,
    j,
    role: opts.role ?? defaultRole,
    elementType,
    material,
    steelSelection: opts.rcSection ? undefined : (opts.steelSelection ?? { ...DEFAULT_STEEL_2D }),
    rcSection: opts.rcSection,
    releases: opts.releases ?? { i: false, j: false },
    ltbSpacing: opts.ltbSpacing,
  };
}

/** Axial + bending member (frame members, loaded chords). Default role 'viga'. */
export function beamColumn(id: string, i: string, j: string, opts: MemberOpts = {}): Fem2DMember {
  return member(id, i, j, 'beam-column', 'viga', opts);
}

/** Axial-only member (web members). Default role 'diagonal'. */
export function twoForce(id: string, i: string, j: string, opts: MemberOpts = {}): Fem2DMember {
  return member(id, i, j, 'two-force', 'diagonal', opts);
}

export function support2d(node: string, type: Support2DType): Fem2DSupport {
  return { node, type };
}

interface LoadCommon {
  lc: LoadCase;
  useCategory?: UseCategoryCode;
}

export function nodeLoad(
  id: string,
  node: string,
  f: LoadCommon & { Fx?: number; Fy?: number },
): Fem2DLoad {
  return {
    id,
    kind: 'node',
    lc: f.lc,
    useCategory: f.useCategory,
    node,
    Fx: f.Fx ?? 0,
    Fy: f.Fy ?? 0,
  };
}

export function memberUdl(
  id: string,
  memberId: string,
  f: LoadCommon & { wx?: number; wy?: number; frame?: LoadFrame2D; from?: number; to?: number },
): Fem2DLoad {
  return {
    id,
    kind: 'udl',
    lc: f.lc,
    useCategory: f.useCategory,
    member: memberId,
    wx: f.wx ?? 0,
    wy: f.wy ?? 0,
    frame: f.frame ?? 'global',
    from: f.from,
    to: f.to,
  };
}

export function memberPointLoad(
  id: string,
  memberId: string,
  pos: number,
  f: LoadCommon & { Fx?: number; Fy?: number; frame?: LoadFrame2D },
): Fem2DLoad {
  return {
    id,
    kind: 'point-member',
    lc: f.lc,
    useCategory: f.useCategory,
    member: memberId,
    pos,
    Fx: f.Fx ?? 0,
    Fy: f.Fy ?? 0,
    frame: f.frame ?? 'global',
  };
}

interface ModelParts {
  nodes: Fem2DNode[];
  members: Fem2DMember[];
  supports?: Fem2DSupport[];
  loads?: Fem2DLoad[];
  /** Defaults FALSE here (clean numbers for solver tests); templates set true. */
  selfWeight?: boolean;
  templateId?: Fem2DModel['templateId'];
}

export function fem2dModel(parts: ModelParts): Fem2DModel {
  return {
    templateId: parts.templateId ?? 'custom',
    selfWeight: parts.selfWeight ?? false,
    nodes: parts.nodes,
    members: parts.members,
    supports: parts.supports ?? [],
    loads: parts.loads ?? [],
  };
}

// ── Geometry helpers ────────────────────────────────────────────────────────

export function memberLength(model: Fem2DModel, m: Fem2DMember): number {
  const ni = model.nodes.find((n) => n.id === m.i);
  const nj = model.nodes.find((n) => n.id === m.j);
  if (!ni || !nj) return 0;
  return Math.hypot(nj.x - ni.x, nj.y - ni.y);
}

// ── Basic validation ────────────────────────────────────────────────────────

function fail(code: string, msg: string): ModelError {
  return { severity: 'fail', code, msg };
}

/**
 * Structural sanity of the model shape. Returns [] when clean.
 * Solve-time physics (mechanisms, reaction sufficiency) is NOT here.
 */
export function validateModel2DBasic(model: Fem2DModel): ModelError[] {
  const errors: ModelError[] = [];

  if (model.nodes.length > FEM2D_MAX_NODES) {
    errors.push(fail('MODEL_TOO_LARGE', `Modelo con ${model.nodes.length} nodos (máx. ${FEM2D_MAX_NODES}).`));
  }
  if (model.members.length > FEM2D_MAX_MEMBERS) {
    errors.push(fail('MODEL_TOO_LARGE', `Modelo con ${model.members.length} barras (máx. ${FEM2D_MAX_MEMBERS}).`));
  }

  // Unique ids per collection.
  for (const [label, ids] of [
    ['nodo', model.nodes.map((n) => n.id)],
    ['barra', model.members.map((m) => m.id)],
    ['carga', model.loads.map((l) => l.id)],
  ] as const) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(fail('DUPLICATE_ID', `Id de ${label} duplicado: '${id}'.`));
      seen.add(id);
    }
  }

  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const memberById = new Map(model.members.map((m) => [m.id, m]));

  for (const m of model.members) {
    if (m.i === m.j) {
      errors.push(fail('MEMBER_SELF_LOOP', `Barra ${m.id} conecta el nodo ${m.i} consigo mismo.`));
      continue;
    }
    if (!nodeIds.has(m.i)) errors.push(fail('MEMBER_NODE_MISSING', `Barra ${m.id}: nodo i='${m.i}' no existe.`));
    if (!nodeIds.has(m.j)) errors.push(fail('MEMBER_NODE_MISSING', `Barra ${m.id}: nodo j='${m.j}' no existe.`));
    if (nodeIds.has(m.i) && nodeIds.has(m.j)) {
      const L = memberLength(model, m);
      if (L < MIN_MEMBER_LENGTH_M) {
        errors.push(fail('MEMBER_TOO_SHORT', `Barra ${m.id} mide ${L.toFixed(4)} m (< ${MIN_MEMBER_LENGTH_M} m).`));
      }
    }
    if (m.material === 'steel' && !m.steelSelection) {
      errors.push(fail('MEMBER_SECTION_MISSING', `Barra ${m.id}: material acero sin perfil.`));
    }
    if (m.material === 'rc' && !m.rcSection) {
      errors.push(fail('MEMBER_SECTION_MISSING', `Barra ${m.id}: material HA sin sección.`));
    }
  }

  for (const s of model.supports) {
    if (!nodeIds.has(s.node)) {
      errors.push(fail('SUPPORT_NODE_MISSING', `Apoyo en nodo '${s.node}' que no existe.`));
    }
  }

  for (const ld of model.loads) {
    if (ld.kind === 'node') {
      if (!nodeIds.has(ld.node)) {
        errors.push(fail('LOAD_TARGET_MISSING', `Carga ${ld.id}: nodo destino '${ld.node}' no existe.`));
      }
      continue;
    }
    const target = memberById.get(ld.member);
    if (!target) {
      errors.push(fail('LOAD_TARGET_MISSING', `Carga ${ld.id}: barra destino '${ld.member}' no existe.`));
      continue;
    }
    // D10 invariant: two-force members carry NO member loads (not even axial
    // ones in v1 — apply axial forces at the nodes instead). A transverse load
    // on a two-force member has no flexural path: local mechanism.
    if (target.elementType === 'two-force') {
      errors.push(fail(
        'TWO_FORCE_MEMBER_LOAD',
        `Carga ${ld.id} sobre la barra biela ${target.id}: un elemento de 2 fuerzas no admite cargas en la barra (aplícalas en los nudos o usa viga-columna).`,
      ));
    }
    if (ld.kind === 'point-member' && (ld.pos < 0 || ld.pos > 1)) {
      errors.push(fail('LOAD_POS_OUT_OF_RANGE', `Carga ${ld.id}: posición ${ld.pos} fuera de [0, 1].`));
    }
    if (ld.kind === 'udl' && ld.from != null && ld.to != null) {
      if (ld.from < 0 || ld.to > 1 || ld.from >= ld.to) {
        errors.push(fail('LOAD_PARTIAL_RANGE_INVALID', `Carga ${ld.id}: rango parcial [${ld.from}, ${ld.to}] inválido.`));
      }
    }
  }

  return errors;
}

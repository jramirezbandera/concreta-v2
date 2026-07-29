// FEM 2D — decompose (Lane B, Fase 3: "cargas como foco propio")
//
// Translates the design-level Fem2DModel into the solver-level
// Analysis2DModel:
//
//   - Members split into elements at point-member load positions and partial
//     UDL boundaries, ALONG THE MEMBER AXIS (fractions t of length — not the
//     global-x sweep that made vertical columns vanish in the 1D decompose;
//     eng-review outside-voice finding 3).
//   - Loads resolved to the solver contract: element UDLs as constant LOCAL
//     (qx, qy); point loads as GLOBAL nodal forces at split nodes. The
//     global→local rotation happens HERE (the "FEF rotada" silent-killer the
//     review flagged): for a member at angle θ (c=cosθ, s=sinθ):
//         qx_local =  c·wx + s·wy
//         qy_local = −s·wx + c·wy
//     and local point components back to global: gx = c·Fx − s·Fy, etc.
//   - Self-weight (model.selfWeight): beam-column members get a global
//     (0, −γA) UDL on every element; TWO-FORCE members get the standard
//     half-to-each-node lumping (a two-force element cannot carry transverse
//     load — the axial idealization moves its weight to the joints).
//   - Supports → BCs: pinned {x,y}, fixed {x,y,rot}, roller {y}.
//   - Member releases map to the FIRST/LAST element of the member.
//
// Stiffness comes from frame-core sections (steel catalog / RC gross section).

import {
  rcSelfWeight,
  rcStiffness,
  steelSelfWeight,
  steelStiffness,
  timberSelfWeight,
  timberStiffness,
} from '../../lib/frame-core/sections';
import type { ModelError } from '../../lib/frame-core/types';
import type {
  Analysis2DBC,
  Analysis2DElement,
  Analysis2DLoadCase,
  Analysis2DModel,
  Analysis2DNode,
  Analysis2DNodeLoad,
} from './analysis';
import { memberLength } from './builder';
import type { ElementType2D, Fem2DMember, Fem2DModel, LoadCase } from './types';

const T_EPS = 1e-6; // anchor dedupe tolerance in length fraction

/**
 * Formulación DERIVADA de una barra (Fase 2, paso 4 — aquí muere el tipo
 * 'two-force' como campo del miembro):
 *
 *   birrotulada (releases.i && releases.j) Y sin carga de barra → 'two-force'
 *   (axial puro, 4 GDL). Cualquier otra cosa → 'beam-column'.
 *
 * Equivalencia medida en Fase 0: birrotulada descargada ≡ biela con error
 * ≤ 2e-12 (la rigidez transversal se cancela EXACTAMENTE al condensar las dos
 * filas M=0), y la formulación axial cuesta ×5.6 menos en el tope de modelo
 * (180 vs 298 GDL, 5 vs 29 ms) — la derivación sostiene la interactividad,
 * no es una optimización.
 *
 * EL PESO PROPIO NO CUENTA COMO CARGA DE BARRA (Fase 0, Resultado 3): se
 * agrupa mitad en cada nudo, que es la idealización que la app siempre aplicó
 * a las bielas y la que el adaptador IA ya citaba como precedente. Si contara,
 * toda celosía con peso propio (el default de la plantilla) pagaría los 29 ms.
 * Una carga explícita del usuario SÍ cuenta: la barra pasa a viga-columna
 * birrotulada y flecta — el problema con el que se abrió este design doc.
 *
 * La derivación se evalúa sobre el MIEMBRO COMPLETO, antes del troceado: las
 * rótulas se mapean al primer/último sub-elemento y un sub-tramo interior
 * nunca es "birrotulado" en el sentido que interesa aquí.
 */
export function memberFormulation(model: Fem2DModel, m: Fem2DMember): ElementType2D {
  if (!m.releases.i || !m.releases.j) return 'beam-column';
  for (const ld of model.loads) {
    if (ld.kind !== 'node' && ld.member === m.id) return 'beam-column';
  }
  return 'two-force';
}

export interface Decompose2DResult {
  analysis: Analysis2DModel;
  errors: ModelError[];
}

interface MemberPlan {
  member: Fem2DMember;
  /** Formulación derivada (memberFormulation) — decide el reparto del peso propio. */
  formulation: ElementType2D;
  L: number;
  c: number;
  s: number;
  /** Analysis node ids per anchor, anchors[k] ↔ nodeIds[k]. */
  anchors: number[]; // t fractions, sorted, first=0 last=1
  nodeIds: string[];
  /** Element index range in the global elements array. */
  firstElement: number;
  elementCount: number;
  selfWeight: number; // kN/m positive magnitude
}

export function decompose2D(model: Fem2DModel): Decompose2DResult {
  const errors: ModelError[] = [];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  const analysisNodes: Analysis2DNode[] = model.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
  const elements: Analysis2DElement[] = [];
  const plans = new Map<string, MemberPlan>();

  // ── Per-member split plan + elements ──────────────────────────────────────
  for (const m of model.members) {
    const ni = nodeById.get(m.i);
    const nj = nodeById.get(m.j);
    if (!ni || !nj) continue; // validateModel2DBasic flags this upstream
    const L = memberLength(model, m);
    if (L <= 0) continue;
    const c = (nj.x - ni.x) / L;
    const s = (nj.y - ni.y) / L;

    // Stiffness.
    let EA = 0;
    let EI = 0;
    if (m.material === 'rc' && m.rcSection) {
      ({ EA, EI } = rcStiffness(m.rcSection));
    } else if (m.material === 'timber' && m.timberSection) {
      const st = timberStiffness(m.timberSection);
      if (!st) {
        errors.push({
          severity: 'fail',
          code: 'UNKNOWN_TIMBER_GRADE',
          msg: `Barra ${m.id}: clase resistente '${m.timberSection.gradeId}' no existe en el catálogo.`,
        });
        continue;
      }
      ({ EA, EI } = st);
    } else if (m.material === 'steel' && m.steelSelection) {
      const st = steelStiffness(m.steelSelection.profileKey);
      if (!st) {
        errors.push({
          severity: 'fail',
          code: 'UNKNOWN_PROFILE',
          msg: `Barra ${m.id}: perfil '${m.steelSelection.profileKey}' no existe en el catálogo.`,
        });
        continue;
      }
      ({ EA, EI } = st);
    }

    // Formulación derivada (ver memberFormulation): una two-force no tiene
    // cargas de barra por construcción, así que tampoco tiene anclajes.
    const formulation = memberFormulation(model, m);

    // Anchors along the member (fractions of L).
    const anchors: number[] = [0, 1];
    if (formulation === 'beam-column') {
      for (const ld of model.loads) {
        if (ld.kind === 'point-member' && ld.member === m.id) {
          if (ld.pos > T_EPS && ld.pos < 1 - T_EPS) anchors.push(ld.pos);
        } else if (ld.kind === 'udl' && ld.member === m.id && ld.from != null && ld.to != null) {
          if (ld.from > T_EPS && ld.from < 1 - T_EPS) anchors.push(ld.from);
          if (ld.to > T_EPS && ld.to < 1 - T_EPS) anchors.push(ld.to);
        }
      }
    }
    anchors.sort((a, b) => a - b);
    const dedup: number[] = [anchors[0]];
    for (let k = 1; k < anchors.length; k++) {
      if (anchors[k] - dedup[dedup.length - 1] > T_EPS) dedup.push(anchors[k]);
    }

    // Anchor nodes: endpoints reuse design ids; interiors get synthetic ids.
    const nodeIds: string[] = dedup.map((t, k) => {
      if (k === 0) return m.i;
      if (k === dedup.length - 1) return m.j;
      const id = `${m.id}_s${k}`;
      analysisNodes.push({ id, x: ni.x + (nj.x - ni.x) * t, y: ni.y + (nj.y - ni.y) * t });
      return id;
    });

    const firstElement = elements.length;
    const selfW = model.selfWeight
      ? (m.material === 'rc' && m.rcSection
          ? rcSelfWeight(m.rcSection)
          : m.material === 'timber' && m.timberSection
            ? timberSelfWeight(m.timberSection)
            : m.steelSelection
              ? steelSelfWeight(m.steelSelection.profileKey)
              : 0)
      : 0;

    for (let k = 0; k < dedup.length - 1; k++) {
      elements.push({
        id: `${m.id}_e${k}`,
        designMemberId: m.id,
        i: nodeIds[k],
        j: nodeIds[k + 1],
        elementType: formulation,
        EA,
        EI,
        releaseI: k === 0 && m.releases.i && formulation === 'beam-column',
        releaseJ: k === dedup.length - 2 && m.releases.j && formulation === 'beam-column',
      });
    }

    plans.set(m.id, {
      member: m, formulation, L, c, s,
      anchors: dedup, nodeIds,
      firstElement, elementCount: dedup.length - 1,
      selfWeight: selfW,
    });
  }

  if (errors.some((e) => e.severity === 'fail')) {
    return { analysis: { nodes: [], elements: [], bcs: [], loadCases: [] }, errors };
  }

  // ── Load cases ────────────────────────────────────────────────────────────
  const caseOrder: LoadCase[] = ['G', 'Q', 'W', 'S', 'E'];
  const present = new Set<LoadCase>(model.loads.map((l) => l.lc));
  if (model.selfWeight) present.add('G');

  const loadCases: Analysis2DLoadCase[] = [];
  for (const lc of caseOrder) {
    if (!present.has(lc)) continue;
    const q = elements.map(() => ({ qx: 0, qy: 0 }));
    const nodeLoads: Analysis2DNodeLoad[] = [];

    // Self-weight → G only.
    if (lc === 'G' && model.selfWeight) {
      for (const plan of plans.values()) {
        if (plan.selfWeight <= 0) continue;
        const { c, s } = plan;
        if (plan.formulation === 'beam-column') {
          // Global (0, −w) → local: qx = s·(−w)·? — full formula below.
          const wy = -plan.selfWeight;
          const qxL = s * wy; // c·0 + s·wy
          const qyL = c * wy; // −s·0 + c·wy
          for (let k = 0; k < plan.elementCount; k++) {
            q[plan.firstElement + k].qx += qxL;
            q[plan.firstElement + k].qy += qyL;
          }
        } else {
          // Two-force: lump half the member weight at each end node.
          const half = (plan.selfWeight * plan.L) / 2;
          nodeLoads.push({ node: plan.member.i, Fx: 0, Fy: -half });
          nodeLoads.push({ node: plan.member.j, Fx: 0, Fy: -half });
        }
      }
    }

    for (const ld of model.loads) {
      if (ld.lc !== lc) continue;

      if (ld.kind === 'node') {
        nodeLoads.push({ node: ld.node, Fx: ld.Fx, Fy: ld.Fy });
        continue;
      }

      const plan = plans.get(ld.member);
      if (!plan) continue; // flagged upstream
      const { c, s } = plan;

      if (ld.kind === 'udl') {
        // Resolve to LOCAL components (constant along the member — the angle
        // is fixed, so a global UDL is also constant in local axes).
        let qxL: number;
        let qyL: number;
        if (ld.frame === 'global') {
          qxL = c * ld.wx + s * ld.wy;
          qyL = -s * ld.wx + c * ld.wy;
        } else {
          qxL = ld.wx;
          qyL = ld.wy;
        }
        const from = ld.from ?? 0;
        const to = ld.to ?? 1;
        for (let k = 0; k < plan.elementCount; k++) {
          const mid = (plan.anchors[k] + plan.anchors[k + 1]) / 2;
          if (mid >= from - T_EPS && mid <= to + T_EPS) {
            q[plan.firstElement + k].qx += qxL;
            q[plan.firstElement + k].qy += qyL;
          }
        }
        continue;
      }

      // point-member → GLOBAL nodal force at the anchor node (it exists by
      // construction; pos ≈ 0/1 lands on the member's end node).
      let gx: number;
      let gy: number;
      if (ld.frame === 'global') {
        gx = ld.Fx;
        gy = ld.Fy;
      } else {
        gx = c * ld.Fx - s * ld.Fy;
        gy = s * ld.Fx + c * ld.Fy;
      }
      let anchorIdx = 0;
      let best = Infinity;
      for (let k = 0; k < plan.anchors.length; k++) {
        const d = Math.abs(plan.anchors[k] - ld.pos);
        if (d < best) { best = d; anchorIdx = k; }
      }
      nodeLoads.push({ node: plan.nodeIds[anchorIdx], Fx: gx, Fy: gy });
    }

    loadCases.push({ lc, q, nodeLoads });
  }

  // ── BCs ───────────────────────────────────────────────────────────────────
  const bcs: Analysis2DBC[] = model.supports.map((sup) => ({
    node: sup.node,
    fixX: sup.type !== 'roller',
    fixY: true,
    fixRot: sup.type === 'fixed',
  }));

  return { analysis: { nodes: analysisNodes, elements, bcs, loadCases }, errors };
}

// FEM 2D — parametric templates (Lane A, eng-review D8: parametric-first)
//
// v1 has NO free 2D editor. Each template is a fixed topology whose geometry,
// member data (grupos de presentación, rótulas, límites) and load layout are GENERATED from a small,
// validated parameter set. The four templates re-author (not reuse) the old
// decorative presets — those lived in the deprecated FemModel shape and were
// only ever "solved" by the quarantined mock (eng-review outside-voice #9).
//
// Conventions honoured here (see types.ts header):
//   - Loads are signed world components; dead/live/snow PARAMS are entered as
//     positive magnitudes (natural for the form) and converted to wy = −w by
//     the generator — that conversion is the "UI preset" of decision D5.
//   - Wind params are SIGNED (+x = wind from the left) so both senses work.
//   - Web members are 'two-force' and never receive member loads (D10);
//     chords/frames are 'beam-column'.
//   - Snow caveat: UDLs act per unit MEMBER length. Snow given per plan
//     projection must be pre-converted (w·cosθ) — v1 limitation, see D5.
//
// Materials: v1 templates emit steel members only. RC members are supported
// by the data model (rcSection) but wait for the check-phase reinforcement
// model (T5) before templates expose them.
//
// Default parameter values mirror the old presets where they existed; final
// FTUX tuning (target η ≈ green) happens once the 2D solver lands (Lane B).

import { beamColumn, fem2dModel, node2d, nodeLoad, memberUdl, support2d, twoForce } from './builder';
import type {
  Fem2DLoad,
  Fem2DMember,
  Fem2DModel,
  Fem2DNode,
  Fem2DSupport,
  Fem2DTemplateId,
  Steel2DSelection,
} from './types';

// ── Shared validation helpers ───────────────────────────────────────────────

function checkRange(errors: string[], name: string, v: number, min: number, max: number) {
  if (!Number.isFinite(v)) errors.push(`${name}: debe ser un número finito.`);
  else if (v < min || v > max) errors.push(`${name}: ${v} fuera del rango [${min}, ${max}].`);
}

function checkInt(errors: string[], name: string, v: number) {
  if (!Number.isInteger(v)) errors.push(`${name}: debe ser un entero.`);
}

function checkSteel(errors: string[], steel: string) {
  if (steel !== 'S275' && steel !== 'S355') errors.push(`Acero '${steel}' no soportado (S275 | S355).`);
}

function checkProfile(errors: string[], name: string, key: string) {
  if (typeof key !== 'string' || key.length === 0) errors.push(`${name}: perfil vacío.`);
}

/** Sequential deterministic load-id factory ('l1', 'l2', …). */
function loadIds(): () => string {
  let i = 0;
  return () => `l${++i}`;
}

export interface Fem2DTemplate<P> {
  id: Fem2DTemplateId;
  name: string;
  description: string;
  /** Fresh defaults per call (avoids shared nested-array mutation). */
  defaults: () => P;
  validate: (p: P) => string[];
  /** Throws Error (joined validate() messages) on invalid params. */
  build: (p: P) => Fem2DModel;
}

function buildGuard<P>(t: Omit<Fem2DTemplate<P>, 'build'>, gen: (p: P) => Fem2DModel): Fem2DTemplate<P> {
  return {
    ...t,
    build: (p: P) => {
      const errors = t.validate(p);
      if (errors.length > 0) {
        throw new Error(`Parámetros inválidos (${t.id}): ${errors.join(' ')}`);
      }
      return gen(p);
    },
  };
}

// ── Cercha Pratt ────────────────────────────────────────────────────────────
//
//        t1 ───cs1─── t2 ───cs2─── t3          (n = 4 panels shown)
//       ╱ │ ╲         │         ╱ │ ╲
//     d1  m1  d2      m2     d3  m3  d4        d1/dn = end posts
//     ╱   │     ╲     │     ╱    │    ╲        interior diagonals descend
//    b0──ci1──b1──ci2──b2──ci3──b3──ci4──b4    toward midspan (Pratt →
//    ▲ pinned                     ○ roller     tension under gravity)
//
// Chords (ci/cs) are beam-column: physically continuous, may carry UDL and
// then genuinely flex (the user's requirement from the review). Web members
// (m/d) are two-force: axial only, never loaded on the member.
//
// Roof UDL accounting (total must equal w·L for the ΣFy sanity tests):
// the top chord only spans [p, L−p], so the two end panels' roof share is
// applied as node loads: w·p/2 at t1/t(n−1) and w·p/2 at b0/bn (the support
// share goes straight to reactions).

export interface PrattTrussParams {
  span: number;            // m
  height: number;          // m (chord-to-chord)
  nPanels: number;         // even, 4..12
  chordProfileKey: string; // top + bottom chords
  webProfileKey: string;   // diagonals + montantes + end posts
  steel: 'S275' | 'S355';
  roofDeadLoad: number;    // kN/m on top chord, G (magnitude, applied ↓)
  roofLiveLoad: number;    // kN/m on top chord, Q · G1 (magnitude, applied ↓)
  ceilingLoad: number;     // kN/m on bottom chord, G (magnitude, applied ↓)
}

export const prattTrussTemplate: Fem2DTemplate<PrattTrussParams> = buildGuard(
  {
    id: 'pratt-truss',
    name: 'Cercha Pratt',
    description: 'Cordones paralelos, montantes y diagonales, luz y nº de paneles paramétricos.',
    defaults: (): PrattTrussParams => ({
      span: 8,
      height: 1.5,
      nPanels: 4,
      chordProfileKey: 'steel_IPE200',
      // D11 (Fase 2): SHS en vez de L 80×8 — área comparable (≈12 cm²) pero
      // CON motor de flexión, así que la historia estrella (poner una
      // repartida sobre una diagonal y ver un resultado) funciona en la
      // plantilla por defecto. Un alma tubular en cercha es proyecto ortodoxo.
      // Los modelos antiguos con L 80×8 siguen abriendo (la clave vive en el
      // catálogo) y una L con demanda de flexión lee PENDIENTE con motivo.
      webProfileKey: 'steel_SHS80x80x4',
      steel: 'S275',
      roofDeadLoad: 3,
      roofLiveLoad: 4,
      ceilingLoad: 0,
    }),
    validate: (p) => {
      const e: string[] = [];
      checkRange(e, 'Luz', p.span, 4, 30);
      checkRange(e, 'Canto', p.height, 0.5, 5);
      checkInt(e, 'Paneles', p.nPanels);
      checkRange(e, 'Paneles', p.nPanels, 4, 12);
      if (Number.isInteger(p.nPanels) && p.nPanels % 2 !== 0) e.push('Paneles: debe ser par.');
      checkProfile(e, 'Perfil de cordones', p.chordProfileKey);
      checkProfile(e, 'Perfil de celosía', p.webProfileKey);
      checkSteel(e, p.steel);
      checkRange(e, 'Carga permanente de cubierta', p.roofDeadLoad, 0, 500);
      checkRange(e, 'Sobrecarga de cubierta', p.roofLiveLoad, 0, 500);
      checkRange(e, 'Carga de techo (cordón inferior)', p.ceilingLoad, 0, 500);
      return e;
    },
  },
  (p) => {
    const n = p.nPanels;
    const panel = p.span / n;
    const chord: Steel2DSelection = { profileKey: p.chordProfileKey, steel: p.steel };
    const web: Steel2DSelection = { profileKey: p.webProfileKey, steel: p.steel };

    const nodes: Fem2DNode[] = [];
    for (let i = 0; i <= n; i++) nodes.push(node2d(`b${i}`, i * panel, 0));
    for (let i = 1; i <= n - 1; i++) nodes.push(node2d(`t${i}`, i * panel, p.height));

    const members: Fem2DMember[] = [];
    // Bottom chord ci1..cin (continuous, may carry ceiling UDL).
    for (let i = 1; i <= n; i++) {
      members.push(beamColumn(`ci${i}`, `b${i - 1}`, `b${i}`, { displayGroup: 'cordon', deflLimit: 300, steelSelection: { ...chord } }));
    }
    // Top chord cs1..cs(n-2).
    for (let i = 1; i <= n - 2; i++) {
      members.push(beamColumn(`cs${i}`, `t${i}`, `t${i + 1}`, { displayGroup: 'cordon', deflLimit: 300, steelSelection: { ...chord } }));
    }
    // Diagonals d1..dn: left end post, left interiors, right interiors, right end post.
    // twoForce() = birrotulada + deflLimit 'none' — decompose deriva la biela.
    const diagonals: Array<[string, string]> = [[`b0`, `t1`]];
    for (let i = 1; i <= n / 2 - 1; i++) diagonals.push([`t${i}`, `b${i + 1}`]);
    for (let i = n / 2 + 1; i <= n - 1; i++) diagonals.push([`t${i}`, `b${i - 1}`]);
    diagonals.push([`t${n - 1}`, `b${n}`]);
    diagonals.forEach(([i, j], k) => {
      members.push(twoForce(`d${k + 1}`, i, j, { displayGroup: 'diagonal', steelSelection: { ...web } }));
    });
    // Verticals m1..m(n-1).
    for (let i = 1; i <= n - 1; i++) {
      members.push(twoForce(`m${i}`, `b${i}`, `t${i}`, { displayGroup: 'montante', steelSelection: { ...web } }));
    }

    const supports: Fem2DSupport[] = [support2d('b0', 'pinned'), support2d(`b${n}`, 'roller')];

    const loads: Fem2DLoad[] = [];
    const lid = loadIds();
    const roofCase = (w: number, lc: 'G' | 'Q') => {
      if (w <= 0) return;
      const cat = lc === 'Q' ? ('G1' as const) : undefined;
      for (let i = 1; i <= n - 2; i++) {
        loads.push(memberUdl(lid(), `cs${i}`, { lc, useCategory: cat, wy: -w }));
      }
      // End-panel tributary (see header): keeps ΣFy = −w·L exactly.
      const half = (w * panel) / 2;
      for (const node of [`t1`, `t${n - 1}`, `b0`, `b${n}`]) {
        loads.push(nodeLoad(lid(), node, { lc, useCategory: cat, Fy: -half }));
      }
    };
    roofCase(p.roofDeadLoad, 'G');
    roofCase(p.roofLiveLoad, 'Q');
    if (p.ceilingLoad > 0) {
      for (let i = 1; i <= n; i++) {
        loads.push(memberUdl(lid(), `ci${i}`, { lc: 'G', wy: -p.ceilingLoad }));
      }
    }

    return fem2dModel({ templateId: 'pratt-truss', selfWeight: true, nodes, members, supports, loads });
  },
);

// ── Pórtico simple ──────────────────────────────────────────────────────────
//
//    n2 ────────v1──────── n3      Columns i→j run bottom→top so the local
//    │                      │      +x_local axis points up on both.
//    p1                     p2
//    │                      │
//    n1                     n4
//   base                   base    (baseFixity: fixed | pinned)

export interface PortalFrameParams {
  span: number;            // m
  height: number;          // m
  columnProfileKey: string;
  beamProfileKey: string;
  steel: 'S275' | 'S355';
  baseFixity: 'fixed' | 'pinned';
  beamDeadLoad: number;    // kN/m, G (magnitude, applied ↓)
  beamLiveLoad: number;    // kN/m, Q · B (magnitude, applied ↓)
  windEaveForce: number;   // kN at left eave n2, SIGNED (+x = wind from left), W
  /** Separación de correas (arriostramiento del ala del dintel), m. */
  beamLtbSpacing: number;
}

export const portalFrameTemplate: Fem2DTemplate<PortalFrameParams> = buildGuard(
  {
    id: 'portal-frame',
    name: 'Pórtico simple',
    description: 'Dos pilares y un dintel, con viento opcional en cabeza.',
    defaults: (): PortalFrameParams => ({
      span: 6,
      height: 3.5,
      columnProfileKey: 'steel_HEB200',
      beamProfileKey: 'steel_IPE240',
      steel: 'S275',
      baseFixity: 'fixed',
      // FTUX: defaults abren en CUMPLE ~78% (gobernado por LTB del dintel).
      beamDeadLoad: 13,
      beamLiveLoad: 5,
      windEaveForce: 8,
      beamLtbSpacing: 1.5,
    }),
    validate: (p) => {
      const e: string[] = [];
      checkRange(e, 'Luz', p.span, 3, 30);
      checkRange(e, 'Altura', p.height, 2, 10);
      checkProfile(e, 'Perfil de pilar', p.columnProfileKey);
      checkProfile(e, 'Perfil de dintel', p.beamProfileKey);
      checkSteel(e, p.steel);
      if (p.baseFixity !== 'fixed' && p.baseFixity !== 'pinned') e.push('Base: debe ser fixed | pinned.');
      checkRange(e, 'Carga permanente del dintel', p.beamDeadLoad, 0, 500);
      checkRange(e, 'Sobrecarga del dintel', p.beamLiveLoad, 0, 500);
      checkRange(e, 'Viento en cabeza', p.windEaveForce, -500, 500);
      checkRange(e, 'Separación de correas', p.beamLtbSpacing, 0.1, 30);
      return e;
    },
  },
  (p) => {
    const col: Steel2DSelection = { profileKey: p.columnProfileKey, steel: p.steel };
    const beam: Steel2DSelection = { profileKey: p.beamProfileKey, steel: p.steel };
    const nodes = [
      node2d('n1', 0, 0),
      node2d('n2', 0, p.height),
      node2d('n3', p.span, p.height),
      node2d('n4', p.span, 0),
    ];
    const members = [
      beamColumn('p1', 'n1', 'n2', { displayGroup: 'pilar', deflLimit: 'none', steelSelection: { ...col } }),
      beamColumn('v1', 'n2', 'n3', { displayGroup: 'viga', deflLimit: 300, steelSelection: { ...beam }, ltbSpacing: p.beamLtbSpacing }),
      beamColumn('p2', 'n4', 'n3', { displayGroup: 'pilar', deflLimit: 'none', steelSelection: { ...col } }),
    ];
    const supports = [support2d('n1', p.baseFixity), support2d('n4', p.baseFixity)];
    const loads: Fem2DLoad[] = [];
    const lid = loadIds();
    if (p.beamDeadLoad > 0) loads.push(memberUdl(lid(), 'v1', { lc: 'G', wy: -p.beamDeadLoad }));
    if (p.beamLiveLoad > 0) loads.push(memberUdl(lid(), 'v1', { lc: 'Q', useCategory: 'B', wy: -p.beamLiveLoad }));
    if (p.windEaveForce !== 0) loads.push(nodeLoad(lid(), 'n2', { lc: 'W', Fx: p.windEaveForce }));
    return fem2dModel({ templateId: 'portal-frame', selfWeight: true, nodes, members, supports, loads });
  },
);

// ── Pórtico de varias plantas ───────────────────────────────────────────────
//
//    n0_2 ──v0_2── n1_2        Grid ids: n{col}_{level}, level 0 = base.
//     │             │          Columns p{col}_{story} run bottom→top;
//    p0_2          p1_2        beams v{bay}_{level} run left→right.
//     │             │          Wind: signed Fx at each level on column 0.
//    n0_1 ──v0_1── n1_1
//     │             │
//    p0_1          p1_1
//     │             │
//    n0_0          n1_0   (baseFixity)

export interface MultistoryParams {
  nBays: number;             // 1..4
  nStories: number;          // 1..5
  bayWidth: number;          // m
  storyHeight: number;       // m
  columnProfileKey: string;
  beamProfileKey: string;
  steel: 'S275' | 'S355';
  baseFixity: 'fixed' | 'pinned';
  floorDeadLoad: number;     // kN/m per beam, G (magnitude, applied ↓)
  floorLiveLoad: number;     // kN/m per beam, Q · B (magnitude, applied ↓)
  windStoryForces: number[]; // kN, length nStories, SIGNED, level 1..nStories, W
  /** Separación de arriostramiento del ala de las vigas (viguetas/forjado), m. */
  beamLtbSpacing: number;
}

export const multistoryTemplate: Fem2DTemplate<MultistoryParams> = buildGuard(
  {
    id: 'multistory',
    name: 'Pórtico de plantas',
    description: 'Retícula de pilares y vigas, plantas y vanos paramétricos, viento por planta.',
    defaults: (): MultistoryParams => ({
      nBays: 1,
      nStories: 2,
      bayWidth: 5,
      storyHeight: 3.2,
      columnProfileKey: 'steel_HEB200',
      beamProfileKey: 'steel_IPE240',
      steel: 'S275',
      baseFixity: 'fixed',
      // FTUX: defaults abren en CUMPLE ~80% (gobernado por LTB de vigas).
      floorDeadLoad: 15,
      floorLiveLoad: 5,
      windStoryForces: [6, 10],
      beamLtbSpacing: 1.5,
    }),
    validate: (p) => {
      const e: string[] = [];
      checkInt(e, 'Vanos', p.nBays);
      checkRange(e, 'Vanos', p.nBays, 1, 4);
      checkInt(e, 'Plantas', p.nStories);
      checkRange(e, 'Plantas', p.nStories, 1, 5);
      checkRange(e, 'Luz de vano', p.bayWidth, 3, 12);
      checkRange(e, 'Altura de planta', p.storyHeight, 2.2, 6);
      checkProfile(e, 'Perfil de pilar', p.columnProfileKey);
      checkProfile(e, 'Perfil de viga', p.beamProfileKey);
      checkSteel(e, p.steel);
      if (p.baseFixity !== 'fixed' && p.baseFixity !== 'pinned') e.push('Base: debe ser fixed | pinned.');
      checkRange(e, 'Carga permanente de forjado', p.floorDeadLoad, 0, 500);
      checkRange(e, 'Sobrecarga de forjado', p.floorLiveLoad, 0, 500);
      if (!Array.isArray(p.windStoryForces) || p.windStoryForces.length !== p.nStories) {
        e.push(`Viento por planta: se esperan ${p.nStories} valores.`);
      } else {
        p.windStoryForces.forEach((f, i) => checkRange(e, `Viento planta ${i + 1}`, f, -500, 500));
      }
      checkRange(e, 'Separación de arriostramiento de vigas', p.beamLtbSpacing, 0.1, 30);
      return e;
    },
  },
  (p) => {
    const col: Steel2DSelection = { profileKey: p.columnProfileKey, steel: p.steel };
    const beam: Steel2DSelection = { profileKey: p.beamProfileKey, steel: p.steel };
    const nodes: Fem2DNode[] = [];
    for (let c = 0; c <= p.nBays; c++) {
      for (let l = 0; l <= p.nStories; l++) {
        nodes.push(node2d(`n${c}_${l}`, c * p.bayWidth, l * p.storyHeight));
      }
    }
    const members: Fem2DMember[] = [];
    for (let c = 0; c <= p.nBays; c++) {
      for (let s = 1; s <= p.nStories; s++) {
        members.push(beamColumn(`p${c}_${s}`, `n${c}_${s - 1}`, `n${c}_${s}`, { displayGroup: 'pilar', deflLimit: 'none', steelSelection: { ...col } }));
      }
    }
    for (let l = 1; l <= p.nStories; l++) {
      for (let b = 0; b < p.nBays; b++) {
        members.push(beamColumn(`v${b}_${l}`, `n${b}_${l}`, `n${b + 1}_${l}`, { displayGroup: 'viga', deflLimit: 300, steelSelection: { ...beam }, ltbSpacing: p.beamLtbSpacing }));
      }
    }
    const supports: Fem2DSupport[] = [];
    for (let c = 0; c <= p.nBays; c++) supports.push(support2d(`n${c}_0`, p.baseFixity));

    const loads: Fem2DLoad[] = [];
    const lid = loadIds();
    for (let l = 1; l <= p.nStories; l++) {
      for (let b = 0; b < p.nBays; b++) {
        if (p.floorDeadLoad > 0) loads.push(memberUdl(lid(), `v${b}_${l}`, { lc: 'G', wy: -p.floorDeadLoad }));
        if (p.floorLiveLoad > 0) loads.push(memberUdl(lid(), `v${b}_${l}`, { lc: 'Q', useCategory: 'B', wy: -p.floorLiveLoad }));
      }
    }
    p.windStoryForces.forEach((f, i) => {
      if (f !== 0) loads.push(nodeLoad(lid(), `n0_${i + 1}`, { lc: 'W', Fx: f }));
    });
    return fem2dModel({ templateId: 'multistory', selfWeight: true, nodes, members, supports, loads });
  },
);

// ── Pórtico a dos aguas ─────────────────────────────────────────────────────
//
//              n3 (L/2, h_cumbrera)
//            ╱    ╲
//         f1        f2           Rafters are 'viga' beam-columns; wind
//        ╱            ╲          pressure (frame 'local') acts ⊥ to the
//     n2 (0,h_alero)   n4        windward rafter f1: positive param =
//      │                │        pressure ONTO the roof → wy_local < 0.
//      p1               p2
//      │                │
//     n1 (0,0)         n5 (L,0)   (baseFixity, default pinned)

export interface GableParams {
  span: number;              // m
  eaveHeight: number;        // m (alero)
  ridgeHeight: number;       // m (cumbrera) — must exceed eaveHeight
  columnProfileKey: string;
  rafterProfileKey: string;
  steel: 'S275' | 'S355';
  baseFixity: 'fixed' | 'pinned';
  rafterDeadLoad: number;    // kN/m per rafter, G (magnitude, applied ↓, per member length)
  rafterSnowLoad: number;    // kN/m per rafter, S (magnitude, applied ↓; pre-convert plan-projected snow)
  windEaveForce: number;     // kN at left eave n2, SIGNED, W
  windRafterPressure: number; // kN/m ⊥ windward rafter f1, SIGNED (+ = presión hacia la cubierta), W
  /** Separación de correas de cubierta (arriostramiento del faldón), m. */
  rafterLtbSpacing: number;
}

export const gableTemplate: Fem2DTemplate<GableParams> = buildGuard(
  {
    id: 'gable',
    name: 'Pórtico a dos aguas',
    description: 'Pilares y faldones inclinados, nieve y viento perpendicular opcionales.',
    defaults: (): GableParams => ({
      span: 8,
      eaveHeight: 3,
      ridgeHeight: 4.2,
      columnProfileKey: 'steel_HEB200',
      rafterProfileKey: 'steel_IPE240',
      steel: 'S275',
      baseFixity: 'pinned',
      rafterDeadLoad: 12,
      rafterSnowLoad: 0,
      windEaveForce: 0,
      windRafterPressure: 0,
      rafterLtbSpacing: 1.5,
    }),
    validate: (p) => {
      const e: string[] = [];
      checkRange(e, 'Luz', p.span, 4, 30);
      checkRange(e, 'Altura de alero', p.eaveHeight, 2, 10);
      checkRange(e, 'Altura de cumbrera', p.ridgeHeight, 2, 15);
      if (Number.isFinite(p.ridgeHeight) && Number.isFinite(p.eaveHeight) && p.ridgeHeight <= p.eaveHeight) {
        e.push('La cumbrera debe estar por encima del alero.');
      }
      checkProfile(e, 'Perfil de pilar', p.columnProfileKey);
      checkProfile(e, 'Perfil de faldón', p.rafterProfileKey);
      checkSteel(e, p.steel);
      if (p.baseFixity !== 'fixed' && p.baseFixity !== 'pinned') e.push('Base: debe ser fixed | pinned.');
      checkRange(e, 'Carga permanente de faldón', p.rafterDeadLoad, 0, 500);
      checkRange(e, 'Nieve', p.rafterSnowLoad, 0, 500);
      checkRange(e, 'Viento en cabeza', p.windEaveForce, -500, 500);
      checkRange(e, 'Presión de viento en faldón', p.windRafterPressure, -100, 100);
      checkRange(e, 'Separación de correas', p.rafterLtbSpacing, 0.1, 30);
      return e;
    },
  },
  (p) => {
    const col: Steel2DSelection = { profileKey: p.columnProfileKey, steel: p.steel };
    const rafter: Steel2DSelection = { profileKey: p.rafterProfileKey, steel: p.steel };
    const nodes = [
      node2d('n1', 0, 0),
      node2d('n2', 0, p.eaveHeight),
      node2d('n3', p.span / 2, p.ridgeHeight),
      node2d('n4', p.span, p.eaveHeight),
      node2d('n5', p.span, 0),
    ];
    const members = [
      beamColumn('p1', 'n1', 'n2', { displayGroup: 'pilar', deflLimit: 'none', steelSelection: { ...col } }),
      beamColumn('f1', 'n2', 'n3', { displayGroup: 'viga', deflLimit: 300, steelSelection: { ...rafter }, ltbSpacing: p.rafterLtbSpacing }),
      beamColumn('f2', 'n3', 'n4', { displayGroup: 'viga', deflLimit: 300, steelSelection: { ...rafter }, ltbSpacing: p.rafterLtbSpacing }),
      beamColumn('p2', 'n5', 'n4', { displayGroup: 'pilar', deflLimit: 'none', steelSelection: { ...col } }),
    ];
    const supports = [support2d('n1', p.baseFixity), support2d('n5', p.baseFixity)];
    const loads: Fem2DLoad[] = [];
    const lid = loadIds();
    for (const [w, lc] of [
      [p.rafterDeadLoad, 'G'],
      [p.rafterSnowLoad, 'S'],
    ] as const) {
      if (w > 0) {
        loads.push(memberUdl(lid(), 'f1', { lc, wy: -w }));
        loads.push(memberUdl(lid(), 'f2', { lc, wy: -w }));
      }
    }
    if (p.windEaveForce !== 0) loads.push(nodeLoad(lid(), 'n2', { lc: 'W', Fx: p.windEaveForce }));
    if (p.windRafterPressure !== 0) {
      // f1 runs n2→n3 (up-right); local +y points up-left (outward from the
      // roof plane), so positive pressure ONTO the roof is wy_local negative.
      loads.push(memberUdl(lid(), 'f1', { lc: 'W', frame: 'local', wy: -p.windRafterPressure }));
    }
    return fem2dModel({ templateId: 'gable', selfWeight: true, nodes, members, supports, loads });
  },
);

// ── Registry ────────────────────────────────────────────────────────────────

export const FEM2D_TEMPLATES = {
  'pratt-truss': prattTrussTemplate,
  'portal-frame': portalFrameTemplate,
  'multistory': multistoryTemplate,
  'gable': gableTemplate,
} as const;

/** Build a template with its own FTUX-green defaults (one-click landing pick).
 *  Typed switch (concrete keys) — the same dispatch pattern as buildModelFromState;
 *  it avoids collapsing the per-template param union into an intersection. */
export function buildTemplateWithDefaults(id: Fem2DTemplateId): Fem2DModel {
  switch (id) {
    case 'pratt-truss':
      return prattTrussTemplate.build(prattTrussTemplate.defaults());
    case 'portal-frame':
      return portalFrameTemplate.build(portalFrameTemplate.defaults());
    case 'multistory':
      return multistoryTemplate.build(multistoryTemplate.defaults());
    case 'gable':
      return gableTemplate.build(gableTemplate.defaults());
  }
}

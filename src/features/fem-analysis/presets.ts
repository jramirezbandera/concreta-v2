import { STEEL_CATALOG } from '../../lib/frame-core/sections';
import type {
  ArmadoHA,
  BarRole,
  DesignBar,
  DesignModel,
  FemModel,
  Material,
  RcMaterial,
  RcSection,
  SteelMaterial,
  SteelSelection,
} from './types';

// Material catalog. Mutable so users can add custom HA sections at runtime.
// Steel profile data lives in the shared frame-core STEEL_CATALOG (Lane B
// extraction, D12); the legacy SteelMaterial entries are derived from it so
// both bar modules read one table. Values are byte-identical to the old
// inline literals — pure refactor.
function steelMat(key: string): SteelMaterial {
  const p = STEEL_CATALOG[key];
  return { kind: 'steel', role: p.role, name: p.name, E: p.E, A: p.A, I: p.I, fy: p.fy, gamma: p.gamma, color: 'steel' };
}

export const MAT: Record<string, Material> = {
  // EVERY key of the shared catalog resolves (full IPE/HEA/HEB/IPN series,
  // 2UPN, SHS/RHS/CHS tubes, L 80×8). The embedded 1D panel reconstructs
  // profileKey from tipo+size ('steel_HEA200') — before this derivation a
  // key outside the 9 literals produced a silent EI = 0 rubber bar.
  ...Object.fromEntries(Object.keys(STEEL_CATALOG).map((k) => [k, steelMat(k)])),
  rc_30x50:     { kind: 'rc',    role: 'viga',  name: 'HA 30×50', E: 30000, b: 30, h: 50, A: 1500, I: 312500, fck: 25, gamma: 1.5, color: 'rc' },
  rc_25x40:     { kind: 'rc',    role: 'viga',  name: 'HA 25×40', E: 30000, b: 25, h: 40, A: 1000, I: 133333, fck: 25, gamma: 1.5, color: 'rc' },
};

export const STEEL_PROFILES: Record<BarRole, string[]> = {
  viga:  ['steel_IPE200', 'steel_IPE240', 'steel_IPE300', 'steel_IPE360', 'steel_L80x8'],
  pilar: ['steel_HEB160', 'steel_HEB200', 'steel_HEB240', 'steel_HEB300'],
};

export const FCK_OPTIONS = [25, 30, 35, 40, 45, 50];

// Mutates MAT in place; returns the key.
export function setRcCustom(barId: string, b_cm: number, h_cm: number, fck: number, role: BarRole): string {
  const key = `rc_custom_${barId}`;
  const mat: RcMaterial = {
    kind: 'rc',
    role,
    name: `HA ${b_cm}×${h_cm}`,
    E: Math.round(8500 * Math.cbrt(fck + 8)),
    b: b_cm,
    h: h_cm,
    A: b_cm * h_cm,
    I: Math.round((b_cm * Math.pow(h_cm, 3)) / 12),
    fck,
    gamma: 1.5,
    color: 'rc',
  };
  MAT[key] = mat;
  return key;
}

export function isSteel(mat: Material | undefined): mat is SteelMaterial {
  return !!mat && mat.kind === 'steel';
}
export function isRc(mat: Material | undefined): mat is RcMaterial {
  return !!mat && mat.kind === 'rc';
}

export type PresetId = 'beam' | 'cantilever' | 'continuous' | 'truss' | 'frame' | 'multistory' | 'gable';

type PresetTemplate = {
  name: string;
  code: PresetId;
  nodes: FemModel['nodes'];
  bars: FemModel['bars'];
  supports: FemModel['supports'];
  loads: FemModel['loads'];
};

export const PRESETS: Record<PresetId, PresetTemplate> = {
  beam: {
    name: 'Viga simplemente apoyada',
    code: 'beam',
    nodes: [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 },
    ],
    bars: [
      { id: 'b1', i: 'n1', j: 'n2', mat: 'rc_30x50' },
    ],
    supports: [
      { node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 25, dir: '-y' },
    ],
  },
  cantilever: {
    name: 'Ménsula',
    code: 'cantilever',
    nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 3, y: 0 }],
    bars: [{ id: 'b1', i: 'n1', j: 'n2', mat: 'steel_IPE240' }],
    supports: [{ node: 'n1', type: 'fixed' }],
    loads: [{ id: 'l1', kind: 'point-bar', lc: 'Q', bar: 'b1', pos: 1, P: 15, dir: '-y' }],
  },
  continuous: {
    name: 'Viga continua 3 vanos',
    code: 'continuous',
    nodes: [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 5, y: 0 },
      { id: 'n3', x: 10, y: 0 }, { id: 'n4', x: 15, y: 0 },
    ],
    bars: [
      { id: 'b1', i: 'n1', j: 'n2', mat: 'rc_30x50' },
      { id: 'b2', i: 'n2', j: 'n3', mat: 'rc_30x50' },
      { id: 'b3', i: 'n3', j: 'n4', mat: 'rc_30x50' },
    ],
    supports: [
      { node: 'n1', type: 'pinned' }, { node: 'n2', type: 'roller' },
      { node: 'n3', type: 'roller' }, { node: 'n4', type: 'roller' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 30, dir: '-y' },
      { id: 'l2', kind: 'udl', lc: 'G', bar: 'b2', w: 30, dir: '-y' },
      { id: 'l3', kind: 'udl', lc: 'G', bar: 'b3', w: 30, dir: '-y' },
    ],
  },
  truss: {
    name: 'Cercha Pratt',
    code: 'truss',
    nodes: [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 2, y: 0 }, { id: 'n3', x: 4, y: 0 }, { id: 'n4', x: 6, y: 0 }, { id: 'n5', x: 8, y: 0 },
      { id: 'n6', x: 2, y: 1.5 }, { id: 'n7', x: 4, y: 1.5 }, { id: 'n8', x: 6, y: 1.5 },
    ],
    bars: [
      { id: 'b1', i: 'n1', j: 'n2', mat: 'steel_L80x8' },
      { id: 'b2', i: 'n2', j: 'n3', mat: 'steel_L80x8' },
      { id: 'b3', i: 'n3', j: 'n4', mat: 'steel_L80x8' },
      { id: 'b4', i: 'n4', j: 'n5', mat: 'steel_L80x8' },
      { id: 'b5', i: 'n6', j: 'n7', mat: 'steel_L80x8' },
      { id: 'b6', i: 'n7', j: 'n8', mat: 'steel_L80x8' },
      { id: 'b7', i: 'n2', j: 'n6', mat: 'steel_L80x8' },
      { id: 'b8', i: 'n3', j: 'n7', mat: 'steel_L80x8' },
      { id: 'b9', i: 'n4', j: 'n8', mat: 'steel_L80x8' },
      { id: 'b10', i: 'n1', j: 'n6', mat: 'steel_L80x8' },
      { id: 'b11', i: 'n6', j: 'n3', mat: 'steel_L80x8' },
      { id: 'b12', i: 'n8', j: 'n3', mat: 'steel_L80x8' },
      { id: 'b13', i: 'n8', j: 'n5', mat: 'steel_L80x8' },
    ],
    supports: [
      { node: 'n1', type: 'pinned' }, { node: 'n5', type: 'roller' },
    ],
    loads: [
      { id: 'l1', kind: 'point-node', lc: 'Q', node: 'n6', Py: 20 },
      { id: 'l2', kind: 'point-node', lc: 'Q', node: 'n7', Py: 20 },
      { id: 'l3', kind: 'point-node', lc: 'Q', node: 'n8', Py: 20 },
    ],
  },
  frame: {
    name: 'Pórtico simple',
    code: 'frame',
    nodes: [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 0, y: 3.5 },
      { id: 'n3', x: 6, y: 3.5 }, { id: 'n4', x: 6, y: 0 },
    ],
    bars: [
      { id: 'b1', i: 'n1', j: 'n2', mat: 'steel_HEB200' },
      { id: 'b2', i: 'n2', j: 'n3', mat: 'steel_IPE240' },
      { id: 'b3', i: 'n3', j: 'n4', mat: 'steel_HEB200' },
    ],
    supports: [
      { node: 'n1', type: 'fixed' }, { node: 'n4', type: 'fixed' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b2', w: 18, dir: '-y' },
      { id: 'l2', kind: 'point-node', lc: 'W', node: 'n2', Px: 8 },
    ],
  },
  multistory: {
    name: 'Pórtico 2 plantas',
    code: 'multistory',
    nodes: [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 5, y: 0 },
      { id: 'n3', x: 0, y: 3.2 }, { id: 'n4', x: 5, y: 3.2 },
      { id: 'n5', x: 0, y: 6.4 }, { id: 'n6', x: 5, y: 6.4 },
    ],
    bars: [
      { id: 'b1', i: 'n1', j: 'n3', mat: 'steel_HEB200' },
      { id: 'b2', i: 'n2', j: 'n4', mat: 'steel_HEB200' },
      { id: 'b3', i: 'n3', j: 'n4', mat: 'steel_IPE240' },
      { id: 'b4', i: 'n3', j: 'n5', mat: 'steel_HEB200' },
      { id: 'b5', i: 'n4', j: 'n6', mat: 'steel_HEB200' },
      { id: 'b6', i: 'n5', j: 'n6', mat: 'steel_IPE240' },
    ],
    supports: [
      { node: 'n1', type: 'fixed' }, { node: 'n2', type: 'fixed' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b3', w: 22, dir: '-y' },
      { id: 'l2', kind: 'udl', lc: 'G', bar: 'b6', w: 22, dir: '-y' },
      { id: 'l3', kind: 'point-node', lc: 'W', node: 'n3', Px: 6 },
      { id: 'l4', kind: 'point-node', lc: 'W', node: 'n5', Px: 10 },
    ],
  },
  gable: {
    name: 'Pórtico a dos aguas',
    code: 'gable',
    nodes: [
      { id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 0, y: 3 },
      { id: 'n3', x: 4, y: 4.2 }, { id: 'n4', x: 8, y: 3 }, { id: 'n5', x: 8, y: 0 },
    ],
    bars: [
      { id: 'b1', i: 'n1', j: 'n2', mat: 'steel_HEB200' },
      { id: 'b2', i: 'n2', j: 'n3', mat: 'steel_IPE240' },
      { id: 'b3', i: 'n3', j: 'n4', mat: 'steel_IPE240' },
      { id: 'b4', i: 'n4', j: 'n5', mat: 'steel_HEB200' },
    ],
    supports: [
      { node: 'n1', type: 'pinned' }, { node: 'n5', type: 'pinned' },
    ],
    loads: [
      { id: 'l1', kind: 'udl', lc: 'G', bar: 'b2', w: 12, dir: '-y' },
      { id: 'l2', kind: 'udl', lc: 'G', bar: 'b3', w: 12, dir: '-y' },
    ],
  },
};

export function clonePreset(id: PresetId): FemModel {
  const p = PRESETS[id];
  return JSON.parse(JSON.stringify({
    presetCode: p.code,
    combo: 'ELU',
    selfWeight: false,
    nodes: p.nodes,
    bars: p.bars,
    supports: p.supports,
    loads: p.loads,
  })) as FemModel;
}

// ── Design-model presets (V1 — Lane B.2 refactor) ───────────────────────────
//
// Replaces the legacy MAT-mutation approach with self-contained DesignBar
// shapes that carry their own rcSection / steelSelection. Used by the new
// Lane B UI; the legacy `clonePreset` above is retained for backward compat
// while Canvas/InputsPanel are still on the old shape.
//
// V1 ships only `beam`, `cantilever`, `continuous`. The other 4 plantillas
// (truss, frame, multistory, gable) require non-collinear topology that the
// V1 strip-layout solver doesn't handle yet — kept in PRESETS for V2 unlock.

export const DEFAULT_RC_SECTION: RcSection = {
  b: 30, h: 50, fck: 25, fyk: 500, cover: 30,
  exposureClass: 'XC1', loadType: 'B',
};

export const DEFAULT_STEEL_SELECTION: SteelSelection = {
  profileKey: 'steel_IPE240',
  steel: 'S275',
  beamType: 'ss',
  deflLimit: 300,
  elsCombo: 'characteristic',
  useCategory: 'B',
};

/**
 * FTUX defaults for vano + apoyo armado. Picked so the FTUX continuous-beam
 * preset produces a CUMPLE verdict at ~70% η so the user sees green
 * immediately, and any reasonable load tweak keeps the verdict meaningful.
 */
const FTUX_VANO_ARMADO: ArmadoHA = {
  tens_nBars: 4, tens_barDiam: 16,
  comp_nBars: 2, comp_barDiam: 12,
  stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2,
};
const FTUX_APOYO_ARMADO: ArmadoHA = {
  tens_nBars: 3, tens_barDiam: 16,
  comp_nBars: 2, comp_barDiam: 12,
  stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2,
};

function rcDesignBar(id: string, i: string, j: string): DesignBar {
  return {
    id, i, j,
    material: 'rc',
    rcSection: { ...DEFAULT_RC_SECTION },
    vano_armado: { ...FTUX_VANO_ARMADO },
    apoyo_armado: { ...FTUX_APOYO_ARMADO },
    internalHinges: { i: false, j: false },
  };
}

function steelDesignBar(
  id: string, i: string, j: string,
  beamType: 'ss' | 'cantilever' | 'fp' | 'ff' = 'ss',
): DesignBar {
  return {
    id, i, j,
    material: 'steel',
    steelSelection: { ...DEFAULT_STEEL_SELECTION, beamType },
    internalHinges: { i: false, j: false },
  };
}

export type DesignPresetId = 'beam' | 'cantilever' | 'continuous';

interface DesignPresetTemplate {
  id: DesignPresetId;
  name: string;
  description: string;
  build: () => DesignModel;
}

export const DESIGN_PRESETS: Record<DesignPresetId, DesignPresetTemplate> = {
  beam: {
    id: 'beam',
    name: 'Viga simple',
    description: 'Apoyada–rodillo, vano único bajo carga repartida.',
    build: (): DesignModel => ({
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: true,
      nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 }],
      bars: [rcDesignBar('b1', 'n1', 'n2')],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
      ],
      loads: [
        { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 25, dir: '-y' },
      ],
    }),
  },
  cantilever: {
    id: 'cantilever',
    name: 'Ménsula',
    description: 'Empotrada en un extremo, libre en el otro.',
    build: (): DesignModel => ({
      presetCode: 'cantilever',
      combo: 'ELU',
      selfWeight: true,
      nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 3, y: 0 }],
      bars: [steelDesignBar('b1', 'n1', 'n2', 'cantilever')],
      supports: [{ node: 'n1', type: 'fixed' }],
      loads: [
        { id: 'l1', kind: 'point-node', lc: 'Q', useCategory: 'B', node: 'n2', Py: 15 },
      ],
    }),
  },
  continuous: {
    id: 'continuous',
    name: 'Viga continua',
    description: 'Tres vanos sobre cuatro apoyos, carga repartida.',
    build: (): DesignModel => ({
      presetCode: 'continuous',
      combo: 'ELU',
      selfWeight: true,
      nodes: [
        { id: 'n1', x: 0, y: 0 },
        { id: 'n2', x: 5, y: 0 },
        { id: 'n3', x: 10, y: 0 },
        { id: 'n4', x: 15, y: 0 },
      ],
      bars: [
        rcDesignBar('b1', 'n1', 'n2'),
        rcDesignBar('b2', 'n2', 'n3'),
        rcDesignBar('b3', 'n3', 'n4'),
      ],
      supports: [
        { node: 'n1', type: 'pinned' },
        { node: 'n2', type: 'roller' },
        { node: 'n3', type: 'roller' },
        { node: 'n4', type: 'roller' },
      ],
      loads: [
        // Initialised at 10 kN/m: a light load so the canonical continuous-beam
        // preset opens well inside CUMPLE (green on first load — the intended
        // FTUX; see FTUX_*_ARMADO note above). Earlier 30 kN/m landed on
        // INCUMPLE 102% (interior-support hogging governed).
        { id: 'l1', kind: 'udl', lc: 'G', bar: 'b1', w: 10, dir: '-y' },
        { id: 'l2', kind: 'udl', lc: 'G', bar: 'b2', w: 10, dir: '-y' },
        { id: 'l3', kind: 'udl', lc: 'G', bar: 'b3', w: 10, dir: '-y' },
      ],
    }),
  },
};

export function cloneDesignPreset(id: DesignPresetId): DesignModel {
  return DESIGN_PRESETS[id].build();
}

/**
 * Default armado used as a starting point when the user converts a fresh bar
 * to HA via the panel. Exported so the InputsPanel can offer a "rellenar
 * armado" affordance instead of starting with undefined fields (which keeps
 * the bar in 'pending' state until the user enters values).
 */
export const DEFAULT_VANO_ARMADO = FTUX_VANO_ARMADO;
export const DEFAULT_APOYO_ARMADO = FTUX_APOYO_ARMADO;

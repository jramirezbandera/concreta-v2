// Unified named steel-profile registry — ONE catalog for the whole app.
//
// Sources:
//   - I/H families (IPE / IPN / HEA / HEB): data/steelProfiles.ts tables.
//   - 2UPN closed boxes: derived from the UPN table via buildUPNBox.
//   - SHS / RHS / CHS tubes: parametric adapters over the curated commercial
//     size lists below (cold-formed EN 10219 by default — the standalone
//     column/beam modules still allow the hot-finished process parametrically).
//   - L 80×8: literal axial-only entry (fem2d truss webs) — no adapter.
//
// The canonical key format is the historic frame-core one ('steel_IPE240').
// FEM 1D/2D models serialize these keys in URLs → keys are FOREVER: never
// rename or repurpose one. frame-core/sections.ts derives its STEEL_CATALOG
// (solver stiffness + self-weight) from this registry.

import { STEEL_PROFILES, UPN_PROFILES, buildUPNBox } from '../../data/steelProfiles';
import { CHSAdapter } from './chs';
import { RHSAdapter } from './rhs';
import type { SectionDescriptor } from './index';

export type SteelFamily = 'IPE' | 'HEA' | 'HEB' | 'IPN' | '2UPN' | 'SHS' | 'RHS' | 'CHS' | 'L';

/** UI order: open I/H families first, then closed/composed, angles last. */
export const STEEL_FAMILIES: readonly SteelFamily[] = [
  'IPE', 'HEA', 'HEB', 'IPN', '2UPN', 'SHS', 'RHS', 'CHS', 'L',
];

export interface SteelCatalogEntry {
  /** Canonical serialized key ('steel_IPE240', 'steel_SHS100x100x5', …). */
  key: string;
  family: SteelFamily;
  /** Short human label for selects/results ('IPE 240', 'SHS 100×100×5'). */
  label: string;
  /** Second-select label within the family ('240', '100×100×5', 'Ø168.3×5'). */
  sizeLabel: string;
  /** Default duty — drives 1D MAT grouping and template defaults. */
  role: 'viga' | 'pilar';
  /** null solo para L (sin adapter ColumnBeamSection — solo axil). */
  descriptor: SectionDescriptor | null;
  A: number;   // cm²
  Iy: number;  // cm⁴ — major axis
  Iz: number;  // cm⁴ — minor axis (v-v minimum for L angles)
}

const FAMILY_ROLE: Record<SteelFamily, 'viga' | 'pilar'> = {
  IPE: 'viga', IPN: 'viga', HEA: 'pilar', HEB: 'pilar',
  '2UPN': 'pilar', SHS: 'pilar', RHS: 'viga', CHS: 'pilar', L: 'viga',
};

// ── Curated commercial tube sizes (EN 10219 cold-formed) ────────────────────
// [size, t] for SHS; [h, b, t] for RHS; [D, t] for CHS. Kept deliberately
// short — these feed named catalog entries (selects, FEM, AI enum); the
// standalone modules remain fully parametric.

const SHS_COMMERCIAL: ReadonlyArray<[number, number]> = [
  [40, 3], [50, 3], [50, 4], [60, 3], [60, 4], [70, 4], [80, 4], [80, 5],
  [90, 4], [100, 4], [100, 5], [100, 6], [120, 5], [120, 6], [120, 8],
  [140, 5], [140, 6], [150, 5], [150, 6], [150, 8], [160, 6], [160, 8],
  [180, 6], [180, 8], [200, 6], [200, 8], [200, 10], [250, 8], [250, 10],
  [300, 10], [300, 12],
];

const RHS_COMMERCIAL: ReadonlyArray<[number, number, number]> = [
  [60, 40, 3], [80, 40, 3], [80, 40, 4], [100, 50, 3], [100, 50, 4],
  [100, 60, 4], [120, 60, 4], [120, 60, 5], [120, 80, 5], [140, 80, 5],
  [150, 100, 5], [150, 100, 6], [160, 80, 5], [160, 80, 6], [180, 100, 6],
  [180, 100, 8], [200, 100, 6], [200, 100, 8], [200, 120, 6], [200, 120, 8],
  [250, 150, 8], [250, 150, 10], [300, 200, 8], [300, 200, 10],
  [350, 250, 10], [400, 200, 10], [400, 200, 12],
];

const CHS_COMMERCIAL: ReadonlyArray<[number, number]> = [
  [48.3, 3.2], [60.3, 3.6], [76.1, 4], [88.9, 4], [101.6, 4], [114.3, 4],
  [139.7, 5], [168.3, 5], [168.3, 8], [193.7, 6], [219.1, 6], [219.1, 8],
  [244.5, 8], [273, 8], [323.9, 10], [355.6, 10], [406.4, 10], [457, 10],
  [508, 12],
];

/** Neat number for keys/labels: '168.3' keeps its decimal, '273' stays bare. */
function dim(v: number): string {
  return String(v);
}

function buildEntries(): SteelCatalogEntry[] {
  const entries: SteelCatalogEntry[] = [];

  for (const p of STEEL_PROFILES) {
    entries.push({
      key: `steel_${p.tipo}${p.size}`,
      family: p.tipo,
      label: p.label,
      sizeLabel: String(p.size),
      role: FAMILY_ROLE[p.tipo],
      descriptor: { kind: 'I', tipo: p.tipo, size: p.size },
      A: p.A, Iy: p.Iy, Iz: p.Iz,
    });
  }

  for (const u of UPN_PROFILES) {
    const box = buildUPNBox(u.size);
    if (!box) continue;
    entries.push({
      key: `steel_2UPN${u.size}`,
      family: '2UPN',
      label: `2UPN ${u.size}`,
      sizeLabel: String(u.size),
      role: FAMILY_ROLE['2UPN'],
      descriptor: { kind: '2UPN', size: u.size },
      A: box.A, Iy: box.Iy, Iz: box.Iz,
    });
  }

  for (const [size, t] of SHS_COMMERCIAL) {
    const s = new RHSAdapter({ h: size, b: size, t, process: 'cold-formed' });
    entries.push({
      key: `steel_SHS${size}x${size}x${dim(t)}`,
      family: 'SHS',
      label: `SHS ${size}×${size}×${dim(t)}`,
      sizeLabel: `${size}×${size}×${dim(t)}`,
      role: FAMILY_ROLE.SHS,
      descriptor: { kind: 'RHS', h: size, b: size, t, process: 'cold-formed' },
      A: s.A, Iy: s.Iy, Iz: s.Iz,
    });
  }

  for (const [h, b, t] of RHS_COMMERCIAL) {
    const s = new RHSAdapter({ h, b, t, process: 'cold-formed' });
    entries.push({
      key: `steel_RHS${h}x${b}x${dim(t)}`,
      family: 'RHS',
      label: `RHS ${h}×${b}×${dim(t)}`,
      sizeLabel: `${h}×${b}×${dim(t)}`,
      role: FAMILY_ROLE.RHS,
      descriptor: { kind: 'RHS', h, b, t, process: 'cold-formed' },
      A: s.A, Iy: s.Iy, Iz: s.Iz,
    });
  }

  for (const [D, t] of CHS_COMMERCIAL) {
    const s = new CHSAdapter({ D, t, process: 'cold-formed' });
    entries.push({
      key: `steel_CHS${dim(D)}x${dim(t)}`,
      family: 'CHS',
      label: `CHS Ø${dim(D)}×${dim(t)}`,
      sizeLabel: `Ø${dim(D)}×${dim(t)}`,
      role: FAMILY_ROLE.CHS,
      descriptor: { kind: 'CHS', D, t, process: 'cold-formed' },
      A: s.A, Iy: s.Iy, Iz: s.Iz,
    });
  }

  // L 80×8 — historic truss-web angle. Iz is the v-v MINIMUM axis (i ≈ 1.55
  // cm): the axial buckling check must use it. No ColumnBeamSection adapter
  // (bending engines reject it); values verbatim from the old frame-core
  // literal catalog.
  entries.push({
    key: 'steel_L80x8',
    family: 'L',
    label: 'L 80×8',
    sizeLabel: '80×8',
    role: FAMILY_ROLE.L,
    descriptor: null,
    A: 12.3, Iy: 73.7, Iz: 29.5,
  });

  return entries;
}

export const STEEL_SECTION_ENTRIES: readonly SteelCatalogEntry[] = buildEntries();

const BY_KEY = new Map(STEEL_SECTION_ENTRIES.map((e) => [e.key, e]));

export function getSteelEntry(key: string): SteelCatalogEntry | undefined {
  return BY_KEY.get(key);
}

export function steelEntriesByFamily(family: SteelFamily): SteelCatalogEntry[] {
  return STEEL_SECTION_ENTRIES.filter((e) => e.family === family);
}

/** Descriptor for the check engines. undefined = unknown key; null = known
 *  axial-only entry (L angle) with no bending adapter. */
export function descriptorForKey(key: string): SectionDescriptor | null | undefined {
  const e = BY_KEY.get(key);
  return e === undefined ? undefined : e.descriptor;
}

/** Family of a catalog key ('steel_IPE240' → 'IPE'); undefined if unknown. */
export function familyOfKey(key: string): SteelFamily | undefined {
  return BY_KEY.get(key)?.family;
}

/**
 * Nearest entry within `family` to the given key's size — used by the
 * familia+tamaño selects so switching family keeps "about the same size".
 * Compared by major-axis inertia: the closest structural size proxy that is
 * well-defined across shapes (mm designations aren't comparable tube vs I).
 */
export function nearestInFamily(family: SteelFamily, currentKey: string): SteelCatalogEntry {
  const entries = steelEntriesByFamily(family);
  const cur = BY_KEY.get(currentKey);
  if (!cur) return entries[0];
  let best = entries[0];
  let bestDiff = Infinity;
  for (const e of entries) {
    const diff = Math.abs(Math.log(e.Iy / cur.Iy));
    if (diff < bestDiff) { bestDiff = diff; best = e; }
  }
  return best;
}

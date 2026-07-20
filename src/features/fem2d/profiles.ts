// FEM 2D — profile family lists for the two-step selects (template forms +
// member inspector). The registry helpers (familyOfKey / nearestInFamily /
// steelEntriesByFamily) live in lib/sections/catalog.ts and are re-exported
// here so fem2d components keep a single local import.
//
// Bending members (beam-column: pilares/vigas/cordones) accept every family
// with a ColumnBeamSection adapter (I/H, 2UPN, SHS/RHS/CHS). Angles (L) are
// axial-only and belong to the two-force selector exclusively — the bending
// engines reject them (contrato F1: pending, never green).

import { STEEL_FAMILIES, type SteelFamily } from '../../lib/sections';

export {
  familyOfKey,
  getSteelEntry,
  nearestInFamily,
  steelEntriesByFamily,
} from '../../lib/sections';
export type { SteelFamily, SteelCatalogEntry } from '../../lib/sections';

/** Families offered on beam-column members (bending engines route them). */
export const BENDING_FAMILIES: readonly SteelFamily[] =
  STEEL_FAMILIES.filter((f) => f !== 'L');

/** Families offered on two-force members (axial check only needs A + Iz). */
export const AXIAL_FAMILIES: readonly SteelFamily[] = STEEL_FAMILIES;

// Public barrel for the polymorphic cross-section layer.

export type {
  SectionKind,
  SectionGeometry,
  ColumnBeamSection,
  CrossSectionPrimitives,
  Shape,
  ReducedMoments,
} from './types';

export { ISectionAdapter, makeISectionBySize } from './iSection';
export { UPNBoxAdapter, makeUPNBoxBySize } from './upnBox';
export {
  CHSAdapter,
  makeCHS,
  CHS_COMMERCIAL_DIAMETERS,
  CHS_COMMERCIAL_THICKNESSES,
} from './chs';
export type { CHSProcess, CHSInputs } from './chs';
export { RHSAdapter, makeRHS } from './rhs';
export type { RHSProcess, RHSInputs } from './rhs';
export { sectionOutline, outlinePathD } from './outline';
export type { SectionOutline, OutlineContour, OutlineSegment, OutlineGeometry } from './outline';
export {
  STEEL_FAMILIES,
  STEEL_SECTION_ENTRIES,
  getSteelEntry,
  steelEntriesByFamily,
  descriptorForKey,
  familyOfKey,
  nearestInFamily,
} from './catalog';
export type { SteelFamily, SteelCatalogEntry } from './catalog';

import { makeISectionBySize } from './iSection';
import { makeUPNBoxBySize } from './upnBox';
import { makeCHS, type CHSProcess } from './chs';
import { makeRHS, type RHSProcess } from './rhs';
import type { ColumnBeamSection } from './types';

/** Discriminated descriptor used as a single-entry factory input. */
export type SectionDescriptor =
  | { kind: 'I'; tipo: 'IPE' | 'HEA' | 'HEB' | 'IPN'; size: number }
  | { kind: '2UPN'; size: number }
  | { kind: 'CHS'; D: number; t: number; process: CHSProcess }
  | { kind: 'RHS'; h: number; b: number; t: number; process: RHSProcess };

/**
 * Factory — returns the right ColumnBeamSection adapter or `undefined` when
 * the descriptor refers to an unknown catalog entry.
 */
export function createSection(d: SectionDescriptor): ColumnBeamSection | undefined {
  switch (d.kind) {
    case 'I':    return makeISectionBySize(d.tipo, d.size);
    case '2UPN': return makeUPNBoxBySize(d.size);
    case 'CHS':  return makeCHS(d.D, d.t, d.process);
    case 'RHS':  return makeRHS(d.h, d.b, d.t, d.process);
  }
}

// FEM 2D — profile option lists for selects (template forms + member inspector).
//
// Bending members (columns/beams/chords) take an I/H profile; angles (L) are
// axial-only and belong to the web/two-force selector. IPN is kept out of the
// column engine upstream but is valid geometry, so it stays selectable.

import { STEEL_CATALOG } from '../../lib/frame-core/sections';

export const BENDING_PROFILES = Object.keys(STEEL_CATALOG).filter((k) => /_(IPE|HEB|HEA|IPN)\d/.test(k));
export const ALL_PROFILES = Object.keys(STEEL_CATALOG);

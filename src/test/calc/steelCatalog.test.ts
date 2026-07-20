// Unified steel catalog (lib/sections/catalog.ts) + derived frame-core
// STEEL_CATALOG. Three contracts:
//   1. The 9 historic literal keys resolve to the exact pre-derivation values
//      (FEM 1D/2D models serialized in URLs keep solving identically).
//   2. Every profileKey the 1D embedded panel can construct
//      ('steel_<TIPO><SIZE>' over the full I/H tables) resolves with real
//      stiffness — the silent EI = 0 rubber-bar hole is closed.
//   3. Registry invariants: unique keys, descriptors resolve via
//      createSection, Iz stored in frame-core is the MINIMUM axis.

import { describe, it, expect } from 'vitest';
import {
  STEEL_SECTION_ENTRIES,
  STEEL_FAMILIES,
  getSteelEntry,
  steelEntriesByFamily,
  descriptorForKey,
  nearestInFamily,
  createSection,
} from '../../lib/sections';
import { STEEL_CATALOG, steelStiffness, steelSelfWeight } from '../../lib/frame-core/sections';
import { getSizesForTipo } from '../../data/steelProfiles';

// Old frame-core literal table (pre-derivation), copied verbatim.
const LEGACY: Record<string, { name: string; role: string; A: number; I: number; Iz: number }> = {
  steel_IPE200: { name: 'IPE 200', role: 'viga',  A: 28.5, I: 1943,  Iz: 142.4 },
  steel_IPE240: { name: 'IPE 240', role: 'viga',  A: 39.1, I: 3892,  Iz: 283.6 },
  steel_IPE300: { name: 'IPE 300', role: 'viga',  A: 53.8, I: 8356,  Iz: 603.8 },
  steel_IPE360: { name: 'IPE 360', role: 'viga',  A: 72.7, I: 16270, Iz: 1043 },
  steel_HEB160: { name: 'HEB 160', role: 'pilar', A: 54.3, I: 2492,  Iz: 889.2 },
  steel_HEB200: { name: 'HEB 200', role: 'pilar', A: 78.1, I: 5696,  Iz: 2003 },
  steel_HEB240: { name: 'HEB 240', role: 'pilar', A: 106,  I: 11260, Iz: 3923 },
  steel_HEB300: { name: 'HEB 300', role: 'pilar', A: 149,  I: 25170, Iz: 8563 },
  steel_L80x8:  { name: 'L 80×8',  role: 'viga',  A: 12.3, I: 73.7,  Iz: 29.5 },
};

describe('derived STEEL_CATALOG — legacy key equivalence', () => {
  for (const [key, exp] of Object.entries(LEGACY)) {
    it(`${key} keeps its literal values`, () => {
      const p = STEEL_CATALOG[key];
      expect(p).toBeDefined();
      expect(p.name).toBe(exp.name);
      expect(p.role).toBe(exp.role);
      expect(p.A).toBe(exp.A);
      expect(p.I).toBe(exp.I);
      expect(p.Iz).toBe(exp.Iz);
      expect(p.E).toBe(210000);
      expect(p.fy).toBe(275);
      expect(p.gamma).toBe(1.05);
    });
  }
});

describe('EI = 0 hole closed — every UI-reachable key resolves', () => {
  for (const tipo of ['IPE', 'HEA', 'HEB', 'IPN'] as const) {
    it(`all ${tipo} sizes have stiffness and self-weight`, () => {
      for (const size of getSizesForTipo(tipo)) {
        const key = `steel_${tipo}${size}`;
        const st = steelStiffness(key);
        expect(st, key).not.toBeNull();
        expect(st!.EI).toBeGreaterThan(0);
        expect(st!.EA).toBeGreaterThan(0);
        expect(steelSelfWeight(key)).toBeGreaterThan(0);
      }
    });
  }

  it('tube and 2UPN entries resolve too', () => {
    for (const e of STEEL_SECTION_ENTRIES) {
      const st = steelStiffness(e.key);
      expect(st, e.key).not.toBeNull();
      expect(st!.EI, e.key).toBeGreaterThan(0);
    }
  });
});

describe('registry invariants', () => {
  it('keys are unique', () => {
    const keys = STEEL_SECTION_ENTRIES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every family has entries and every entry belongs to a listed family', () => {
    for (const f of STEEL_FAMILIES) {
      expect(steelEntriesByFamily(f).length, f).toBeGreaterThan(0);
    }
    for (const e of STEEL_SECTION_ENTRIES) {
      expect(STEEL_FAMILIES).toContain(e.family);
    }
  });

  it('every non-L descriptor resolves via createSection with matching props', () => {
    for (const e of STEEL_SECTION_ENTRIES) {
      if (e.family === 'L') {
        expect(e.descriptor).toBeNull();
        continue;
      }
      expect(e.descriptor, e.key).not.toBeNull();
      const s = createSection(e.descriptor!);
      expect(s, e.key).toBeDefined();
      expect(s!.A).toBeCloseTo(e.A, 6);
      expect(s!.Iy).toBeCloseTo(e.Iy, 4);
      expect(s!.Iz).toBeCloseTo(e.Iz, 4);
    }
  });

  it('frame-core Iz is the MINIMUM axis (2UPN boxes can have Iz_box > Iy)', () => {
    for (const e of STEEL_SECTION_ENTRIES) {
      expect(STEEL_CATALOG[e.key].Iz).toBeCloseTo(Math.min(e.Iy, e.Iz), 6);
    }
    // Concrete case: small 2UPN boxes are wider than tall → Iz_box > Iy.
    const box80 = getSteelEntry('steel_2UPN80')!;
    expect(box80.Iz).toBeGreaterThan(box80.Iy);
    expect(STEEL_CATALOG.steel_2UPN80.Iz).toBeCloseTo(box80.Iy, 6);
  });

  it('descriptorForKey: undefined for unknown, null for L, descriptor otherwise', () => {
    expect(descriptorForKey('steel_NOPE123')).toBeUndefined();
    expect(descriptorForKey('steel_L80x8')).toBeNull();
    expect(descriptorForKey('steel_IPE300')).toEqual({ kind: 'I', tipo: 'IPE', size: 300 });
    expect(descriptorForKey('steel_SHS100x100x5')).toEqual({
      kind: 'RHS', h: 100, b: 100, t: 5, process: 'cold-formed',
    });
    expect(descriptorForKey('steel_CHS168.3x8')).toEqual({
      kind: 'CHS', D: 168.3, t: 8, process: 'cold-formed',
    });
  });

  it('nearestInFamily lands on a similar-stiffness entry', () => {
    // IPE 300 (Iy 8356) → nearest HEB should be HEB 240 (11260) or HEB 220 (8091).
    const near = nearestInFamily('HEB', 'steel_IPE300');
    expect(['steel_HEB220', 'steel_HEB240']).toContain(near.key);
    // Unknown current key falls back to the family's first entry.
    expect(nearestInFamily('IPE', 'steel_NOPE').key).toBe('steel_IPE80');
  });
});

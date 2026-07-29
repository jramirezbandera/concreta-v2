// FEM 2D — parametric template tests (Lane A)
//
// Every template is checked for: geometry, roles/element types, supports,
// load layout, the ΣF invariant (total applied force per load case must match
// the parameter inputs EXACTLY — this is what catches tributary-share double
// counting), determinism, param validation, and basic model validity.

import { describe, expect, it } from 'vitest';
import { memberLength, validateModel2DBasic } from '../../features/fem2d/builder';
import { memberFormulation } from '../../features/fem2d/decompose';
import {
  FEM2D_TEMPLATES,
  gableTemplate,
  multistoryTemplate,
  portalFrameTemplate,
  prattTrussTemplate,
} from '../../features/fem2d/templates';
import type { Fem2DModel, LoadCase } from '../../features/fem2d/types';
import { STEEL_CATALOG } from '../../lib/frame-core/sections';

// ── ΣF helper ───────────────────────────────────────────────────────────────
//
// Resolves every load of a case to GLOBAL components. Local-frame loads are
// rotated with the member direction: for a member at angle θ (i→j),
// x̂_local = (cosθ, sinθ) and ŷ_local = (−sinθ, cosθ).

function sumF(model: Fem2DModel, lc: LoadCase): { Fx: number; Fy: number } {
  let Fx = 0;
  let Fy = 0;
  for (const ld of model.loads) {
    if (ld.lc !== lc) continue;
    if (ld.kind === 'node') {
      Fx += ld.Fx;
      Fy += ld.Fy;
      continue;
    }
    const member = model.members.find((m) => m.id === ld.member)!;
    expect(member).toBeDefined();
    const L = memberLength(model, member);
    const frac = ld.kind === 'udl' ? (ld.to ?? 1) - (ld.from ?? 0) : 0;
    const [fx, fy] = ld.kind === 'udl' ? [ld.wx * L * frac, ld.wy * L * frac] : [ld.Fx, ld.Fy];
    if (ld.frame === 'global') {
      Fx += fx;
      Fy += fy;
    } else {
      const ni = model.nodes.find((n) => n.id === member.i)!;
      const nj = model.nodes.find((n) => n.id === member.j)!;
      const theta = Math.atan2(nj.y - ni.y, nj.x - ni.x);
      Fx += fx * Math.cos(theta) - fy * Math.sin(theta);
      Fy += fx * Math.sin(theta) + fy * Math.cos(theta);
    }
  }
  return { Fx, Fy };
}

// ── Cross-template invariants ───────────────────────────────────────────────

describe('all templates', () => {
  for (const [key, template] of Object.entries(FEM2D_TEMPLATES)) {
    describe(key, () => {
      it('registry key matches template id', () => {
        expect(template.id).toBe(key);
      });

      it('defaults build a valid model with correct provenance', () => {
        const model = template.build(template.defaults() as never);
        expect(validateModel2DBasic(model)).toEqual([]);
        expect(model.templateId).toBe(key);
        expect(model.selfWeight).toBe(true);
      });

      it('defaults are valid per validate()', () => {
        expect(template.validate(template.defaults() as never)).toEqual([]);
      });

      it('build is deterministic', () => {
        expect(template.build(template.defaults() as never)).toEqual(
          template.build(template.defaults() as never),
        );
      });

      it('defaults() returns a fresh object each call', () => {
        const a = template.defaults();
        const b = template.defaults();
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
      });

      it('every steel profile key exists in the shared catalog', () => {
        const model = template.build(template.defaults() as never);
        for (const m of model.members) {
          expect(m.material).toBe('steel');
          const mat = STEEL_CATALOG[m.steelSelection!.profileKey];
          expect(mat, `perfil ${m.steelSelection!.profileKey}`).toBeDefined();
        }
      });

      it('las barras birrotuladas de plantilla no llevan cargas de barra (derivan a biela)', () => {
        const model = template.build(template.defaults() as never);
        const releasedIds = new Set(
          model.members.filter((m) => m.releases.i && m.releases.j).map((m) => m.id),
        );
        for (const ld of model.loads) {
          if (ld.kind !== 'node') expect(releasedIds.has(ld.member)).toBe(false);
        }
      });

      it('build throws on invalid params', () => {
        const bad = { ...(template.defaults() as unknown as Record<string, unknown>), span: -1, nBays: 99 };
        expect(() => template.build(bad as never)).toThrow(/Parámetros inválidos/);
      });
    });
  }
});

// ── Cercha Pratt ────────────────────────────────────────────────────────────

describe('prattTrussTemplate', () => {
  const defaults = prattTrussTemplate.defaults();
  const model = prattTrussTemplate.build(defaults);

  it('n=4: 8 nodes (5 bottom + 3 top), 13 members (4n−3)', () => {
    expect(model.nodes).toHaveLength(8);
    expect(model.members).toHaveLength(13);
  });

  it('panel geometry: bottom at y=0 every L/n, top at y=height', () => {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    expect(byId.get('b0')).toMatchObject({ x: 0, y: 0 });
    expect(byId.get('b4')).toMatchObject({ x: 8, y: 0 });
    expect(byId.get('t1')).toMatchObject({ x: 2, y: 1.5 });
    expect(byId.get('t3')).toMatchObject({ x: 6, y: 1.5 });
  });

  it('cordones continuos con flecha exigible; alma birrotulada (biela derivada) sin flecha', () => {
    const chords = model.members.filter((m) => m.displayGroup === 'cordon');
    const diagonals = model.members.filter((m) => m.displayGroup === 'diagonal');
    const verticals = model.members.filter((m) => m.displayGroup === 'montante');
    expect(chords).toHaveLength(6); // n bottom + (n−2) top
    expect(diagonals).toHaveLength(4); // 2 end posts + n−2 interior
    expect(verticals).toHaveLength(3); // n−1
    expect(chords.every((m) => !m.releases.i && !m.releases.j)).toBe(true);
    expect(chords.every((m) => m.deflLimit === 300)).toBe(true);
    const web = [...diagonals, ...verticals];
    expect(web.every((m) => m.releases.i && m.releases.j)).toBe(true);
    expect(web.every((m) => m.deflLimit === 'none')).toBe(true);
    expect(web.every((m) => memberFormulation(model, m) === 'two-force')).toBe(true);
  });

  it('Pratt connectivity: interior diagonals descend toward midspan', () => {
    const byId = new Map(model.members.map((m) => [m.id, m]));
    expect(byId.get('d1')).toMatchObject({ i: 'b0', j: 't1' }); // end post
    expect(byId.get('d2')).toMatchObject({ i: 't1', j: 'b2' }); // left interior
    expect(byId.get('d3')).toMatchObject({ i: 't3', j: 'b2' }); // right interior
    expect(byId.get('d4')).toMatchObject({ i: 't3', j: 'b4' }); // end post
  });

  it('supports: pinned + roller at bottom-chord ends', () => {
    expect(model.supports).toEqual([
      { node: 'b0', type: 'pinned' },
      { node: 'b4', type: 'roller' },
    ]);
  });

  it('ΣFy invariant: exactly −w·L per case (tributary shares included)', () => {
    expect(sumF(model, 'G').Fy).toBeCloseTo(-defaults.roofDeadLoad * defaults.span, 10);
    expect(sumF(model, 'Q').Fy).toBeCloseTo(-defaults.roofLiveLoad * defaults.span, 10);
    expect(sumF(model, 'G').Fx).toBe(0);
  });

  it('roof live load is tagged Q · G1 (cubiertas)', () => {
    const q = model.loads.filter((l) => l.lc === 'Q');
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((l) => l.useCategory === 'G1')).toBe(true);
  });

  it('ceiling load adds bottom-chord UDLs and keeps the ΣFy invariant', () => {
    const p = { ...prattTrussTemplate.defaults(), ceilingLoad: 2 };
    const m = prattTrussTemplate.build(p);
    const bottomUdls = m.loads.filter((l) => l.kind === 'udl' && l.member.startsWith('ci'));
    expect(bottomUdls).toHaveLength(4); // one per bottom-chord member
    expect(sumF(m, 'G').Fy).toBeCloseTo(-(p.roofDeadLoad + p.ceilingLoad) * p.span, 10);
  });

  it('scales: n=6 → 21 members, ΣFy exact, still valid', () => {
    const p = { ...prattTrussTemplate.defaults(), nPanels: 6, span: 12 };
    const m = prattTrussTemplate.build(p);
    expect(m.members).toHaveLength(21);
    expect(validateModel2DBasic(m)).toEqual([]);
    expect(sumF(m, 'G').Fy).toBeCloseTo(-p.roofDeadLoad * 12, 10);
  });

  it('rejects odd panel counts', () => {
    expect(prattTrussTemplate.validate({ ...prattTrussTemplate.defaults(), nPanels: 5 })).not.toEqual([]);
  });
});

// ── Pórtico simple ──────────────────────────────────────────────────────────

describe('portalFrameTemplate', () => {
  const defaults = portalFrameTemplate.defaults();
  const model = portalFrameTemplate.build(defaults);

  it('geometry: two columns bottom→top and one beam', () => {
    const byId = new Map(model.members.map((m) => [m.id, m]));
    expect(byId.get('p1')).toMatchObject({ i: 'n1', j: 'n2', displayGroup: 'pilar' });
    expect(byId.get('v1')).toMatchObject({ i: 'n2', j: 'n3', displayGroup: 'viga' });
    expect(byId.get('p2')).toMatchObject({ i: 'n4', j: 'n3', displayGroup: 'pilar' });
    expect(model.members.every((m) => memberFormulation(model, m) === 'beam-column')).toBe(true);
  });

  it('ΣF: gravity −w·L on G/Q, wind on W', () => {
    expect(sumF(model, 'G').Fy).toBeCloseTo(-defaults.beamDeadLoad * defaults.span, 10);
    expect(sumF(model, 'Q').Fy).toBeCloseTo(-defaults.beamLiveLoad * defaults.span, 10);
    expect(sumF(model, 'W')).toEqual({ Fx: defaults.windEaveForce, Fy: 0 });
  });

  it('live load tagged Q · B; wind 0 emits no load; negative wind allowed (both senses)', () => {
    const q = model.loads.filter((l) => l.lc === 'Q');
    expect(q.every((l) => l.useCategory === 'B')).toBe(true);

    const calm = portalFrameTemplate.build({ ...portalFrameTemplate.defaults(), windEaveForce: 0 });
    expect(calm.loads.filter((l) => l.lc === 'W')).toHaveLength(0);

    const reversed = portalFrameTemplate.build({ ...portalFrameTemplate.defaults(), windEaveForce: -8 });
    expect(sumF(reversed, 'W').Fx).toBe(-8);
  });

  it('baseFixity param drives support types', () => {
    const pinned = portalFrameTemplate.build({ ...portalFrameTemplate.defaults(), baseFixity: 'pinned' });
    expect(pinned.supports.every((s) => s.type === 'pinned')).toBe(true);
    expect(model.supports.every((s) => s.type === 'fixed')).toBe(true);
  });
});

// ── Pórtico de plantas ──────────────────────────────────────────────────────

describe('multistoryTemplate', () => {
  const defaults = multistoryTemplate.defaults();
  const model = multistoryTemplate.build(defaults);

  it('1 bay × 2 stories: 6 nodes, 4 columns + 2 beams', () => {
    expect(model.nodes).toHaveLength(6);
    expect(model.members.filter((m) => m.displayGroup === 'pilar')).toHaveLength(4);
    expect(model.members.filter((m) => m.displayGroup === 'viga')).toHaveLength(2);
  });

  it('grid coordinates and base supports', () => {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    expect(byId.get('n0_0')).toMatchObject({ x: 0, y: 0 });
    expect(byId.get('n1_2')).toMatchObject({ x: 5, y: 6.4 });
    expect(model.supports).toEqual([
      { node: 'n0_0', type: 'fixed' },
      { node: 'n1_0', type: 'fixed' },
    ]);
  });

  it('wind per story: one signed Fx at each level on column line 0', () => {
    const w = model.loads.filter((l) => l.lc === 'W');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ kind: 'node', node: 'n0_1', Fx: 6 });
    expect(w[1]).toMatchObject({ kind: 'node', node: 'n0_2', Fx: 10 });
    expect(sumF(model, 'W').Fx).toBeCloseTo(16, 12);
  });

  it('ΣFy: −w·bayWidth·(nBeams) per case', () => {
    expect(sumF(model, 'G').Fy).toBeCloseTo(-defaults.floorDeadLoad * defaults.bayWidth * 2, 10);
    expect(sumF(model, 'Q').Fy).toBeCloseTo(-defaults.floorLiveLoad * defaults.bayWidth * 2, 10);
  });

  it('scales to 4 bays × 5 stories inside the caps', () => {
    const p = {
      ...multistoryTemplate.defaults(),
      nBays: 4,
      nStories: 5,
      windStoryForces: [2, 4, 6, 8, 10],
    };
    const m = multistoryTemplate.build(p);
    expect(m.nodes).toHaveLength(30); // (4+1)·(5+1)
    expect(m.members).toHaveLength(45); // 25 columns + 20 beams
    expect(validateModel2DBasic(m)).toEqual([]);
  });

  it('rejects windStoryForces length mismatch and out-of-range story counts', () => {
    const p = multistoryTemplate.defaults();
    expect(multistoryTemplate.validate({ ...p, nStories: 3 })).not.toEqual([]); // forces still length 2
    expect(multistoryTemplate.validate({ ...p, nStories: 6, windStoryForces: [1, 1, 1, 1, 1, 1] })).not.toEqual([]);
  });
});

// ── Pórtico a dos aguas ─────────────────────────────────────────────────────

describe('gableTemplate', () => {
  const defaults = gableTemplate.defaults();
  const model = gableTemplate.build(defaults);
  const rafterLen = Math.hypot(defaults.span / 2, defaults.ridgeHeight - defaults.eaveHeight);

  it('geometry: ridge at midspan, rafters son vigas continuas', () => {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    expect(byId.get('n3')).toMatchObject({ x: 4, y: 4.2 });
    const rafters = model.members.filter((m) => m.id.startsWith('f'));
    expect(rafters.every((m) => m.displayGroup === 'viga' && memberFormulation(model, m) === 'beam-column')).toBe(true);
    expect(model.supports.every((s) => s.type === 'pinned')).toBe(true); // old-preset default
  });

  it('ΣFy(G): dead load acts per MEMBER length on both rafters', () => {
    expect(sumF(model, 'G').Fy).toBeCloseTo(-defaults.rafterDeadLoad * 2 * rafterLen, 10);
  });

  it('snow goes to the S case', () => {
    const snowy = gableTemplate.build({ ...gableTemplate.defaults(), rafterSnowLoad: 4 });
    const s = snowy.loads.filter((l) => l.lc === 'S');
    expect(s).toHaveLength(2);
    expect(sumF(snowy, 'S').Fy).toBeCloseTo(-4 * 2 * rafterLen, 10);
  });

  it('local-frame wind pressure resolves to global (w·Δy, −w·Δx) — convention check', () => {
    // Pressure w=1 ⊥ onto rafter f1 (n2→n3, Δx=4, Δy=1.2): the global
    // resultant must be exactly (w·Δy, −w·Δx) = (1.2, −4).
    const windy = gableTemplate.build({ ...gableTemplate.defaults(), windRafterPressure: 1 });
    const f = sumF(windy, 'W');
    expect(f.Fx).toBeCloseTo(1.2, 10);
    expect(f.Fy).toBeCloseTo(-4, 10);
  });

  it('rejects a ridge at or below the eave', () => {
    expect(gableTemplate.validate({ ...gableTemplate.defaults(), ridgeHeight: 3 })).not.toEqual([]);
  });
});

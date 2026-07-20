// FEM 2D — barras de MADERA: enrutado, kmod por combinación (incluida la
// solo-permanente §3.1.3(2)), flecha con kdef, biela axil y rigidez/peso
// propio de decompose. Paridad contra calcTimberFrameMember con los MISMOS
// esfuerzos del solver (la fila y el motor no pueden discrepar).

import { describe, expect, it } from 'vitest';
import {
  beamColumn,
  fem2dModel,
  node2d,
  nodeLoad,
  memberUdl,
  support2d,
  twoForce,
  validateModel2DBasic,
} from '../../features/fem2d/builder';
import { decompose2D } from '../../features/fem2d/decompose';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { calcTimberFrameMember } from '../../lib/calculations/timberFrameMember';
import { getKdef, getTimberGrade } from '../../data/timberGrades';
import { describeModel } from '../../lib/pdf/fem2d';

const TS_C24 = { gradeId: 'C24', b: 140, h: 240, serviceClass: 1 as const };

/** Viga biapoyada 6 m de madera con UDL — modelo base de los tests. */
function ssBeam(loads: ReturnType<typeof memberUdl>[]) {
  return fem2dModel({
    nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
    members: [beamColumn('m1', 'n1', 'n2', { timberSection: TS_C24 })],
    supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
    loads,
  });
}

describe('madera — viga biapoyada (G solo: kmod permanente)', () => {
  const model = ssBeam([memberUdl('l1', 'm1', { lc: 'G', wy: -10 })]);
  const r = analyzeFem2D(model);

  it('flexión y cortante = calcTimberFrameMember con los esfuerzos ELU del solver', () => {
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    expect(v.status).not.toBe('pending');
    // ELU único {G: 1.35} → duración PERMANENTE (kmod 0.60).
    //   M = 1.35·10·6²/8 = 60.75 kN·m; V = 1.35·10·6/2 = 40.5 kN; N = 0.
    const ref = calcTimberFrameMember({
      section: TS_C24, Lef_y: 6, Lef_z: 6, Lltb: 6,
      loadDuration: 'permanent', N: 0, M: 60.75, V: 40.5,
    });
    const bending = v.checks.find((c) => c.id === 'bending')!;
    const shear = v.checks.find((c) => c.id === 'shear')!;
    const ltb = v.checks.find((c) => c.id === 'ltb')!;
    expect(bending.eta).toBeCloseTo(ref.checks.find((c) => c.id === 'bending')!.utilization, 8);
    expect(shear.eta).toBeCloseTo(ref.checks.find((c) => c.id === 'shear')!.utilization, 8);
    expect(ltb.eta).toBeCloseTo(ref.checks.find((c) => c.id === 'ltb')!.utilization, 8);
    expect(bending.combo).toBe('1.35·G');
  });

  it('flecha instantánea exacta (5wL⁴/384EI) y final = (1 + kdef)·δ con solo G', () => {
    const v = r.checks!.perMember.m1;
    // EI = E0,mean·I = 11 000e3 kN/m² · (0.14·0.24³/12) m⁴ = 1774.08 kN·m²
    //   δ = 5·10·6⁴/(384·1774.08) = 0.0951202 m; adm = 6000/300 = 20 mm.
    const EI = 11_000e3 * (0.14 * Math.pow(0.24, 3)) / 12;
    const delta_mm = (5 * 10 * Math.pow(6, 4)) / (384 * EI) * 1000;
    const defl = v.checks.find((c) => c.id === 'deflection')!;
    expect(defl.eta).toBeCloseTo(delta_mm / 20, 6);
    // Con solo G, δ_cp = δ_c → δ_fin = (1 + kdef)·δ, kdef(aserrada, CS1) = 0.6.
    const fin = v.checks.find((c) => c.id === 'deflection-fin')!;
    const kdef = getKdef('sawn', 1);
    expect(kdef).toBeCloseTo(0.6, 12);
    expect(fin.eta).toBeCloseTo((1 + kdef) * defl.eta, 6);
  });

  it('la ficha lleva la etiqueta de sección de madera y los grupos del material', () => {
    const v = r.checks!.perMember.m1;
    expect(v.detail!.sectionLabel).toBe('C24 140×240 mm · CS1');
    const titles = v.detail!.groups.map((g) => g.title);
    expect(titles.some((t) => t.includes('Material y resistencias'))).toBe(true);
    expect(titles.some((t) => t.includes('Pandeo y vuelco lateral'))).toBe(true);
  });
});

describe('madera — §3.1.3(2): la combinación solo-permanente puede gobernar', () => {
  it('con q pequeña (q < 0.3·g) gobierna 1.35·G con kmod 0.60', () => {
    // g = 10, q = 1 (cat B): combo multi-principal {G:1.35, Q:1.5} con kmod
    // media (0.80) da η = (15·4.5/W)/fm_d(0.8); la sintética {G:1.35} con kmod
    // permanente (0.60) da η = (13.5·4.5/W)/fm_d(0.6):
    //   η_perm/η_main = (60.75/67.5)·(0.8/0.6) = 1.2 > 1 → gobierna 1.35·G.
    const model = ssBeam([
      memberUdl('l1', 'm1', { lc: 'G', wy: -10 }),
      memberUdl('l2', 'm1', { lc: 'Q', useCategory: 'B', wy: -1 }),
    ]);
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const bending = r.checks!.perMember.m1.checks.find((c) => c.id === 'bending')!;
    expect(bending.combo).toBe('1.35·G');
    const ref = calcTimberFrameMember({
      section: TS_C24, Lef_y: 6, Lef_z: 6, Lltb: 6,
      loadDuration: 'permanent', N: 0, M: 60.75, V: 40.5,
    });
    expect(bending.eta).toBeCloseTo(ref.checks.find((c) => c.id === 'bending')!.utilization, 8);
  });

  it('con q grande gobierna la multi-principal (kmod media) y su etiqueta lo dice', () => {
    const model = ssBeam([
      memberUdl('l1', 'm1', { lc: 'G', wy: -10 }),
      memberUdl('l2', 'm1', { lc: 'Q', useCategory: 'B', wy: -8 }),
    ]);
    const r = analyzeFem2D(model);
    const bending = r.checks!.perMember.m1.checks.find((c) => c.id === 'bending')!;
    expect(bending.combo).toBe('1.35·G + 1.50·Q');
  });
});

describe('madera — pilar y biela', () => {
  it('pilar: interacción 6.23/6.24 con Lef = L en ambos ejes, sin fila de flecha', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3)],
      members: [beamColumn('p1', 'n1', 'n2', { role: 'pilar', timberSection: TS_C24 })],
      supports: [support2d('n1', 'fixed')],
      loads: [nodeLoad('l1', 'n2', { lc: 'G', Fy: -100 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const p = r.checks!.perMember.p1;
    expect(p.status).not.toBe('pending');
    // N = −135 kN constante, M = V = 0 → compresión pura.
    const ref = calcTimberFrameMember({
      section: TS_C24, Lef_y: 3, Lef_z: 3, Lltb: 3,
      loadDuration: 'permanent', N: -135, M: 0, V: 0,
    });
    const u623 = p.checks.find((c) => c.id === 'comb-623')!;
    const u624 = p.checks.find((c) => c.id === 'comb-624')!;
    expect(u623.eta).toBeCloseTo(ref.checks.find((c) => c.id === 'comb-623')!.utilization, 8);
    expect(u624.eta).toBeCloseTo(ref.checks.find((c) => c.id === 'comb-624')!.utilization, 8);
    expect(p.checks.some((c) => c.id === 'deflection')).toBe(false);
  });

  it('biela de madera: tracción §6.2.3 (a diferencia de la biela HA, NO es pending)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 2, 0)],
      members: [twoForce('m1', 'n1', 'n2', { timberSection: TS_C24 })],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [nodeLoad('l1', 'n2', { lc: 'G', Fx: 50 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const m = r.checks!.perMember.m1;
    expect(m.status).not.toBe('pending');
    // N = +67.5 kN: σt/ft0,d = (67.5e3/33 600)/(0.6·14.5/1.3).
    const row = m.checks.find((c) => c.id === 'tension-bending')!;
    expect(row.eta).toBeCloseTo((67.5e3 / 33_600) / ((0.6 * 14.5) / 1.3), 8);
    expect(m.checks.some((c) => c.id === 'deflection')).toBe(false);
  });

  it('biela comprimida: gobierna el pandeo fuera del plano (kc,z con iz = b/√12)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 2, 0)],
      members: [twoForce('m1', 'n1', 'n2', { timberSection: TS_C24 })],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [nodeLoad('l1', 'n2', { lc: 'G', Fx: -50 })],
    });
    const r = analyzeFem2D(model);
    const m = r.checks!.perMember.m1;
    const u623 = m.checks.find((c) => c.id === 'comb-623')!;
    const u624 = m.checks.find((c) => c.id === 'comb-624')!;
    expect(u624.eta).toBeGreaterThan(u623.eta); // b = 140 < h = 240 → kc,z < kc,y
  });

  it('flexotracción (viga-columna con axil de tracción + M) pasa por el solver, no pending', () => {
    // Ménsula horizontal: Fx=+30 tracciona la barra, Fy=−2 flecta la base.
    //   ELU {G:1.35} (kmod permanente 0.60): N = +40.5 kN, M_base = 8.1 kN·m.
    //   σt = 40 500/33 600 = 1.20536; ft0,d = 0.6·14.5/1.3 = 6.69231
    //   σm = 8.1e6/1 344 000 = 6.02679; fm,d = 0.6·24/1.3 = 11.07692
    //   util 6.17 = 1.20536/6.69231 + 6.02679/11.07692 = 0.18011 + 0.54408
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 3, 0)],
      members: [beamColumn('m1', 'n1', 'n2', { role: 'viga', timberSection: TS_C24 })],
      supports: [support2d('n1', 'fixed')],
      loads: [nodeLoad('l1', 'n2', { lc: 'G', Fx: 30, Fy: -2 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const m = r.checks!.perMember.m1;
    expect(m.status).not.toBe('pending');
    const row = m.checks.find((c) => c.id === 'tension-bending')!;
    const ft0d = (0.6 * 14.5) / 1.3;
    const fmd = (0.6 * 24) / 1.3;
    expect(row.eta).toBeCloseTo((40_500 / 33_600) / ft0d + (8.1e6 / 1_344_000) / fmd, 6);
    // Con tracción no aparece la interacción de compresión ni un 'bending' suelto.
    expect(m.checks.some((c) => c.id === 'comb-623')).toBe(false);
    expect(m.checks.some((c) => c.id === 'bending')).toBe(false);
  });
});

describe('madera — correas arriostran el vuelco Y el pandeo fuera del plano', () => {
  it('una viga esbelta arriostrada tiene MENOS η de vuelco que sin arriostrar', () => {
    // Sección esbelta 100×400 (h/b = 4) → el vuelco lateral (kcrit) manda.
    const slender = { gradeId: 'C24', b: 100, h: 400, serviceClass: 1 as const };
    const build = (ltbSpacing?: number) => fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [beamColumn('m1', 'n1', 'n2', { role: 'viga', timberSection: slender, ltbSpacing })],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -8 })],
    });
    const unbraced = analyzeFem2D(build(undefined)).checks!.perMember.m1;
    const braced = analyzeFem2D(build(1.5)).checks!.perMember.m1;
    const ltbEta = (v: typeof unbraced) => v.checks.find((c) => c.id === 'ltb')!.eta;
    // Lltb 6 m → 1.5 m: σm,crit sube ⇒ λrel,m baja ⇒ kcrit sube ⇒ η de vuelco baja.
    expect(ltbEta(braced)).toBeLessThan(ltbEta(unbraced));
    // La flexión pura (sin kcrit) no cambia: mismo M, misma sección.
    const bend = (v: typeof unbraced) => v.checks.find((c) => c.id === 'bending')!.eta;
    expect(bend(braced)).toBeCloseTo(bend(unbraced), 10);
  });
});

describe('madera — kmod de la nieve por altitud (§2.3.1.2 / toggle >1000 m)', () => {
  it('S dominante: kmod corta (0.90) a ≤1000 m, media (0.80) a >1000 m', () => {
    // G pequeña + S grande ⇒ el combo S-principal {G:1.35, S:1.5} gobierna η.
    const build = (snowOver1000m: boolean) => ({
      ...ssBeam([
        memberUdl('l1', 'm1', { lc: 'G', wy: -2 }),
        memberUdl('l2', 'm1', { lc: 'S', wy: -12 }),
      ]),
      snowOver1000m,
    });
    const low = analyzeFem2D(build(false)).checks!.perMember.m1;
    const high = analyzeFem2D(build(true)).checks!.perMember.m1;
    const bendLow = low.checks.find((c) => c.id === 'bending')!;
    const bendHigh = high.checks.find((c) => c.id === 'bending')!;
    // Gobierna la nieve en ambos (no la sintética 1.35·G).
    expect(bendLow.combo).toBe('1.35·G + 1.50·S');
    expect(bendHigh.combo).toBe('1.35·G + 1.50·S');
    // Misma demanda, kmod 0.90 vs 0.80 ⇒ η_>1000 / η_≤1000 = 0.90/0.80 = 1.125.
    expect(bendHigh.eta / bendLow.eta).toBeCloseTo(0.9 / 0.8, 8);
    // La ficha del caso de montaña declara la duración media.
    const grp = high.detail!.groups.find((g) => g.rows.some((row) => row.label.includes('kmod')))!;
    expect(grp.rows.find((row) => row.label.includes('kmod'))!.label).toContain('media');
  });
});

describe('madera — decompose (rigidez, peso propio) y validación', () => {
  it('EA/EI de C24 140×240 y peso propio ρ_mean·g·A como UDL de G', () => {
    const model = ssBeam([memberUdl('l1', 'm1', { lc: 'G', wy: -10 })]);
    const { analysis, errors } = decompose2D({ ...model, selfWeight: true });
    expect(errors.filter((e) => e.severity === 'fail')).toHaveLength(0);
    const el = analysis.elements[0];
    // EA = 11 000 MPa·1e3·(0.14·0.24) = 369 600 kN
    // EI = 11 000e3·(0.14·0.24³/12) = 1774.08 kN·m²
    expect(el.EA).toBeCloseTo(369_600, 6);
    expect(el.EI).toBeCloseTo(1774.08, 6);
    // q_sw = (420·9.80665/1000)·0.0336 = 0.138384 kN/m, en G hacia abajo,
    // sumada a la UDL de usuario (−10).
    const g = analysis.loadCases.find((c) => c.lc === 'G')!;
    const qsw = (420 * 9.80665 / 1000) * 0.0336;
    expect(g.q[0].qy).toBeCloseTo(-10 - qsw, 6);
  });

  it('clase resistente desconocida → fail UNKNOWN_TIMBER_GRADE en decompose', () => {
    const model = ssBeam([memberUdl('l1', 'm1', { lc: 'G', wy: -10 })]);
    model.members[0].timberSection = { ...TS_C24, gradeId: 'C99' };
    const { errors } = decompose2D(model);
    expect(errors.some((e) => e.code === 'UNKNOWN_TIMBER_GRADE' && e.severity === 'fail')).toBe(true);
  });

  it('madera sin sección → MEMBER_SECTION_MISSING (mismo contrato que acero sin perfil)', () => {
    const model = ssBeam([memberUdl('l1', 'm1', { lc: 'G', wy: -10 })]);
    model.members[0] = { ...model.members[0], timberSection: undefined };
    const errors = validateModel2DBasic(model);
    expect(errors.some((e) => e.code === 'MEMBER_SECTION_MISSING')).toBe(true);
  });

  it('el PDF describe la barra de madera como "C24 140×240 mm"', () => {
    const model = ssBeam([memberUdl('l1', 'm1', { lc: 'G', wy: -10 })]);
    const sections = describeModel(model, 'si');
    const perfiles = sections.find((s) => s.header === 'PERFILES')!;
    expect(perfiles.lines.join(' ')).toContain('C24 140×240 mm');
  });

  it('getTimberGrade cubre la semilla C24 del editor', () => {
    expect(getTimberGrade('C24')).toBeDefined();
  });
});

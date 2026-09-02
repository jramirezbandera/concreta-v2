// FEM 2D — checks tests (Lane B Fase 4: T5 mechanism routing, T6 multi-principal,
// T7 αcr amplification). Each numeric assertion has an independent hand
// derivation in a comment.

import { describe, expect, it } from 'vitest';
import {
  beamColumn,
  fem2dModel,
  node2d,
  nodeLoad,
  memberUdl,
  support2d,
  twoForce,
} from '../../features/fem2d/builder';
import { formatCombo, worstRelativeDeflection } from '../../features/fem2d/checks';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import type { Solver2DElementResult } from '../../features/fem2d/solver2d';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import type { ArmadoHA, RcColumnCage } from '../../features/fem2d/types';
import { bucklingChi } from '../../lib/calculations/buckling';
import { crackedDeflectionFactor } from '../../lib/calculations/crackedDeflection';
import { calcRCBeam, calcRcShear } from '../../lib/calculations/rcBeams';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { getConcrete } from '../../data/materials';
import { getBarArea } from '../../data/rebar';
import { STEEL_CATALOG } from '../../lib/frame-core/sections';

describe('T6 — real multi-principal combinations (never the summed bucket)', () => {
  it('cantilever with equal G/Q/W tip loads: envelope M = 39·(P·L), not 43.5', () => {
    // M_G = M_Q = M_W = 10 kN·m at the base (P=10, L=1). CTE Tabla 4.2:
    //   Q principal: 1.35·10 + 1.5·10 + 1.5·ψ0(W)=0.6·10 → 37.5
    //   W principal: 1.35·10 + 1.5·ψ0(Q,B)=0.7·10 + 1.5·10 → 39.0  ← governs
    // The summed bucket (the old 1D display shortcut) would give
    // 1.35·10 + 1.5·(10+10) = 43.5 — asserting 39 proves the fix.
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 1, 0)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'fixed')],
      loads: [
        nodeLoad('l1', 'n2', { lc: 'G', Fy: -10 }),
        nodeLoad('l2', 'n2', { lc: 'Q', useCategory: 'B', Fy: -10 }),
        nodeLoad('l3', 'n2', { lc: 'W', Fy: -10 }),
      ],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const M = r.checks!.envelopes.m1.ELU.M;
    expect(Math.abs(M[0])).toBeCloseTo(39, 8);
  });
});

describe('T5 — mechanism routing (Fase 2: sin rol)', () => {
  const portal = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
  const r = analyzeFem2D(portal);

  it('pilar de plantilla poco comprimido (η_N < 5%): pasada de vigas sola — mismo umbral que el invariante', () => {
    expect(r.ok).toBe(true);
    const p1 = r.checks!.perMember.p1;
    expect(p1.group).toBe('pilar'); // displayGroup de plantilla — presentación
    expect(p1.status).not.toBe('pending');
    expect(p1.checks.length).toBeGreaterThan(1);
    expect(p1.eta).toBeGreaterThan(0);
    // Con η_N,y ≈ 0.04 la interacción no puede cambiar el color: flexión y
    // axil se comprueban por separado y el invariante calla — coherente.
    expect(p1.checks.some((c) => c.id === 'bending')).toBe(true);
    expect(p1.checks.some((c) => c.id === 'mn-no-comprobada')).toBe(false);
  });

  it('con compresión RELEVANTE el motor de pilares corre y aporta int1/int2 (la fila que el rol perdía)', () => {
    // Mismo pórtico con 300 kN bajando por cada pilar: η_N,y ≫ 5 %.
    const base = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
    const loaded = {
      ...base,
      loads: [
        ...base.loads,
        nodeLoad('lx1', 'n2', { lc: 'G', Fy: -300 }),
        nodeLoad('lx2', 'n3', { lc: 'G', Fy: -300 }),
      ],
    };
    const rl = analyzeFem2D(loaded);
    const p1 = rl.checks!.perMember.p1;
    expect(p1.checks.some((c) => c.id === 'int1' || c.id === 'int2')).toBe(true);
    // El cortante lo aporta la pasada de vigas: UNA sola fila.
    expect(p1.checks.filter((c) => c.id === 'shear').length).toBe(1);
    // Y el vuelco del motor de pilares se CEDE al de vigas (fila 'ltb', no 'LTB').
    expect(p1.checks.some((c) => c.id === 'LTB')).toBe(false);
  });

  it('el dintel corre el motor de vigas + fila de flecha real (deflLimit 300 de plantilla)', () => {
    const v1 = r.checks!.perMember.v1;
    expect(v1.group).toBe('viga');
    expect(v1.status).not.toBe('pending');
    const defl = v1.checks.find((c) => c.id === 'deflection');
    expect(defl).toBeDefined();
    expect(defl!.ref).toContain('CTE');
    expect(defl!.eta).toBeGreaterThan(0);
  });

  it('el alma de la celosía (biela DERIVADA) lleva el chequeo axil, χ verificado a mano', () => {
    const truss = FEM2D_TEMPLATES['pratt-truss'].build(FEM2D_TEMPLATES['pratt-truss'].defaults());
    const rt = analyzeFem2D(truss);
    expect(rt.ok).toBe(true);
    const d1 = rt.checks!.perMember.d1; // end post — compression (Pratt)
    const row = d1.checks.find((c) => c.id === 'axial-buckling');
    expect(row).toBeDefined();
    // Independent Nb,Rd: SHS 80×80×4 (default D11), Lcr = diagonal del panel
    // √(2²+1.5²)=2.5 m, i_min = √(Iz/A), λ̄ = Lcr/i/λ1, curve c, Nb = χ·A·fy/γM1.
    const cat = STEEL_CATALOG.steel_SHS80x80x4;
    const A_mm2 = cat.A * 100;
    const i_mm = Math.sqrt((cat.Iz * 1e4) / A_mm2);
    const lambdaBar = 2500 / i_mm / (93.9 * Math.sqrt(235 / 275));
    const chi = bucklingChi(lambdaBar, 0.49);
    const Nb = (chi * A_mm2 * 275) / 1.05 / 1000;
    // Governing compression: single ELU combo {G:1.35, Q:1.5} (Q only variable)
    // → |N_ELU| from the member envelope.
    const Nc = Math.max(...rt.checks!.envelopes.d1.ELU.N.map((n) => -n));
    expect(row!.eta).toBeCloseTo(Nc / Nb, 8);
  });

  it('RC con comprobación elegida pero SIN armado → pending-armado (share links / AI)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [beamColumn('m1', 'n1', 'n2', {
        rcDesignKind: 'beam',
        rcSection: { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' },
      })],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })],
    });
    const rc = analyzeFem2D(model);
    expect(rc.ok).toBe(true);
    expect(rc.checks!.perMember.m1.status).toBe('pending');
    expect(rc.checks!.perMember.m1.checks[0].id).toBe('pending-armado');
    expect(rc.checks!.status).toBe('pending');
  });
});

describe('deflection row — exact against the SS closed form', () => {
  it('SS viga L=6, w=25 G-only: η = (5wL⁴/384EI) / (L/300)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -25 })],
    });
    const r = analyzeFem2D(model);
    const defl = r.checks!.perMember.m1.checks.find((c) => c.id === 'deflection')!;
    // IPE240 default: EI = 210000e3 · 3892e-8 = 8173.2 kN·m².
    const EI = 210000e3 * 3892e-8;
    const delta_mm = ((5 * 25 * 1296) / (384 * EI)) * 1000;
    const adm_mm = 6000 / 300;
    expect(defl.eta).toBeCloseTo(delta_mm / adm_mm, 6);
  });
});

describe('T7 — αcr sway sensitivity', () => {
  it('stocky default portal: αcr ≥ 10, no amplification, informational ok row', () => {
    const r = analyzeFem2D(FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults()));
    const checks = r.checks!;
    expect(checks.alphaCr).not.toBeNull();
    expect(checks.alphaCr!).toBeGreaterThanOrEqual(10);
    expect(checks.amplified).toBe(false);
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.eta).toBeLessThan(0.95);
  });

  it('slender portal in the 3–10 window: lateral factors amplified by 1/(1−1/αcr), closure exact', () => {
    // Tall weak columns + moderate gravity → αcr in the simplified window.
    const p = {
      ...FEM2D_TEMPLATES['portal-frame'].defaults(),
      height: 10,
      columnProfileKey: 'steel_HEB160',
      beamDeadLoad: 25,
      beamLiveLoad: 0,
      windEaveForce: 8,
    };
    const model = FEM2D_TEMPLATES['portal-frame'].build(p);
    const r = analyzeFem2D(model);
    const checks = r.checks!;
    expect(checks.alphaCr!).toBeGreaterThan(3);
    expect(checks.alphaCr!).toBeLessThan(10);
    expect(checks.amplified).toBe(true);

    // Closure: single ELU combo {G:1.35, W:1.5}, desdoblado en ±Hφ — la W de
    // 8 kN no llega a la exención 0,15·V_Ed, así que la imperfección §5.3.2
    // viaja en el combo (caso NG, amplificado con el MISMO k que la W). El
    // envelope debe ser el máximo muestra a muestra de
    //   |1.35·M_G + k·1.5·M_W ± k·1.35·M_NG|.
    expect(checks.notionalApplied).toBe(true);
    const k = 1 / (1 - 1 / checks.alphaCr!);
    const p1 = r.elements.filter((e) => e.designMemberId === 'p1')[0];
    const M_G = p1.samples.M.G[0];
    const M_W = p1.samples.M.W[0];
    const M_NG = p1.samples.M.NG[0];
    const base = 1.35 * M_G + k * 1.5 * M_W;
    const expected = Math.max(Math.abs(base + k * 1.35 * M_NG), Math.abs(base - k * 1.35 * M_NG));
    const got = checks.envelopes.p1.ELU.M[0];
    expect(Math.abs(got)).toBeCloseTo(expected, 6);
  });

  it('very slender + heavy portal: αcr < 3 → fail row demanding 2nd-order analysis', () => {
    const p = {
      ...FEM2D_TEMPLATES['portal-frame'].defaults(),
      height: 10,
      columnProfileKey: 'steel_HEB160',
      beamDeadLoad: 60,
      beamLiveLoad: 0,
      windEaveForce: 8,
    };
    const r = analyzeFem2D(FEM2D_TEMPLATES['portal-frame'].build(p));
    const checks = r.checks!;
    expect(checks.alphaCr!).toBeLessThan(3);
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.eta).toBeGreaterThanOrEqual(1);
    expect(row.val).toContain('2º orden');
    expect(checks.status).toBe('fail');
  });

  it('truss: la detección por cotas SÍ la sondea y es su rigidez la que la salva', () => {
    // Contrato pre-D12: el filtro por rol la dejaba fuera (alphaCr null, sin
    // fila). Con 'all-nodes' la sonda lateral se ejecuta de verdad y una
    // celosía triangulada se autorregula: αcr ≫ 10, sin amplificar, fila
    // informativa verde. (Spike 2026-07-29: la Pratt de plantilla da ≈ 5813.)
    const r = analyzeFem2D(FEM2D_TEMPLATES['pratt-truss'].build(FEM2D_TEMPLATES['pratt-truss'].defaults()));
    const checks = r.checks!;
    expect(checks.alphaCr).not.toBeNull();
    expect(checks.alphaCr!).toBeGreaterThanOrEqual(10);
    expect(checks.amplified).toBe(false);
    const row = checks.globalChecks.find((c) => c.id === 'alpha-cr')!;
    expect(row.eta).toBeLessThan(0.95);
  });
});

// ── Auditoría del motor (2026-07-18): regresiones de los hallazgos F1-F4 ────

describe('auditoría — F1: nunca verde no ganado', () => {
  it('perfil L como pilar → miembro Y modelo en pending (pending contagioso)', () => {
    // steel_L80x8 es clave válida del catálogo (pasa la validación de params)
    // pero el motor de pilares no soporta angulares: la comprobación NO corre.
    const p = { ...FEM2D_TEMPLATES['portal-frame'].defaults(), columnProfileKey: 'steel_L80x8' };
    const r = analyzeFem2D(FEM2D_TEMPLATES['portal-frame'].build(p));
    expect(r.ok).toBe(true);
    expect(r.checks!.perMember.p1.status).toBe('pending');
    expect(r.checks!.perMember.p2.status).toBe('pending');
    // La viga sí se comprueba — pero el global no puede ser mejor que pending.
    // (Aquí además los pilares L son tan flexibles que αcr < 3 dispara el
    // fail global de estabilidad, y fail DOMINA sobre pending por diseño.)
    expect(r.checks!.perMember.v1.status).not.toBe('pending');
    expect(['pending', 'fail']).toContain(r.checks!.status);
    expect(r.checks!.status).not.toBe('ok');
  });

  it('perfil L como dintel → flexión sin comprobar → pending aunque el axil tenga η real', () => {
    const p = { ...FEM2D_TEMPLATES['portal-frame'].defaults(), beamProfileKey: 'steel_L80x8' };
    const r = analyzeFem2D(FEM2D_TEMPLATES['portal-frame'].build(p));
    expect(r.checks!.perMember.v1.status).toBe('pending');
    expect(r.checks!.status).toBe('pending');
  });
});

describe('auditoría — F2: cuerda de flecha en x real', () => {
  /** Synthetic element with a prescribed w(x) field (single 'G' case). */
  function syntheticEl(id: string, L: number, xStart: number, fn: (X: number) => number, n = 5): Solver2DElementResult {
    const xs = Array.from({ length: n }, (_, i) => (L * i) / (n - 1));
    return {
      elementId: id,
      designMemberId: 'm1',
      L,
      angle: 0,
      samples: {
        xs,
        N: { G: xs.map(() => 0) },
        V: { G: xs.map(() => 0) },
        M: { G: xs.map(() => 0) },
        u: { G: xs.map(() => 0) },
        w: { G: xs.map((x) => fn(xStart + x)) },
      },
    };
  }

  it('campo w LINEAL sobre elementos desiguales → flecha relativa exactamente 0', () => {
    // Miembro L=6 partido en 1.5 + 4.5 (como lo parte una carga puntual en
    // 0.25L). w = X/6 es puro movimiento de cuerda (extremos 0 → 1, sin
    // comba). Con la cuerda en espacio de índices (el bug) esto daba ≠ 0.
    const els = [syntheticEl('e0', 1.5, 0, (X) => X / 6), syntheticEl('e1', 4.5, 1.5, (X) => X / 6)];
    expect(worstRelativeDeflection(els, [{ G: 1 }])).toBeCloseTo(0, 12);
  });

  it('parábola + rampa sobre elementos desiguales → la comba real, no la distorsionada', () => {
    // w = X(6−X)/9 + X/6: comba parabólica (máx 1 en X=3) sobre una cuerda
    // inclinada. La flecha relativa exacta es 1. El segundo elemento muestrea
    // con n=7 para que X=3 (el pico) caiga en un punto de muestreo.
    const fn = (X: number) => (X * (6 - X)) / 9 + X / 6;
    const els = [syntheticEl('e0', 1.5, 0, fn), syntheticEl('e1', 4.5, 1.5, fn, 7)];
    expect(worstRelativeDeflection(els, [{ G: 1 }])).toBeCloseTo(1, 10);
  });
});

describe('auditoría — F4: demanda cero es un veredicto válido', () => {
  it('biela sin esfuerzo → ok con fila informativa, sin contaminar el global', () => {
    // Dos subestructuras: viga SS cargada + biela entre dos apoyos SIN carga
    // (N = 0 exacto). La biela debe salir ok (η=0), no pending.
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0), node2d('n3', 0, 5), node2d('n4', 3, 5)],
      members: [beamColumn('m1', 'n1', 'n2'), twoForce('t1', 'n3', 'n4')],
      supports: [
        support2d('n1', 'pinned'), support2d('n2', 'roller'),
        support2d('n3', 'pinned'), support2d('n4', 'pinned'),
      ],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const t1 = r.checks!.perMember.t1;
    expect(t1.status).toBe('ok');
    expect(t1.checks[0].id).toBe('no-forces');
    expect(r.checks!.status).not.toBe('pending');
  });
});

describe('all templates produce a real verdict', () => {
  for (const [key, template] of Object.entries(FEM2D_TEMPLATES)) {
    it(`${key}: defaults → checks complete, no pending members, FTUX green`, () => {
      const r = analyzeFem2D(template.build(template.defaults() as never));
      expect(r.ok).toBe(true);
      expect(r.checks).not.toBeNull();
      for (const [id, v] of Object.entries(r.checks!.perMember)) {
        expect(v.status, `miembro ${id}`).not.toBe('pending');
        expect(v.checks.length, `miembro ${id}`).toBeGreaterThan(0);
      }
      // FTUX guarantee (mirrors the 1D presets): defaults open in CUMPLE with
      // real margin — the first thing a new user sees is a green verdict.
      expect(r.checks!.status).toBe('ok');
      expect(r.checks!.maxEta).toBeLessThan(0.9);
    });
  }
});

// ── HA — enrutado de barras de hormigón ──────────────────────────────────────
//
// Paridad contra los motores REALES (calcRCBeam / calcRCColumn) llamados
// directamente en el test con las mismas demandas regionales reconstruidas
// desde la envolvente del solver — valida la fontanería (split de regiones,
// mapeo de armado, cuasipermanente multi-principal), no re-deriva los motores
// (que tienen su propia batería).

describe('HA — barras de hormigón', () => {
  const RC_BEAM = { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom' };
  const RC_COL = { ...RC_BEAM, h: 30 };
  const VANO: ArmadoHA = {
    tens_nBars: 4, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12,
    stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2,
  };
  const APOYO: ArmadoHA = {
    tens_nBars: 3, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12,
    stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2,
  };
  const CAGE: RcColumnCage = {
    cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12,
    stirrupDiam: 6, stirrupSpacing: 150,
  };

  /** Region maxima from a signed envelope (sagSign=+1: members drawn i→j rightward). */
  function regions(env: { xs: number[]; M: number[]; V: number[] }) {
    const L = env.xs[env.xs.length - 1];
    const out = { vanoSag: 0, vanoHog: 0, vanoV: 0, apoyoHog: 0, apoyoSag: 0, apoyoV: 0 };
    for (let i = 0; i < env.xs.length; i++) {
      const x = env.xs[i];
      const M = env.M[i];
      const V = Math.abs(env.V[i]);
      if (x >= 0.25 * L && x <= 0.75 * L) {
        if (M > out.vanoSag) out.vanoSag = M;
        if (-M > out.vanoHog) out.vanoHog = -M;
        if (V > out.vanoV) out.vanoV = V;
      }
      if (x <= 0.15 * L || x >= 0.85 * L) {
        if (-M > out.apoyoHog) out.apoyoHog = -M;
        if (M > out.apoyoSag) out.apoyoSag = M;
        if (V > out.apoyoV) out.apoyoV = V;
      }
    }
    return out;
  }

  it('viga HA biapoyada: paridad exacta con calcRCBeam (G-only, una sola combinación)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'beam', rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    expect(v.status).not.toBe('pending');

    // Única combinación ELU {G:1.35} → la envolvente ES la combinación; la
    // cuasipermanente {G:1.0} es la envolvente / 1.35.
    const elu = regions(r.checks!.envelopes.m1.ELU);
    const cp = {
      vanoSag: elu.vanoSag / 1.35,
      apoyoHog: elu.apoyoHog / 1.35,
      apoyoSag: elu.apoyoSag / 1.35,
    };
    // Sanity de las demandas (forma biapoyada): sagging en vano ~ 1.35·wL²/8,
    // nada de hogging, y M+ entrando en la zona de apoyo.
    expect(elu.vanoSag).toBeCloseTo((1.35 * (10 * 36)) / 8, 1);
    expect(elu.vanoHog).toBe(0);
    expect(elu.apoyoHog).toBe(0);
    expect(elu.apoyoSag).toBeGreaterThan(1);

    const expected = calcRCBeam({
      mode: 'portico', title: '', b: 300, h: 500, cover: 30, fck: 25, fyk: 500,
      exposureClass: 'XC1', loadType: 'custom', psi2Custom: 0, L: 0, structSystem: 'ss',
      vano_Md: elu.vanoSag, vano_VEd: elu.vanoV, vano_M_G: cp.vanoSag, vano_M_Q: 0,
      vano_bot_nBars: 4, vano_bot_barDiam: 16, vano_top_nBars: 2, vano_top_barDiam: 12,
      vano_stirrupDiam: 8, vano_stirrupSpacing: 150, vano_stirrupLegs: 2,
      apoyo_Md: elu.apoyoHog, apoyo_VEd: elu.apoyoV, apoyo_M_G: cp.apoyoHog, apoyo_M_Q: 0,
      apoyo_top_nBars: 3, apoyo_top_barDiam: 16, apoyo_bot_nBars: 2, apoyo_bot_barDiam: 12,
      apoyo_stirrupDiam: 8, apoyo_stirrupSpacing: 100, apoyo_stirrupLegs: 2,
    });
    expect(expected.valid).toBe(true);
    for (const id of ['bending', 'shear', 'cracking'] as const) {
      const exp = expected.vano.checks.find((c) => c.id === id)!;
      const got = v.checks.find((c) => c.id === `vano:${id}`)!;
      expect(got, `fila vano:${id}`).toBeDefined();
      expect(got.eta, `fila vano:${id}`).toBeCloseTo(exp.utilization, 8);
    }
    // La cuasipermanente real no es cero: la fisuración trabaja de verdad.
    expect(expected.vano.checks.find((c) => c.id === 'cracking')!.utilization).toBeGreaterThan(0);

    // M+ que entra en zona de apoyo → fila 'apoyo-inv:bending' contra la cara
    // inferior del armado de apoyo (2Ø12), NUNCA un hueco sin comprobar.
    expect(v.checks.find((c) => c.id === 'apoyo-inv:bending')).toBeDefined();
    // La fila de flecha del acero (ELS-c elástica) NO existe en HA…
    expect(v.checks.find((c) => c.id === 'deflection')).toBeUndefined();

    // …la de HA es la DIFERIDA FISURADA: δ_cp de la envolvente × k (§7.4.3).
    // Biapoyada ⇒ extremos w=0 ⇒ flecha relativa a cuerda = |w| máx.
    const wCp = Math.max(...r.checks!.envelopes.m1.ELS_cp.w.map(Math.abs)) * 1000;
    const McpEnv = Math.max(...r.checks!.envelopes.m1.ELS_cp.M.map(Math.abs));
    const fis = crackedDeflectionFactor({
      b: 300, h: 500, fck: 25, As: 4 * getBarArea(16), d: 500 - 30 - 8 - 8,
      Mcp: McpEnv, phiEf: 2.0,
    });
    expect(fis.zeta).toBeGreaterThan(0); // M_cp = 45 > Mcr = 32 — fisura real
    const dRow = v.checks.find((c) => c.id === 'deflection-cracked')!;
    expect(dRow).toBeDefined();
    expect(dRow.eta).toBeCloseTo((wCp * fis.k) / (6000 / 300), 6);
    expect(dRow.ref).toContain('7.4.3');
  });

  it('viga HA poco cargada (sin fisurar): la flecha diferida es δ_cp·(1+φef) exacto', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'beam', rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -2 })], // M_cp = 9 < Mcr = 32
    });
    const r = analyzeFem2D(model);
    const v = r.checks!.perMember.m1;
    const wCp = Math.max(...r.checks!.envelopes.m1.ELS_cp.w.map(Math.abs)) * 1000;
    const dRow = v.checks.find((c) => c.id === 'deflection-cracked')!;
    expect(dRow.val).toContain('ζ = 0.00');
    expect(dRow.eta).toBeCloseTo((wCp * 3.0) / (6000 / 300), 8); // k = 1+φef = 3
  });

  it('pilar HA: paridad exacta con calcRCColumn (axil + M en el plano, β=1, φef=2)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'column', rcSection: { ...RC_COL } }),
        columnCage: { ...CAGE },
      }],
      supports: [support2d('n1', 'fixed')],
      loads: [nodeLoad('l1', 'n2', { lc: 'G', Fy: -500 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    expect(v.status).not.toBe('pending');

    const env = r.checks!.envelopes.m1.ELU;
    const Nd = Math.max(...env.N.map((n) => -n)); // 1.35·500 = 675
    expect(Nd).toBeCloseTo(675, 6);
    const MEd = Math.max(...env.M.map(Math.abs));
    const expected = calcRCColumn({
      title: '', b: 300, h: 300, cover: 30,
      cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12,
      stirrupDiam: 6, stirrupSpacing: 150, fck: 25, fyk: 500,
      Nd, MEdy: MEd, MEdz: 0, L: 3, beta: 1, phiEf: 2.0, sectionType: 'rectangular',
    });
    expect(expected.valid).toBe(true);
    for (const exp of expected.checks) {
      const got = v.checks.find((c) => c.id === exp.id);
      expect(got, `fila ${exp.id}`).toBeDefined();
      // Semántica del mapper 2D: NaN informativo → 0; fila-condición CUMPLIDA
      // exactamente al límite ("4 barras / ≥ 4" → ratio 1.0 con status 'ok'
      // del motor) → 0 (una condición no es una utilización de capacidad y no
      // debe teñir de INCUMPLE el badge del miembro — bug cazado en QA vivo).
      // Aviso del motor con ratio ≥ 1 (densificación de cercos §9.5.3(4)) →
      // conserva 'warn' y recorta η a WARN_UTIL: un aviso nunca pinta INCUMPLE.
      const engineOk = exp.status === 'ok' || exp.status === 'neutral';
      const sane = Number.isNaN(exp.utilization) ? 0 : exp.utilization;
      const expEta = engineOk && sane >= 0.95 ? 0
        : exp.status === 'warn' && sane >= 1 ? 0.95
        : sane;
      expect(got!.eta, `fila ${exp.id}`).toBeCloseTo(expEta, 8);
    }
    expect(Number.isFinite(v.eta)).toBe(true);
    // La jaula por defecto tiene EXACTAMENTE 4 barras (≥ 4 al límite) y cerco
    // Ø6 (= mínimo): condiciones cumplidas → el pilar NO puede leer fail.
    expect(v.status).not.toBe('fail');
    expect(v.eta).toBeLessThan(1);
  });

  it('viga HA comprimida ESBELTA (λ > λ_lim) → gate de esbeltez y pending contagioso', () => {
    // N_ELU = 1.35·400 = 540 kN; n = 540e3/(300·500·16.667) = 0.216 →
    // λ_lim = 10.78/√0.216 = 23.2; λ = 6000/(500/√12) = 41.6 > 23.2 → pending.
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'beam', rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [
        memberUdl('l1', 'm1', { lc: 'G', wy: -5 }),
        nodeLoad('l2', 'n2', { lc: 'G', Fx: -400 }),
      ],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    expect(v.status).toBe('pending');
    const gate = v.checks.find((c) => c.id === 'slenderness-gate');
    expect(gate).toBeDefined();
    expect(gate!.val).toContain('pilar');
    expect(gate!.ref).toContain('5.8.3.1');
    // El gate viejo de magnitud fija ya no existe.
    expect(v.checks.find((c) => c.id === 'axial-gate')).toBeUndefined();
    expect(r.checks!.status).toBe('pending'); // F1 contagioso
  });

  it('viga HA comprimida STOCKY (λ < λ_lim) → fila M+N real, sin pending', () => {
    // Mismo axil (n = 0.216, λ_lim = 23.2) pero L = 2.5 m → λ = 17.3 < 23.2.
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 2.5, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'beam', rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [
        memberUdl('l1', 'm1', { lc: 'G', wy: -5 }),
        nodeLoad('l2', 'n2', { lc: 'G', Fx: -400 }),
      ],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    expect(v.status).not.toBe('pending');
    expect(v.checks.find((c) => c.id === 'slenderness-gate')).toBeUndefined();
    const mn = v.checks.find((c) => c.id === 'mn-vano');
    expect(mn).toBeDefined();
    expect(mn!.eta).toBeGreaterThan(0);
    expect(mn!.ref).toContain('6.1');
    // La excentricidad mínima gobierna sobre el M minúsculo del vano corto:
    // M_check = 540·max(500/30, 20)/1000 = 540·0.02 = 10.8 kN·m.
    expect(mn!.val).toContain('compresión');
    // La fila 'bending' del motor (N=0) sigue presente.
    expect(v.checks.find((c) => c.id === 'vano:bending')).toBeDefined();
  });

  it('viga HA en TRACCIÓN: ya no gatea — flexotracción real, y Nt ≥ Nt,Rd falla', () => {
    const mk = (Fx: number) => fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'beam', rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [
        memberUdl('l1', 'm1', { lc: 'G', wy: -5 }),
        nodeLoad('l2', 'n2', { lc: 'G', Fx }),
      ],
    });
    // Tracción moderada: N_ELU = 270 kN < Nt,Rd(apoyo = 3Ø16+2Ø12 ≈ 360 kN):
    // filas M+N reales, miembro comprueba (la tracción NUNCA gatea esbeltez).
    const rMod = analyzeFem2D(mk(200));
    const vMod = rMod.checks!.perMember.m1;
    expect(vMod.status).not.toBe('pending');
    const mnMod = vMod.checks.find((c) => c.id === 'mn-vano');
    expect(mnMod).toBeDefined();
    expect(mnMod!.val).toContain('tracción');
    // La tracción REDUCE la capacidad: η del M+N > η de la flexión pura.
    const bend = vMod.checks.find((c) => c.id === 'vano:bending')!;
    expect(mnMod!.eta).toBeGreaterThan(bend.eta);

    // Tracción brutal: N_ELU = 675 kN ≥ Nt,Rd de ambas regiones → INCUMPLE.
    const rHi = analyzeFem2D(mk(500));
    const vHi = rHi.checks!.perMember.m1;
    expect(vHi.status).toBe('fail');
    const mnHi = vHi.checks.find((c) => c.id === 'mn-apoyo')!;
    expect(mnHi.eta).toBeGreaterThan(1);
    expect(mnHi.val).toContain('Nt,Rd');
  });

  it('biela HA derivada: pende hasta elegir comprobación; con "column" se comprueba (M = 0)', () => {
    const build = (kind?: 'beam' | 'column') => fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 4, 0), node2d('n3', 2, 2)],
      members: [
        beamColumn('m1', 'n1', 'n2'),
        {
          ...twoForce('d1', 'n1', 'n3', { rcSection: { ...RC_BEAM }, rcDesignKind: kind }),
          columnCage: { cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12, stirrupDiam: 6, stirrupSpacing: 150 },
        },
        twoForce('d2', 'n2', 'n3'),
      ],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [nodeLoad('l1', 'n3', { lc: 'G', Fy: -20 })],
    });
    // Sin elegir: PENDIENTE accionable (la vieja lista negra "biela HA" murió).
    const r1 = analyzeFem2D(build());
    expect(r1.ok).toBe(true);
    expect(r1.checks!.perMember.d1.status).toBe('pending');
    expect(r1.checks!.perMember.d1.checks[0].val).toContain('comprobación HA');
    // Eligiendo pilar: flexocompresión real con M = 0 — la barra ES comprobable.
    const r2 = analyzeFem2D(build('column'));
    expect(r2.ok).toBe(true);
    expect(r2.checks!.perMember.d1.status).not.toBe('pending');
  });

  it('inversión por viento: succión neta → fila vano-inv:bending (tracción arriba en vano)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'beam', rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [
        memberUdl('l1', 'm1', { lc: 'G', wy: -2 }),
        memberUdl('l2', 'm1', { lc: 'W', wy: 15 }),
      ],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    const rev = v.checks.find((c) => c.id === 'vano-inv:bending');
    expect(rev).toBeDefined();
    expect(rev!.eta).toBeGreaterThan(0);
  });

  it('HA sin comprobación elegida (rcDesignKind undefined) → pending accionable', () => {
    // Fase 2: la lista negra de roles axiles murió con el rol. El único
    // PENDIENTE legítimo de HA es "el usuario aún no eligió cómo está armada"
    // — y el mensaje nombra la acción, no solo el bloqueo (P1).
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', { rcSection: { ...RC_BEAM } }),
        vanoArmado: { ...VANO }, apoyoArmado: { ...APOYO },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })],
    });
    const r = analyzeFem2D(model);
    expect(r.ok).toBe(true);
    expect(r.checks!.perMember.m1.status).toBe('pending');
    const val = r.checks!.perMember.m1.checks[0].val;
    expect(val).toContain('comprobación HA');
    expect(val).toContain('Pilar');
    expect(val).toContain('Viga');
  });
});

// ── Cortante de pilar (HA con σcp · acero vía motor de vigas) ────────────────
//
// Modelos de UNA sola combinación ELU ({G:1.35}) para que la demanda y el σcp
// concurrente sean exactos a mano: ménsula vertical empotrada con carga G
// vertical (axil) + G horizontal (cortante constante = 1.35·Fx).

describe('cortante de pilar', () => {
  const RC_COL = { b: 30, h: 30, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom' };
  const CAGE: RcColumnCage = {
    cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12,
    stirrupDiam: 6, stirrupSpacing: 150,
  };

  function columnModel(material: 'rc' | 'steel') {
    return fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3)],
      members: [material === 'rc'
        ? { ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'column', rcSection: { ...RC_COL } }), columnCage: { ...CAGE } }
        : beamColumn('m1', 'n1', 'n2', { steelSelection: { profileKey: 'steel_HEB160', steel: 'S275' } }),
      ],
      supports: [support2d('n1', 'fixed')],
      loads: [
        nodeLoad('l1', 'n2', { lc: 'G', Fy: -100 }),
        nodeLoad('l2', 'n2', { lc: 'G', Fx: 20 }),
      ],
    });
  }

  it('pilar HA: fila shear con σcp del combo y política max(VRdc, min(VRds, VRdmax))', () => {
    const r = analyzeFem2D(columnModel('rc'));
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    const row = v.checks.find((c) => c.id === 'shear')!;
    expect(row).toBeDefined();

    // Única combinación {G:1.35}: V = 27 kN, N = −135 kN ⇒ σcp = 1.5 MPa.
    const expected = calcRcShear({
      b: 300,
      d: 300 - 30 - 6 - 16 / 2,           // 256
      fck: 25,
      fcd: getConcrete(25).fcd,
      fyd: 500 / 1.15,
      As: 2 * getBarArea(16),              // cara traccionada: 2 esquinas (nX=0)
      Asw: (2 * getBarArea(6)) / 150,
      hasStirrups: true,
      sigmaCp: (135 * 1000) / (300 * 300), // 1.5
    });
    const VRdPilar = Math.max(expected.VRdc, Math.min(expected.VRds, expected.VRdmax));
    expect(row.eta).toBeCloseTo(27 / VRdPilar, 8);
    expect(row.val).toContain('σcp = 1.50');
    const rowMax = v.checks.find((c) => c.id === 'shear-max')!;
    expect(rowMax.eta).toBeCloseTo(27 / expected.VRdmax, 8);
    // El término σcp cuenta: VRdc con axil > VRdc sin él.
    const noAxial = calcRcShear({ ...{
      b: 300, d: 256, fck: 25, fcd: getConcrete(25).fcd, fyd: 500 / 1.15,
      As: 2 * getBarArea(16), Asw: (2 * getBarArea(6)) / 150, hasStirrups: true,
    }, sigmaCp: 0 });
    expect(expected.VRdc).toBeGreaterThan(noAxial.VRdc);
  });

  it('pilar de ACERO: la pasada de vigas aporta shear (paridad exacta) e interacción M-V — mecanismo GANADO en Fase 2', () => {
    const r = analyzeFem2D(columnModel('steel'));
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    expect(v.status).not.toBe('pending');
    const row = v.checks.find((c) => c.id === 'shear')!;
    expect(row).toBeDefined();

    const direct = calcSteelBeam({
      title: '', tipo: 'HEB', size: 160, steel: 'S275', beamType: 'ss',
      chs_D: 0, chs_t: 0, rhs_h: 0, rhs_b: 0, rhs_t: 0, tube_process: 'cold-formed',
      MEd: 0, VEd: 27, VEd_interaction: 0, Lcr: 3000, Mser: 0, L: 3000,
      deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B', gk: 0, qk: 0, bTrib: 1,
    });
    expect(direct.valid).toBe(true);
    const directShear = direct.checks!.find((c) => c.id === 'shear')!;
    // La utilización de cortante no depende de MEd: paridad exacta.
    expect(row.eta).toBeCloseTo(directShear.utilization, 8);
    // La interacción M-V §6.2.8 ahora SÍ se comprueba en soportes (antes el
    // camino de pilar la perdía — mecanismo 3 de la tabla de propietarios).
    expect(v.checks.find((c) => c.id === 'interaction')).toBeDefined();
    // Y una sola fila de shear (el de pilares se eliminó, no se duplica).
    expect(v.checks.filter((c) => c.id === 'shear').length).toBe(1);
  });
});

// ── Pilar HA en TRACCIÓN NETA — veredicto real (flexotracción + cortante),
// no 'pending' ────────────────────────────────────────────────────────────
//
// Antes: un combo en tracción neta hacía Nd = max(0,−Nmin) = 0 < 1, calcRCColumn
// lo rechazaba ('NEd debe ser ≥ 1 kN') y el miembro caía a 'pending'. Ahora se
// salta la flexocompresión sin marcar incomplete y se comprueba flexotracción
// N+M conservadora (T_cara = N/2 + M/z ≤ As_cara·fyd).

describe('pilar HA en tracción neta', () => {
  const RC_COL = { b: 30, h: 30, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom' };
  const CAGE: RcColumnCage = {
    cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12,
    stirrupDiam: 6, stirrupSpacing: 150,
  };

  /** Ménsula vertical fija en base, tirón G hacia arriba (tracción) + G lateral. */
  function tieModel(Fup: number, Fx: number) {
    return fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3)],
      members: [{ ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'column', rcSection: { ...RC_COL } }), columnCage: { ...CAGE } }],
      supports: [support2d('n1', 'fixed')],
      loads: [
        nodeLoad('l1', 'n2', { lc: 'G', Fy: Fup }),
        nodeLoad('l2', 'n2', { lc: 'G', Fx }),
      ],
    });
  }

  it('da veredicto real (no pending) y la fila de flexotracción N+M cuadra a mano', () => {
    // Fy=+100 (tirón hacia arriba) ⇒ N tracción; Fx=5 ⇒ M + V.
    const r = analyzeFem2D(tieModel(100, 5));
    expect(r.ok).toBe(true);
    const v = r.checks!.perMember.m1;
    // El motor de pilares NO corrió (tracción) pero NO hay pending: hay veredicto.
    expect(v.status).not.toBe('pending');
    expect(v.checks.find((c) => c.id === 'engine-invalid')).toBeUndefined();
    // La fila vieja de solo-tracción desaparece; ahora es flexotracción N+M.
    expect(v.checks.find((c) => c.id === 'axial-tension')).toBeUndefined();
    const tb = v.checks.find((c) => c.id === 'tension-bending')!;
    expect(tb).toBeDefined();

    // Demandas de la ÚNICA combinación ELU desde la envolvente.
    const env = r.checks!.envelopes.m1.ELU;
    const N = Math.max(...env.N);              // tracción máx (kN)
    const M = Math.max(...env.M.map(Math.abs)); // |M| máx (kN·m)
    expect(N).toBeGreaterThan(0);
    // z = h − 2·(cover+stirrup+corner/2) = 300 − 2·(30+6+8) = 212 mm.
    const z = 300 - 2 * (30 + 6 + 16 / 2);
    const Tface = N / 2 + (M * 1000) / z;                       // kN
    const capFace = (2 * getBarArea(16) * (500 / 1.15)) / 1000; // 174.8 kN
    expect(tb.eta).toBeCloseTo(Tface / capFace, 6);
    // El cortante también se comprueba (σcp negativo por la tracción).
    expect(v.checks.find((c) => c.id === 'shear')).toBeDefined();
  });

  it('tracción + M que agotan la cara traccionada → INCUMPLE honesto', () => {
    // Fy=+300 ⇒ N≈405 tracción; Fx=15 ⇒ M grande. T_cara ≫ cap.
    const r = analyzeFem2D(tieModel(300, 15));
    const v = r.checks!.perMember.m1;
    expect(v.status).toBe('fail');
    const tb = v.checks.find((c) => c.id === 'tension-bending')!;
    expect(tb.eta).toBeGreaterThan(1);
  });
});

// ── Ficha de cálculo: formatCombo + combos por fila + detail ─────────────────
//
// La ficha por barra (Fem2DMemberDetail) no re-ejecuta motores: consume
// MemberCheck.combo y MemberVerdict2D.detail construidos en el pase de
// comprobación. Estos tests fijan ese contrato (etiqueta de combinación
// GOBERNANTE por fila, demandas pésimas con su combo y grupos de intermedios
// capturados del motor).

describe('ficha — formatCombo', () => {
  it('formatea factores en orden fijo G,Q,W,S,E y omite ceros/ausentes', () => {
    expect(formatCombo({ G: 1.35, Q: 1.5 })).toBe('1.35·G + 1.50·Q');
    expect(formatCombo({ W: 1.5, G: 1.35, Q: 1.05 })).toBe('1.35·G + 1.05·Q + 1.50·W');
    expect(formatCombo({ G: 1.0 })).toBe('1.00·G');
    expect(formatCombo({})).toBe('—');
  });
});

describe('ficha — combo gobernante por fila', () => {
  it('ménsula G/Q/W: la fila de flexión lleva el combo W-principal (1.35·G + 1.05·Q + 1.50·W)', () => {
    // Mismo modelo que el test T6: M_G = M_Q = M_W en la base. Gobierna
    // W principal: 1.35·G + 1.5·ψ0(Q,B)=0.7 → 1.05·Q + 1.50·W (M del combo 39).
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 1, 0)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'fixed')],
      loads: [
        nodeLoad('l1', 'n2', { lc: 'G', Fy: -10 }),
        nodeLoad('l2', 'n2', { lc: 'Q', useCategory: 'B', Fy: -10 }),
        nodeLoad('l3', 'n2', { lc: 'W', Fy: -10 }),
      ],
    });
    const r = analyzeFem2D(model);
    const v = r.checks!.perMember.m1;
    const bending = v.checks.find((c) => c.id === 'bending')!;
    expect(bending.combo).toBe('1.35·G + 1.05·Q + 1.50·W');
    // Las demandas pésimas de la ficha llevan el mismo combo gobernante.
    expect(v.detail).toBeDefined();
    const M = v.detail!.demands.find((d) => d.label === 'Momento MEd')!;
    expect(M.combo).toBe('1.35·G + 1.05·Q + 1.50·W');
    expect(M.value).toBe('39.0 kN·m');
  });

  it('viga G-only: flexión y flecha llevan sus combos (ELU vs ELS característica)', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [beamColumn('m1', 'n1', 'n2')],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -25 })],
    });
    const r = analyzeFem2D(model);
    const v = r.checks!.perMember.m1;
    expect(v.checks.find((c) => c.id === 'bending')!.combo).toBe('1.35·G');
    expect(v.checks.find((c) => c.id === 'deflection')!.combo).toBe('1.00·G');
    // La clasificación es combo-independiente → sin etiqueta.
    expect(v.checks.find((c) => c.id === 'classification')?.combo).toBeUndefined();
  });
});

describe('ficha — detail (datos + intermedios del motor)', () => {
  const portal = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
  const r = analyzeFem2D(portal);

  it('viga acero: sectionLabel, demandas y grupo de resistencias con Mc,Rd del MOTOR', () => {
    const v = r.checks!.perMember.v1;
    const d = v.detail!;
    expect(d.sectionLabel).toMatch(/^IPE \d+ · S(275|355)$/);
    expect(d.L).toBeGreaterThan(0);
    expect(d.demands.length).toBeGreaterThan(0);
    for (const dem of d.demands) expect(dem.combo).not.toBe('');
    const g = d.groups.find((gr) => gr.title === 'Sección y resistencias (flexión)')!;
    expect(g).toBeDefined();
    const mcRd = g.rows.find((row) => row.label.startsWith('Mc,Rd'))!;
    // Paridad con el motor: Mc,Rd de calcSteelBeam para el mismo perfil/acero
    // (Mc,Rd es propiedad de sección — independiente de demandas y Lcr).
    const sel = portal.members.find((m) => m.id === 'v1')!.steelSelection!;
    const match = sel.profileKey.match(/^steel_(IPE|HEA|HEB|IPN)(\d+)$/)!;
    const eng = calcSteelBeam({
      title: '', tipo: match[1] as 'IPE', size: Number(match[2]), steel: sel.steel,
      chs_D: 0, chs_t: 0, rhs_h: 0, rhs_b: 0, rhs_t: 0, tube_process: 'cold-formed',
      beamType: 'ss', MEd: 1, VEd: 0, VEd_interaction: 0, Lcr: 1000, Mser: 0,
      L: 6000, deflLimit: 300, elsCombo: 'characteristic', useCategory: 'B',
      gk: 0, qk: 0, bTrib: 1,
    });
    expect(mcRd.value).toBe(`${eng.Mc_Rd.toFixed(1)} kN·m`);
  });

  it('pilar comprimido de verdad: grupo de flexocompresión con Nb,Rd por eje', () => {
    // El pilar de plantilla tiene η_N < 5% (no corre el motor de pilares): se
    // carga hasta compresión relevante para que la pasada combinada emita la
    // ficha de flexocompresión.
    const base = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
    const loaded = {
      ...base,
      loads: [
        ...base.loads,
        nodeLoad('lx1', 'n2', { lc: 'G', Fy: -300 }),
        nodeLoad('lx2', 'n3', { lc: 'G', Fy: -300 }),
      ],
    };
    const v = analyzeFem2D(loaded).checks!.perMember.p1;
    const g = v.detail!.groups.find((gr) => gr.title === 'Flexocompresión M+N (§6.3.3)')!;
    expect(g).toBeDefined();
    expect(g.rows.some((row) => row.label.startsWith('Nb,Rd eje y'))).toBe(true);
    expect(g.rows.some((row) => row.label.startsWith('Nb,Rd eje z'))).toBe(true);
  });

  it('biela Pratt: grupo axil con Npl,Rd verificado a mano (SHS 80×80×4, default D11)', () => {
    const truss = FEM2D_TEMPLATES['pratt-truss'].build(FEM2D_TEMPLATES['pratt-truss'].defaults());
    const rt = analyzeFem2D(truss);
    const v = rt.checks!.perMember.d1;
    const g = v.detail!.groups.find((gr) => gr.title === 'Resistencias axiles (biela)')!;
    expect(g).toBeDefined();
    // Npl = A·fy/γM0 del SHS 80×80×4 (alma por defecto desde D11).
    const npl = g.rows.find((row) => row.label.startsWith('Npl,Rd'))!;
    expect(npl.value).toBe(`${((STEEL_CATALOG.steel_SHS80x80x4.A * 100 * 275) / 1.05 / 1000).toFixed(1)} kN`);
  });

  it('pendiente (HA sin armado): la ficha conserva demandas y sección', () => {
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [beamColumn('m1', 'n1', 'n2', {
        rcSection: { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' },
      })],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })],
    });
    const rc = analyzeFem2D(model);
    const v = rc.checks!.perMember.m1;
    expect(v.status).toBe('pending');
    expect(v.detail).toBeDefined();
    expect(v.detail!.sectionLabel).toBe('HA 30×50 cm · HA-25 · B500');
    expect(v.detail!.demands.find((d) => d.label === 'Momento MEd')!.combo).toBe('1.35·G');
  });

  it('viga HA: filas con combo por mecanismo y grupos de sección vano/apoyo con MRd', () => {
    const VANO_F: ArmadoHA = {
      tens_nBars: 4, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12,
      stirrupDiam: 8, stirrupSpacing: 150, stirrupLegs: 2,
    };
    const APOYO_F: ArmadoHA = {
      tens_nBars: 3, tens_barDiam: 16, comp_nBars: 2, comp_barDiam: 12,
      stirrupDiam: 8, stirrupSpacing: 100, stirrupLegs: 2,
    };
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
      members: [{
        ...beamColumn('m1', 'n1', 'n2', {
          rcDesignKind: 'beam',
          rcSection: { b: 30, h: 50, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom' },
        }),
        vanoArmado: { ...VANO_F }, apoyoArmado: { ...APOYO_F },
      }],
      supports: [support2d('n1', 'pinned'), support2d('n2', 'roller')],
      loads: [memberUdl('l1', 'm1', { lc: 'G', wy: -10 })],
    });
    const rc = analyzeFem2D(model);
    const v = rc.checks!.perMember.m1;
    const bend = v.checks.find((c) => c.id === 'vano:bending')!;
    expect(bend.combo).toBe('1.35·G');
    const defl = v.checks.find((c) => c.id === 'deflection-cracked')!;
    expect(defl.combo).toBe('1.00·G'); // cuasipermanente: ψ2(G)=1, sin Q
    const gv = v.detail!.groups.find((gr) => gr.title.startsWith('Sección de vano'))!;
    expect(gv).toBeDefined();
    expect(gv.rows.some((row) => row.label === 'MRd' && /kN·m$/.test(row.value))).toBe(true);
  });

  it('pilar HA: combo en filas de demanda, NUNCA en detailing (mergeWorst se queda la 1ª — sería mentira)', () => {
    const RC_COL = { b: 30, h: 30, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'custom' };
    const CAGE: RcColumnCage = {
      cornerBarDiam: 16, nBarsX: 0, barDiamX: 12, nBarsY: 0, barDiamY: 12,
      stirrupDiam: 6, stirrupSpacing: 150,
    };
    const model = fem2dModel({
      nodes: [node2d('n1', 0, 0), node2d('n2', 0, 3)],
      members: [{ ...beamColumn('m1', 'n1', 'n2', { rcDesignKind: 'column', rcSection: { ...RC_COL } }), columnCage: { ...CAGE } }],
      supports: [support2d('n1', 'fixed')],
      loads: [
        nodeLoad('l1', 'n2', { lc: 'G', Fy: -100 }),
        nodeLoad('l2', 'n2', { lc: 'G', Fx: 20 }),
      ],
    });
    const r = analyzeFem2D(model);
    const v = r.checks!.perMember.m1;
    // Demanda (NEd/M dentro) → etiquetadas con la única combinación.
    expect(v.checks.find((c) => c.id === 'shear')!.combo).toBe('1.35·G');
    expect(v.checks.find((c) => c.id === 'nm-y')!.combo).toBe('1.35·G');
    // Detailing puro (geometría del armado) → sin etiqueta aunque η > 0.
    const detailing = v.checks.filter((c) =>
      ['as-min', 'as-max', 'nBars-min', 'bar-spacing-x', 'bar-spacing-y', 'stirrup-diam', 'stirrup-spacing'].includes(c.id));
    expect(detailing.length).toBeGreaterThan(0);
    for (const c of detailing) expect(c.combo).toBeUndefined();
    // Grupos de la ficha: flexocompresión + cortante con su combo en el título.
    const titles = v.detail!.groups.map((g) => g.title);
    expect(titles.some((t) => t.startsWith('Flexocompresión — combo pésimo: 1.35·G'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Cortante — combo pésimo: 1.35·G'))).toBe(true);
  });
});

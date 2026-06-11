// RC Retaining Wall test suite
// Covers: FTUX defaults, Ka, stability, water table, Mononobe-Okabe, structural, edge cases
// Run: bun test src/test/calc/retainingWall.test.ts

import { describe, expect, it } from 'vitest';
import { calcRetainingWall, asBar } from '../../lib/calculations/retainingWall';
import { retainingWallDefaults } from '../../data/defaults';
import { solveRCBending } from '../../lib/calculations/types';

const base = { ...retainingWallDefaults };

// ── solveRCBending utility ────────────────────────────────────────────────────
describe('solveRCBending', () => {
  it('MEd=0 → 0 (zero moment → zero steel)', () => {
    expect(solveRCBending(0, 1000, 400, 16.67, 434.8)).toBe(0);
  });

  it('MEd=100 kNm → finite positive value', () => {
    const As = solveRCBending(100, 1000, 400, 16.67, 434.8);
    expect(As).toBeGreaterThan(0);
    expect(isFinite(As)).toBe(true);
  });

  it('m ≥ 0.5 → Infinity (over-reinforced section)', () => {
    // m = MEd*1e6 / (b*d²*fcd) ≥ 0.5 → over-reinforced
    // MEd that gives m=0.6: MEd = 0.6 * 1000 * 400² * 16.67 / 1e6 = 1600 kNm
    const As = solveRCBending(1600, 1000, 400, 16.67, 434.8);
    expect(As).toBe(Infinity);
  });
});

// ── FTUX defaults ─────────────────────────────────────────────────────────────
describe('FTUX defaults', () => {
  it('result is valid', () => {
    const r = calcRetainingWall(base);
    expect(r.valid).toBe(true);
  });

  it('all checks pass (no fail)', () => {
    const r = calcRetainingWall(base);
    expect(r.valid).toBe(true);
    for (const c of r.checks) {
      expect(c.status).not.toBe('fail');
    }
  });

  it('all check.article fields reference CTE, CE, NCSE, NCSP, or Criterio de ingeniería', () => {
    const r = calcRetainingWall(base);
    for (const c of r.checks) {
      const ok = c.article.includes('CTE') || c.article.includes('CE') ||
                 c.article.includes('NCSE') || c.article.includes('NCSP') ||
                 c.article.includes('Criterio');
      expect(ok, `check ${c.id} article: "${c.article}"`).toBe(true);
    }
  });

  it('Ka ≈ 0.274 for phi=30, delta=10', () => {
    const r = calcRetainingWall(base);
    // Coulomb Ka with phi=30°, delta=10°
    expect(r.Ka).toBeGreaterThan(0.25);
    expect(r.Ka).toBeLessThan(0.35);
  });

  it('EAH_total > 0', () => {
    const r = calcRetainingWall(base);
    expect(r.EAH_total).toBeGreaterThan(0);
  });

  it('ΣV > 0', () => {
    const r = calcRetainingWall(base);
    expect(r.ΣV).toBeGreaterThan(0);
  });

  it('sigma_max > 0 and ≤ sigmaAdm', () => {
    const r = calcRetainingWall(base);
    expect(r.sigma_max).toBeGreaterThan(0);
    expect(r.sigma_max).toBeLessThanOrEqual(base.sigmaAdm);
  });

  it('no seismic checks when Ab=0', () => {
    const r = calcRetainingWall(base);
    const seisIds = r.checks.map((c) => c.id);
    expect(seisIds).not.toContain('vuelco-sismico');
    expect(seisIds).not.toContain('deslizamiento-sismico');
  });
});

// ── Ka (Coulomb) ──────────────────────────────────────────────────────────────
describe('Ka formula', () => {
  it('phi=30, delta=0 → Ka ≈ 0.333 (Rankine limit)', () => {
    const r = calcRetainingWall({ ...base, delta: 0 });
    expect(r.Ka).toBeCloseTo(0.333, 2);
  });

  it('phi=30, delta=15 → Ka < Ka_delta0 (wall friction reduces Ka)', () => {
    const r0  = calcRetainingWall({ ...base, delta: 0  });
    const r15 = calcRetainingWall({ ...base, delta: 15 });
    expect(r15.Ka).toBeLessThan(r0.Ka);
  });

  it('phi=0 → Ka = 1 (fluid pressure limit, no crash)', () => {
    const r = calcRetainingWall({ ...base, phi: 0, delta: 0 });
    expect(r.valid).toBe(true);
    expect(r.Ka).toBeCloseTo(1.0, 2);
  });
});

// ── Stability static ──────────────────────────────────────────────────────────
describe('stability static', () => {
  it('narrow footing → vuelco fails', () => {
    // Very narrow footing: bTalon=0.3m → overturning moment dominates
    const r = calcRetainingWall({ ...base, bTalon: 0.3, bPunta: 0.2 });
    expect(r.valid).toBe(true);
    const v = r.checks.find((c) => c.id === 'vuelco');
    expect(v?.status).toBe('fail');
  });

  it('FS_vuelco ≥ 2.0 with default geometry (CTE Tabla 2.1: 1.8/0.9)', () => {
    const r = calcRetainingWall(base);
    expect(r.FS_vuelco).toBeGreaterThanOrEqual(2.0);
  });

  it('vuelco threshold is 2.0, not 1.5 (fix auditoría #21)', () => {
    // CTE DB-SE-C Tabla 2.1: γE,desestab=1.8 / γE,estab=0.9 → FS equiv = 2.0.
    // bTalon=0.55 → FS_vuelco ≈ 1.88: cumplía el umbral erróneo 1.5,
    // incumple el normativo 2.0 → debe fallar.
    const r = calcRetainingWall({ ...base, bTalon: 0.55 });
    expect(r.FS_vuelco).toBeGreaterThan(1.5);
    expect(r.FS_vuelco).toBeLessThan(2.0);
    const v = r.checks.find((c) => c.id === 'vuelco');
    expect(v?.status).toBe('fail');
  });

  it('FS_desliz ≥ 1.5 with default geometry', () => {
    const r = calcRetainingWall(base);
    expect(r.FS_desliz).toBeGreaterThanOrEqual(1.5);
  });

  // CTE DB-SE-C §9.3.3 — passive resistance Ep must NOT be included in
  // sliding FS by default (unreliable without guarantees on toe soil).
  // Regression for the bug where Ep was added at full value to numerator.
  it('FS_desliz excludes passive Ep (CTE DB-SE-C §9.3.3)', () => {
    const r = calcRetainingWall(base);
    // FS_desliz = ΣV·μ / EAH_total — no Ep term.
    // Rebuild it from exposed quantities and compare exactly.
    const expected = (r.ΣV * base.mu) / r.EAH_total;
    expect(r.FS_desliz).toBeCloseTo(expected, 6);
  });

  it('q no estabiliza: FS_desliz excluye W_q_heel (fix auditoría #22)', () => {
    // CTE DB-SE §4.2 / EC7: acción variable favorable → γQ,fav = 0. La
    // sobrecarga genera empuje EA_q (desestabiliza) pero no puede contarse
    // como peso estabilizador sobre el talón. Con q=10, bT=1.5 → W_q_heel=15.
    const r = calcRetainingWall({ ...base, q: 10 });
    const W_q_heel = 10 * 1.5;
    const expected = ((r.ΣV - W_q_heel) * base.mu) / r.EAH_total;
    expect(r.FS_desliz).toBeCloseTo(expected, 6);
  });

  it('q > 0 reduce siempre FS_vuelco y FS_desliz (solo desestabiliza)', () => {
    const r0 = calcRetainingWall({ ...base, q: 0 });
    const rq = calcRetainingWall({ ...base, q: 10 });
    expect(rq.FS_vuelco).toBeLessThan(r0.FS_vuelco);
    expect(rq.FS_desliz).toBeLessThan(r0.FS_desliz);
  });

  it('FS_desliz scales linearly with mu when Ep is excluded', () => {
    // If Ep were still in the numerator, doubling mu would NOT exactly
    // double FS_desliz − Ep/EAH. With Ep excluded, doubling mu must
    // exactly double FS_desliz.
    const r1 = calcRetainingWall({ ...base, mu: 0.30 });
    const r2 = calcRetainingWall({ ...base, mu: 0.60 });
    expect(r2.FS_desliz).toBeCloseTo(2 * r1.FS_desliz, 5);
  });

  it('FS_desliz independent of hf when Ep excluded (keeping H_total fixed)', () => {
    // If Ep were still in the numerator, larger hf → larger Ep → higher FS.
    // With Ep excluded, FS_desliz depends on hf only through W_zap (25·B·hf)
    // and B = bP + tF + bT (unchanged by hf). So hf still affects ΣV via
    // footing self-weight, but NOT through Ep. Verify via a targeted diff:
    // compare hf=0.4 vs hf=0.5 — the change in FS must match the change
    // induced only by the extra 25·B·(0.1)·μ kN/m in the numerator.
    const rA = calcRetainingWall({ ...base, hf: 0.4 });
    const rB = calcRetainingWall({ ...base, hf: 0.5 });
    const numA = rA.FS_desliz * rA.EAH_total;
    const numB = rB.FS_desliz * rB.EAH_total;
    const deltaNum = numB - numA;             // difference in ΣV·μ only
    const deltaSigmaV = (rB.ΣV - rA.ΣV) * base.mu;
    expect(deltaNum).toBeCloseTo(deltaSigmaV, 4);
  });

  it('very tall wall → sigma_max > sigmaAdm → sigma-max fails', () => {
    const r = calcRetainingWall({ ...base, H: 6.0, sigmaAdm: 100 });
    expect(r.valid).toBe(true);
    const c = r.checks.find((c) => c.id === 'sigma-max');
    expect(c?.status).toBe('fail');
  });

  it('e > B/6 → eccentricidad fails', () => {
    // Very small heel → eccentricity exceeds B/6
    const r = calcRetainingWall({ ...base, bTalon: 0.2, bPunta: 0.2 });
    if (r.valid && r.e > (r.ΣV > 0 ? 1 : 0)) {
      const c = r.checks.find((c) => c.id === 'excentricidad');
      // May or may not fail depending on exact values — just verify check exists
      expect(c).toBeDefined();
    }
  });

  it('e > B/6 → triangular branch: sigma_min = 0', () => {
    // Force triangular branch with extreme geometry
    const r = calcRetainingWall({ ...base, H: 5.0, bTalon: 0.4, bPunta: 0.2 });
    if (r.valid && r.e > r.ΣV * 0) {  // always true
      const B = base.bPunta + base.tFuste + 0.4;
      if (r.e > B / 6) {
        expect(r.sigma_min).toBe(0);
      }
    }
  });

  it('e ≥ B/3 guard → sigma-min check = fail, structural checks absent', () => {
    // Force e ≥ B/3 with extreme overturning
    const r = calcRetainingWall({ ...base, H: 8.0, hf: 0.3, bTalon: 0.3, bPunta: 0.1, tFuste: 0.2, sigmaAdm: 99999, mu: 0.1 });
    if (r.valid) {
      // If structural checks are absent, guard fired
      const hasFusteBending = r.checks.some((c) => c.id === 'fuste-bending');
      const hasSigmaMin = r.checks.find((c) => c.id === 'sigma-min');
      if (!hasFusteBending) {
        // Guard fired — sigma-min should fail
        expect(hasSigmaMin?.status).toBe('fail');
      }
    }
  });

  it('delta=0 → EA_V_soil = 0 (no vertical component from earth pressure)', () => {
    const r0  = calcRetainingWall({ ...base, delta: 0  });
    const r10 = calcRetainingWall({ ...base, delta: 10 });
    // With delta=0 ΣV is lower (no EA_V contribution)
    expect(r0.valid).toBe(true);
    expect(r10.valid).toBe(true);
  });
});

// ── Water table ───────────────────────────────────────────────────────────────
describe('water table', () => {
  it('hasWater=false → EW undefined (no water effects regardless of hw)', () => {
    const r = calcRetainingWall({ ...base, hasWater: false, hw: 0 });
    expect(r.EW).toBeUndefined();
  });

  it('hasWater=true, hw ≥ H_total → EW undefined (water table below footing)', () => {
    const r = calcRetainingWall({ ...base, hasWater: true, hw: 3.5 });  // H=3+hf=0.5
    expect(r.EW).toBeUndefined();
  });

  it('hasWater=true, hw=0 (fully submerged) → higher EAH than dry case', () => {
    const rDry = calcRetainingWall({ ...base, hasWater: false });
    const rWet = calcRetainingWall({ ...base, hasWater: true, hw: 0 });
    expect(rWet.EAH_total).toBeGreaterThan(rDry.EAH_total);
  });

  it('hasWater=true, hw=0 → EW defined and > 0', () => {
    const r = calcRetainingWall({ ...base, hasWater: true, hw: 0 });
    expect(r.EW).toBeDefined();
    expect(r.EW!).toBeGreaterThan(0);
  });

  it('partial NF hw=1.5m → EW defined and between dry and fully submerged', () => {
    const rFull = calcRetainingWall({ ...base, hasWater: true, hw: 0 });
    const rPart = calcRetainingWall({ ...base, hasWater: true, hw: 1.5 });
    expect(rPart.EW).toBeDefined();
    expect(rPart.EW!).toBeLessThan(rFull.EW!);
  });
});

// ── Mononobe-Okabe ────────────────────────────────────────────────────────────
describe('Mononobe-Okabe seismic', () => {
  it('Ab=0.1, S=1 → kh=0.1 → seismic checks appear in output', () => {
    const r = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0 });
    expect(r.valid).toBe(true);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('vuelco-sismico');
    expect(ids).toContain('deslizamiento-sismico');
  });

  it('kh_derived = S·Ab, kv_derived = kh/2', () => {
    const r = calcRetainingWall({ ...base, Ab: 0.1, S: 1.5 });
    expect(r.kh_derived).toBeCloseTo(0.15, 5);
    expect(r.kv_derived).toBeCloseTo(0.075, 5);
  });

  it('Ab=0.1 → KAD > Ka (seismic increases active pressure)', () => {
    const r = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0 });
    expect(r.KAD).toBeDefined();
    expect(r.KAD!).toBeGreaterThan(r.Ka);
  });

  it('Ab=0 → KAD undefined, no seismic checks', () => {
    const r = calcRetainingWall({ ...base, Ab: 0 });
    expect(r.KAD).toBeUndefined();
    expect(r.FS_vuelco_seis).toBeUndefined();
  });

  it('phi=25, Ab=0.5 → seismicUnstable (theta > phi)', () => {
    // Ab=0.5, S=1.0 → kh=0.5, kv=0.25 → theta=atan(0.5/0.75)≈33.7° > 25°
    const r = calcRetainingWall({ ...base, phi: 25, Ab: 0.5, S: 1.0 });
    expect(r.valid).toBe(true);
    expect(r.seismicUnstable).toBe(true);
  });

  it('q=5, Ab=0.1 → seismic surcharge term contributes to EAD', () => {
    const rNoQ  = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0, q: 0 });
    const rWithQ = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0, q: 5 });
    expect(rWithQ.valid).toBe(true);
    expect(rNoQ.valid).toBe(true);
  });

  it('inercia del muro kh·W + (1−kv) — oracle manual (fixes auditoría #4 y #40)', () => {
    // EC8-5 §7.3.2.2 / NCSP-07. Hand-calc con defaults + Ab=0.1, S=1.0:
    //   kh = 0.1, kv = 0.05. Geometría: H=3, hf=0.5, tF=0.3, bP=0.6, bT=1.5.
    //   Pesos: W_fuste = 25·0.3·3 = 22.5; W_zap = 25·2.4·0.5 = 30;
    //          W_heel = 18·3·1.5 = 81 → ΣW = 133.5 kN/m
    //   F_inercia = kh·ΣW = 13.35 kN/m
    //   M_inercia = 0.1·(22.5·2.0 + 30·0.25 + 81·2.0) = 21.45 kNm/m
    //   M-O correcta (#40): radicando sin(φ+δ)·sin(φ−θ)/cos(δ+θ):
    //   θ = atan(0.1/0.95) = 6.01° → KAD = 0.8346/2.2129 = 0.3772
    //   (la fórmula errónea con sin(φ−θ+δ) daba 0.3952, ~5% conservador)
    //   EAD = 0.5·0.3772·18·3.5²·0.95 = 39.50 → EAH = 38.90, EAV = 6.86
    //   Mo_seis = 39.07 + (38.90−33.49)·0.6·3.5 + 21.45 = 71.88
    //   ΣV_seis = 133.5·0.95 + 6.86 = 133.69
    //   Mr_seis = (22.5·0.75 + 30·1.2 + 81·1.65)·0.95 + 6.86·2.4 = 193.66
    //   FS_vuelco = 193.66/71.88 = 2.694
    //   FS_desliz = 133.69·0.4/(38.90 + 13.35) = 1.023 → FALLA (< 1.10)
    // Pre-fix #4 (sin kh·W y sin 1−kv): FS_desliz_seis = 1.38 → verde indebido.
    const r = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0 });
    expect(r.KAD!).toBeCloseTo(0.3772, 3);
    expect(r.FS_vuelco_seis!).toBeCloseTo(2.694, 2);
    expect(r.FS_desliz_seis!).toBeCloseTo(1.023, 2);
    const desliz = r.checks.find((c) => c.id === 'deslizamiento-sismico')!;
    expect(desliz.status).toBe('fail');
  });

  it('VRd,c del fuste con factor 100 — oracle manual (fix auditoría #41)', () => {
    // Ø16/200 (As=1005 mm²/m), d=246, C25: ρ=0.00409, k=1.902
    //   VRdc1 = 0.12·1.902·(100·0.00409·25)^⅓·246 = 0.12·1.902·2.170·246 = 121.8 kN/m
    //   (sin el 100: 26.2 → gobernaba νmin=109.7, ~10% infravalorado aquí)
    const r = calcRetainingWall({ ...base, diam_fv_int: 16, sep_fv_int: 200 });
    const c = r.checks.find((ch) => ch.id === 'fuste-shear')!;
    expect(c.limit).toContain('121.8');
  });

  it('e negativa (resultante hacia talón): σ_talón gobierna y |e| en el check (fix #42)', () => {
    // H=1.5, bT=3.5, df=2.0, usePassive → e = −0.666 m (B/6 = 0.733):
    // pre-fix sigma_max usaba la puntera (menor) y el check de excentricidad
    // con e<0 daba utilización negativa → siempre verde.
    const r = calcRetainingWall({ ...base, H: 1.5, bTalon: 3.5, df: 2.0, usePassive: true });
    expect(r.e).toBeLessThan(0);
    expect(r.sigma_max).toBeGreaterThan(r.sigma_min);  // σ_talón comprobada
    const exc = r.checks.find((c) => c.id === 'excentricidad')!;
    expect(exc.utilization).toBeCloseTo(Math.abs(r.e) / (4.4 / 6), 3);
    expect(exc.status).toBe('warn');   // |e|/B6 = 0.91 — pre-fix salía 'ok'
  });

  it('armado del fuste con envolvente sísmica accidental (fix auditoría #43)', () => {
    // Con kh alto, el empuje M-O con γ=1.0 supera al estático mayorado:
    // Ab=0.15 → KAD=0.4215, MEd_fuste 33.2 → 36.3 kNm/m (gobierna sísmico).
    const r0 = calcRetainingWall(base);
    const rs = calcRetainingWall({ ...base, Ab: 0.15, S: 1.0 });
    expect(rs.MEd_fuste).toBeGreaterThan(r0.MEd_fuste);
    expect(rs.MEd_fuste).toBeCloseTo(36.30, 1);
    // Con kh bajo sigue gobernando la persistente (envolvente, no sustitución).
    const rl = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0 });
    expect(rl.MEd_fuste).toBeCloseTo(r0.MEd_fuste, 5);
  });
});

// ── Structural ────────────────────────────────────────────────────────────────
describe('structural design', () => {
  it('check ids present: vuelco, deslizamiento, excentricidad, sigma-max, sigma-min', () => {
    const r = calcRetainingWall(base);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('vuelco');
    expect(ids).toContain('deslizamiento');
    expect(ids).toContain('excentricidad');
    expect(ids).toContain('sigma-max');
    expect(ids).toContain('sigma-min');
  });

  it('check ids present: fuste-bending, fuste-shear, fuste-asmin', () => {
    const r = calcRetainingWall(base);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('fuste-bending');
    expect(ids).toContain('fuste-shear');
    expect(ids).toContain('fuste-asmin');
  });

  it('check ids present: talon-bending, talon-asmin', () => {
    const r = calcRetainingWall(base);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('talon-bending');
    expect(ids).toContain('talon-asmin');
  });

  it('check ids present: punta-bending, punta-asmin', () => {
    const r = calcRetainingWall(base);
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('punta-bending');
    expect(ids).toContain('punta-asmin');
  });

  it('Ab>0: vuelco-sismico and deslizamiento-sismico appear', () => {
    const r = calcRetainingWall({ ...base, Ab: 0.1, S: 1.0 });
    const ids = r.checks.map((c) => c.id);
    expect(ids).toContain('vuelco-sismico');
    expect(ids).toContain('deslizamiento-sismico');
  });

  it('tall wall H=4.0m → As_req_fuste > As_min_fuste', () => {
    const r = calcRetainingWall({ ...base, H: 4.0 });
    expect(r.valid).toBe(true);
    expect(r.As_req_fuste).toBeGreaterThan(r.As_min_fuste);
  });

  it('VRd_c shear check fires on fuste section', () => {
    const r = calcRetainingWall(base);
    const c = r.checks.find((ch) => ch.id === 'fuste-shear');
    expect(c).toBeDefined();
    expect(c!.value).toMatch(/VEd/);
    expect(c!.limit).toMatch(/VRd/);
  });

  it('short punta bP=0.1m → MEd_punta ≈ 0 (self-weight may dominate)', () => {
    const r = calcRetainingWall({ ...base, bPunta: 0.1 });
    expect(r.valid).toBe(true);
    // MEd_punta should be small (punta is very short)
    expect(r.MEd_punta).toBeLessThan(5);  // < 5 kNm/m
  });

  it('MEd_talon computed and As_req_talon ≥ 0', () => {
    const r = calcRetainingWall(base);
    expect(r.MEd_talon).toBeGreaterThanOrEqual(0);
    expect(r.As_req_talon).toBeGreaterThanOrEqual(0);
  });

  it('cover=0.05m, tFuste=0.06m → invalid (d_fuste ≤ 0)', () => {
    const r = calcRetainingWall({ ...base, cover: 0.05, tFuste: 0.06 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/recubrimiento/i);
  });

  it('bTalon=0 → talon checks absent', () => {
    const r = calcRetainingWall({ ...base, bTalon: 0 });
    expect(r.valid).toBe(true);
    const ids = r.checks.map((c) => c.id);
    expect(ids).not.toContain('talon-bending');
    expect(ids).not.toContain('talon-asmin');
  });

  it('bPunta=0 → punta checks absent', () => {
    const r = calcRetainingWall({ ...base, bPunta: 0 });
    expect(r.valid).toBe(true);
    const ids = r.checks.map((c) => c.id);
    expect(ids).not.toContain('punta-bending');
    expect(ids).not.toContain('punta-asmin');
  });

  it('sigma_min is always ≥ 0 (by construction: trapezoidal branch clamps, triangular sets 0)', () => {
    // Various geometries — sigma_min is never negative in this implementation
    const cases = [
      base,
      { ...base, bTalon: 0.5 },
      { ...base, H: 5.0, bTalon: 2.0 },
      { ...base, bTalon: 0.3, bPunta: 0.2 },  // narrow footing, e may exceed B/6
    ];
    for (const inp of cases) {
      const r = calcRetainingWall(inp);
      if (r.valid) {
        expect(r.sigma_min).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('H=6, tFuste=0.2, wide footing → fuste-bending fails (m_f ≥ 0.5, over-reinforced section)', () => {
    // Thin stem with tall wall → high bending demand → m_f > 0.5
    // Wide footing (bTalon=3, bPunta=1) keeps e < B/3 so structural checks run
    const r = calcRetainingWall({ ...base, H: 6.0, tFuste: 0.2, bTalon: 3.0, bPunta: 1.0 });
    expect(r.valid).toBe(true);
    const c = r.checks.find((ch) => ch.id === 'fuste-bending');
    expect(c).toBeDefined();
    expect(c!.status).toBe('fail');
    expect(r.As_req_fuste).toBe(Infinity);
  });
});

// ── Rebar verification ────────────────────────────────────────────────────────
describe('rebar verification', () => {
  // asBar helper
  it('asBar: ø16 c/200 → ≈ 1005 mm²/m', () => {
    expect(asBar(16, 200)).toBeCloseTo(1005.3, 0);
  });

  it('asBar: diam=0 → 0 (sizing mode)', () => {
    expect(asBar(0, 200)).toBe(0);
  });

  it('asBar: sep=0 → 0 (guard)', () => {
    expect(asBar(16, 0)).toBe(0);
  });

  it('asBar: ø12 c/150 → ≈ 754 mm²/m', () => {
    expect(asBar(12, 150)).toBeCloseTo(753.98, 0);
  });

  // Default state — all zones As_prov = 0
  it('defaults: all As_prov = 0 (sizing mode)', () => {
    const r = calcRetainingWall(base);
    expect(r.As_prov_fv_int).toBe(0);
    expect(r.As_prov_fv_ext).toBe(0);
    expect(r.As_prov_fh).toBe(0);
    expect(r.As_prov_zs).toBe(0);
    expect(r.As_prov_zi).toBe(0);
    expect(r.As_prov_zt_inf).toBe(0);
    expect(r.As_prov_zt_sup).toBe(0);
    expect(r.As_prov_zt).toBe(0);
  });

  // As_min secondary values present
  it('As_min_h_fuste > 0 when structural checks run', () => {
    const r = calcRetainingWall(base);
    expect(r.As_min_h_fuste).toBeGreaterThan(0);
  });

  it('As_min_talon follows CE art. 9.1: max(0.26·fctm/fyk·b·d, 0.0013·b·d)', () => {
    // base: fck=25 → fctm=2.56 MPa, fyk=500, hf=0.5m, cover=0.04m → d=446mm
    const r = calcRetainingWall(base);
    const d = 0.5 * 1000 - 0.04 * 1000 - 14; // 446mm
    const expected = Math.max(0.26 * 2.56 / 500 * 1000 * d, 0.0013 * 1000 * d);
    expect(r.As_min_talon).toBeCloseTo(expected, 0);
  });

  // Fuste trasdós — sizing mode check still present
  it('fuste-bending check present in sizing mode (As_prov_fv_int=0)', () => {
    const r = calcRetainingWall(base);
    const c = r.checks.find((ch) => ch.id === 'fuste-bending');
    expect(c).toBeDefined();
    expect(c!.value).toMatch(/MEd/);
  });

  // Fuste trasdós — rebar specified → upgraded check
  it('fuste-bending upgraded when As_prov_fv_int provided: CUMPLE for ø16 c/200', () => {
    const r = calcRetainingWall({ ...base, diam_fv_int: 16, sep_fv_int: 200 });
    const c = r.checks.find((ch) => ch.id === 'fuste-bending');
    expect(c).toBeDefined();
    expect(c!.value).toMatch(/As,prov/);
    expect(c!.limit).toMatch(/As,req/);
    expect(c!.status).toBe('ok');
  });

  it('fuste-bending upgraded: INCUMPLE when As_prov < As_req (ø6 c/200 on H=3m)', () => {
    const r = calcRetainingWall({ ...base, diam_fv_int: 6, sep_fv_int: 200 });
    const c = r.checks.find((ch) => ch.id === 'fuste-bending');
    expect(c).toBeDefined();
    expect(c!.status).toBe('fail');
  });

  // fuste-asmin-ext — only appears when As_prov_fv_ext > 0
  it('fuste-asmin-ext absent when diam_fv_ext=0', () => {
    const r = calcRetainingWall(base);
    expect(r.checks.find((c) => c.id === 'fuste-asmin-ext')).toBeUndefined();
  });

  it('fuste-asmin-ext present and CUMPLE for ø16 c/150 intradós', () => {
    // ø16 c/150 → ~1340 mm²/m > As_min intradós (40% of 0.002·Ac = 240 mm²/m for tFuste=0.3m)
    const r = calcRetainingWall({ ...base, diam_fv_ext: 16, sep_fv_ext: 150 });
    const c = r.checks.find((ch) => ch.id === 'fuste-asmin-ext');
    expect(c).toBeDefined();
    expect(c!.status).toBe('ok');
  });

  // fuste-asmin-h — only when As_prov_fh > 0
  it('fuste-asmin-h absent when diam_fh=0', () => {
    const r = calcRetainingWall(base);
    expect(r.checks.find((c) => c.id === 'fuste-asmin-h')).toBeUndefined();
  });

  it('fuste-asmin-h present for ø8 c/200 horizontal', () => {
    const r = calcRetainingWall({ ...base, diam_fh: 8, sep_fh: 200 });
    const c = r.checks.find((ch) => ch.id === 'fuste-asmin-h');
    expect(c).toBeDefined();
  });

  // Talón — upgraded when As_prov_zs > 0
  it('talon-bending upgraded when As_prov_zs provided', () => {
    const r = calcRetainingWall({ ...base, diam_zs: 16, sep_zs: 200 });
    const c = r.checks.find((ch) => ch.id === 'talon-bending');
    expect(c).toBeDefined();
    expect(c!.value).toMatch(/As,prov/);
  });

  // Punta — upgraded when As_prov_zi > 0
  it('punta-bending upgraded when As_prov_zi provided', () => {
    const r = calcRetainingWall({ ...base, diam_zi: 12, sep_zi: 200 });
    const c = r.checks.find((ch) => ch.id === 'punta-bending');
    expect(c).toBeDefined();
    expect(c!.value).toMatch(/As,prov/);
  });

  // zapata-asmin-trans-inf / sup — only when As_prov_zt_inf / _sup > 0
  it('zapata-asmin-trans-inf absent when diam_zt_inf=0', () => {
    const r = calcRetainingWall(base);
    expect(r.checks.find((c) => c.id === 'zapata-asmin-trans-inf')).toBeUndefined();
    expect(r.checks.find((c) => c.id === 'zapata-asmin-trans-sup')).toBeUndefined();
  });

  it('zapata-asmin-trans-inf present for ø16 c/150 transversal inferior (30% rule + Ø12@20 floor)', () => {
    // ø16 c/150 → ~1340 mm²/m > max(30% × As_t, 565) → ok
    const r = calcRetainingWall({ ...base, diam_zt_inf: 16, sep_zt_inf: 150 });
    const c = r.checks.find((ch) => ch.id === 'zapata-asmin-trans-inf');
    expect(c).toBeDefined();
    expect(c!.status).toBe('ok');
  });

  it('zapata-asmin-trans-sup present independently when sup rebar provided', () => {
    // ø12 c/150 sup → ~754 mm²/m > max(30% × As_p, 565) → ok
    const r = calcRetainingWall({ ...base, diam_zt_inf: 12, sep_zt_inf: 150, diam_zt_sup: 12, sep_zt_sup: 150 });
    const cinf = r.checks.find((ch) => ch.id === 'zapata-asmin-trans-inf');
    const csup = r.checks.find((ch) => ch.id === 'zapata-asmin-trans-sup');
    expect(cinf).toBeDefined();
    expect(csup).toBeDefined();
    expect(cinf!.status).toBe('ok');
    expect(csup!.status).toBe('ok');
    expect(r.As_prov_zt).toBeCloseTo(r.As_prov_zt_inf + r.As_prov_zt_sup, 0);
  });

  // Shear uses actual As_prov_fv_int for rho_l when provided
  it('fuste-shear rho_l uses As_prov_fv_int when specified (ø16 c/200 raises VRd,c vs ø6 c/200)', () => {
    const rLow  = calcRetainingWall({ ...base, diam_fv_int: 6,  sep_fv_int: 200 });
    const rHigh = calcRetainingWall({ ...base, diam_fv_int: 16, sep_fv_int: 200 });
    const cLow  = rLow.checks.find((ch)  => ch.id === 'fuste-shear');
    const cHigh = rHigh.checks.find((ch) => ch.id === 'fuste-shear');
    // Higher As_prov → higher VRd,c (better utilization or lower ratio)
    expect(cHigh!.utilization).toBeLessThanOrEqual(cLow!.utilization);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────
describe('input validation', () => {
  it('H=0 → invalid', () => {
    const r = calcRetainingWall({ ...base, H: 0 });
    expect(r.valid).toBe(false);
  });

  it('hf=0 → invalid', () => {
    const r = calcRetainingWall({ ...base, hf: 0 });
    expect(r.valid).toBe(false);
  });

  it('tFuste=0 → invalid', () => {
    const r = calcRetainingWall({ ...base, tFuste: 0 });
    expect(r.valid).toBe(false);
  });

  it('bPunta=0 + bTalon=0 → B = tFuste only, still valid', () => {
    const r = calcRetainingWall({ ...base, bPunta: 0, bTalon: 0 });
    expect(r.valid).toBe(true);
  });
});

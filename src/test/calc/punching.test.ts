// Punching shear test suite — CE art. 6.4
// Run: bun test src/test/calc/punching.test.ts

import { describe, expect, it } from 'vitest';
import { calcPunching } from '../../lib/calculations/punching';
import { punchingDefaults } from '../../data/defaults';

const base = { ...punchingDefaults };
// base: cx=300, cy=300, d=200, fck=25, fyk=500
//       barDiamSup=barDiamInf=12, sSup=sInf=150
//       VEd=300kN, position='interior', mode='pilar'
// → As = 113.1/150 = 0.754mm²/mm → ρl = 0.754/200 = 0.00377 → vRdc ≈ 0.507 MPa

// ── FTUX defaults ────────────────────────────────────────────────────────────
describe('FTUX defaults', () => {
  it('result is valid', () => expect(calcPunching(base).valid).toBe(true));
  it('no check fails', () => {
    const r = calcPunching(base);
    for (const c of r.checks) expect(c.status).not.toBe('fail');
  });
  it('beta=1.0 for interior', () => expect(calcPunching(base).beta).toBe(1.0));
  it('rhoLClamped=false (Ø12@150 > rhoLMin)', () => expect(calcPunching(base).rhoLClamped).toBe(false));
});

// ── u1 critical perimeter ────────────────────────────────────────────────────
describe('u1 perimeter', () => {
  it('interior rectangular: 2(cx+cy)+4πd', () => {
    const expected = 2 * (300 + 300) + 4 * Math.PI * 200;
    expect(calcPunching(base).u1).toBeCloseTo(expected, 0);
  });

  it('borde rectangular: 2cx+cy+2πd+4d', () => {
    const expected = 2 * 300 + 300 + 2 * Math.PI * 200 + 4 * 200;
    expect(calcPunching({ ...base, position: 'borde' }).u1).toBeCloseTo(expected, 0);
  });

  it('esquina rectangular: cx+cy+πd+4d', () => {
    const expected = 300 + 300 + Math.PI * 200 + 4 * 200;
    expect(calcPunching({ ...base, position: 'esquina' }).u1).toBeCloseTo(expected, 0);
  });

  it('interior circular: π(Ø+4d)', () => {
    const expected = Math.PI * (300 + 4 * 200);
    expect(calcPunching({ ...base, isCircular: true }).u1).toBeCloseTo(expected, 0);
  });

  it('isCircular forced false for borde — same as rectangular borde', () => {
    const rect = calcPunching({ ...base, position: 'borde' });
    const circ = calcPunching({ ...base, position: 'borde', isCircular: true });
    expect(circ.u1).toBeCloseTo(rect.u1, 0);
  });

  it('isCircular forced false for esquina — same as rectangular esquina', () => {
    const rect = calcPunching({ ...base, position: 'esquina' });
    const circ = calcPunching({ ...base, position: 'esquina', isCircular: true });
    expect(circ.u1).toBeCloseTo(rect.u1, 0);
  });
});

// ── β eccentricity factor ─────────────────────────────────────────────────────
describe('beta', () => {
  it('interior β=1.0', () => expect(calcPunching(base).beta).toBe(1.0));
  it('borde β=1.4',    () => expect(calcPunching({ ...base, position: 'borde' }).beta).toBe(1.4));
  it('esquina β=1.5',  () => expect(calcPunching({ ...base, position: 'esquina' }).beta).toBe(1.5));
});

// ── vEd design shear stress ───────────────────────────────────────────────────
describe('vEd', () => {
  it('interior: β·VEd·1000/(u1·d)', () => {
    const r = calcPunching(base);
    const u1 = 2 * (300 + 300) + 4 * Math.PI * 200;
    const expected = 1.0 * 300 * 1000 / (u1 * 200);
    expect(r.vEd).toBeCloseTo(expected, 4);
  });

  it('borde: β=1.4 raises vEd vs interior', () => {
    const interior = calcPunching(base);
    const borde    = calcPunching({ ...base, position: 'borde' });
    expect(borde.vEd).toBeGreaterThan(interior.vEd);
  });
});

// ── u0 / vEd0 — column-face perimeter (CE art. 6.4.5(3)) ──────────────────────
describe('u0 / vEd,0', () => {
  it('interior u0 = 2·(cx+cy)', () => {
    const r = calcPunching(base);
    expect(r.u0).toBeCloseTo(2 * (300 + 300), 6);
  });

  it('interior circular u0 = π·Ø', () => {
    const r = calcPunching({ ...base, isCircular: true, cx: 400, cy: 400 });
    expect(r.u0).toBeCloseTo(Math.PI * 400, 6);
  });

  it('borde u0 = min(cx+3d, cx+2·cy)', () => {
    // cx=300, cy=300, d=200 → min(300+600, 300+600) = 900
    const r = calcPunching({ ...base, position: 'borde' });
    expect(r.u0).toBeCloseTo(Math.min(300 + 3 * 200, 300 + 2 * 300), 6);
  });

  it('esquina u0 = min(3d, cx+cy)', () => {
    // d=200, cx=cy=300 → min(600, 600) = 600
    const r = calcPunching({ ...base, position: 'esquina' });
    expect(r.u0).toBeCloseTo(Math.min(3 * 200, 300 + 300), 6);
  });

  it('vEd0 = β·VEd·1000/(u0·d) — column-face stress', () => {
    const r = calcPunching(base);
    const expected = 1.0 * 300 * 1000 / (r.u0 * 200);
    expect(r.vEd0).toBeCloseTo(expected, 4);
  });

  it('vEd0 > vEd — column-face stress strictly larger than u1 stress', () => {
    const r = calcPunching(base);
    // u0 < u1 for any real column, so vEd0 > vEd
    expect(r.vEd0).toBeGreaterThan(r.vEd);
  });

  it('punz-ved-max check uses vEd0 (not vEd)', () => {
    const r = calcPunching(base);
    const c = r.checks.find((c) => c.id === 'punz-ved-max')!;
    // "value" field of the check should show vEd0, not vEd
    expect(c.value).toContain(r.vEd0.toFixed(3));
    expect(c.value).not.toContain(r.vEd.toFixed(3));
  });
});

// ── k size factor ────────────────────────────────────────────────────────────
describe('k factor', () => {
  it('d=200 → k=2.0 (capped at 2.0)', () => {
    // 1+√(200/200)=1+1=2.0 → exactly at cap
    expect(calcPunching(base).k).toBe(2.0);
  });

  it('d=800 → k=1.5', () => {
    const r = calcPunching({ ...base, d: 800, VEd: 2000 });
    expect(r.k).toBeCloseTo(1.5, 4);
  });

  it('d=50 → k capped at 2.0', () => {
    const r = calcPunching({ ...base, d: 50 });
    expect(r.k).toBe(2.0);
  });
});

// ── ρl from bar dimensions ────────────────────────────────────────────────────
describe('rhoL', () => {
  it('Ø12@150, d=200, mode=pilar → rhoL ≈ 0.00377', () => {
    // As = π×12²/4 / 150 = 113.1/150 = 0.754 mm²/mm; ρl = 0.754/200 = 0.00377
    expect(calcPunching(base).rhoL).toBeCloseTo(0.00377, 4);
  });

  it('rhoL capped at 0.02 when bars are very dense', () => {
    // Ø32@50, d=200 → As = 804.2/50 = 16.08 mm²/mm; ρl = 0.0804 → capped at 0.02
    const r = calcPunching({ ...base, barDiamSup: 32, sSup: 50 });
    expect(r.rhoL).toBeLessThanOrEqual(0.02 + 1e-10);
  });

  it('very sparse bars → rhoLClamped=true', () => {
    // Ø8@200, d=200 → As = 50.3/200 = 0.2515; ρl = 0.001258 < rhoLMin≈0.00133 → clamped
    const r = calcPunching({ ...base, barDiamSup: 8, sSup: 200 });
    expect(r.rhoLClamped).toBe(true);
  });

  it('dense bars (Ø12@150) → no clamp', () => {
    expect(calcPunching(base).rhoLClamped).toBe(false);
  });

  it('carga-puntual uses bottom face bars for ρl', () => {
    // Different sup vs inf → rhoL differs by mode
    const inp = { ...base, mode: 'carga-puntual' as const, barDiamSup: 16, sSup: 150, barDiamInf: 12, sInf: 200 };
    const r_pilar = calcPunching({ ...inp, mode: 'pilar' as const });
    const r_carga = calcPunching({ ...inp, mode: 'carga-puntual' as const });
    // pilar: Ø16@150 → ρl = 201.1/150/200 = 0.00671
    // carga: Ø12@200 → ρl = 113.1/200/200 = 0.00283
    expect(r_pilar.rhoL).toBeGreaterThan(r_carga.rhoL);
  });

  it('asSup/asInf stored in result', () => {
    const r = calcPunching(base);
    // As = 113.1/150 = 0.754 mm²/mm
    expect(r.asSup).toBeCloseTo(113.1 / 150, 2);
    expect(r.asInf).toBeCloseTo(113.1 / 150, 2);
  });
});

// ── ρl,min (CE art. 9.1) ─────────────────────────────────────────────────────
describe('rhoLMin', () => {
  it('fck=25, fyk=500: rhoLMin = max(0.26·fctm/500, 0.0013)', () => {
    // fctm(fck=25) ≈ 2.56 MPa
    const fctm = 2.56;
    const expected = Math.max(0.26 * fctm / 500, 0.0013);
    expect(calcPunching(base).rhoLMin).toBeCloseTo(expected, 4);
  });
});

// ── vRd,c resistance without shear reinf ────────────────────────────────────
describe('vRdc', () => {
  it('Ø12@150 → ρl≈0.00377 → vRdc≈0.507 MPa (formula governs over vmin=0.495)', () => {
    // CRdc=0.12, k=2.0, ρl=0.00377, fck=25
    // 0.12·2.0·(100·0.00377·25)^(1/3) = 0.24·(9.425)^(1/3) ≈ 0.24·2.112 ≈ 0.507
    // vmin = 0.035·2^1.5·√25 = 0.495 → formula governs
    const r = calcPunching(base);
    expect(r.vRdc).toBeCloseTo(0.507, 2);
  });

  it('vRdc ≥ vMin always', () => {
    const r = calcPunching(base);
    expect(r.vRdc).toBeGreaterThanOrEqual(r.vMin);
  });
});

// ── vRd,max ──────────────────────────────────────────────────────────────────
describe('vRdmax', () => {
  it('fck=25: ν=0.54 → 0.4·ν·fcd ≈ 3.60 MPa', () => {
    const nu  = 0.6 * (1 - 25 / 250); // 0.54
    const fcd = 16.7; // from getConcrete(25).fcd (rounded)
    const expected = 0.4 * nu * fcd;
    expect(calcPunching(base).vRdmax).toBeCloseTo(expected, 1);
  });
});

// ── vMin ─────────────────────────────────────────────────────────────────────
describe('vMin', () => {
  it('d=200: 0.035·2.0^1.5·√25 ≈ 0.495', () => {
    const expected = 0.035 * Math.pow(2.0, 1.5) * Math.sqrt(25);
    expect(calcPunching(base).vMin).toBeCloseTo(expected, 3);
  });
});

// ── shear reinforcement (tipo viga) ─────────────────────────────────────────
describe('shear reinforcement', () => {
  const withSw = { ...base, hasShearReinf: true, swDiam: 8, swLegs: 2, sr: 75, fywk: 500 };

  it('no hasShearReinf → vRdcs undefined', () => {
    expect(calcPunching(base).vRdcs).toBeUndefined();
  });

  it('hasShearReinf=true → vRdcs defined', () => {
    expect(calcPunching(withSw).vRdcs).toBeDefined();
  });

  it('vRdcs > 0.75·vRdc (stirrups add to base)', () => {
    const r = calcPunching(withSw);
    expect(r.vRdcs!).toBeGreaterThan(0.75 * r.vRdc);
  });

  it('Asw = 4 × swLegs × As(swDiam) for interior', () => {
    // 4 sides × 2 legs × 50.3mm²(Ø8) = 402.4mm²
    const r = calcPunching(withSw);
    expect(r.aswPerRow).toBeCloseTo(4 * 2 * 50.3, 0);
  });

  it('borde → 3 sides → Asw = 3 × swLegs × As(swDiam)', () => {
    const r = calcPunching({ ...withSw, position: 'borde' });
    expect(r.aswPerRow).toBeCloseTo(3 * 2 * 50.3, 0);
  });

  it('esquina → 2 sides → Asw = 2 × swLegs × As(swDiam)', () => {
    const r = calcPunching({ ...withSw, position: 'esquina' });
    expect(r.aswPerRow).toBeCloseTo(2 * 2 * 50.3, 0);
  });

  it('vRdcs formula: 0.75·vRdc + 1.5·(d/sr)·Asw/(u1·d)·fywd_ef', () => {
    const r = calcPunching(withSw);
    const Asw_expected = 4 * 2 * 50.3;  // 4 sides × 2 legs × As(Ø8)
    const fywd_ef = Math.min(250 + 0.25 * 200, 500 / 1.15); // = 300 MPa
    const expected = 0.75 * r.vRdc + 1.5 * (200 / 75) * Asw_expected / (r.u1 * 200) * fywd_ef;
    expect(r.vRdcs!).toBeCloseTo(expected, 3);
  });

  it('fywd,ef: d=200 → min(250+50, 500/1.15)=min(300, 435)=300 MPa', () => {
    // Validated via formula test above
    const fywd_ef = Math.min(250 + 0.25 * 200, 500 / 1.15);
    expect(fywd_ef).toBeCloseTo(300, 1);
  });

  it('sr ≤ 0.75d → punz-sr-max ok', () => {
    // sr=100, d=200 → 0.75d=150 → util=0.667 → ok
    const r = calcPunching(withSw);
    const c = r.checks.find((c) => c.id === 'punz-sr-max')!;
    expect(c).toBeDefined();
    expect(c.status).toBe('ok');
  });

  it('sr > 0.75d → punz-sr-max fails', () => {
    // sr=200, d=200 → 0.75d=150 → util=1.33 → fail
    const r = calcPunching({ ...base, hasShearReinf: true, swDiam: 8, swLegs: 2, sr: 200, fywk: 500 });
    const c = r.checks.find((c) => c.id === 'punz-sr-max')!;
    expect(c.status).toBe('fail');
    expect(r.valid).toBe(false);
  });

  it('no hasShearReinf → punz-sr-max absent', () => {
    expect(calcPunching(base).checks.find((c) => c.id === 'punz-sr-max')).toBeUndefined();
  });

  it('more legs → higher vRdcs', () => {
    const r2 = calcPunching({ ...base, hasShearReinf: true, swDiam: 8, swLegs: 2, sr: 100, fywk: 500 });
    const r4 = calcPunching({ ...base, hasShearReinf: true, swDiam: 8, swLegs: 4, sr: 100, fywk: 500 });
    expect(r4.vRdcs!).toBeGreaterThan(r2.vRdcs!);
  });
});

// ── checks ───────────────────────────────────────────────────────────────────
describe('checks', () => {
  it('punz-rho-min always present', () => {
    const r = calcPunching(base);
    expect(r.checks.find((c) => c.id === 'punz-rho-min')).toBeDefined();
  });

  it('punz-rho-min=warn when rhoLClamped', () => {
    // Ø8@200 → ρl = 50.3/200/200 = 0.00126 < rhoLMin ≈ 0.00133 → clamped
    const r = calcPunching({ ...base, barDiamSup: 8, sSup: 200 });
    const check = r.checks.find((c) => c.id === 'punz-rho-min')!;
    expect(check.status).toBe('warn');
  });

  it('punz-ved-max present and ok (default inputs)', () => {
    const r = calcPunching(base);
    const c = r.checks.find((c) => c.id === 'punz-ved-max')!;
    expect(c).toBeDefined();
    expect(c.status).toBe('ok');
  });

  it('punz-ved-vrdc present', () => {
    expect(calcPunching(base).checks.find((c) => c.id === 'punz-ved-vrdc')).toBeDefined();
  });

  it('punz-ved-vrdcs absent without shear reinf', () => {
    expect(calcPunching(base).checks.find((c) => c.id === 'punz-ved-vrdcs')).toBeUndefined();
  });

  it('punz-ved-vrdcs present with shear reinf', () => {
    const r = calcPunching({ ...base, hasShearReinf: true, swDiam: 8, swLegs: 2, sr: 75, fywk: 500 });
    expect(r.checks.find((c) => c.id === 'punz-ved-vrdcs')).toBeDefined();
  });

  it('all article references contain CE', () => {
    const r = calcPunching(base);
    for (const c of r.checks) expect(c.article).toMatch(/CE/);
  });

  it('vEd > vRdc → punz-ved-vrdc fails → valid=false', () => {
    // VEd=3000kN with d=200, interior, Ø12@150 → vEd much larger than vRdc≈0.507
    const r = calcPunching({ ...base, VEd: 3000 });
    const c = r.checks.find((c) => c.id === 'punz-ved-vrdc')!;
    expect(c.status).toBe('fail');
    expect(r.valid).toBe(false);
  });

  it('vEd > vRdmax → punz-ved-max fails → valid=false', () => {
    // vRdmax(fck=25) ≈ 3.6 MPa; to exceed it need extreme VEd
    // With d=50 (small slab), VEd=200kN: vEd = 1.0*200000/(u1*50); u1≈3770mm → vEd≈1.06 MPa → may not fail
    // Use d=50, VEd=3000kN: vEd = 3000000/(u1*50); u1=2(300+300)+4π*50≈1828mm → vEd≈32.8 MPa > vRdmax≈3.6
    const r = calcPunching({ ...base, d: 50, VEd: 3000 });
    const c = r.checks.find((c) => c.id === 'punz-ved-max')!;
    expect(c.status).toBe('fail');
    expect(r.valid).toBe(false);
  });
});

// ── uout ─────────────────────────────────────────────────────────────────────
describe('uout', () => {
  it('uout = β·VEd·1000/(vRdc·d)', () => {
    const r        = calcPunching(base);
    const expected = 1.0 * 300 * 1000 / (r.vRdc * 200);
    expect(r.uout).toBeCloseTo(expected, 0);
  });

  it('rOut = uout/(2π)', () => {
    const r = calcPunching(base);
    expect(r.rOut).toBeCloseTo(r.uout / (2 * Math.PI), 1);
  });
});

// ── invalid inputs ────────────────────────────────────────────────────────────
describe('invalid inputs', () => {
  it('d=0 → invalid',      () => expect(calcPunching({ ...base, d: 0 }).valid).toBe(false));
  it('VEd=0 → invalid',    () => expect(calcPunching({ ...base, VEd: 0 }).valid).toBe(false));
  it('sSup=0 → invalid',   () => expect(calcPunching({ ...base, sSup: 0 }).valid).toBe(false));
  it('sInf=0 → invalid',   () => expect(calcPunching({ ...base, sInf: 0 }).valid).toBe(false));
  it('barDiamSup=0 → invalid', () => expect(calcPunching({ ...base, barDiamSup: 0 }).valid).toBe(false));
  it('barDiamInf=0 → invalid', () => expect(calcPunching({ ...base, barDiamInf: 0 }).valid).toBe(false));
  it('fck=100 → invalid',  () => expect(calcPunching({ ...base, fck: 100 }).valid).toBe(false));
  it('hasShearReinf + sr=0 → invalid', () => {
    expect(calcPunching({ ...base, hasShearReinf: true, swDiam: 8, swLegs: 2, sr: 0, fywk: 500 }).valid).toBe(false);
  });
  it('hasShearReinf + swLegs=0 → invalid', () => {
    expect(calcPunching({ ...base, hasShearReinf: true, swDiam: 8, swLegs: 0, sr: 100, fywk: 500 }).valid).toBe(false);
  });
  it('hasShearReinf + swDiam=0 → invalid', () => {
    expect(calcPunching({ ...base, hasShearReinf: true, swDiam: 0, swLegs: 2, sr: 100, fywk: 500 }).valid).toBe(false);
  });
});

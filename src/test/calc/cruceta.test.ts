import { describe, it, expect } from 'vitest';
import { calcCruceta, sidesForPosition } from '../../lib/calculations/cruceta';
import { punchingDefaults, type PunchingInputs } from '../../data/defaults';

const base: PunchingInputs = { ...punchingDefaults, mode: 'pilar-cruceta' };

// ── sidesForPosition ──────────────────────────────────────────────────────────
describe('sidesForPosition', () => {
  it('interior=4, borde=3, esquina=2', () => {
    expect(sidesForPosition('interior')).toBe(4);
    expect(sidesForPosition('borde')).toBe(3);
    expect(sidesForPosition('esquina')).toBe(2);
  });
});

// Control-perimeter geometry is tested in crossPerimeter.test.ts (the validated
// numerical engine). Here we only test calcCruceta's use of it.

// ── Posición borde/esquina (V2.next, motor de perímetro truncado) ─────────────
describe('borde / esquina con distancia al borde', () => {
  it('borde válido con N moderado y distancia al borde', () => {
    const r = calcCruceta({ ...base, position: 'borde', edgeY: 500, VEd: 150 });
    expect(r.valid).toBe(true);
    expect(r.cruceta!.nArms).toBe(3);
    expect(r.cruceta!.beta).toBeCloseTo(1.4, 6);
  });
  it('esquina válida con N bajo y dos distancias', () => {
    const r = calcCruceta({ ...base, position: 'esquina', edgeY: 500, edgeX: 500, VEd: 80 });
    expect(r.valid).toBe(true);
    expect(r.cruceta!.nArms).toBe(2);
    expect(r.cruceta!.beta).toBeCloseTo(1.5, 6);
  });
  it('acercar el borde RECORTA u1 (más cerca → menor → vEd mayor)', () => {
    const near = calcCruceta({ ...base, position: 'borde', edgeY: 50, VEd: 150 }).cruceta!.u1;
    const far  = calcCruceta({ ...base, position: 'borde', edgeY: 5000, VEd: 150 }).cruceta!.u1;
    expect(near).toBeLessThan(far);
  });
  it('rechaza borde sin distancia al borde (edgeY ≤ 0)', () => {
    const r = calcCruceta({ ...base, position: 'borde', edgeY: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/borde/i);
  });
  it('rechaza esquina sin 2ª distancia (edgeX ≤ 0)', () => {
    const r = calcCruceta({ ...base, position: 'esquina', edgeY: 500, edgeX: 0 });
    expect(r.valid).toBe(false);
  });
});

// ── Forjado / losa de transferencia (interior, armadura de punzonamiento) ──────
describe('forjado', () => {
  const forj = { ...base, substrate: 'forjado' as const };

  it('forjado interior válido; carga = N completo (sin terreno), Kj=1', () => {
    const r = calcCruceta(forj);
    expect(r.valid).toBe(true);
    expect(r.cruceta!.Vdesign).toBeCloseTo(base.VEd, 6);
    expect(r.cruceta!.reliefApplied).toBe(false);
    expect(r.cruceta!.Kj).toBeCloseTo(1, 6);
  });

  it('forjado borde/esquina rechazado (solo interior v1)', () => {
    expect(calcCruceta({ ...forj, position: 'borde', edgeY: 500 }).valid).toBe(false);
    expect(calcCruceta({ ...forj, position: 'esquina', edgeY: 500, edgeX: 500 }).error).toMatch(/interior/i);
  });

  it('forjado ignora el descuento de terreno', () => {
    const r = calcCruceta({ ...forj, soilRelief: true, soilPressure: 200 });
    expect(r.cruceta!.reliefApplied).toBe(false);
    expect(r.cruceta!.Vdesign).toBeCloseTo(base.VEd, 6);
  });

  it('losa fina que no cumple con hormigón → cumple con cercos (vRd,cs gobierna)', () => {
    // d pequeño + N alto: el punzonamiento solo-hormigón no llega.
    const thin = { ...forj, d: 100, VEd: 360 };
    const sin = calcCruceta(thin);
    expect(sin.valid).toBe(false);
    expect(sin.checks.find((c) => c.id === 'cru-punz')!.status).toBe('fail');

    const con = calcCruceta({ ...thin, hasShearReinf: true, swDiam: 12, swLegs: 4, sr: 75, fywk: 500 });
    // cru-punz pasa a informativo; cru-punz-cs es el gate y debe existir.
    expect(con.checks.find((c) => c.id === 'cru-punz')!.status).toBe('neutral');
    expect(con.checks.find((c) => c.id === 'cru-punz-cs')).toBeDefined();
    expect(con.vRdcs!).toBeGreaterThan(con.vRdc); // los cercos suben la resistencia
    // con cercos suficientes, punzonamiento global + núcleo dejan de fallar.
    expect(con.checks.find((c) => c.id === 'cru-punz-cs')!.status).not.toBe('fail');
    expect(con.checks.find((c) => c.id === 'cru-core')!.status).not.toBe('fail');
  });

  it('zapata NO expone cercos aunque hasShearReinf=true (solo forjado)', () => {
    const r = calcCruceta({ ...base, substrate: 'zapata', hasShearReinf: true, swDiam: 10, swLegs: 4, sr: 80 });
    expect(r.checks.find((c) => c.id === 'cru-punz-cs')).toBeUndefined();
    expect(r.vRdcs).toBeUndefined();
  });
});

// ── V2 #6 — α (Kj) bearing concentration ──────────────────────────────────────
describe('concentración EC3 Kj (V2 #6)', () => {
  it('por defecto α=Kj=1 (sin concentración)', () => {
    const r = calcCruceta(base);
    expect(r.cruceta!.Kj).toBeCloseTo(1, 6);
  });

  it('activada en zapata: Kj>1, ≤3, sube f_jd y Vcap', () => {
    const off = calcCruceta(base).cruceta!;
    const on = calcCruceta({ ...base, useConcentration: true }).cruceta!;
    expect(on.Kj).toBeGreaterThan(1);
    expect(on.Kj).toBeLessThanOrEqual(3);
    expect(on.fjd).toBeGreaterThan(off.fjd);
    expect(on.Vcap).toBeGreaterThan(off.Vcap);
  });

  it('f_jd escala linealmente con Kj (off·Kj = on)', () => {
    // off.fjd = βj·1·fcd ; on.fjd = βj·Kj·fcd  →  on.fjd / off.fjd = Kj.
    const off = calcCruceta(base).cruceta!;
    const on = calcCruceta({ ...base, useConcentration: true }).cruceta!;
    expect(on.fjd / off.fjd).toBeCloseTo(on.Kj, 4);
  });

  it('zapata enorme → Kj saturado a 3 (cap EC3)', () => {
    const on = calcCruceta({ ...base, useConcentration: true, footB: 60000, footL: 60000, footH: 60000 }).cruceta!;
    expect(on.Kj).toBeCloseTo(3, 6);
  });

  it('la iteración Ac0↔fjd es determinista y consistente (f_jd = βj·Kj·fcd al converger)', () => {
    // El cap de 5 iteraciones no debe dejar fjd y Kj descuadrados: al salir,
    // el fjd reportado debe seguir siendo exactamente βj·Kj·fcd_local.
    const r = calcCruceta({ ...base, useConcentration: true });
    const c = r.cruceta!;
    const fcdLocal = c.fjd / ((2 / 3) * c.Kj);   // implícito
    expect(c.fjd).toBeCloseTo((2 / 3) * c.Kj * fcdLocal, 9);
    // Determinismo: misma entrada → mismo Kj.
    const r2 = calcCruceta({ ...base, useConcentration: true });
    expect(r2.cruceta!.Kj).toBe(c.Kj);
  });
});


// ── FTUX defaults / benchmark ─────────────────────────────────────────────────
describe('FTUX defaults (HEB200, plate 300×300×20, UPN160, S275, d200, N300)', () => {
  const r = calcCruceta(base);
  const c = r.cruceta!;

  it('result is valid', () => expect(r.valid).toBe(true));
  it('no check fails', () => expect(r.checks.every((ch) => ch.status !== 'fail')).toBe(true));
  it('UPN class 1', () => expect(c.upnClass).toBe(1));
  it('fjd ≈ 11.13 MPa (2/3·16.7)', () => expect(c.fjd).toBeCloseTo(11.13, 1));
  it('bEff = 65 mm (flange width governs)', () => expect(c.bEff).toBeCloseTo(65, 1));
  it('cf ≈ 29.4 mm', () => expect(c.cf).toBeCloseTo(29.4, 1));
  it('M_Rd ≈ 38.76 kN·m (Wpl·fy/γM0)', () => expect(c.MRd).toBeCloseTo(38.76, 1));
  it('L_eff,max ≈ 327.3 mm', () => expect(c.LeffMax).toBeCloseTo(327.3, 1));
  it('Leff = LeffMax in auto mode', () => expect(c.Leff).toBeCloseTo(c.LeffMax, 6));
  // u1 = true 2d-offset of the cross (numerical engine). The old closed form gave
  // 6331 — ~12% too long → unconservative; the validated engine gives ~5641.
  it('u1 ≈ 5641 mm (offset 2d real, < fórmula vieja 6331)', () => {
    expect(c.u1).toBeGreaterThan(5630);
    expect(c.u1).toBeLessThan(5652);
  });
  it('Vcap ≈ 1949 kN', () => expect(c.Vcap).toBeCloseTo(1949, 0));
  it('no suggestion when chosen passes', () => expect(c.suggestedUpn).toBeNull());
  it('exposes cruceta detail only in this mode', () => expect(r.cruceta).toBeDefined());
});

// ── All eight failure surfaces present ────────────────────────────────────────
describe('failure surfaces', () => {
  const r = calcCruceta(base);
  const ids = r.checks.map((ch) => ch.id);
  for (const id of ['cru-class', 'cru-cap', 'cru-punz', 'cru-core', 'cru-tip', 'cru-crush', 'cru-upn-m', 'cru-upn-v', 'cru-weld']) {
    it(`includes ${id}`, () => expect(ids).toContain(id));
  }
});

// ── Profile suggestion (respect choice, recommend) ────────────────────────────
describe('profile escalation suggestion', () => {
  it('chosen UPN fails → suggests a larger passing profile (no auto-switch)', () => {
    const r = calcCruceta({ ...base, VEd: 700, upnSize: 160 });
    expect(r.valid).toBe(false);
    expect(r.cruceta!.upnSize).toBe(160);            // choice unchanged
    expect(r.cruceta!.suggestedUpn).not.toBeNull();
    expect(r.cruceta!.suggestedUpn!).toBeGreaterThan(160);
  });

  it('suggested profile actually passes', () => {
    const r = calcCruceta({ ...base, VEd: 700, upnSize: 160 });
    const sized = calcCruceta({ ...base, VEd: 700, upnSize: r.cruceta!.suggestedUpn! });
    expect(sized.valid).toBe(true);
  });

  it('gama exhausted (load too high for any UPN at this d) → fail + null suggestion', () => {
    const r = calcCruceta({ ...base, VEd: 2500 });
    expect(r.valid).toBe(false);
    expect(r.cruceta!.suggestedUpn).toBeNull();
  });
});

// ── Manual arm length override ────────────────────────────────────────────────
describe('manual arm length', () => {
  it('armLength below LeffMax is used as-is', () => {
    const r = calcCruceta({ ...base, armLength: 100 });
    expect(r.cruceta!.Leff).toBeCloseTo(100, 6);
  });
  it('armLength above LeffMax is capped at LeffMax', () => {
    const r = calcCruceta({ ...base, armLength: 5000 });
    expect(r.cruceta!.Leff).toBeCloseTo(r.cruceta!.LeffMax, 6);
  });
});

// ── Soil relief (zapata) ──────────────────────────────────────────────────────
describe('soil relief', () => {
  it('relief lowers the design load (real cross area, conservative)', () => {
    const off = calcCruceta({ ...base, soilRelief: false });
    const on = calcCruceta({ ...base, soilRelief: true, soilPressure: 150 });
    expect(on.cruceta!.Vdesign).toBeLessThan(off.cruceta!.Vdesign);
    expect(on.cruceta!.reliefApplied).toBe(true);
    expect(off.cruceta!.reliefApplied).toBe(false);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────
describe('input validation', () => {
  const cases: Array<[string, Partial<PunchingInputs>]> = [
    ['d ≤ 0', { d: 0 }],
    ['VEd ≤ 0', { VEd: 0 }],
    ['fck out of range', { fck: 5 }],
    ['plateA ≤ 0', { plateA: 0 }],
    ['plateT ≤ 0', { plateT: 0 }],
    ['weldThroat ≤ 0', { weldThroat: 0 }],
    ['unknown UPN', { upnSize: 999 }],
    ['soilRelief without footing dims', { soilRelief: true, footB: 0 }],
    ['useConcentration without footing dims', { useConcentration: true, footB: 0 }],
  ];
  for (const [label, patch] of cases) {
    it(`rejects ${label}`, () => {
      const r = calcCruceta({ ...base, ...patch });
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    });
  }
});

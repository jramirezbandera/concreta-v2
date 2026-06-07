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

  it('forjado borde válido con distancia al borde + concerns de borde en amber', () => {
    const r = calcCruceta({ ...forj, position: 'borde', edgeY: 500, VEd: 120 });
    expect(r.valid).toBe(true);
    expect(r.cruceta!.nArms).toBe(3);
    // concerns específicos del borde de losa, en amber (verificar a mano)
    for (const id of ['cru-edge-anchor', 'cru-edge-torsion']) {
      const ch = r.checks.find((c) => c.id === id);
      expect(ch, id).toBeDefined();
      expect(ch!.status).toBe('warn');
    }
  });

  it('forjado esquina válido con dos distancias', () => {
    const r = calcCruceta({ ...forj, position: 'esquina', edgeY: 500, edgeX: 500, VEd: 70 });
    expect(r.valid).toBe(true);
    expect(r.cruceta!.nArms).toBe(2);
  });

  it('forjado borde sin distancia al borde se rechaza', () => {
    expect(calcCruceta({ ...forj, position: 'borde', edgeY: 0 }).valid).toBe(false);
  });

  it('los concerns de borde NO aparecen en forjado interior ni en zapata borde', () => {
    const fi = calcCruceta(forj);
    const zb = calcCruceta({ ...base, position: 'borde', edgeY: 500, VEd: 150 });
    expect(fi.checks.some((c) => c.id === 'cru-edge-torsion')).toBe(false);
    expect(zb.checks.some((c) => c.id === 'cru-edge-torsion')).toBe(false);
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

// ── Modelo de bearing EMBEBIDO (interino conservador, 2026-06-07) ──────────────
// El rediseño post-/office-hours: cruz embebida confinada, no placa que apoya.
// f_geom = fcd (no 2/3·fcd) → L_eff más corto → más conservador en punzonamiento.
// V_cap = 2/3·fcd·Acruz (capacidad conservadora). Sin Kj, sin iteración.
describe('bearing embebido confinado (interino)', () => {
  const c = calcCruceta(base).cruceta!;
  const fcd = c.fjd; // f apoyo reportado = fcd

  it('f apoyo = fcd (≈16.7), no 2/3·fcd (11.13) ni Kj', () => {
    expect(c.fjd).toBeCloseTo(16.7, 1);
    expect(c.Kj).toBe(1);
  });
  it('V_cap usa f_cap = 2/3·fcd (capacidad conservadora)', () => {
    const Acruz = 300 * 300 + 4 * c.bEff * c.Leff;          // mm²
    expect(c.Vcap).toBeCloseTo((2 / 3) * fcd * Acruz / 1000, 0); // kN
  });
  it('bEff lo gobierna tw+2·cf (no el ancho del ala) con f=fcd', () => {
    expect(c.bEff).toBeLessThan(65);
  });

  it('aviso "cruceta poco efectiva" cuando L_eff,máx < 200mm (perfil pequeño)', () => {
    // UPN80 → L_eff,máx ≈ 157mm < 200 → warn; UPN200 → ≈ 359mm → sin aviso.
    const small = calcCruceta({ ...base, upnSize: 80 });
    const wSmall = small.checks.find((c) => c.id === 'cru-arm-min');
    expect(wSmall, 'UPN80 debería avisar').toBeDefined();
    expect(wSmall!.status).toBe('warn');

    const big = calcCruceta({ ...base, upnSize: 200 });
    expect(big.checks.some((c) => c.id === 'cru-arm-min')).toBe(false);
  });
});

// ── Filas honestas de estados límite pendientes (amber, no verde) ─────────────
describe('estados límite del embebido pendientes', () => {
  const r = calcCruceta(base);
  it('anclaje/recubrimiento/delaminación presentes como warn (verificar a mano)', () => {
    for (const id of ['cru-anchor', 'cru-cover', 'cru-delam']) {
      const ch = r.checks.find((c) => c.id === id);
      expect(ch, id).toBeDefined();
      expect(ch!.status).toBe('warn');
    }
  });
  it('el verdict global no sale verde limpio (hay warn pendiente)', () => {
    expect(r.checks.some((c) => c.status === 'warn')).toBe(true);
  });
  it('los pendientes NO son fail (avisan, no bloquean el resto)', () => {
    expect(r.valid).toBe(true);
  });
});


// ── FTUX defaults / benchmark ─────────────────────────────────────────────────
describe('FTUX defaults (HEB200, plate 300×300×20, UPN160, S275, d200, N300)', () => {
  const r = calcCruceta(base);
  const c = r.cruceta!;

  it('result is valid (los pendientes son warn, no fail)', () => expect(r.valid).toBe(true));
  it('no check fails', () => expect(r.checks.every((ch) => ch.status !== 'fail')).toBe(true));
  it('UPN class 1', () => expect(c.upnClass).toBe(1));
  // Modelo embebido: f apoyo = fcd (no 2/3·fcd) → bEff/Leff/u1 más conservadores.
  it('fjd ≈ 16.70 N/mm² (= fcd, cruz embebida)', () => expect(c.fjd).toBeCloseTo(16.70, 1));
  it('bEff ≈ 55.5 mm (tw+2·cf gobierna con f=fcd)', () => expect(c.bEff).toBeCloseTo(55.5, 1));
  it('cf ≈ 24.0 mm', () => expect(c.cf).toBeCloseTo(24.0, 1));
  it('M_Rd ≈ 38.76 kN·m (Wpl·fy/γM0)', () => expect(c.MRd).toBeCloseTo(38.76, 1));
  it('L_eff,max ≈ 289.2 mm (< 327 del modelo viejo → conservador)', () => expect(c.LeffMax).toBeCloseTo(289.2, 1));
  it('Leff = LeffMax in auto mode', () => expect(c.Leff).toBeCloseTo(c.LeffMax, 6));
  // u1 más corto que el modelo previo (5641) → más conservador (vEd mayor).
  it('u1 ≈ 5315 mm (< 5641 previo < 6331 fórmula vieja)', () => {
    expect(c.u1).toBeGreaterThan(5300);
    expect(c.u1).toBeLessThan(5330);
  });
  it('Vcap ≈ 1717 kN (f_cap = 2/3·fcd)', () => expect(c.Vcap).toBeCloseTo(1717, 0));
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
  ];
  for (const [label, patch] of cases) {
    it(`rejects ${label}`, () => {
      const r = calcCruceta({ ...base, ...patch });
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    });
  }
});

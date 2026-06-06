import { describe, it, expect } from 'vitest';
import { calcCruceta, crossControlPerimeter, sidesForPosition } from '../../lib/calculations/cruceta';
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

// ── crossControlPerimeter (hand-verified, interior) ───────────────────────────
describe('crossControlPerimeter', () => {
  it('interior plate 300×300, bEff 65, Leff 327.3, d 200', () => {
    const p = crossControlPerimeter(300, 300, 65, 327.3, 200, 4);
    expect(p.u0).toBeCloseTo(1200, 1);
    expect(p.uCore).toBeCloseTo(3713.27, 1);   // 1200 + 2π·400
    expect(p.u1).toBeCloseTo(6331.67, 1);       // 1200 + 8·327.3 + 2π·400
    expect(p.uTip).toBeCloseTo(1976.24, 1);     // 2·327.3 + 65 + π·400
    expect(p.Acruz).toBeCloseTo(175098, 0);     // 300² + 4·65·327.3
  });

  it('straight part grows by 2·nArms·Leff', () => {
    const a = crossControlPerimeter(300, 300, 65, 100, 200, 4);
    const b = crossControlPerimeter(300, 300, 65, 200, 200, 4);
    expect(b.u1 - a.u1).toBeCloseTo(2 * 4 * 100, 6);
  });

  it('degenerate Leff=0 collapses u1 to bare-plate uCore', () => {
    const p = crossControlPerimeter(300, 300, 65, 0, 200, 4);
    expect(p.u1).toBeCloseTo(p.uCore, 6);
    expect(p.Acruz).toBeCloseTo(90000, 6);
  });

  // V2 #1 — borde (3 brazos) y esquina (2 brazos), hand-verified.
  it('borde: 3 brazos, plate 300×300, bEff 65, Leff 327.3, d 200', () => {
    const p = crossControlPerimeter(300, 300, 65, 327.3, 200, 3, 'borde');
    expect(p.u0).toBeCloseTo(900, 1);          // A + 2B
    expect(p.uCore).toBeCloseTo(2156.64, 1);    // 900 + π·400 (½ arc)
    expect(p.u1).toBeCloseTo(4120.44, 1);       // 900 + 6·327.3 + π·400
    expect(p.uTip).toBeCloseTo(1976.24, 1);     // arm strip (position-independent)
    expect(p.Acruz).toBeCloseTo(153823.5, 0);   // 300² + 3·65·327.3
  });

  it('esquina: 2 brazos, plate 300×300, bEff 65, Leff 327.3, d 200', () => {
    const p = crossControlPerimeter(300, 300, 65, 327.3, 200, 2, 'esquina');
    expect(p.u0).toBeCloseTo(600, 1);           // A + B
    expect(p.uCore).toBeCloseTo(1228.32, 1);     // 600 + ½π·400 (¼ arc)
    expect(p.u1).toBeCloseTo(2537.52, 1);        // 600 + 4·327.3 + ½π·400
    expect(p.Acruz).toBeCloseTo(132549, 0);      // 300² + 2·65·327.3
  });

  it('u1 shrinks interior > borde > esquina (fewer arms + free edges)', () => {
    const i = crossControlPerimeter(300, 300, 65, 327.3, 200, 4, 'interior');
    const b = crossControlPerimeter(300, 300, 65, 327.3, 200, 3, 'borde');
    const e = crossControlPerimeter(300, 300, 65, 327.3, 200, 2, 'esquina');
    expect(i.u1).toBeGreaterThan(b.u1);
    expect(b.u1).toBeGreaterThan(e.u1);
  });
});

// ── Scope gate: borde/esquina/forjado REVERTIDOS (eng-review 2026-06-07) ───────
// El perímetro borde/esquina no trunca el offset 2d ni uTip en el borde libre
// (Codex): puede subestimar vEd → inseguro. calcCruceta los rechaza hasta que
// llegue el modelo de borde con distancia al borde. La forma cerrada del helper
// sigue testeada arriba como semilla del modelo futuro (no va al producto).
describe('scope gate interior+zapata (V2.next pendiente)', () => {
  it('rechaza posición borde', () => {
    const r = calcCruceta({ ...base, position: 'borde' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/interior/i);
  });
  it('rechaza posición esquina', () => {
    const r = calcCruceta({ ...base, position: 'esquina' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/interior/i);
  });
  it('rechaza sustrato forjado', () => {
    const r = calcCruceta({ ...base, substrate: 'forjado' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/zapata/i);
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
  it('u1 ≈ 6331.7 mm', () => expect(c.u1).toBeCloseTo(6331.7, 1));
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

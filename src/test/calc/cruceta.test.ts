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
    const thin = { ...forj, d: 90, VEd: 450 };
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

  it('aviso "perfil corto" cuando el acero no alcanza la longitud del detalle (luz/8)', () => {
    // UPN80 muy cargado (N900) → el acero solo llega ~190mm, por debajo de luz/8 → warn.
    const small = calcCruceta({ ...base, upnSize: 80, VEd: 900 });
    const wSmall = small.checks.find((c) => c.id === 'cru-arm-min');
    expect(wSmall, 'UPN80 N900 debería avisar').toBeDefined();
    expect(wSmall!.status).toBe('warn');
    // UPN160 a carga normal reparte de sobra → sin aviso.
    expect(calcCruceta(base).checks.some((c) => c.id === 'cru-arm-min')).toBe(false);
  });
});

// ── Tabla canto→UPN del detalle tipo (solo forjado) ───────────────────────────
describe('tabla canto→UPN (guía del detalle, solo forjado)', () => {
  const f = { ...base, substrate: 'forjado' as const };

  it('forjado muestra la fila de guía de tabla (neutral)', () => {
    const t = calcCruceta({ ...f, d: 200, upnSize: 160 }).checks.find((c) => c.id === 'cru-table');
    expect(t).toBeDefined();
    expect(t!.status).toBe('neutral');
  });

  it('zapata NO muestra la tabla (el detalle es de forjado)', () => {
    expect(calcCruceta(base).checks.some((c) => c.id === 'cru-table')).toBe(false);
  });

  it('avisa si el perfil queda por debajo de la tabla (canto 30cm → UPN140)', () => {
    const w = calcCruceta({ ...f, d: 260, upnSize: 100 }).checks.find((c) => c.id === 'cru-table-low');
    expect(w, 'UPN100 en canto 30cm debería avisar').toBeDefined();
    expect(w!.status).toBe('warn');
  });

  it('avisa si el UPN no cabe a media altura del canto (perfil alto, canto fino)', () => {
    const w = calcCruceta({ ...f, d: 160, upnSize: 160 }).checks.find((c) => c.id === 'cru-fit');
    expect(w, 'UPN160 en canto ~20cm no cabe').toBeDefined();
    expect(w!.status).toBe('warn');
  });

  it('la guía/aviso NO bloquea la validez (es recomendación, no check duro)', () => {
    // perfil bajo tabla pero que cumple resistencia → sigue valid
    const r = calcCruceta({ ...f, d: 260, upnSize: 100, VEd: 150 });
    expect(r.checks.some((c) => c.id === 'cru-table-low')).toBe(true);
    expect(r.checks.find((c) => c.id === 'cru-table-low')!.status).not.toBe('fail');
  });
});

// ── Espiral de confinamiento §6.7 (sube V_cap, no toca punzonamiento) ─────────
describe('confinamiento §6.7 por espiral (solo apoyo del núcleo)', () => {
  it('la espiral sube V_cap pero NO cambia geometría ni punzonamiento', () => {
    const off = calcCruceta(base).cruceta!;
    const on = calcCruceta({ ...base, hasSpiral: true, spiralD: 500 });
    expect(on.cruceta!.Vcap).toBeGreaterThan(off.Vcap);  // más capacidad de apoyo
    expect(on.cruceta!.bEff).toBeCloseTo(off.bEff, 6);   // geometría intacta (conservadora)
    expect(on.cruceta!.u1).toBeCloseTo(off.u1, 6);
    expect(on.vEd).toBeCloseTo(calcCruceta(base).vEd, 6); // punzonamiento intacto
  });

  it('f_Rdu se capa en 3·fcd (espiral muy grande)', () => {
    const r = calcCruceta({ ...base, hasSpiral: true, spiralD: 5000 });
    const row = r.checks.find((c) => c.id === 'cru-confine')!;
    expect(row.value).toContain('50.1'); // 3·fcd = 3·16.7
  });

  it('espiral menor que la placa no reduce el apoyo (clamp ≥ fcd)', () => {
    const r = calcCruceta({ ...base, hasSpiral: true, spiralD: 100 });
    // Vcap idéntico al caso sin espiral (f_núcleo = fcd, sin penalización)
    expect(r.cruceta!.Vcap).toBeCloseTo(calcCruceta(base).cruceta!.Vcap, 0);
  });

  it('sin espiral no aparece la fila de confinamiento', () => {
    expect(calcCruceta(base).checks.some((c) => c.id === 'cru-confine')).toBe(false);
  });
});

// ── Longitud del brazo: regla constructiva (luz/8, ≥50cm) capada por el acero ──
describe('longitud del brazo (detalle tipo: luz/8, ≥50cm)', () => {
  it('la longitud auto la manda la luz (luz/8), no el acero, si éste alcanza', () => {
    // UPN300 con N50: el acero llega lejísimos, pero se construye luz/8 = 625mm.
    const r = calcCruceta({ ...base, upnSize: 300, VEd: 50, spanL: 5000 });
    expect(r.cruceta!.LeffMax).toBeCloseTo(625, 0); // = luz/8
    expect(r.cruceta!.Leff).toBeCloseTo(r.cruceta!.LeffMax, 6); // auto → Leff = auto
  });

  it('suelo de 50cm cuando luz/8 < 500mm (luz pequeña)', () => {
    const r = calcCruceta({ ...base, upnSize: 300, VEd: 50, spanL: 2000 }); // luz/8=250
    expect(r.cruceta!.LeffMax).toBeCloseTo(500, 0); // suelo constructivo
  });

  it('en sobrecarga el acero capa la longitud por debajo de la constructiva (decreciente)', () => {
    // Cargas altas: L_hard < luz/8 → la auto sigue al acero y decrece con el axil
    // (premisa monótona de la bisección de steelReach).
    const reaches = [1000, 1300, 1600, 2000, 2500].map(
      (VEd) => calcCruceta({ ...base, upnSize: 160, VEd }).cruceta!.LeffMax,
    );
    expect(reaches[0]).toBeLessThan(625); // ya por debajo de la constructiva
    for (let i = 1; i < reaches.length; i++) {
      expect(reaches[i]).toBeLessThan(reaches[i - 1]);
    }
  });
});

// ── Filas honestas de estados límite pendientes (amber, no verde) ─────────────
describe('estados límite del embebido pendientes', () => {
  const r = calcCruceta(base);
  it('anclaje/recubrimiento presentes como warn en zapata (verificar a mano)', () => {
    for (const id of ['cru-anchor', 'cru-cover']) {
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


// ── Estados límite resueltos por el detalle tipo (forjado) ────────────────────
describe('detalle tipo: anclaje/atado dejan de ser "verificar a mano" (forjado)', () => {
  const f = { ...base, substrate: 'forjado' as const };
  const stat = (r: ReturnType<typeof calcCruceta>, id: string) =>
    r.checks.find((c) => c.id === id)?.status;

  it('con el detalle completo: anclaje y atado pasan a neutral (por detalle)', () => {
    const r = calcCruceta(f); // armThrough/repartos = true por defecto
    expect(stat(r, 'cru-anchor')).toBe('neutral');
    expect(stat(r, 'cru-cover')).toBe('neutral');
  });

  it('la soldadura se rotula como conexión cruceta-pilar en forjado', () => {
    const w = calcCruceta(f).checks.find((c) => c.id === 'cru-weld');
    expect(w!.description).toMatch(/pilar/i);
  });

  it('sin pasante (armThrough=false) el anclaje vuelve a verificar a mano', () => {
    expect(stat(calcCruceta({ ...f, armThrough: false }), 'cru-anchor')).toBe('warn');
  });

  it('sin reparto superior el atado vuelve a verificar a mano', () => {
    expect(stat(calcCruceta({ ...f, hasRepartoSup: false }), 'cru-cover')).toBe('warn');
  });

  it('en zapata anclaje y atado siguen como verificación a mano (el detalle es de forjado)', () => {
    const r = calcCruceta(base);
    for (const id of ['cru-anchor', 'cru-cover']) expect(stat(r, id)).toBe('warn');
  });
});

// ── Delaminación: cortante de interfaz §6.2.5 cosido por cercos entre crucetas ─
describe('delaminación (cortante de interfaz, EC2 §6.2.5)', () => {
  const f = { ...base, substrate: 'forjado' as const };
  const delam = (r: ReturnType<typeof calcCruceta>) => r.checks.find((c) => c.id === 'cru-delam')!;

  it('es un check real (vEdi ≤ vRdi), ya no "verificar a mano"', () => {
    const c = delam(calcCruceta(f));
    expect(c.value).toContain('N/mm²');
    expect(c.article).toContain('6.2.5');
    expect(['ok', 'warn', 'fail']).toContain(c.status);
  });

  it('con los cercos del detalle (Ø8@150) cumple con holgura', () => {
    const c = delam(calcCruceta(f));
    expect(c.status).toBe('ok');
    expect(c.utilization).toBeLessThan(0.5);
  });

  it('los cercos suben la resistencia (cohesión del hormigón + fricción del acero)', () => {
    const sin = delam(calcCruceta({ ...f, hasConfTies: false })).utilization;
    const con = delam(calcCruceta(f)).utilization;
    expect(con).toBeLessThan(sin); // más cosido → menos utilización
  });

  it('la demanda se referencia a u0 (cara de placa), no a u1 (vEdi = β·V/(0.9d·u0))', () => {
    const r = calcCruceta(f);
    const c = r.cruceta!;
    const vEdiExpected = (c.beta * f.VEd * 1000) / (0.9 * f.d * c.u0);
    const vEdiShown = parseFloat(String(delam(r).value));
    expect(vEdiShown).toBeCloseTo(vEdiExpected, 2);
    // y NO el valor (mucho menor) que daría u1
    const vEdiU1 = (c.beta * f.VEd * 1000) / (0.9 * f.d * c.u1);
    expect(vEdiShown).toBeGreaterThan(vEdiU1 * 2);
  });

  it('sin cercos y con axil alto, la delaminación FALLA (bloquea la validez)', () => {
    const r = calcCruceta({ ...f, hasConfTies: false, VEd: 600 });
    expect(delam(r).status).toBe('fail');
    expect(r.valid).toBe(false);
  });

  it('reforzar los cercos (Ø10@100) rescata ese caso', () => {
    const r = calcCruceta({ ...f, confTieD: 10, confTieS: 100, VEd: 600 });
    expect(delam(r).status).toBe('ok');
  });

  it('vRdi se capa por bielas (0.5·ν·fcd) con muchísimo cosido', () => {
    const c = delam(calcCruceta({ ...f, confTieD: 25, confTieS: 50 }));
    const cap = 0.5 * (0.6 * (1 - base.fck / 250)) * 16.7; // ≈4.5
    const vRdi = parseFloat(String(c.limit));
    expect(vRdi).toBeLessThanOrEqual(cap + 0.01);
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
  // Longitud del brazo por el DETALLE TIPO: luz/8 = 5000/8 = 625mm (el acero llega
  // más lejos, así que manda la regla constructiva, no la resistencia).
  it('L_brazo auto ≈ 625 mm (= luz/8, detalle tipo)', () => {
    expect(c.LeffMax).toBeCloseTo(625, 0);
  });
  it('Leff = LeffMax in auto mode', () => expect(c.Leff).toBeCloseTo(c.LeffMax, 6));
  it('u1 ≈ 8000 mm (offset 2d del shearhead sobre brazo de 625)', () => {
    expect(c.u1).toBeGreaterThan(7900);
    expect(c.u1).toBeLessThan(8100);
  });
  it('Vcap ≈ 2547 kN (f_cap = 2/3·fcd · Acruz)', () => expect(c.Vcap).toBeCloseTo(2547, -1));
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
  // Cercos fuertes para que la delaminación (que depende de la placa, no del perfil)
  // no sea la que gobierna y se aísle el efecto de subir de perfil (punzonamiento).
  const esc = { ...base, VEd: 750, upnSize: 160, confTieD: 12, confTieS: 75 };
  it('chosen UPN fails → suggests a larger passing profile (no auto-switch)', () => {
    const r = calcCruceta(esc);
    expect(r.valid).toBe(false);
    expect(r.cruceta!.upnSize).toBe(160);            // choice unchanged
    expect(r.cruceta!.suggestedUpn).not.toBeNull();
    expect(r.cruceta!.suggestedUpn!).toBeGreaterThan(160);
  });

  it('suggested profile actually passes', () => {
    const r = calcCruceta(esc);
    const sized = calcCruceta({ ...esc, upnSize: r.cruceta!.suggestedUpn! });
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
  it('armLength por debajo del alcance se usa tal cual', () => {
    const r = calcCruceta({ ...base, armLength: 100 });
    expect(r.cruceta!.Leff).toBeCloseTo(100, 6);
  });
  it('armLength enorme se capa en el límite duro del acero (util=1.0)', () => {
    const r = calcCruceta({ ...base, armLength: 5000 }).cruceta!;
    expect(r.Leff).toBeLessThan(5000);              // capado
    expect(r.Leff).toBeGreaterThanOrEqual(r.LeffMax); // puede pasar del auto (75%) hasta el duro (100%)
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

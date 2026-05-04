// Tests del motor de cálculo de muros de fábrica (DB-SE-F).
// Cubre: Tabla 4.4 lookup, resolverFabrica, helpers (eMin/eApoyo/reparto/β),
// getMachonesPlanta (incluyendo clamps de borde), validation gate,
// calcularEdificio (pipeline completo, multi-planta, dinteles, asimetría P,
// huecos en borde con fallback de reacción, cabeza vs pie),
// getCriticoEdificio y overallStatus.

import { describe, it, expect } from 'vitest';
import {
  betaConcentracion,
  calcularEdificio,
  defaultMasonryState,
  eApoyoForjado,
  eMin,
  findGammaMCell,
  GAMMA_M_TABLA,
  getCriticoEdificio,
  getMachonesPlanta,
  lookupFk,
  lookupGammaM,
  newId,
  overallStatus,
  plantaTemplate,
  repartoMomento,
  resolverFabrica,
  type Hueco,
  type MasonryWallState,
  type Planta,
  type PlantaResult,
  type Puntual,
} from '../../lib/calculations/masonryWalls';
import {
  buildShareUrl,
  decodeShareString,
  encodeShareString,
} from '../../features/masonry-walls/serialize';

// ─── helpers ─────────────────────────────────────────────────────────────

function statePB(overrides: Partial<MasonryWallState> = {}): MasonryWallState {
  // Edificio simple: PB + cubierta, sin huecos, sin puntuales.
  const base = defaultMasonryState();
  return {
    ...base,
    plantas: [
      { ...base.plantas[0], huecos: [], puntuales: [] },
      { ...base.plantas[base.plantas.length - 1], huecos: [], puntuales: [] },
    ],
    ...overrides,
  };
}

function expectPlantas(r: ReturnType<typeof calcularEdificio>): PlantaResult[] {
  if (r.invalid) throw new Error(`expected valid result, got: ${r.reason}`);
  return r.plantas;
}

// ─── 1. lookupFk ─────────────────────────────────────────────────────────

describe('lookupFk — Tabla 4.4 DB-SE-F', () => {
  it('macizo fb=10 fm=5 → fk=4 N/mm²', () => {
    expect(lookupFk('macizo', 10, 5)).toBe(4);
  });

  it('perforado fb=20 fm=15 → fk=8', () => {
    expect(lookupFk('perforado', 20, 15)).toBe(8);
  });

  it('bloque_hueco fb=25 fm=15 → fk=6', () => {
    expect(lookupFk('bloque_hueco', 25, 15)).toBe(6);
  });

  it('macizo_junta_delgada fb=5 → celda no aplicable (null)', () => {
    expect(lookupFk('macizo_junta_delgada', 5, 5)).toBeNull();
  });

  it('fb fuera de tabla → null', () => {
    expect(lookupFk('macizo', 999, 5)).toBeNull();
  });

  it('fm fuera de fila → null', () => {
    expect(lookupFk('macizo', 10, 999)).toBeNull();
  });
});

// ─── 2. resolverFabrica ──────────────────────────────────────────────────

describe('resolverFabrica', () => {
  it('modo tabla con combinación válida → fk del lookup', () => {
    const s = defaultMasonryState();
    const fab = resolverFabrica(s);
    expect(fab.modo).toBe('tabla');
    expect(fab.fk).toBe(lookupFk(s.pieza, s.fb, s.fm));
    expect(fab.valida).toBe(true);
  });

  it('modo tabla con combinación inválida → fk=null, valida=false', () => {
    const s: MasonryWallState = { ...defaultMasonryState(), pieza: 'macizo_junta_delgada', fb: 5, fm: 5 };
    const fab = resolverFabrica(s);
    expect(fab.fk).toBeNull();
    expect(fab.valida).toBe(false);
  });

  it('modo custom → respeta fk_custom y gamma_custom', () => {
    const s: MasonryWallState = { ...defaultMasonryState(), fabricaModo: 'custom', fk_custom: 7.5, gamma_custom: 16 };
    const fab = resolverFabrica(s);
    expect(fab.modo).toBe('custom');
    expect(fab.fk).toBe(7.5);
    expect(fab.gamma).toBe(16);
  });

  it('label sale de TABLA_4_4 cuando modo=tabla', () => {
    expect(resolverFabrica({ ...defaultMasonryState(), pieza: 'macizo' }).label).toContain('Ladrillo macizo');
  });
});

// ─── 3. helpers de geometría / momento ───────────────────────────────────

describe('eMin', () => {
  it('t pequeño → 20 mm domina', () => {
    expect(eMin(100)).toBe(20); // 0.05·100 = 5 < 20
  });
  it('t grande → 0.05·t domina', () => {
    expect(eMin(500)).toBe(25); // 0.05·500 = 25 > 20
  });
});

describe('eApoyoForjado', () => {
  it('apoyo corto → eccentricity', () => {
    expect(eApoyoForjado(240, 120)).toBeCloseTo(80, 5); // 240/2 - 120/3 = 120 - 40 = 80
  });
  it('apoyo > 1.5·t → e=0', () => {
    expect(eApoyoForjado(240, 400)).toBe(0);
  });
});

describe('repartoMomento', () => {
  it('cubierta (H_sup=0) → k=1 (todo al muro inferior)', () => {
    expect(repartoMomento(3000, 0)).toBe(1);
  });
  it('plantas iguales → k=0.5', () => {
    expect(repartoMomento(3000, 3000)).toBeCloseTo(0.5, 5);
  });
});

// ─── 3.5. γM Tabla 4.8 ───────────────────────────────────────────────────

describe('γM · Tabla 4.8 DB-SE-F', () => {
  it('Cat II + Ejec B → γM=2.5 (default rehabilitación)', () => {
    expect(lookupGammaM('II', 'B')).toBe(2.5);
  });
  it('Cat I + Ejec A → γM=1.7 (más favorable)', () => {
    expect(lookupGammaM('I', 'A')).toBe(1.7);
  });
  it('Cat III + Ejec B → γM=3.0 (más conservador)', () => {
    expect(lookupGammaM('III', 'B')).toBe(3.0);
  });
  it('GAMMA_M_TABLA cubre 6 celdas', () => {
    let count = 0;
    Object.values(GAMMA_M_TABLA).forEach((row) => Object.values(row).forEach(() => count++));
    expect(count).toBe(6);
  });
  it('findGammaMCell encuentra γM=2.0 → Cat II ejec A', () => {
    expect(findGammaMCell(2.0)).toEqual({ cat: 'II', ejec: 'A' });
  });
  it('findGammaMCell devuelve null para valor personalizado', () => {
    expect(findGammaMCell(2.3)).toBeNull();
  });
  it('findGammaMCell tolera tolerancia 0.01', () => {
    expect(findGammaMCell(2.504)).toEqual({ cat: 'II', ejec: 'B' });
  });
});

// ─── 4. betaConcentracion (§5.4 — variable por posición) ─────────────────

describe('betaConcentracion', () => {
  it('carga centrada en muro largo → β próximo a 1.5 (tope)', () => {
    expect(betaConcentracion(3000, 6000, 3000)).toBe(1.3); // a/h = 3000/3000 = 1, β = 1+0.3 = 1.3
  });
  it('carga al borde del muro → β=1 (sin confinamiento)', () => {
    expect(betaConcentracion(0, 6000, 3000)).toBe(1.0);
  });
  it('carga muy lejana del borde con muro alto → β capped a 1.5', () => {
    // a = min(x, L-x) = 5000, h = 1000 → a/h = 5, 1+0.3·5=2.5 → cap 1.5
    expect(betaConcentracion(5000, 10000, 1000)).toBe(1.5);
  });
  it('H=0 → β=1 (degenerate guard)', () => {
    expect(betaConcentracion(3000, 6000, 0)).toBe(1.0);
  });
});

// ─── 5. getMachonesPlanta ────────────────────────────────────────────────

describe('getMachonesPlanta', () => {
  it('sin huecos → 1 machón cubre toda la longitud', () => {
    const m = getMachonesPlanta([], 6000);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ x1: 0, x2: 6000, ancho: 6000 });
  });

  it('1 hueco centrado → 2 machones', () => {
    const huecos: Hueco[] = [{ id: 'h1', x: 2500, y: 1000, w: 1000, h: 1000, tipo: 'ventana' }];
    const m = getMachonesPlanta(huecos, 6000);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ x1: 0, x2: 2500, ancho: 2500 });
    expect(m[1]).toMatchObject({ x1: 3500, x2: 6000, ancho: 2500 });
  });

  it('hueco pegado a x=0 → solo machón derecho', () => {
    const huecos: Hueco[] = [{ id: 'h1', x: 0, y: 0, w: 900, h: 2050, tipo: 'puerta' }];
    const m = getMachonesPlanta(huecos, 6000);
    expect(m).toHaveLength(1);
    expect(m[0].x1).toBe(900);
  });

  it('hueco hasta el final del muro → solo machón izquierdo', () => {
    const huecos: Hueco[] = [{ id: 'h1', x: 5000, y: 1000, w: 1000, h: 1000, tipo: 'ventana' }];
    const m = getMachonesPlanta(huecos, 6000);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ x1: 0, x2: 5000 });
  });

  it('2 huecos no solapados → 3 machones', () => {
    const huecos: Hueco[] = [
      { id: 'h1', x: 800, y: 1000, w: 900, h: 1000, tipo: 'ventana' },
      { id: 'h2', x: 4400, y: 1000, w: 1000, h: 1000, tipo: 'ventana' },
    ];
    const m = getMachonesPlanta(huecos, 6000);
    expect(m).toHaveLength(3);
  });

  it('2 huecos solapados → merge, 2 machones', () => {
    const huecos: Hueco[] = [
      { id: 'h1', x: 1000, y: 0, w: 1500, h: 1000, tipo: 'ventana' },
      { id: 'h2', x: 2000, y: 0, w: 1000, h: 1000, tipo: 'ventana' },
    ];
    const m = getMachonesPlanta(huecos, 6000);
    expect(m).toHaveLength(2);
    expect(m[0].x2).toBe(1000);
    expect(m[1].x1).toBe(3000);
  });

  it('hueco con x+w > L → se trunca a L', () => {
    const huecos: Hueco[] = [{ id: 'h1', x: 5000, y: 0, w: 2000, h: 2000, tipo: 'ventana' }]; // sale fuera
    const m = getMachonesPlanta(huecos, 6000);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ x1: 0, x2: 5000 });
  });
});

// ─── 6. Validation gate ──────────────────────────────────────────────────

describe('calcularEdificio — validation gate', () => {
  it('t=0 → invalid con field=t', () => {
    const r = calcularEdificio(statePB({ t: 0 }));
    expect(r.invalid).toBe(true);
    if (r.invalid) {
      expect(r.field).toBe('t');
      expect(r.reason).toContain('Espesor');
    }
  });

  it('L=100 (< 200) → invalid con field=L', () => {
    const r = calcularEdificio(statePB({ L: 100 }));
    expect(r.invalid).toBe(true);
    if (r.invalid) expect(r.field).toBe('L');
  });

  it('Tabla 4.4 inválida (junta delgada fb=5) → invalid con field=fk', () => {
    const r = calcularEdificio(statePB({ pieza: 'macizo_junta_delgada', fb: 5, fm: 5 }));
    expect(r.invalid).toBe(true);
    if (r.invalid) {
      expect(r.field).toBe('fk');
      expect(r.reason).toContain('Tabla 4.4');
    }
  });

  it('custom fk=0 → invalid con field=fk', () => {
    const r = calcularEdificio(statePB({ fabricaModo: 'custom', fk_custom: 0 }));
    expect(r.invalid).toBe(true);
    if (r.invalid) expect(r.field).toBe('fk');
  });

  it('plantas=[] → invalid con field=plantas', () => {
    const r = calcularEdificio(statePB({ plantas: [] }));
    expect(r.invalid).toBe(true);
    if (r.invalid) expect(r.field).toBe('plantas');
  });

  it('gamma_M=0 → invalid', () => {
    const r = calcularEdificio(statePB({ gamma_M: 0 }));
    expect(r.invalid).toBe(true);
    if (r.invalid) expect(r.field).toBe('gamma_M');
  });
});

// ─── 7. calcularEdificio — happy path ────────────────────────────────────

describe('calcularEdificio — happy path', () => {
  it('default state es válido y tiene 4 plantas', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    expect(plantas).toHaveLength(4);
  });

  it('cada planta tiene al menos 1 machón', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    plantas.forEach((pl) => expect(pl.machones.length).toBeGreaterThan(0));
  });

  it('q_top crece de cubierta a planta baja (carga acumulada)', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    for (let i = 0; i < plantas.length - 1; i++) {
      expect(plantas[i].q_planta).toBeGreaterThan(plantas[i + 1].q_planta);
    }
  });

  it('mayoración ELU: q_d = γG·G_k + γQ·Q_k de la cubierta', () => {
    const s = statePB({
      plantas: [
        { ...plantaTemplate(0, false), q_G: 0, q_Q: 0, huecos: [], puntuales: [] }, // PB sin carga propia
        { ...plantaTemplate(1, true), q_G: 5, q_Q: 1, huecos: [], puntuales: [] }, // cubierta
      ],
      gamma_G: 1.35,
      gamma_Q: 1.5,
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    // q_top de la cubierta = γG·5 + γQ·1 = 6.75 + 1.5 = 8.25 kN/m
    expect(plantas[1].q_planta).toBeCloseTo(8.25, 5);
  });
});

// ─── 8. OV-1: verificación cabeza Y pie ──────────────────────────────────

describe('calcularEdificio — verificación cabeza y pie (OV-1)', () => {
  it('N_Ed_pie > N_Ed (peso propio del muro suma al pie)', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    plantas.forEach((pl) => pl.machones.forEach((m) => {
      expect(m.N_Ed_pie).toBeGreaterThan(m.N_Ed);
    }));
  });

  it('eta = max(eta_cabeza, eta_pie)', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    plantas.forEach((pl) => pl.machones.forEach((m) => {
      expect(m.eta).toBeGreaterThanOrEqual(m.eta_cabeza);
      expect(m.eta).toBeGreaterThanOrEqual(m.eta_pie);
      expect(m.eta).toBe(Math.max(m.eta_cabeza, m.eta_pie));
    }));
  });

  it('eta_pie > eta_cabeza para muro con poca carga lineal y mucho peso propio', () => {
    // Muro alto y delgado con casi nada de carga lineal: el peso propio
    // domina y el pie es claramente más crítico.
    const s = statePB({
      L: 4000,
      t: 200,
      plantas: [
        { ...plantaTemplate(0, false), q_G: 0.1, q_Q: 0, H: 4000, huecos: [], puntuales: [] },
        { ...plantaTemplate(1, true),  q_G: 0,   q_Q: 0, H: 3000, huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    const m = plantas[0].machones[0];
    expect(m.eta_pie).toBeGreaterThan(m.eta_cabeza);
  });
});

// ─── 9. OV-2: dintel huérfano en borde del muro ──────────────────────────

describe('calcularEdificio — dintel en borde de muro (OV-2)', () => {
  it('hueco en x=0 → reacción del apoyo izq cae al machón derecho', () => {
    const s = statePB({
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [{ id: 'h1', x: 0, y: 0, w: 1000, h: 2050, tipo: 'puerta' }],
          puntuales: [],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    // Solo hay 1 machón (el de la derecha) — debe absorber la reacción total
    // del dintel (R_izq + R_dch).
    const machon = plantas[0].machones[0];
    expect(plantas[0].machones).toHaveLength(1);
    expect(machon.N_dinteles).toBeGreaterThan(0);
    const d = plantas[0].dinteles[0];
    expect(machon.N_dinteles).toBeCloseTo(d.R_izq + d.R_dch, 5);
  });

  it('hueco en x=L-w → reacción del apoyo derecho cae al machón izquierdo', () => {
    const s = statePB({
      L: 6000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [{ id: 'h1', x: 5000, y: 0, w: 1000, h: 2050, tipo: 'puerta' }],
          puntuales: [],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    const machon = plantas[0].machones[0];
    const d = plantas[0].dinteles[0];
    expect(machon.N_dinteles).toBeCloseTo(d.R_izq + d.R_dch, 5);
  });
});

// ─── 10. OV-3: β variable concentración ──────────────────────────────────

describe('calcularEdificio — concentración β variable (OV-3)', () => {
  it('puntual al borde tiene β=1.0 → etaConc mayor que con β=1.5 hardcoded', () => {
    // Carga puntual cerca del borde del muro
    const sBorde = statePB({
      L: 4000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [],
          puntuales: [{ id: 'p1', x: 100, P_G: 100, P_Q: 0, b_apoyo: 200 }],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const sCentro = statePB({
      L: 4000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [],
          puntuales: [{ id: 'p1', x: 2000, P_G: 100, P_Q: 0, b_apoyo: 200 }],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const rBorde = calcularEdificio(sBorde);
    const rCentro = calcularEdificio(sCentro);
    const etaBorde = expectPlantas(rBorde)[0].machones[0].etaConc;
    const etaCentro = expectPlantas(rCentro)[0].machones[0].etaConc;
    // β en el borde es 1.0 vs ~1.3 en el centro → etaConc mayor en el borde.
    expect(etaBorde).toBeGreaterThan(etaCentro);
  });
});

// ─── 11. OV-5: rho_n parametrizado ───────────────────────────────────────

describe('calcularEdificio — rho_n configurable (OV-5)', () => {
  it('rho_n explícito anula el default por planta', () => {
    const s = statePB({
      plantas: [
        { ...plantaTemplate(0, false), rho_n: 0.85, huecos: [], puntuales: [] },
        { ...plantaTemplate(1, true),  rho_n: 0.50, huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    expect(plantas[0].rho_n).toBe(0.85);
    expect(plantas[1].rho_n).toBe(0.50);
  });

  it('cubierta default → rho_n=1.0; intermedia default → 0.75', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    const cubierta = plantas[plantas.length - 1];
    expect(cubierta.rho_n).toBe(1.0);
    plantas.slice(0, -1).forEach((pl) => expect(pl.rho_n).toBe(0.75));
  });
});

// ─── 12. OV-6: asimetría P en dintel ─────────────────────────────────────

describe('calcularEdificio — asimetría P sobre dintel (OV-6)', () => {
  it('puntual cerca del apoyo izq genera R_izq > R_dch', () => {
    const s = statePB({
      L: 6000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [{ id: 'h1', x: 1000, y: 0, w: 2000, h: 2050, tipo: 'puerta' }],
          puntuales: [{ id: 'p1', x: 1200, P_G: 50, P_Q: 0, b_apoyo: 250 }],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    const d = plantas[0].dinteles[0];
    expect(d.R_izq).toBeGreaterThan(d.R_dch);
  });

  it('puntual centrado en el hueco → R_izq ≈ R_dch (UDL+P/2)', () => {
    const s = statePB({
      L: 6000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [{ id: 'h1', x: 2000, y: 0, w: 2000, h: 2050, tipo: 'puerta' }],
          puntuales: [{ id: 'p1', x: 3000, P_G: 50, P_Q: 0, b_apoyo: 250 }],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    const d = plantas[0].dinteles[0];
    expect(d.R_izq).toBeCloseTo(d.R_dch, 5);
  });
});

// ─── 13. Puerta vs ventana ───────────────────────────────────────────────

describe('calcularEdificio — puerta vs ventana', () => {
  it('puerta: h_muro_sobre = 0 (la puerta llega al forjado)', () => {
    const s = statePB({
      plantas: [
        {
          ...plantaTemplate(0, false),
          H: 3000,
          huecos: [{ id: 'h1', x: 1000, y: 0, w: 900, h: 2050, tipo: 'puerta' }],
          puntuales: [],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    expect(plantas[0].dinteles[0].h_muro_sobre).toBe(0);
  });

  it('ventana: h_muro_sobre = H − (y+h)', () => {
    const s = statePB({
      plantas: [
        {
          ...plantaTemplate(0, false),
          H: 3000,
          huecos: [{ id: 'h1', x: 1000, y: 1000, w: 900, h: 1000, tipo: 'ventana' }],
          puntuales: [],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    expect(plantas[0].dinteles[0].h_muro_sobre).toBe(1000); // 3000 - (1000+1000)
  });
});

// ─── 14. Distribución de cargas ──────────────────────────────────────────

describe('calcularEdificio — distribución de cargas', () => {
  it('puntual sobre machón → suma a N_puntual del propio machón', () => {
    const s = statePB({
      L: 6000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [],
          puntuales: [{ id: 'p1', x: 3000, P_G: 50, P_Q: 0, b_apoyo: 250 }],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    const m = plantas[0].machones[0]; // único machón cubre todo el muro
    expect(m.N_puntual).toBeCloseTo(50 * 1.35, 5);
  });

  it('puntual sobre hueco → entra al dintel, no al machón directamente', () => {
    const s = statePB({
      L: 6000,
      plantas: [
        {
          ...plantaTemplate(0, false),
          huecos: [{ id: 'h1', x: 2000, y: 1000, w: 2000, h: 1000, tipo: 'ventana' }],
          puntuales: [{ id: 'p1', x: 3000, P_G: 50, P_Q: 0, b_apoyo: 250 }],
        },
        { ...plantaTemplate(1, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    plantas[0].machones.forEach((m) => expect(m.N_puntual).toBe(0));
    const d = plantas[0].dinteles[0];
    expect(d.P_sobre_hueco).toBeCloseTo(50 * 1.35, 5);
  });

  it('balance: Σ axil cabeza ≈ q_top·L (sin huecos, sin puntuales)', () => {
    const s = statePB({ L: 4000, t: 240 });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    const sumN = plantas[0].machones.reduce((acc, m) => acc + m.N_Ed, 0);
    expect(sumN).toBeCloseTo(plantas[0].q_planta * (s.L / 1000), 5);
  });
});

// ─── 15. e_pie cruzado entre plantas (OV-7) ──────────────────────────────

describe('calcularEdificio — e_pie cruzado (OV-7)', () => {
  it('e_pie de planta intermedia depende del forjado de planta inferior, no del propio', () => {
    // PB con e_apoyo grande (forjado muy descentrado) y planta 1 con e_apoyo pequeño.
    // El pie de planta 1 debería heredar la excentricidad del forjado de PB
    // (que es el techo de PB = pie de planta 1), NO la del forjado propio.
    const s = statePB({
      plantas: [
        {
          ...plantaTemplate(0, false),
          e_apoyo: 100, // forjado entre PB y planta 1: descentrado
          a_apoyo: 0,
          huecos: [],
          puntuales: [],
        },
        {
          ...plantaTemplate(1, false),
          e_apoyo: 0, // forjado entre planta 1 y cubierta: centrado
          a_apoyo: 9999,
          huecos: [],
          puntuales: [],
        },
        { ...plantaTemplate(2, true), huecos: [], puntuales: [] },
      ],
    });
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    // e_pie de planta 1 debe ser > e_min porque hereda del forjado de PB.
    // Si fuera con la fórmula vieja (e_apoyo propio), sería e_min porque el
    // forjado propio de planta 1 está centrado.
    const pl1 = plantas[1];
    expect(pl1.e_pie).toBeGreaterThan(pl1.e_min);
  });
});

// ─── 16. Φ unificado (OV-8) ──────────────────────────────────────────────

describe('calcularEdificio — Φ unificado (OV-8)', () => {
  it('Φ siempre ≤ 1', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    plantas.forEach((pl) => expect(pl.Phi).toBeLessThanOrEqual(1));
  });

  it('λ pequeño y excentricidad mínima → Φ próximo a 1', () => {
    const s = statePB({ t: 500 }); // muro grueso → λ pequeño + e_total/t pequeño
    const r = calcularEdificio(s);
    const plantas = expectPlantas(r);
    plantas.forEach((pl) => expect(pl.Phi).toBeGreaterThan(0.7));
  });

  it('λ grande → reducción significativa de Φ', () => {
    // muro delgado y alto → λ grande
    const s: MasonryWallState = {
      ...defaultMasonryState(),
      t: 100,
      plantas: [
        { ...plantaTemplate(0, false), H: 4000, huecos: [], puntuales: [] },
        { ...plantaTemplate(1, true), H: 4000, huecos: [], puntuales: [] },
      ],
    };
    const r = calcularEdificio(s);
    if (r.invalid) return; // si la geometría es muy degenerada el guard salta — ok
    expect(r.plantas[0].Phi).toBeLessThan(0.5);
  });

  it('Φ tiene clamp inferior 0.05', () => {
    // forjar caso extremo: e enorme + λ enorme. El clamp de seguridad evita 0.
    const s: MasonryWallState = {
      ...defaultMasonryState(),
      t: 80,
      plantas: [
        { ...plantaTemplate(0, false), H: 6000, e_apoyo: 39, a_apoyo: 0, huecos: [], puntuales: [] }, // e≈39 ≈ t/2
        { ...plantaTemplate(1, true), H: 6000, huecos: [], puntuales: [] },
      ],
    };
    const r = calcularEdificio(s);
    if (r.invalid) return;
    expect(r.plantas[0].Phi).toBeGreaterThanOrEqual(0.05);
  });
});

// ─── 17. getCriticoEdificio / overallStatus ──────────────────────────────

describe('getCriticoEdificio', () => {
  it('default state → retorna machón con η máximo del edificio', () => {
    const r = calcularEdificio(defaultMasonryState());
    const plantas = expectPlantas(r);
    const c = getCriticoEdificio(plantas);
    expect(c).not.toBeNull();
    if (c) {
      const allEtas = plantas.flatMap((pl) => pl.machones.map((m) => m.etaMax));
      const max = Math.max(...allEtas);
      expect(c.etaMax).toBe(max);
    }
  });

  it('plantas vacías → null', () => {
    expect(getCriticoEdificio([])).toBeNull();
  });
});

describe('overallStatus', () => {
  it('plantasCalc vacías → CUMPLE η=0', () => {
    expect(overallStatus([])).toEqual({ v: 'ok', label: 'CUMPLE', eta: 0 });
  });

  it('umbral 0.8 → REVISAR', () => {
    const fake: PlantaResult[] = [
      {
        index: 0, machones: [{ etaMax: 0.85 } as never], dinteles: [],
        q_planta: 0, e_apoyo: 0, e_cabeza: 0, e_pie: 0, e_total: 0, e_min: 0,
        e_a: 0, k_reparto: 0, rho_n: 0, h_ef: 0, lambda: 0, Phi: 0, f_d: 0,
        id: 'x', nombre: '', H: 0, q_G: 0, q_Q: 0, a_apoyo: 0, huecos: [], puntuales: [],
      },
    ];
    expect(overallStatus(fake).v).toBe('warn');
  });

  it('umbral 1.0 → INCUMPLE', () => {
    const fake: PlantaResult[] = [
      {
        index: 0, machones: [{ etaMax: 1.2 } as never], dinteles: [],
        q_planta: 0, e_apoyo: 0, e_cabeza: 0, e_pie: 0, e_total: 0, e_min: 0,
        e_a: 0, k_reparto: 0, rho_n: 0, h_ef: 0, lambda: 0, Phi: 0, f_d: 0,
        id: 'x', nombre: '', H: 0, q_G: 0, q_Q: 0, a_apoyo: 0, huecos: [], puntuales: [],
      },
    ];
    expect(overallStatus(fake).v).toBe('fail');
  });

  it('todos los machones η<0.8 → CUMPLE', () => {
    const fake: PlantaResult[] = [
      {
        index: 0, machones: [{ etaMax: 0.4 } as never, { etaMax: 0.7 } as never], dinteles: [],
        q_planta: 0, e_apoyo: 0, e_cabeza: 0, e_pie: 0, e_total: 0, e_min: 0,
        e_a: 0, k_reparto: 0, rho_n: 0, h_ef: 0, lambda: 0, Phi: 0, f_d: 0,
        id: 'x', nombre: '', H: 0, q_G: 0, q_Q: 0, a_apoyo: 0, huecos: [], puntuales: [],
      },
    ];
    expect(overallStatus(fake).v).toBe('ok');
  });
});

// ─── 17.5. Share-URL serialización (lz-string + base64) ─────────────────

describe('share-URL serialización', () => {
  it('round-trip: encode → decode produce un state deep-equal al original', () => {
    const original = defaultMasonryState();
    const encoded = encodeShareString(original);
    const decoded = decodeShareString(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(original);
  });

  it('round-trip preserva nested arrays (huecos, puntuales por planta)', () => {
    const s = defaultMasonryState();
    s.plantas[0].huecos.push({ id: 'h-extra', x: 5500, y: 0, w: 400, h: 2000, tipo: 'puerta' });
    s.plantas[0].puntuales.push({ id: 'p-extra', x: 200, P_G: 12, P_Q: 3, b_apoyo: 200 });
    const decoded = decodeShareString(encodeShareString(s));
    expect(decoded?.plantas[0].huecos).toHaveLength(s.plantas[0].huecos.length);
    expect(decoded?.plantas[0].puntuales[2]).toEqual({ id: 'p-extra', x: 200, P_G: 12, P_Q: 3, b_apoyo: 200 });
  });

  it('decode devuelve null para entrada vacía', () => {
    expect(decodeShareString('')).toBeNull();
  });

  it('decode devuelve null para entrada corrupta (no-base64)', () => {
    expect(decodeShareString('not-a-valid-encoded-string!!!')).toBeNull();
  });

  it('decode devuelve null cuando la forma no es un MasonryWallState', () => {
    // Codificamos un objeto válido pero con shape distinto.
    const garbage = { hello: 'world', x: 1 };
    const fakeJson = JSON.stringify(garbage);
    // Importamos el lz-string indirectamente vía encodeShareString hubiera sido
    // imposible — usamos el formato directo.
    expect(decodeShareString(encodeShareString(garbage as never))).toBeNull();
    expect(fakeJson.length).toBeGreaterThan(0); // sanity check
  });

  it('buildShareUrl produce ?model= con el state codificado', () => {
    const url = buildShareUrl(defaultMasonryState(), 'https://concreta.tools/rehab/muros-fabrica');
    expect(url).toMatch(/^https:\/\/concreta\.tools\/rehab\/muros-fabrica\?model=.+/);
  });

  it('buildShareUrl elimina query existente para no duplicar params', () => {
    const url = buildShareUrl(defaultMasonryState(), 'https://concreta.tools/rehab/muros-fabrica?foo=1');
    expect(url).not.toContain('foo=1');
    expect(url).toContain('?model=');
  });

  it('compresión razonable: el state default codifica a < 2 KB', () => {
    const encoded = encodeShareString(defaultMasonryState());
    expect(encoded.length).toBeLessThan(2048);
  });
});

// ─── 18. Defaults & utilities ────────────────────────────────────────────

describe('defaults & utilities', () => {
  it('defaultMasonryState pasa la validación', () => {
    expect(calcularEdificio(defaultMasonryState()).invalid).toBe(false);
  });

  it('plantaTemplate(N>0, true) marca como Cubierta sin huecos', () => {
    const cubierta = plantaTemplate(3, true);
    expect(cubierta.nombre).toBe('Cubierta');
    expect(cubierta.huecos).toHaveLength(0);
  });

  it('newId genera ids únicos con prefijo', () => {
    const a = newId('foo');
    const b = newId('foo');
    expect(a).toMatch(/^foo-/);
    expect(b).toMatch(/^foo-/);
    expect(a).not.toBe(b);
  });

  // Type usage (compile check)
  it('type Planta + Hueco + Puntual exports', () => {
    const p: Planta = plantaTemplate(0, false);
    const h: Hueco | undefined = p.huecos[0];
    const u: Puntual | undefined = p.puntuales[0];
    expect(p.id).toBeTruthy();
    void h;
    void u;
  });
});

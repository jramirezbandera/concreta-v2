// Invariantes FÍSICOS del catálogo de perfiles laminados (IPE / HEA / HEB / IPN / UPN).
//
// POR QUÉ EXISTE ESTE FICHERO
// El catálogo son ~1.300 números teclados a mano desde prontuario, y hasta 2026-07-25
// nada los validaba: steelCatalog.test.ts congela los valores literales (protege la
// migración, no la corrección) y sections.test.ts solo clava dos celdas de HEB 200.
// Con ese hueco, las columnas Wpl_y e Iw de TODA la serie IPN estuvieron mal desde el
// principio: IPN 600 declaraba Wpl_y = 11600 cm³ (correcto: 5480), o sea un factor de
// forma Wpl/Wel = 2.51. Como steelBeams.ts usa Wpl_y para Mc,Rd en clase 1-2, ese
// perfil anunciaba 2.1x su momento resistente real: una viga dada por CUMPLE al 90%
// estaba en realidad al 192%.
//
// La auditoría del 2026-09-24 (cotejo contra el catálogo ArcelorMittal, eurocodeapplied
// y las fórmulas exactas de la sección) encontró 86 celdas más: toda la It de IPN, la Iz
// de HEA 160 (−22 %), las Iw de HEB 280-400 y 58 celdas del UPN, que no tenía NINGÚN
// invariante (UPN 320 con tw = 10.5 y A = 65.2 cuando son 14 y 75.8; Wpl_y hasta +28 %;
// It hasta 3x). Los invariantes de abajo no dependen de ninguna fuente externa, solo de
// la geometría de la sección: son la red para que no se pueda equivocar en silencio.
import { describe, it, expect } from 'vitest';
import { STEEL_PROFILES, UPN_PROFILES, type SteelProfile, type UPNProfile } from '../../data/steelProfiles';

const key = (p: SteelProfile) => `${p.tipo} ${p.size}`;

const SERIE_HE = [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 400,
  450, 500, 550, 600, 650, 700, 800, 900, 1000];

describe('catálogo de perfiles — invariantes físicos', () => {
  it('cubre las 4 familias y 87 perfiles, con HEA y HEB de 100 a 1000', () => {
    expect(STEEL_PROFILES.length).toBe(87);
    expect(new Set(STEEL_PROFILES.map((p) => p.tipo))).toEqual(
      new Set(['IPE', 'HEA', 'HEB', 'IPN']),
    );
    for (const tipo of ['HEA', 'HEB'] as const) {
      expect(STEEL_PROFILES.filter((p) => p.tipo === tipo).map((p) => p.size)).toEqual(SERIE_HE);
    }
  });

  it('sin claves repetidas y con los tamaños en orden creciente dentro de cada familia', () => {
    const claves = STEEL_PROFILES.map((p) => p.key);
    expect(new Set(claves).size).toBe(claves.length);
    for (const tipo of ['IPE', 'HEA', 'HEB', 'IPN'] as const) {
      const sizes = STEEL_PROFILES.filter((p) => p.tipo === tipo).map((p) => p.size);
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    }
  });

  // Wel_y = Iy / (h/2) es una identidad exacta para cualquier sección simétrica: la
  // fibra extrema está a h/2 del eje neutro. Ata tres columnas entre sí, así que un
  // typo en Iy, en h o en Wel_y rompe la relación. Medido: error máx. real 0.35%
  // (redondeo del prontuario a 3 cifras).
  describe('Wel_y = Iy / (h/2)  —  identidad exacta, tolerancia 1%', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const WelCalc = p.Iy / (p.h / 20); // Iy cm⁴, h mm → h/2 en cm = h/20
        expect(Math.abs(p.Wel_y - WelCalc) / WelCalc).toBeLessThan(0.01);
      });
    }
  });

  // El factor de forma α = Wpl/Wel tiene un TECHO TEÓRICO de 1.5 para cualquier sección
  // maciza (el del rectángulo). Un perfil en I, con el material en las alas, se queda en
  // 1.10-1.20. Este es el invariante que pilla el bug de IPN: llegaba a 2.51, que no es
  // "un valor raro" sino imposible. Medido en el catálogo corregido: 1.098 (HEA 280) a
  // 1.184 (IPN 600).
  describe('factor de forma Wpl_y / Wel_y ∈ [1.05, 1.25]  —  techo físico 1.5', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const alpha = p.Wpl_y / p.Wel_y;
        expect(alpha).toBeGreaterThan(1.05);
        expect(alpha).toBeLessThan(1.25);
      });
    }
  });

  // Iw = Iz_alas · (h−tf)²/4. En un perfil en I el alma aporta menos del 1% de Iz
  // (para IPN 600: 45 de 4670 cm⁴), así que usar Iz total es exacto al ~1%. Iw entra en
  // computeMcr → Mcr → χ_LT → Mb,Rd, y un Iw inflado sobreestima el pandeo lateral.
  // Medido en el catálogo corregido: 0.954 a 1.003. Hasta 2026-09-24 había 5 filas en
  // cuarentena (HEA 160, HEB 280/320/360/400); ya no hay exenciones: si una fila falla
  // aquí, el valor está mal — se corrige el valor, no el test.
  describe('Iw = Iz·(h−tf)²/4  —  tolerancia 6%', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const hs = (p.h - p.tf) / 10; // cm
        const IwCalc = p.Iz * hs * hs / 4;
        expect(Math.abs(p.Iw / IwCalc - 1)).toBeLessThan(0.06);
      });
    }
  });

  // Iz ≈ 2·tf·b³/12 (las alas mandan; alma y acuerdos suman 0.1-0.6 %). Es el invariante
  // que habría pillado la Iz = 479 de HEA 160 (real 615.6): con h, b y tf del propio
  // perfil, Iz no puede quedar un 22 % por debajo de sus dos alas. En IPN el ala al 14 %
  // concentra el acero junto al alma y el rectángulo equivalente sobreestima Iz un 13-17 %
  // (medido 0.852-0.870), así que lleva su propia banda.
  describe('Iz coherente con las alas 2·tf·b³/12  —  [0.995, 1.06] en I/H, [0.83, 0.90] en IPN', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const IzAlas = (2 * p.tf * p.b ** 3) / 12 / 1e4; // mm⁴ → cm⁴
        const ratio = p.Iz / IzAlas;
        const [lo, hi] = p.tipo === 'IPN' ? [0.83, 0.90] : [0.995, 1.06];
        expect(ratio).toBeGreaterThan(lo);
        expect(ratio).toBeLessThan(hi);
      });
    }
  });

  // El área bruta tiene que quedar por encima del rectángulo sin acuerdos (los acuerdos
  // añaden material) salvo en IPN, donde la conicidad del ala hace que el modelo
  // rectangular con tf medido a b/4 sobreestime ~0.5%. Medido: −0.8% (IPN) a +6% (HEA).
  describe('A coherente con 2·b·tf + (h−2tf)·tw  —  banda [−2%, +9%]', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const Arect = (2 * p.b * p.tf + (p.h - 2 * p.tf) * p.tw) / 100; // mm² → cm²
        const desv = (p.A / Arect - 1) * 100;
        expect(desv).toBeGreaterThan(-2);
        expect(desv).toBeLessThan(9);
      });
    }
  });
});

// ─── UPN ─────────────────────────────────────────────────────────────────────
// El UPN alimenta el cajón 2UPN (vigas y pilares: Wpl_y·2 → Mc,Rd; e1 → Iz del cajón) y
// la cruceta de punzonamiento (Wpl_y → MRd). Hasta 2026-09-24 no tenía ningún invariante
// y 58 de sus 176 celdas estaban mal.
const ukey = (u: UPNProfile) => `UPN ${u.size}`;

describe('UPN — invariantes físicos', () => {
  it('16 perfiles, de 80 a 400, en orden', () => {
    expect(UPN_PROFILES.map((u) => u.size)).toEqual(
      [80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 350, 380, 400],
    );
  });

  describe('Wel_y = Iy / (h/2)  —  identidad exacta, tolerancia 1%', () => {
    for (const u of UPN_PROFILES) {
      it(ukey(u), () => {
        const WelCalc = u.Iy / (u.h / 20);
        expect(Math.abs(u.Wel_y - WelCalc) / WelCalc).toBeLessThan(0.01);
      });
    }
  });

  // En U el factor de forma sube un poco respecto al I (alma más gruesa en proporción):
  // medido 1.195 (UPN 120) a 1.251 (UPN 350). Los valores viejos daban 1.25-1.38, así que
  // este invariante solo pilla de UPN 200 en adelante; los de A, e1 e It pillan el resto.
  describe('factor de forma Wpl_y / Wel_y ∈ [1.15, 1.27]', () => {
    for (const u of UPN_PROFILES) {
      it(ukey(u), () => {
        const alpha = u.Wpl_y / u.Wel_y;
        expect(alpha).toBeGreaterThan(1.15);
        expect(alpha).toBeLessThan(1.27);
      });
    }
  });

  // Alas al 8 % con tf medido a media ala: el rectángulo equivalente reproduce A al 1.5 %
  // (medido −0.4 % a +1.3 %). Es el invariante que ata tw con A: el UPN 320 viejo cuadraba
  // A = 65.2 con tw = 10.5 — los dos falsos a la vez — y sólo el prontuario lo delataba.
  describe('A coherente con 2·b·tf + (h−2tf)·tw  —  banda [−1.5%, +2.5%]', () => {
    for (const u of UPN_PROFILES) {
      it(ukey(u), () => {
        const Arect = (2 * u.b * u.tf + (u.h - 2 * u.tf) * u.tw) / 100;
        const desv = (u.A / Arect - 1) * 100;
        expect(desv).toBeGreaterThan(-1.5);
        expect(desv).toBeLessThan(2.5);
      });
    }
  });

  // Centroide desde la cara exterior del alma. El modelo rectangular lo sobreestima
  // porque la conicidad concentra el ala junto al alma: medido e1/e1_rect = 0.913-0.961.
  // Los e1 viejos daban 0.97-1.02.
  describe('e1 / e1_rectangular ∈ [0.90, 0.97]', () => {
    for (const u of UPN_PROFILES) {
      it(ukey(u), () => {
        const Aw = (u.h - 2 * u.tf) * u.tw;
        const Af = u.b * u.tf;
        const e1Rect = (Aw * u.tw / 2 + 2 * Af * u.b / 2) / (Aw + 2 * Af);
        const ratio = u.e1 / e1Rect;
        expect(ratio).toBeGreaterThan(0.90);
        expect(ratio).toBeLessThan(0.97);
      });
    }
  });

  // Torsión de sección abierta: It ≈ Σ b·t³/3 más el aporte de los acuerdos (5-10 %).
  // Medido It/It_paredes = 1.05-1.09. Los It viejos daban 1.2-3.2.
  describe('It / Σ(b·t³/3) ∈ [1.0, 1.15]', () => {
    for (const u of UPN_PROFILES) {
      it(ukey(u), () => {
        const ItParedes = (2 * u.b * u.tf ** 3 + (u.h - 2 * u.tf) * u.tw ** 3) / 3 / 1e4; // cm⁴
        const ratio = u.It / ItParedes;
        expect(ratio).toBeGreaterThan(1.0);
        expect(ratio).toBeLessThan(1.15);
      });
    }
  });
});

// Pines de los incidentes concretos, con los números a la vista: si alguien revierte el
// fichero de datos, esto lo dice por su nombre en vez de dejarlo en un invariante abstracto.
describe('regresión — el bug de Wpl_y de IPN (2026-07-25)', () => {
  const ipn600 = STEEL_PROFILES.find((p) => p.tipo === 'IPN' && p.size === 600)!;

  it('IPN 600: Wpl_y ≈ 5450 cm³, NO 11600', () => {
    expect(ipn600.Wpl_y).toBeGreaterThan(5300);
    expect(ipn600.Wpl_y).toBeLessThan(5650);
  });

  it('IPN 600: Iw ≈ 3.8e6 cm⁶, NO 1.89e7', () => {
    expect(ipn600.Iw).toBeGreaterThan(3.6e6);
    expect(ipn600.Iw).toBeLessThan(3.9e6);
  });

  it('ninguna fila de IPN supera el techo físico de 1.5 en Wpl/Wel', () => {
    const ipn = STEEL_PROFILES.filter((p) => p.tipo === 'IPN');
    expect(ipn.length).toBe(21);
    for (const p of ipn) expect(p.Wpl_y / p.Wel_y).toBeLessThan(1.5);
  });
});

describe('regresión — auditoría del catálogo (2026-09-24)', () => {
  const upn = (size: number) => UPN_PROFILES.find((u) => u.size === size)!;
  const prof = (tipo: SteelProfile['tipo'], size: number) =>
    STEEL_PROFILES.find((p) => p.tipo === tipo && p.size === size)!;

  it('UPN 320: tw = 14 mm y A = 75.8 cm² (59.5 kg/m), NO 10.5 / 65.2', () => {
    expect(upn(320).tw).toBe(14);
    expect(upn(320).A).toBeCloseTo(75.8, 1);
  });

  it('UPN 350 y 380: A = 77.3 y 80.4 cm², NO 66.0 / 70.4', () => {
    expect(upn(350).A).toBeCloseTo(77.3, 1);
    expect(upn(380).A).toBeCloseTo(80.4, 1);
  });

  it('UPN 400: Iy = 20350 cm⁴ (NO la del IPE 400, 23130) y Wpl_y = 1240 cm³ (NO 1590)', () => {
    expect(upn(400).Iy).toBe(20350);
    expect(upn(400).Wpl_y).toBe(1240);
  });

  it('IPN 200: It = 13.5 cm⁴, NO 9.98', () => {
    expect(prof('IPN', 200).It).toBeCloseTo(13.5, 1);
  });

  it('HEA 160: Iz = 615.6 cm⁴, NO 479', () => {
    expect(prof('HEA', 160).Iz).toBeCloseTo(615.6, 1);
  });

  it('HEB 400: Iw ≈ 3.82e6 cm⁶, NO 5.38e6', () => {
    expect(prof('HEB', 400).Iw).toBeGreaterThan(3.7e6);
    expect(prof('HEB', 400).Iw).toBeLessThan(3.9e6);
  });

  it('HEB 1000 existe y pesa lo que dice el catálogo (A = 400 cm²)', () => {
    expect(prof('HEB', 1000).A).toBe(400);
    expect(prof('HEA', 1000).A).toBeCloseTo(346.8, 1);
  });
});

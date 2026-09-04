/**
 * Golden de la tabla de clases resistentes contra la UNE-EN 338:2016.
 *
 * Por qué existe: al ampliar el desplegable del cuadro de materiales a todas las
 * clases del catálogo, seis densidades no cuadraron con la norma. Las
 * resistencias y rigideces de esas mismas filas sí eran de 2016, así que era una
 * transcripción, no un cambio de edición:
 *
 *   · C35 llevaba copiadas las densidades de C40 (400/480 en vez de 390/470);
 *   · C27 tenía la ρmedia de C24 (420 en vez de 430);
 *   · D35, D40, D50 y la ρmedia de D70 eran las de la EN 338:2003.
 *
 * ρmedia entra en el peso propio de las barras de madera (frame-core/sections),
 * así que un error ahí no salta por ninguna parte: sólo pesa de menos o de más.
 * Este test transcribe las tablas 1 y 3 enteras y no deja que vuelva a pasar.
 */

import { describe, expect, it } from 'vitest';
import { TIMBER_GRADES, getKh } from '../../data/timberGrades';
import { calcTimberBeam } from '../../lib/calculations/timberBeams';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';
import { calcTimberFrameMember } from '../../lib/calculations/timberFrameMember';
import { timberBeamDefaults, timberColumnDefaults } from '../../data/defaults';

/** UNE-EN 338:2016, tabla 1 — coníferas, las doce clases. */
const TABLA_1: Record<string, [number, number, number, number, number, number, number, number, number, number, number, number]> = {
  C14: [14, 7.2, 0.4, 16, 2.0, 3.0, 7.0, 4.7, 0.23, 0.44, 290, 350],
  C16: [16, 8.5, 0.4, 17, 2.2, 3.2, 8.0, 5.4, 0.27, 0.5, 310, 370],
  C18: [18, 10, 0.4, 18, 2.2, 3.4, 9.0, 6.0, 0.3, 0.56, 320, 380],
  C20: [20, 11.5, 0.4, 19, 2.3, 3.6, 9.5, 6.4, 0.32, 0.59, 330, 400],
  C22: [22, 13, 0.4, 20, 2.4, 3.8, 10.0, 6.7, 0.33, 0.63, 340, 410],
  C24: [24, 14.5, 0.4, 21, 2.5, 4.0, 11.0, 7.4, 0.37, 0.69, 350, 420],
  C27: [27, 16.5, 0.4, 22, 2.5, 4.0, 11.5, 7.7, 0.38, 0.72, 360, 430],
  C30: [30, 19, 0.4, 24, 2.7, 4.0, 12.0, 8.0, 0.4, 0.75, 380, 460],
  C35: [35, 22.5, 0.4, 25, 2.7, 4.0, 13.0, 8.7, 0.43, 0.81, 390, 470],
  C40: [40, 26, 0.4, 27, 2.8, 4.0, 14.0, 9.4, 0.47, 0.88, 400, 480],
  C45: [45, 30, 0.4, 29, 2.9, 4.0, 15.0, 10.1, 0.5, 0.94, 410, 490],
  C50: [50, 33.5, 0.4, 30, 3.0, 4.0, 16.0, 10.7, 0.53, 1.0, 430, 520],
};

/** UNE-EN 338:2016, tabla 3 — frondosas, las catorce clases. */
const TABLA_3: Record<string, [number, number, number, number, number, number, number, number, number, number, number, number]> = {
  D18: [18, 11, 0.6, 18, 4.8, 3.5, 9.5, 8.0, 0.63, 0.59, 475, 570],
  D24: [24, 14, 0.6, 21, 4.9, 3.7, 10.0, 8.4, 0.67, 0.63, 485, 580],
  D27: [27, 16, 0.6, 22, 5.1, 3.8, 10.5, 8.8, 0.7, 0.66, 510, 610],
  D30: [30, 18, 0.6, 24, 5.3, 3.9, 11.0, 9.2, 0.73, 0.69, 530, 640],
  D35: [35, 21, 0.6, 25, 5.4, 4.1, 12.0, 10.1, 0.8, 0.75, 540, 650],
  D40: [40, 24, 0.6, 27, 5.5, 4.2, 13.0, 10.9, 0.87, 0.81, 550, 660],
  D45: [45, 27, 0.6, 29, 5.8, 4.4, 13.5, 11.3, 0.9, 0.84, 580, 700],
  D50: [50, 30, 0.6, 30, 6.2, 4.5, 14.0, 11.8, 0.93, 0.88, 620, 740],
  D55: [55, 33, 0.6, 32, 6.6, 4.7, 15.5, 13.0, 1.03, 0.97, 660, 790],
  D60: [60, 36, 0.6, 33, 10.5, 4.8, 17.0, 14.3, 1.13, 1.06, 700, 840],
  D65: [65, 39, 0.6, 35, 11.3, 5.0, 18.5, 15.5, 1.23, 1.16, 750, 900],
  D70: [70, 42, 0.6, 36, 12.0, 5.0, 20.0, 16.8, 1.33, 1.25, 800, 960],
  D75: [75, 45, 0.6, 37, 12.8, 5.0, 22.0, 18.5, 1.47, 1.38, 850, 1020],
  D80: [80, 48, 0.6, 38, 13.5, 5.0, 24.0, 20.2, 1.6, 1.5, 900, 1080],
};

const CAMPOS = [
  'fm_k', 'ft0_k', 'ft90_k', 'fc0_k', 'fc90_k', 'fv_k',
  'E0_mean', 'E0_05', 'E90_mean', 'G_mean', 'rho_k', 'rho_mean',
] as const;

describe('UNE-EN 338:2016 — clases resistentes de madera aserrada', () => {
  for (const [tabla, datos] of [
    ['tabla 1 (coníferas)', TABLA_1],
    ['tabla 3 (frondosas)', TABLA_3],
  ] as const) {
    describe(tabla, () => {
      for (const [id, esperados] of Object.entries(datos)) {
        it(`${id}: las doce propiedades`, () => {
          const g = TIMBER_GRADES.find((x) => x.id === id);
          expect(g, `falta la clase ${id}`).toBeDefined();
          for (const [i, campo] of CAMPOS.entries()) {
            expect(g![campo], `${id} ${campo}`).toBeCloseTo(esperados[i], 10);
          }
        });
      }
    });
  }

  it('el catálogo trae las dos tablas enteras, ni una clase menos', () => {
    // Y al revés: si mañana se añade una clase, este test obliga a traer sus
    // valores de la norma en vez de deducirlos por interpolación.
    const enElCatalogo = TIMBER_GRADES.filter((g) => g.type === 'sawn').map((g) => g.id).sort();
    const enElGolden = [...Object.keys(TABLA_1), ...Object.keys(TABLA_3)].sort();
    expect(enElCatalogo).toEqual(enElGolden);
    expect(Object.keys(TABLA_1)).toHaveLength(12);
    expect(Object.keys(TABLA_3)).toHaveLength(14);
  });

  it('cada propiedad crece con la clase: delata una columna corrida', () => {
    // El error que hubo era justo este: C35 con las densidades de C40. Una
    // transcripción desplazada rompe la monotonía en algún punto, salvo en
    // fc90,k de las frondosas, que da un salto real en D60 (EN 338:2016).
    for (const tabla of [TABLA_1, TABLA_3]) {
      const filas = Object.values(tabla);
      for (const [i, campo] of CAMPOS.entries()) {
        for (let k = 1; k < filas.length; k++) {
          expect(filas[k][i], `${campo} entre ${Object.keys(tabla)[k - 1]} y ${Object.keys(tabla)[k]}`)
            .toBeGreaterThanOrEqual(filas[k - 1][i]);
        }
      }
    }
  });
});

describe('kh — EN 1995-1-1 §3.2(3) y §3.3(3)', () => {
  const g = (id: string) => TIMBER_GRADES.find((x) => x.id === id)!;

  it('maciza ligera: (150/h)^0,2 con tope 1,3', () => {
    expect(getKh(g('C24'), 100)).toBeCloseTo(Math.pow(1.5, 0.2), 10);
    expect(getKh(g('C24'), 40)).toBe(1.3);
    expect(getKh(g('C24'), 150)).toBe(1.0);
    expect(getKh(g('C24'), 400)).toBe(1.0);
  });

  it('laminada: (600/h)^0,1 con tope 1,1, sin condición de densidad', () => {
    expect(getKh(g('GL24h'), 400)).toBeCloseTo(Math.pow(1.5, 0.1), 10); // 1,041
    expect(getKh(g('GL24h'), 200)).toBe(1.1); // (600/200)^0,1 = 1,116 → tope
    expect(getKh(g('GL24h'), 600)).toBe(1.0);
  });

  it('frondosa densa (ρk > 700): NO hay factor de tamaño', () => {
    // El error que había: los tres motores daban a un D70 de 100 mm de canto
    // un 8 % más de fm,d que la norma no concede. §3.2(3) restringe kh a
    // «madera maciza … con una densidad característica ρk ≤ 700 kg/m³».
    for (const id of ['D65', 'D70', 'D75', 'D80']) {
      expect(g(id).rho_k, id).toBeGreaterThan(700);
      expect(getKh(g(id), 100), id).toBe(1.0);
    }
    // D60 está justo en el límite (700) y sí entra.
    expect(g('D60').rho_k).toBe(700);
    expect(getKh(g('D60'), 100)).toBeCloseTo(Math.pow(1.5, 0.2), 10);
  });

  it('los tres motores usan el mismo kh: un D70 de 100 mm no se bonifica en ninguno', () => {
    const viga = calcTimberBeam({ ...timberBeamDefaults, gradeId: 'D70', b: 60, h: 100 });
    const pilar = calcTimberColumn({ ...timberColumnDefaults, gradeId: 'D70', b: 100, h: 100 });
    const barra = calcTimberFrameMember({
      section: { gradeId: 'D70', b: 60, h: 100, serviceClass: 1 },
      Lef_y: 2, Lef_z: 2, Lltb: 2, loadDuration: 'medium', N: 0, M: 2, V: 1,
    });
    expect(viga.kh).toBe(1.0);
    expect(pilar.kh).toBe(1.0);
    expect(barra.kh).toBe(1.0);
  });
});

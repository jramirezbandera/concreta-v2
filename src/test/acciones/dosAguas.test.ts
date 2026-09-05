/**
 * Golden de la cubierta a dos aguas: la hoja «DOS AGUAS» de `vientoCTE.xls`.
 *
 * Edificio de 12 × 20,5 m con la cumbrera de 20,5 m, coronación a 10,5 m y
 * pendiente 17º; qe = qb·ce de la hoja «CALCULO PRESION» (76,797 kg/m², a
 * z = 10 m, zona A, aspereza IV). La hoja interpola la pendiente en la D.6
 * con la macro `interpo` y escoge cpe,10 o cpe,1 según el área de cada zona.
 *
 * Con viento PERPENDICULAR a la cumbrera es reproducible entera: áreas,
 * coeficientes y presiones de las zonas F-J en kg/m². Con viento PARALELO la
 * hoja se separa de la norma en tres sitios, y cada uno tiene su bloque
 * DISCREPANCIA:
 *   - su tabla «A<10m2» es una copia de la de A ≥ 10 (la D.6 b) da otros
 *     valores para cpe,1), así que F y G (3,6 m²) salen con cpe,10;
 *   - escalona en 10 m² en vez de aplicar la fórmula D.4 (Anejo D.3-4);
 *   - aproxima las áreas de H e I (e/2·b/2 y d/2·b/2) en vez de restar la
 *     banda e/10 y de medir I desde e/2, como dibuja la figura.
 * Y una errata de transcripción en su tabla a): la zona I a 5º lleva un
 * +0,2 que la norma no tiene (se le coló de la fila de −5º).
 */

import { describe, expect, it } from 'vitest';
import {
  alturaCoronacionDesdeForjado,
  calcularDosAguas,
  coeficienteParaArea,
  coeficienteTabulado,
  zonasEnPlanta,
  type ZonaResuelta,
} from '../../lib/acciones/dosAguas';
import { coeficienteExposicion, presionDinamicaDesdeVelocidad } from '../../lib/acciones/viento';

const KG = 1 / 0.00981; // kN/m² → kg/m², como la hoja

/** L24 de «CALCULO PRESION»: la hoja usa el qe del edificio (z = 10) también para la cubierta. */
const qe = presionDinamicaDesdeVelocidad(26) * coeficienteExposicion(10, 'IV');
const hoja = calcularDosAguas({ pendiente: 17, alturaCoronacion: 10.5, longitudCumbrera: 20.5, anchoCubierta: 12, qe });
const zona = (zonas: ZonaResuelta[], z: string) => zonas.find((x) => x.zona === z)!;

describe('golden vientoCTE — DOS AGUAS, viento perpendicular a la cumbrera', () => {
  const d = hoja.perpendicular;

  it('b es la cumbrera (20,5), d el ancho (12) y e = min(b, 2h) = 20,5 (J7)', () => {
    expect(d.theta).toBe(0);
    expect(d.b).toBe(20.5);
    expect(d.d).toBe(12);
    expect(d.e).toBe(20.5);
  });

  it('áreas de las zonas (I20:M20): F 10,51 · G 21,01 · H 80,98 · I 80,98 · J 42,03', () => {
    expect(zona(d.zonas, 'F').area).toBeCloseTo(10.50625, 5);
    expect(zona(d.zonas, 'F').piezas).toBe(2);
    expect(zona(d.zonas, 'G').area).toBeCloseTo(21.0125, 4);
    expect(zona(d.zonas, 'H').area).toBeCloseTo(80.975, 3);
    expect(zona(d.zonas, 'I').area).toBeCloseTo(80.975, 3);
    expect(zona(d.zonas, 'J').area).toBeCloseTo(42.025, 3);
  });

  it('coeficientes a 17º interpolados entre 15º y 30º (L12:P13); todas las zonas pasan de 10 m²', () => {
    const esperado: Record<string, [number, number]> = {
      F: [-0.8467, 0.2667],
      G: [-0.76, 0.2667],
      H: [-0.2867, 0.2267],
      I: [-0.4, 0],
      J: [-0.9333, 0],
    };
    for (const [z, [s, p]] of Object.entries(esperado)) {
      const r = zona(d.zonas, z);
      expect(r.A, z).toBeGreaterThanOrEqual(10);
      expect(r.cpe.succion, z).toBeCloseTo(s, 3);
      expect(r.cpe.presion, z).toBeCloseTo(p, 3);
      expect(r.cpe, z).toEqual(r.cpe10);
    }
  });

  it('presiones en kg/m² (L14:P15): succión y presión de cada zona', () => {
    const esperado: Record<string, [number, number]> = {
      F: [-65.02, 20.48],
      G: [-58.37, 20.48],
      H: [-22.02, 17.41],
      I: [-30.72, 0],
      J: [-71.68, 0],
    };
    for (const [z, [s, p]] of Object.entries(esperado)) {
      expect(zona(d.zonas, z).succion! * KG, z).toBeCloseTo(s, 1);
      expect(zona(d.zonas, z).presion! * KG, z).toBeCloseTo(p, 1);
    }
  });
});

describe('golden PARCIAL — viento paralelo a la cumbrera', () => {
  const d = hoja.paralela;

  it('b es el hastial (12), d la cumbrera (20,5) y e = min(12, 21) = 12 (J34)', () => {
    expect(d.theta).toBe(90);
    expect(d.b).toBe(12);
    expect(d.d).toBe(20.5);
    expect(d.e).toBe(12);
  });

  it('F y G miden 3,6 m² como en la hoja (I45, J45), uno por faldón', () => {
    expect(zona(d.zonas, 'F').area).toBeCloseTo(3.6, 9);
    expect(zona(d.zonas, 'G').area).toBeCloseTo(3.6, 9);
    expect(zona(d.zonas, 'F').piezas).toBe(2);
    expect(zona(d.zonas, 'G').piezas).toBe(2);
  });

  it('DISCREPANCIA áreas de H e I: la hoja toma e/2·b/2 = 36 y d/2·b/2 = 61,5 (K45, L45)', () => {
    // La figura D.6 b) da a H de e/10 a e/2 y a I de e/2 al otro hastial:
    // (6 − 1,2)·6 = 28,8 y (20,5 − 6)·6 = 87. Las dos pasan de 10 m² en
    // ambos cálculos, así que el coeficiente no cambia.
    expect(zona(d.zonas, 'H').area).toBeCloseTo(28.8, 9);
    expect(zona(d.zonas, 'I').area).toBeCloseTo(87, 9);
  });

  it('cpe,10 a 17º = los de la hoja (L39:O39) y sus presiones en kg/m² (L41:O41)', () => {
    const esperado: Record<string, [number, number]> = {
      F: [-1.2733, -97.79],
      G: [-1.3133, -100.86],
      H: [-0.6267, -48.13],
      I: [-0.5, -38.4],
    };
    for (const [z, [c, kg]] of Object.entries(esperado)) {
      expect(zona(d.zonas, z).cpe10.succion, z).toBeCloseTo(c, 3);
      expect(zona(d.zonas, z).cpe10.presion, z).toBeNull();
      expect(zona(d.zonas, z).cpe10.succion! * qe * KG, z).toBeCloseTo(kg, 1);
    }
  });

  it('DISCREPANCIA cpe,1 y fórmula D.4: la hoja deja F y G (3,6 m²) con cpe,10; la norma da más', () => {
    // La tabla «A<10m2» de la hoja (S46:V53) es una copia de la de A ≥ 10.
    // Con la D.6 b), cpe,1 a 17º es −1,93 (F) y −2,00 (G), y la D.4 con
    // A = 3,6 m² deja −1,57 y −1,62: un 23 % más de succión que la hoja.
    const F = zona(d.zonas, 'F');
    const G = zona(d.zonas, 'G');
    expect(F.cpe1.succion).toBeCloseTo(-2 + (2 / 15) * 0.5, 9);
    expect(G.cpe1.succion).toBeCloseTo(-2, 9);
    expect(F.cpe.succion).toBeCloseTo(F.cpe1.succion! + (F.cpe10.succion! - F.cpe1.succion!) * Math.log10(3.6), 9);
    expect(F.cpe.succion).toBeCloseTo(-1.566, 3);
    expect(G.cpe.succion).toBeCloseTo(-1.618, 3);
    expect(zona(d.zonas, 'H').cpe).toEqual(zona(d.zonas, 'H').cpe10);
    expect(zona(d.zonas, 'I').cpe).toEqual(zona(d.zonas, 'I').cpe10);
    expect(hoja.notas.join()).toMatch(/D\.4/);
  });
});

describe('tabla D.6 — series de succión y presión', () => {
  it('DISCREPANCIA de transcripción: la zona I a 5º sólo tiene −0,6 en la norma (la hoja le puso +0,2)', () => {
    expect(coeficienteTabulado('perpendicular', 'I', 5, 'A10')).toEqual({ succion: -0.6, presion: null });
    expect(coeficienteTabulado('perpendicular', 'I', -5, 'A10')).toEqual({ succion: -0.6, presion: 0.2 });
  });

  it('los ±0,0 están para interpolar cada serie: F pierde la succión entre 45º y 60º y conserva la presión', () => {
    expect(coeficienteTabulado('perpendicular', 'F', 45, 'A10')).toEqual({ succion: 0, presion: 0.7 });
    expect(coeficienteTabulado('perpendicular', 'F', 52.5, 'A10')).toEqual({ succion: null, presion: 0.7 });
    expect(coeficienteTabulado('perpendicular', 'F', 60, 'A1')).toEqual({ succion: null, presion: 0.7 });
    const h = coeficienteTabulado('perpendicular', 'H', 22.5, 'A1');
    expect(h.succion).toBeCloseTo(-0.25, 12);
    expect(h.presion).toBeCloseTo(0.3, 12);
  });

  it('una serie que falta en un extremo del tramo no se interpola: I a 10º sólo tiene succión', () => {
    const c = coeficienteTabulado('perpendicular', 'I', 10, 'A10');
    expect(c.succion).toBeCloseTo(-0.5, 12);
    expect(c.presion).toBeNull();
  });

  it('por la cubierta plana (0º) se interpola entre −5º y 5º', () => {
    const f = coeficienteTabulado('perpendicular', 'F', 0, 'A1');
    expect(f.succion).toBeCloseTo(-2.5, 12);
    expect(f.presion).toBeNull();
    expect(coeficienteTabulado('perpendicular', 'J', 0, 'A10')).toEqual({ succion: -0.6, presion: 0.2 });
  });

  it('viento paralelo: sólo succión, cpe,1 nunca menos desfavorable que cpe,10, y sin zona J', () => {
    for (const z of ['F', 'G', 'H', 'I'] as const) {
      for (const a of [-45, -20, -5, 5, 30, 50, 75]) {
        const c10 = coeficienteTabulado('paralela', z, a, 'A10');
        const c1 = coeficienteTabulado('paralela', z, a, 'A1');
        expect(c10.presion, `${z} a ${a}º`).toBeNull();
        expect(c1.succion!, `${z} a ${a}º`).toBeLessThanOrEqual(c10.succion!);
      }
    }
    expect(() => coeficienteTabulado('paralela', 'J', 30, 'A10')).toThrow(/J/);
  });

  it('fuera de −45º…75º no hay coeficiente', () => {
    expect(coeficienteTabulado('perpendicular', 'F', 80, 'A10')).toEqual({ succion: null, presion: null });
    expect(coeficienteTabulado('paralela', 'F', -50, 'A1')).toEqual({ succion: null, presion: null });
  });
});

describe('área de influencia (Anejo D.3-4)', () => {
  const c10 = { succion: -0.9, presion: 0.2 };
  const c1 = { succion: -2, presion: 0.2 };

  it('cpe,1 hasta 1 m², cpe,10 desde 10 m², y la fórmula D.4 entre medias', () => {
    expect(coeficienteParaArea(c10, c1, 0.5)).toEqual(c1);
    expect(coeficienteParaArea(c10, c1, 1)).toEqual(c1);
    expect(coeficienteParaArea(c10, c1, 10)).toEqual(c10);
    expect(coeficienteParaArea(c10, c1, 50)).toEqual(c10);
    const m = coeficienteParaArea(c10, c1, 5);
    expect(m.succion).toBeCloseTo(-2 + 1.1 * Math.log10(5), 12);
    expect(m.presion).toBeCloseTo(0.2, 12);
    expect(coeficienteParaArea({ succion: null, presion: 0.7 }, { succion: null, presion: 0.7 }, 3)).toEqual({ succion: null, presion: 0.7 });
  });

  it('con área tecleada todas las zonas la usan, y la nota lo dice', () => {
    const base = { pendiente: 17, alturaCoronacion: 10.5, longitudCumbrera: 20.5, anchoCubierta: 12, qe };
    const local = calcularDosAguas({ ...base, areaInfluencia: 1 });
    expect(local.areaInfluencia).toBe(1);
    for (const z of [...local.perpendicular.zonas, ...local.paralela.zonas]) {
      expect(z.A).toBe(1);
      expect(z.cpe).toEqual(z.cpe1);
    }
    expect(local.notas.join()).toMatch(/1 m², la del elemento/);
    expect(local.notas.join()).not.toMatch(/D\.4/);
    expect(calcularDosAguas({ ...base, areaInfluencia: 5 }).notas.join()).toMatch(/D\.4/);
    expect(hoja.notas.join()).toMatch(/propia zona en planta/);
  });
});

describe('zonas en planta (figura D.6)', () => {
  const medidas = (
    zonas: { zona: string; piezas: number; ancho: number; fondo: number }[],
    esperado: [string, number, number, number][],
  ) => {
    expect(zonas.map((z) => z.zona)).toEqual(esperado.map((e) => e[0]));
    zonas.forEach((z, i) => {
      expect(z.piezas, z.zona).toBe(esperado[i][1]);
      expect(z.ancho, z.zona).toBeCloseTo(esperado[i][2], 10);
      expect(z.fondo, z.zona).toBeCloseTo(esperado[i][3], 10);
    });
  };

  it('perpendicular: b es la cumbrera, cada faldón tiene d/2 de fondo y J va detrás de la cumbrera', () => {
    const { e, zonas } = zonasEnPlanta('perpendicular', 20, 12, 8); // e = min(20, 16)
    expect(e).toBe(16);
    medidas(zonas, [
      ['F', 2, 4, 1.6],
      ['G', 1, 12, 1.6],
      ['H', 1, 20, 4.4],
      ['I', 1, 20, 4.4],
      ['J', 1, 20, 1.6],
    ]);
  });

  it('paralela: b es el hastial, H llega hasta e/2 e I sigue hasta el otro hastial', () => {
    const { e, zonas } = zonasEnPlanta('paralela', 12, 20, 8); // e = min(12, 16)
    expect(e).toBe(12);
    medidas(zonas, [
      ['F', 2, 3, 1.2],
      ['G', 2, 3, 1.2],
      ['H', 2, 6, 4.8],
      ['I', 2, 6, 14],
    ]);
  });

  it('cuando el faldón es más corto que la banda, H e I desaparecen y F, G y J se acortan', () => {
    const { zonas } = zonasEnPlanta('perpendicular', 20, 3, 10); // e = 20, e/10 = 2 > d/2 = 1,5
    medidas(zonas, [
      ['F', 2, 5, 1.5],
      ['G', 1, 10, 1.5],
      ['H', 1, 20, 0],
      ['I', 1, 20, 0],
      ['J', 1, 20, 1.5],
    ]);
  });

  it('con viento paralelo y cumbrera corta, I desaparece y H se recorta', () => {
    const { zonas } = zonasEnPlanta('paralela', 20, 6, 10); // e = 20, e/2 = 10 > d = 6
    medidas(zonas, [
      ['F', 2, 5, 2],
      ['G', 2, 5, 2],
      ['H', 2, 10, 4],
      ['I', 2, 10, 0],
    ]);
  });
});

describe('resultante horizontal de los faldones (auditoría M1)', () => {
  it('golden vientoCTE a 17º: Σ cpe·A·tan α con cada cara entera, hacia sotavento y hacia barlovento', () => {
    const d = hoja.perpendicular;
    const res = d.resultante!;
    const tan = Math.tan((17 * Math.PI) / 180);
    expect(res.area).toBeCloseTo(20.5 * 6 * tan, 9);
    const A = (z: string) => zona(d.zonas, z).piezas * zona(d.zonas, z).area;
    const c = (z: string) => zona(d.zonas, z).cpe;
    const barloventoPresion = c('F').presion! * A('F') + c('G').presion! * A('G') + c('H').presion! * A('H');
    const barloventoSuccion = c('F').succion! * A('F') + c('G').succion! * A('G') + c('H').succion! * A('H');
    const sotaventoPresion = c('I').presion! * A('I') + c('J').presion! * A('J');
    const sotaventoSuccion = c('I').succion! * A('I') + c('J').succion! * A('J');
    expect(res.haciaSotavento).toBeCloseTo(tan * qe * (barloventoPresion - sotaventoSuccion), 9);
    expect(res.haciaBarlovento).toBeCloseTo(tan * qe * (barloventoSuccion - sotaventoPresion), 9);
    expect(res.haciaSotavento).toBeGreaterThan(0);
    expect(res.haciaBarlovento).toBeLessThan(0);
    expect(hoja.paralela.resultante).toBeNull();
    expect(hoja.notas.join()).toMatch(/Resultante horizontal/);
  });

  it('con los faldones hacia el centro (α < 0) los signos se invierten solos y la resultante sigue acotada', () => {
    const r = calcularDosAguas({ pendiente: -15, alturaCoronacion: 9, longitudCumbrera: 20, anchoCubierta: 12, qe: 0.8 });
    const res = r.perpendicular.resultante!;
    expect(res.area).toBeCloseTo(20 * 6 * Math.tan((15 * Math.PI) / 180), 9);
    expect(res.haciaSotavento).toBeGreaterThanOrEqual(0);
    expect(res.haciaBarlovento).toBeLessThanOrEqual(0);
  });

  it('las zonas sin sitio no salen (auditoría B8)', () => {
    const r = calcularDosAguas({ pendiente: 20, alturaCoronacion: 10, longitudCumbrera: 20, anchoCubierta: 3, qe: 0.8 });
    expect(r.perpendicular.zonas.map((z) => z.zona)).toEqual(['F', 'G', 'J']);
    expect(r.perpendicular.zonas.every((z) => z.area > 0)).toBe(true);
    expect(r.notas.join()).toMatch(/dos sentidos/);
  });
});

describe('calcularDosAguas — límites y notas', () => {
  const base = { pendiente: 20, alturaCoronacion: 9, longitudCumbrera: 20, anchoCubierta: 12, qe: 0.8 };

  it('presión = qe · cpe en cada zona, con las dos posibilidades donde las hay', () => {
    const r = calcularDosAguas(base);
    for (const d of [r.perpendicular, r.paralela]) {
      for (const z of d.zonas) {
        expect(z.succion).toBe(z.cpe.succion === null ? null : z.cpe.succion * 0.8);
        expect(z.presion).toBe(z.cpe.presion === null ? null : z.cpe.presion * 0.8);
      }
    }
    expect(r.perpendicular.zonas.every((z) => z.presion !== null)).toBe(true);
    expect(r.paralela.zonas.every((z) => z.presion === null)).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.notas.join()).toMatch(/D\.3-2/);
    expect(r.areaInfluencia).toBeNull();
  });

  it('pendientes fuera de la tabla: error; casi plana: aviso; negativa dentro de rango: nada', () => {
    expect(calcularDosAguas({ ...base, pendiente: 80 }).errores.join()).toMatch(/75º/);
    expect(calcularDosAguas({ ...base, pendiente: -50 }).errores.join()).toMatch(/-45º/);
    const plana = calcularDosAguas({ ...base, pendiente: 3 });
    expect(plana.errores).toEqual([]);
    expect(plana.avisos.join()).toMatch(/casi plana/);
    expect(calcularDosAguas({ ...base, pendiente: -20 }).avisos).toEqual([]);
  });

  it('dimensiones, altura o área nulas', () => {
    expect(calcularDosAguas({ ...base, alturaCoronacion: 0 }).errores.join()).toMatch(/coronación/);
    expect(calcularDosAguas({ ...base, longitudCumbrera: 0 }).errores.join()).toMatch(/cumbrera/);
    expect(calcularDosAguas({ ...base, areaInfluencia: 0 }).errores.join()).toMatch(/área de influencia/);
  });

  it('la altura de coronación deducida del último forjado', () => {
    expect(alturaCoronacionDesdeForjado(9, 12, 0)).toBe(9);
    expect(alturaCoronacionDesdeForjado(9, 12, -20)).toBe(9);
    expect(alturaCoronacionDesdeForjado(9, 12, 45)).toBeCloseTo(15, 12);
  });
});

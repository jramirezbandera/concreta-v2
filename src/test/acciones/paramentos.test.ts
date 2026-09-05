/**
 * Golden de los paramentos verticales: el bloque «ALZADO FRONTAL / ALZADO
 * LATERAL» de la hoja «DOS AGUAS» de `vientoCTE.xls` (tabla D.3).
 *
 * Mismo edificio que la cubierta: 12 × 20,5 m, coronación a 10,5 m, 17º de
 * pendiente, qe = 76,797 kg/m². «Frontal» es el viento perpendicular a la
 * cumbrera (d = 12, h/d = 0,875) y «lateral» el paralelo (d = 20,5, h/d =
 * 0,512). Los coeficientes de las zonas, interpolados en h/d dentro de la
 * fila de A ≥ 10 m², y las presiones en kg/m² se reproducen enteros.
 *
 * Lo que la hoja hace de otra manera, cada cosa con su bloque DISCREPANCIA:
 *   - mide las fachadas con una altura de alero ho = h − d/2·sin α, que usa
 *     el seno en vez de la tangente y la dimensión paralela al viento en vez
 *     del ancho de la cubierta (y en el alzado lateral el ángulo apunta por
 *     error a la celda del cpe de la zona F, con lo que ho sale 10,65);
 *   - el ancho de B es e − e/10 sin recortarlo a la fachada, y pinta la zona
 *     C con área negativa cuando d < e;
 *   - su IF anidado (`5>A<2`, `2>=A<1`) nunca es cierto: toda área ≤ 5 m² cae
 *     en la fila de A ≤ 1 m² en vez de interpolar entre las filas de 5 y 2.
 */

import { describe, expect, it } from 'vitest';
import {
  calcularParamentos,
  coeficienteParamento,
  zonasLaterales,
  type DireccionParamentos,
} from '../../lib/acciones/paramentos';
import { coeficienteExposicion, presionDinamicaDesdeVelocidad } from '../../lib/acciones/viento';

const KG = 1 / 0.00981; // kN/m² → kg/m², como la hoja

/** L24 de «CALCULO PRESION»: la hoja usa el qe del edificio (z = 10) para las fachadas. */
const qe = presionDinamicaDesdeVelocidad(26) * coeficienteExposicion(10, 'IV');
/** Alero real: coronación menos lo que sube el faldón, 10,5 − 6·tan 17º = 8,67 m. */
const alero = 10.5 - 6 * Math.tan((17 * Math.PI) / 180);
const hoja = calcularParamentos({ h: 10.5, alturaFachada: alero, dimensiones: { x: 20.5, y: 12 }, qe });

const cpeDe = (d: DireccionParamentos) => Object.fromEntries(d.zonas.map((z) => [z.zona, z.cpe]));
const kgDe = (d: DireccionParamentos) => Object.fromEntries(d.zonas.map((z) => [z.zona, z.presion * KG]));
const anchoDe = (d: DireccionParamentos) => Object.fromEntries(d.zonas.map((z) => [z.zona, z.ancho]));

describe('golden vientoCTE — ALZADO FRONTAL (viento según Y, perpendicular a la cumbrera)', () => {
  const d = hoja.y;

  it('d = 12, b = 20,5, e = min(b, 2h) = 20,5 > d: sin zona C, y h/d = 0,875 (M63)', () => {
    expect(d.d).toBe(12);
    expect(d.b).toBe(20.5);
    expect(d.e).toBe(20.5);
    expect(d.esbeltez).toBeCloseTo(0.875, 12);
    expect(d.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'D', 'E']);
    for (const z of d.zonas) expect(z.A, z.zona).toBeGreaterThanOrEqual(10);
  });

  it('coeficientes (H66:L66): A −1,20 · B −0,80 · D 0,78 · E −0,47', () => {
    const c = cpeDe(d);
    expect(c.A).toBeCloseTo(-1.2, 9);
    expect(c.B).toBeCloseTo(-0.8, 9);
    expect(c.D).toBeCloseTo(0.7833, 3);
    expect(c.E).toBeCloseTo(-0.4667, 3);
  });

  it('presiones en kg/m² (H68:L68): −92,16 · −61,44 · 60,16 · −35,84', () => {
    const k = kgDe(d);
    expect(k.A).toBeCloseTo(-92.16, 1);
    expect(k.B).toBeCloseTo(-61.44, 1);
    expect(k.D).toBeCloseTo(60.16, 1);
    expect(k.E).toBeCloseTo(-35.84, 1);
  });

  it('DISCREPANCIA zona C: la hoja la pinta con −0,5 y −38,40 kg/m² sobre un área negativa (J73 = −74 m²); con d < e no existe', () => {
    expect(coeficienteParamento('C', 0.875, 10)).toBe(-0.5);
    expect(d.zonas.find((z) => z.zona === 'C')).toBeUndefined();
  });

  it('DISCREPANCIA áreas: la hoja mide con ho = 8,75 m y da a B 18,45 m de ancho en una fachada de 12 m (I73 = 177,5 m²)', () => {
    // El alero real está a 8,67 m (tangente y ancho de la cubierta), A mide
    // e/10 = 2,05 m como en la hoja, y B se recorta a lo que queda de fachada.
    expect(alero).toBeCloseTo(8.666, 3);
    const ancho = anchoDe(d);
    expect(ancho.A).toBeCloseTo(2.05, 12);
    expect(ancho.B).toBeCloseTo(12 - 2.05, 12);
    expect(d.zonas.find((z) => z.zona === 'B')!.area).toBeCloseTo((12 - 2.05) * alero, 9);
  });
});

describe('golden vientoCTE — ALZADO LATERAL (viento según X, paralelo a la cumbrera)', () => {
  const d = hoja.x;

  it('d = 20,5, b = 12, e = 12 < d: las cinco zonas, C de 8,5 m (T63), y h/d = 0,512 (V63)', () => {
    expect(d.e).toBe(12);
    expect(d.esbeltez).toBeCloseTo(10.5 / 20.5, 12);
    expect(d.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'C', 'D', 'E']);
    const ancho = anchoDe(d);
    expect(ancho.A).toBeCloseTo(1.2, 12);
    expect(ancho.B).toBeCloseTo(10.8, 12);
    expect(ancho.C).toBeCloseTo(8.5, 12);
    expect(ancho.D).toBe(12);
    expect(ancho.E).toBe(12);
    for (const z of d.zonas) expect(z.A, z.zona).toBeGreaterThanOrEqual(10);
  });

  it('coeficientes (Q66:U66) y presiones en kg/m² (Q68:U68)', () => {
    const c = cpeDe(d);
    const k = kgDe(d);
    expect(c.A).toBeCloseTo(-1.2, 9);
    expect(c.B).toBeCloseTo(-0.8, 9);
    expect(c.C).toBe(-0.5);
    expect(c.D).toBeCloseTo(0.735, 3);
    expect(c.E).toBeCloseTo(-0.3699, 3);
    expect(k.A).toBeCloseTo(-92.16, 1);
    expect(k.B).toBeCloseTo(-61.44, 1);
    expect(k.C).toBeCloseTo(-38.4, 1);
    expect(k.D).toBeCloseTo(56.44, 1);
    expect(k.E).toBeCloseTo(-28.41, 1);
  });
});

describe('tabla D.3 — interpolación en h/d y en el área', () => {
  it('en h/d dentro de una fila: D pasa de 0,7 (h/d ≤ 0,25) a 0,8 (h/d = 1) y sigue en 0,8 hasta 5; E de −0,3 a −0,5 y a −0,7', () => {
    expect(coeficienteParamento('D', 0.1, 10)).toBeCloseTo(0.7, 12);
    expect(coeficienteParamento('D', 0.625, 10)).toBeCloseTo(0.75, 12);
    expect(coeficienteParamento('D', 1, 10)).toBeCloseTo(0.8, 12);
    expect(coeficienteParamento('D', 7, 10)).toBeCloseTo(0.8, 12);
    expect(coeficienteParamento('E', 3, 10)).toBeCloseTo(-0.6, 12);
    expect(coeficienteParamento('E', 0.25, 1)).toBeCloseTo(-0.3, 12);
    expect(coeficienteParamento('D', 5, 1)).toBeCloseTo(1.0, 12);
  });

  it('en el área: A −1,2 con 10 m², −1,4 con 1 m², −1,35 con 1,5 m²; fuera de la tabla, el extremo', () => {
    expect(coeficienteParamento('A', 1, 50)).toBeCloseTo(-1.2, 12);
    expect(coeficienteParamento('A', 1, 1.5)).toBeCloseTo(-1.35, 12);
    expect(coeficienteParamento('A', 1, 0.2)).toBeCloseTo(-1.4, 12);
    expect(coeficienteParamento('B', 5, 3)).toBeCloseTo(-1 + (1 / 3) * 0.1, 12);
  });

  it('DISCREPANCIA del IF anidado: con 3 m² la hoja tomaría la fila de 1 m² (B = −1,1); interpolando entre 5 y 2 m² sale −0,97', () => {
    expect(coeficienteParamento('B', 1, 3)).toBeCloseTo(-0.9667, 3);
  });

  it('C vale −0,5 en toda la tabla', () => {
    for (const hd of [0.1, 1, 5]) for (const A of [0.5, 3, 20]) expect(coeficienteParamento('C', hd, A)).toBe(-0.5);
  });
});

describe('zonas laterales (figura D.3)', () => {
  it('e < d: A = e/10, B hasta e, C el resto', () => {
    const z = zonasLaterales(20, 30, 8); // e = min(20, 16)
    expect(z.e).toBe(16);
    expect(z.A).toBeCloseTo(1.6, 12);
    expect(z.B).toBeCloseTo(14.4, 12);
    expect(z.C).toBeCloseTo(14, 12);
  });

  it('e ≥ d: B se recorta a la fachada y no hay C', () => {
    const z = zonasLaterales(20, 12, 8);
    expect(z.A).toBeCloseTo(1.6, 12);
    expect(z.B).toBeCloseTo(10.4, 12);
    expect(z.C).toBe(0);
  });

  it('fachada más corta que e/10: sólo A', () => {
    expect(zonasLaterales(20, 1, 8)).toEqual({ e: 16, A: 1, B: 0, C: 0 });
  });
});

describe('hastiales con cubierta a dos aguas (auditoría B10, I1)', () => {
  const con = calcularParamentos({ h: 11.2, alturaFachada: 9, dimensiones: { x: 20, y: 12 }, qe: 0.8, cumbrera: 'x' });
  const zona = (d: DireccionParamentos, z: string) => d.zonas.find((q) => q.zona === z)!;

  it('con la cumbrera paralela al viento, D y E llevan el triángulo hasta la coronación; las laterales y la otra dirección no', () => {
    expect(zona(con.x, 'D').area).toBeCloseTo(12 * 9 + (12 * 2.2) / 2, 9);
    expect(zona(con.x, 'E').area).toBeCloseTo(zona(con.x, 'D').area, 9);
    expect(zona(con.x, 'A').area).toBeCloseTo(zona(con.x, 'A').ancho * 9, 9);
    expect(zona(con.y, 'D').area).toBeCloseTo(20 * 9, 9);
    expect(con.notas.join()).toMatch(/hastiales/);
    const sin = calcularParamentos({ h: 11.2, alturaFachada: 9, dimensiones: { x: 20, y: 12 }, qe: 0.8 });
    expect(zona(sin.x, 'D').area).toBeCloseTo(12 * 9, 9);
    expect(sin.notas.join()).not.toMatch(/hastiales/);
  });

  it('las notas dicen que la zona A es e/10 por el DB (e/5 en el Eurocódigo) y que el viento va en los dos sentidos', () => {
    expect(con.notas.join()).toMatch(/e\/5/);
    expect(con.notas.join()).toMatch(/dos sentidos/);
  });
});

describe('calcularParamentos — composición', () => {
  const base = { h: 9, alturaFachada: 9, dimensiones: { x: 20, y: 12 }, qe: 0.8 };

  it('áreas, área de influencia, presión y piezas por zona; las zonas que no caben no salen', () => {
    const r = calcularParamentos(base);
    for (const d of [r.x, r.y]) {
      for (const z of d.zonas) {
        expect(z.area, z.zona).toBeCloseTo(z.ancho * 9, 12);
        expect(z.A, z.zona).toBe(z.area);
        expect(z.presion, z.zona).toBeCloseTo(z.cpe * 0.8, 12);
        expect(z.piezas, z.zona).toBe('ABC'.includes(z.zona) ? 2 : 1);
      }
    }
    expect(r.x.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'C', 'D', 'E']); // d = 20, b = 12 → e = 12
    expect(r.y.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'D', 'E']); // d = 12, b = 20 → e = 18
    expect(r.x.esbeltez).toBeCloseTo(0.45, 12);
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.notas.join()).toMatch(/3\.3\.4-3/);
    expect(r.notas.join()).toMatch(/propia zona/);
    expect(r.areaInfluencia).toBeNull();
  });

  it('con área tecleada todas las zonas la usan, y la nota lo dice', () => {
    const local = calcularParamentos({ ...base, areaInfluencia: 1 });
    expect(local.areaInfluencia).toBe(1);
    for (const z of [...local.x.zonas, ...local.y.zonas]) expect(z.A).toBe(1);
    expect(local.x.zonas[0].cpe).toBeCloseTo(-1.4, 12);
    expect(local.notas.join()).toMatch(/1 m² en las fachadas/);
  });

  it('entradas inválidas', () => {
    expect(calcularParamentos({ ...base, h: 0 }).errores.join()).toMatch(/altura/);
    expect(calcularParamentos({ ...base, dimensiones: { x: 0, y: 12 } }).errores.join()).toMatch(/dimensiones/);
    expect(calcularParamentos({ ...base, areaInfluencia: 0 }).errores.join()).toMatch(/área de influencia/);
  });
});

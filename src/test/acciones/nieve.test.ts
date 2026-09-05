/**
 * Nieve: el bloque «NIEVE_ qn(= μ·sk)» y «ACUMULACIÓN NIEVE» del Excel de
 * cargas del estudio (sk = 0,6 tecleado, μ de 0 a 7, pd = (1−μ)·L·sk,
 * pa = min(μ,1)·pd), más las reglas del art. 3.5 releídas de las pp. 14-16 y
 * la tabla E.2 de la p. 46.
 */

import { describe, expect, it } from 'vitest';
import {
  acumulacion,
  calcularNieve,
  cargaHielo,
  cargaNieveTerreno,
  coeficienteForma,
  coeficienteFormaLimahoya,
} from '../../lib/acciones/nieve';
import { interpolar } from '../../lib/acciones/interp';

describe('interpolar', () => {
  it('lineal entre casillas y acotada en los extremos', () => {
    expect(interpolar(0.5, [0, 1], [10, 20])).toBe(15);
    expect(interpolar(-1, [0, 1], [10, 20])).toBe(10);
    expect(interpolar(5, [0, 1], [10, 20])).toBe(20);
    expect(interpolar(1, [0, 1, 2], [0, 10, 30])).toBe(10);
    expect(interpolar(1.5, [0, 1, 2], [0, 10, 30])).toBe(20);
    expect(() => interpolar(1, [0, 1], [1])).toThrow();
  });
});

describe('golden Excel de cargas — qn = μ·sk con sk = 0,6', () => {
  it('μ de 0 a 7 (G46:G53)', () => {
    for (let mu = 0; mu <= 7; mu++) expect(mu * 0.6).toBeCloseTo([0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2][mu], 9);
  });

  it('encuentro entre dos faldones: μ = 2 en 2 m (F48)', () => {
    // La hoja teclea μ = 2 directamente; la norma (3.5.3-3b) da 2,0 en cuanto
    // la semisuma de inclinaciones pasa de 30º.
    expect(coeficienteFormaLimahoya(35, 35)).toBe(2);
    expect(coeficienteFormaLimahoya(45, 20)).toBe(2);
  });

  it('acumulación pd = (1−μ)·L·sk y pa = min(μ,1)·pd (F57:G58)', () => {
    expect(acumulacion(1, 5, 0.6)).toEqual({ pd: 0, pa: 0 });
    expect(acumulacion(0.5, 10, 0.6)).toEqual({ pd: 3, pa: 3 });
    expect(acumulacion(0.5, 10, 0.6, 0.5)).toEqual({ pd: 3, pa: 1.5 });
    expect(acumulacion(0.5, 10, 0.6, 2)).toEqual({ pd: 3, pa: 3 });
  });
});

describe('coeficiente de forma (3.5.3)', () => {
  it('1 hasta 30º, 0 desde 60º, lineal entre medias; impedimento → 1', () => {
    expect(coeficienteForma(0)).toBe(1);
    expect(coeficienteForma(30)).toBe(1);
    expect(coeficienteForma(45)).toBeCloseTo(0.5, 12);
    expect(coeficienteForma(60)).toBe(0);
    expect(coeficienteForma(75)).toBe(0);
    expect(coeficienteForma(75, true)).toBe(1);
  });

  it('limahoya entre faldones contrarios: 1 + β/30, tope 2', () => {
    expect(coeficienteFormaLimahoya(20, 20)).toBeCloseTo(1 + 20 / 30, 12);
    expect(coeficienteFormaLimahoya(10, 30)).toBeCloseTo(1 + 20 / 30, 12);
    expect(coeficienteFormaLimahoya(30, 30)).toBe(2);
    expect(coeficienteFormaLimahoya(0, 0)).toBe(1);
  });
});

describe('sk por zona y altitud (tabla E.2 interpolada)', () => {
  it('casillas exactas y valores intermedios', () => {
    expect(cargaNieveTerreno(3, 1000)).toBe(0.7);
    expect(cargaNieveTerreno(4, 660)).toBeCloseTo(0.56, 12); // Madrid
    expect(cargaNieveTerreno(1, 0)).toBe(0.3);
    expect(cargaNieveTerreno(5, -20)).toBe(0.2);
    expect(cargaNieveTerreno(7, 1500)).toBe(0.2);
    expect(cargaNieveTerreno(2, 2000)).toBeCloseTo(6.3, 12); // entre 1.800 (4,6) y 2.200 (8,0)
  });

  it('por encima de lo tabulado para la zona: null (art. 3.5.2-3)', () => {
    expect(cargaNieveTerreno(1, 1600)).toBe(4.3);
    expect(cargaNieveTerreno(1, 1601)).toBeNull();
    expect(cargaNieveTerreno(7, 1800)).toBe(0.2);
    expect(cargaNieveTerreno(7, 2000)).toBeNull();
    expect(cargaNieveTerreno(2, 2200)).toBe(8.0);
  });
});

describe('hielo en voladizos (3.5.1-4)', () => {
  it('pn = 3·μ²·sk', () => {
    expect(cargaHielo(1, 1.7)).toBeCloseTo(5.1, 12);
    expect(cargaHielo(0.5, 2)).toBeCloseTo(1.5, 12);
  });
});

describe('calcularNieve — composición', () => {
  const faldones = [
    { id: 'n', nombre: 'Faldón norte', inclinacion: 20, limahoya: { tipo: 'contrario' as const, inclinacionOtro: 20 } },
    // Descarga sobre una cubierta más baja: sin ese dato la nieve caería fuera y no habría acumulación.
    { id: 's', nombre: 'Faldón sur', inclinacion: 45, L: 8, voladizo: true, limahoya: { tipo: 'cambioNivel' as const } },
    { id: 'p', nombre: 'Terraza', inclinacion: 0 },
  ];

  it('Ávila (zona 3, 1.130 m): sk de la E.2, μ por faldón, limahoya, acumulación y hielo', () => {
    const r = calcularNieve({ zona: 3, altitud: 1130, exposicion: 'normal', faldones });
    expect(r.skOrigen).toBe('anejoE');
    expect(r.sk).toBeCloseTo(0.96, 12);
    expect(r.factorExposicion).toBe(1);
    expect(r.skEfectiva).toBeCloseTo(0.96, 12);
    expect(r.errores).toEqual([]);

    const [n, s, p] = r.faldones;
    expect(n.id).toBe('n');
    expect(n.mu).toBe(1);
    expect(n.qn).toBeCloseTo(0.96, 12);
    expect(n.qnAsimetrica).toBeCloseTo(0.48, 12);
    expect(n.limahoya).toBeDefined();
    expect(n.limahoya!.mu).toBeCloseTo(1 + 20 / 30, 12);
    expect(n.limahoya!.qn).toBeCloseTo((1 + 20 / 30) * 0.96, 12);
    expect(n.limahoya!.ancho).toBe(2);
    expect(n.acumulacion).toBeUndefined();

    expect(s.mu).toBeCloseTo(0.5, 12);
    expect(s.qn).toBeCloseTo(0.48, 12);
    expect(s.acumulacion!.pd).toBeCloseTo(0.5 * 8 * 0.96, 12);
    expect(s.acumulacion!.pa).toBeCloseTo(0.5 * 8 * 0.96, 12);
    expect(s.hielo).toBeCloseTo(3 * 0.25 * 0.96, 12);

    expect(p.mu).toBe(1);
    expect(p.hielo).toBeUndefined();
    expect(r.notas.join()).toMatch(/3\.5\.1-4/);
    expect(r.notas.join()).not.toMatch(/3\.5\.1-1/); // por encima de 1.000 m no hay simplificación de cubierta plana
  });

  it('en la capital manda la tabla 3.8; tecleado manda sobre todo', () => {
    const capital = calcularNieve({ zona: 3, altitud: 1130, skCapital: 1.0, exposicion: 'normal', faldones });
    expect(capital.skOrigen).toBe('tabla3.8');
    expect(capital.sk).toBe(1.0);
    const manual = calcularNieve({ zona: 3, altitud: 1130, skCapital: 1.0, skManual: 1.35, exposicion: 'normal', faldones });
    expect(manual.skOrigen).toBe('manual');
    expect(manual.sk).toBe(1.35);
  });

  it('exposición: −20 % protegida, +20 % expuesta, con su nota', () => {
    const prot = calcularNieve({ zona: 4, altitud: 660, exposicion: 'protegida', faldones });
    expect(prot.skEfectiva).toBeCloseTo(0.56 * 0.8, 12);
    expect(prot.faldones[0].qn).toBeCloseTo(0.56 * 0.8, 12);
    expect(prot.notas.join()).toMatch(/reducida un 20 %/);
    const exp = calcularNieve({ zona: 4, altitud: 660, exposicion: 'expuesta', faldones });
    expect(exp.skEfectiva).toBeCloseTo(0.56 * 1.2, 12);
    expect(exp.notas.join()).toMatch(/aumentada un 20 %/);
  });

  it('por debajo de 1.000 m: nota de la cubierta plana simplificada; sin hielo aunque haya voladizo', () => {
    const r = calcularNieve({ zona: 4, altitud: 660, exposicion: 'normal', faldones });
    expect(r.notas.join()).toMatch(/1,0 kN\/m² \(art\. 3\.5\.1-1\)/);
    expect(r.faldones[1].hielo).toBeUndefined();
  });

  it('faldón que descarga (μ < 1) sobre una discontinuidad sin L: aviso, no error', () => {
    const r = calcularNieve({ zona: 6, altitud: 690, exposicion: 'normal', faldones: [{ inclinacion: 45, limahoya: { tipo: 'cambioNivel' } }] });
    expect(r.errores).toEqual([]);
    expect(r.avisos.join()).toMatch(/3\.5\.4/);
    expect(r.avisos.join()).toMatch(/cubierta más baja/);
    expect(r.faldones[0].nombre).toBe('Faldón 1');
    expect(r.faldones[0].acumulacion).toBeUndefined();
  });

  it('faldón que descarga con alero (sin limahoya ni cambio de nivel): ni aviso ni acumulación, la nieve cae fuera (auditoría B7)', () => {
    const sinL = calcularNieve({ zona: 6, altitud: 690, exposicion: 'normal', faldones: [{ inclinacion: 45 }] });
    expect(sinL.avisos).toEqual([]);
    expect(sinL.faldones[0].acumulacion).toBeUndefined();
    const conL = calcularNieve({ zona: 6, altitud: 690, exposicion: 'normal', faldones: [{ inclinacion: 45, L: 8 }] });
    expect(conL.faldones[0].acumulacion).toBeUndefined();
    expect(conL.avisos.join()).toMatch(/cae fuera del edificio/);
    expect(conL.errores).toEqual([]);
  });

  it('cambio de nivel: acumulación con μi = 1 y sin banda de limahoya; la nota del 3.5.4-4 acompaña', () => {
    const r = calcularNieve({ zona: 4, altitud: 660, exposicion: 'normal', faldones: [{ inclinacion: 45, L: 8, limahoya: { tipo: 'cambioNivel' } }] });
    expect(r.faldones[0].limahoya).toBeUndefined();
    expect(r.faldones[0].acumulacion!.pd).toBeCloseTo(0.5 * 8 * 0.56, 12);
    expect(r.faldones[0].acumulacion!.pa).toBeCloseTo(0.5 * 8 * 0.56, 12);
    expect(r.notas.join()).toMatch(/3\.5\.4-4/);
    expect(calcularNieve({ zona: 4, altitud: 660, exposicion: 'normal', faldones: [{ inclinacion: 0 }] }).notas.join()).not.toMatch(/3\.5\.4-4/);
  });

  it('sk tecleado nulo: error (auditoría M3)', () => {
    expect(calcularNieve({ zona: 4, altitud: 660, skManual: 0, exposicion: 'normal', faldones: [{ inclinacion: 0 }] }).errores.join()).toMatch(/mayor que cero/);
    expect(calcularNieve({ zona: 4, altitud: 660, skManual: -0.2, exposicion: 'normal', faldones: [{ inclinacion: 0 }] }).errores.join()).toMatch(/mayor que cero/);
    expect(calcularNieve({ zona: 4, altitud: 660, skManual: 0.8, exposicion: 'normal', faldones: [{ inclinacion: 0 }] }).errores).toEqual([]);
  });

  it('la inclinación del otro faldón de la limahoya tiene que estar entre 0º y 90º (auditoría M3)', () => {
    const r = calcularNieve({ zona: 4, altitud: 660, exposicion: 'normal', faldones: [{ inclinacion: 20, limahoya: { tipo: 'contrario', inclinacionOtro: -50 } }] });
    expect(r.errores.join()).toMatch(/otro faldón/);
    const s = calcularNieve({ zona: 4, altitud: 660, exposicion: 'normal', faldones: [{ inclinacion: 20, limahoya: { tipo: 'mismoSentido', inclinacionInferior: 95 } }] });
    expect(s.errores.join()).toMatch(/otro faldón/);
  });

  it('León (zona 1, 820 m): la nota del 3.5.1-1 no dice «basta 1,0» cuando la tabla da más (auditoría M5)', () => {
    const leon = calcularNieve({ zona: 1, altitud: 820, exposicion: 'normal', faldones: [{ inclinacion: 0 }] });
    expect(leon.faldones[0].qn).toBeCloseTo(1.24, 12);
    const nota = leon.notas.find((n) => n.includes('3.5.1-1'))!;
    expect(nota).toMatch(/la tabla da más/);
    expect(nota).not.toMatch(/basta/);
    const madrid = calcularNieve({ zona: 4, altitud: 660, exposicion: 'normal', faldones: [{ inclinacion: 0 }] });
    expect(madrid.notas.find((n) => n.includes('3.5.1-1'))).toMatch(/basta considerar 1,0 kN\/m²/);
  });

  it('capital con la altitud cambiada: aviso con lo que daría la E.2 (auditoría B6)', () => {
    const r = calcularNieve({ zona: 4, altitud: 1200, skCapital: 0.6, altitudCapital: 660, exposicion: 'normal', faldones: [{ inclinacion: 0 }] });
    expect(r.sk).toBe(0.6);
    expect(r.avisos.join()).toMatch(/capital a 660 m/);
    expect(r.avisos.join()).toMatch(/1,90 kN\/m²/);
    const igual = calcularNieve({ zona: 4, altitud: 660, skCapital: 0.6, altitudCapital: 660, exposicion: 'normal', faldones: [{ inclinacion: 0 }] });
    expect(igual.avisos).toEqual([]);
  });

  it('altitud no tabulada para la zona: sk null y error del 3.5.2-3', () => {
    const r = calcularNieve({ zona: 1, altitud: 1900, exposicion: 'normal', faldones: [{ inclinacion: 30 }] });
    expect(r.sk).toBeNull();
    expect(r.skEfectiva).toBeNull();
    expect(r.errores.join()).toMatch(/3\.5\.2-3/);
    expect(r.faldones[0].qn).toBe(0);
  });

  it('entradas inválidas', () => {
    const r = calcularNieve({ zona: 2, altitud: 200, exposicion: 'normal', faldones: [{ inclinacion: 95 }, { inclinacion: 40, L: 0, limahoya: { tipo: 'cambioNivel' } }] });
    expect(r.errores.join()).toMatch(/entre 0º y 90º/);
    expect(r.errores.join()).toMatch(/mayor que cero/);
    expect(calcularNieve({ zona: 2, altitud: 200, exposicion: 'normal', faldones: [] }).errores.join()).toMatch(/al menos un faldón/);
  });
});

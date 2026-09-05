/**
 * Golden del viento: las dos hojas del estudio.
 *
 *   1. `vientoCTE.xls`, hoja «CALCULO PRESION» — método analítico del Anejo D:
 *      zona A, aspereza IV, z = 10 m, edificio 20 × 12 m, plantas de 3,1 m.
 *      Reproducible ENTERO: qb derivado de la zona con la fórmula D.1, ce con
 *      la D.2 y cp/cs interpolados en la 3.5 (macro `interpo`).
 *   2. Excel de cargas, hoja «Viento y nieve» — «Edificio auditorio»: aspereza
 *      IV, qb = 0,5 TECLEADO, h = 4 m, b = 7,5 m. Golden PARCIAL: esa hoja
 *      coge ce de la tabla 3.4 al escalón superior y cp/cs por escalón, y el
 *      módulo interpola (D-VN2) y usa la fórmula (D-VN3). Los bloques
 *      `DISCREPANCIA` documentan la diferencia con su referencia.
 *
 * Unidades: el motor trabaja en kN y kN/m²; las hojas del estudio están en kg
 * y kg/m² con g = 9,81, y aquí se convierte igual (× 1/0,00981).
 */

import { describe, expect, it } from 'vitest';
import {
  alturasTributarias,
  calcularViento,
  coeficienteExposicion,
  coeficientesEolicos,
  fuerzaHastial,
  fuerzaPlanta,
  presionDinamicaDesdeVelocidad,
} from '../../lib/acciones/viento';
import {
  ALTURAS_TABLA_3_4,
  ORDEN_ASPEREZAS,
  QB_SIMPLIFICADO,
  TABLA_3_4,
} from '../../lib/acciones/tablasAE';

const KG = 1 / 0.00981; // kN → kg (y kN/m² → kg/m²), como la hoja

describe('golden vientoCTE — CALCULO PRESION', () => {
  const qb = presionDinamicaDesdeVelocidad(26); // L9 = 0,5·1,25·26²·0,001
  const ce = coeficienteExposicion(10, 'IV');    // L22
  const qe = qb * ce;                            // L24 = qe/cp

  it('presión dinámica de la zona A por la fórmula D.1: 0,4225 kN/m²', () => {
    expect(qb).toBeCloseTo(0.4225, 6);
  });

  it('parámetros F y ce del Anejo D.2 en zona urbana a 10 m', () => {
    const F = 0.22 * Math.log(Math.max(5, 10) / 0.3);
    expect(F).toBeCloseTo(0.771442737, 8);          // L21
    expect(ce).toBeCloseTo(1.7831457127, 8);        // L22
  });

  it('qe/cp = 76,80 kg/m²', () => {
    expect(qe * KG).toBeCloseTo(76.797, 2);         // L24
  });

  it('coeficientes eólicos interpolados: esbeltez 0,5 y 0,833', () => {
    expect(coeficientesEolicos(10 / 20)).toEqual({ cp: 0.7, cs: -0.4 });           // G30, G31
    const c1 = coeficientesEolicos(10 / 12);                                        // N30, N31
    expect(c1.cp).toBeCloseTo(0.8, 9);
    expect(c1.cs).toBeCloseTo(-0.4333333333, 9);
  });

  it('carga puntual por planta y carga superficial en las dos direcciones', () => {
    // Viento 1: profundidad b1 = 20 (esbeltez 0,5), fachada expuesta b2 = 12.
    const c2 = coeficientesEolicos(0.5);
    expect(fuerzaPlanta(3.1, 12, c2.cp, c2.cs, qe) * KG).toBeCloseTo(3142.535, 1);  // H49
    expect((c2.cp - c2.cs) * qe * KG).toBeCloseTo(84.477, 2);                       // H50
    // Viento 2: profundidad b2 = 12 (esbeltez 0,833), fachada expuesta b1 = 20.
    const c1 = coeficientesEolicos(10 / 12);
    expect(fuerzaPlanta(3.1, 20, c1.cp, c1.cs, qe) * KG).toBeCloseTo(5872.414, 1);  // M49
    expect((c1.cp - c1.cs) * qe * KG).toBeCloseTo(94.716, 2);                       // M50
  });

  it('con el qb que escribe el DB (0,42) la diferencia es del 0,6 %', () => {
    const r = calcularViento({
      zona: 'A',
      aspereza: 'IV',
      plantas: [{ h: 10 }],
      dimensiones: { x: 20, y: 12 },
    });
    expect(r.qb).toBe(0.42);
    expect(r.vb).toBe(26);
    const qeDB = r.qb * coeficienteExposicion(10, 'IV');
    expect(Math.abs(qeDB - qe) / qe).toBeLessThan(0.006);
  });
});

describe('golden parcial: Excel de cargas, «Edificio auditorio»', () => {
  const r = calcularViento({
    zona: 'A',
    qbManual: 0.5,
    aspereza: 'IV',
    plantas: [{ h: 4 }],
    dimensiones: { x: 7.5, y: 7.5 },
  });

  it('qb tecleado 0,5 = el simplificado del art. 3.3.2', () => {
    expect(r.qb).toBe(QB_SIMPLIFICADO);
    expect(r.qbOrigen).toBe('simplificado');
    expect(r.vb).toBeNull();
  });

  it('esbeltez 0,533', () => {
    expect(r.x.esbeltez).toBeCloseTo(4 / 7.5, 9);
  });

  it('DISCREPANCIA cp: la hoja toma 0,8 por escalón; interpolando en la 3.5 sale 0,713', () => {
    // C20: IF(esbeltez < 0,75 → 0,8). La 3.5 tabula 0,7 en 0,50 y 0,8 en
    // 0,75; a 0,533 la interpolación (D-VN2, Anejo D.3-2) da 0,7133. cs sí
    // coincide: −0,4 en las dos casillas.
    expect(r.x.cp).toBeCloseTo(0.7 + (4 / 7.5 - 0.5) / 0.25 * 0.1, 9);
    expect(r.x.cs).toBeCloseTo(-0.4, 9);
  });

  it('DISCREPANCIA ce: la hoja toma 1,4 (tabla 3.4, escalón de 6 m); la fórmula D.2 a 4 m da 1,336', () => {
    // C27: INDEX/MATCH(-1) sobre la 3.4 coge la casilla de 6 m para h = 4.
    // Con la fórmula (D-VN3), 4 m está por debajo de Z = 5 y ce es el de 5 m.
    const p = r.x.plantas[0];
    expect(p.ce).toBeCloseTo(1.33629, 4);
    expect(p.ce).toBeCloseTo(coeficienteExposicion(5, 'IV'), 12);
  });

  it('qe: la hoja da 0,56 / −0,28; el módulo 0,477 / −0,267', () => {
    const p = r.x.plantas[0];
    expect(p.presion).toBeCloseTo(0.5 * 1.33629 * (0.7 + (4 / 7.5 - 0.5) / 0.25 * 0.1), 3);
    expect(p.succion).toBeCloseTo(-0.5 * 1.33629 * 0.4, 3);
  });

  it('el perfil por alturas de la hoja (columna I, tabla 3.4) es la fórmula redondeada', () => {
    const perfil = [1.3, 1.3, 1.4, 1.7, 1.9, 2.1, 2.2, 2.4, 2.6]; // I13:I21, alturas 0,3,6,…,30
    const alturas = [0, 3, 6, 9, 12, 15, 18, 24, 30];
    alturas.forEach((z, i) => {
      expect(Math.abs(coeficienteExposicion(z, 'IV') - perfil[i]), `z = ${z}`).toBeLessThanOrEqual(0.1);
    });
  });
});

describe('la tabla 3.4 es la fórmula del Anejo D.2 redondeada', () => {
  it('las 40 casillas quedan a menos de 0,1 (la mayor desviación es 0,084, en el grado I)', () => {
    let maxima = 0;
    for (const grado of ORDEN_ASPEREZAS) {
      ALTURAS_TABLA_3_4.forEach((z, i) => {
        const d = Math.abs(coeficienteExposicion(z, grado) - TABLA_3_4[grado][i]);
        maxima = Math.max(maxima, d);
        expect(d, `${grado} a ${z} m`).toBeLessThanOrEqual(0.1);
      });
    }
    expect(maxima).toBeGreaterThan(0.05); // si algún día coinciden exactas, algo ha cambiado en la tabla
  });
});

describe('alturas tributarias', () => {
  it('media planta abajo y media arriba; la cubierta sólo la de abajo', () => {
    expect(alturasTributarias([3, 6, 9])).toEqual([3, 3, 1.5]);
    expect(alturasTributarias([4])).toEqual([2]);
    expect(alturasTributarias([3.5, 6.5, 9.5, 12])).toEqual([3.25, 3, 2.75, 1.25]);
    expect(alturasTributarias([])).toEqual([]);
  });
});

describe('calcularViento — composición', () => {
  const r = calcularViento({
    zona: 'B',
    aspereza: 'III',
    altitud: 700,
    plantas: [
      { id: 'c', nombre: 'Cubierta', h: 9.3 },
      { id: 'a', nombre: 'Planta 1', h: 3.1 },
      { id: 'b', nombre: 'Planta 2', h: 6.2 },
    ],
    dimensiones: { x: 20, y: 12 },
  });

  it('ordena las plantas por altura conservando id y nombre', () => {
    expect(r.x.plantas.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(r.x.plantas.map((p) => p.nombre)).toEqual(['Planta 1', 'Planta 2', 'Cubierta']);
    expect(r.H).toBe(9.3);
    const hTrib = r.x.plantas.map((p) => p.hTrib);
    expect(hTrib).toHaveLength(3);
    [3.1, 3.1, 1.55].forEach((h, i) => expect(hTrib[i]).toBeCloseTo(h, 12));
  });

  it('qb y vb de la zona, parámetros del entorno', () => {
    expect(r.qb).toBe(0.45);
    expect(r.vb).toBe(27);
    expect(r.qbOrigen).toBe('zona');
    expect(r.parametros).toEqual({ k: 0.19, L: 0.05, Z: 2.0 });
  });

  it('esbeltez, ancho expuesto y excentricidad por dirección', () => {
    expect(r.x.esbeltez).toBeCloseTo(9.3 / 20, 9);
    expect(r.x.anchoExpuesto).toBe(12);
    expect(r.x.excentricidad).toBeCloseTo(0.6, 9);
    expect(r.y.esbeltez).toBeCloseTo(9.3 / 12, 9);
    expect(r.y.anchoExpuesto).toBe(20);
    expect(r.y.excentricidad).toBeCloseTo(1.0, 9);
  });

  it('ce crece con la altura y cada F sale de sus piezas', () => {
    const ce = r.x.plantas.map((p) => p.ce);
    expect(ce[1]).toBeGreaterThan(ce[0]);
    expect(ce[2]).toBeGreaterThan(ce[1]);
    for (const d of [r.x, r.y]) {
      for (const p of d.plantas) {
        expect(p.qe).toBeCloseTo(r.qb * p.ce, 12);
        expect(p.presion).toBeCloseTo(p.qe * d.cp, 12);
        expect(p.succion).toBeCloseTo(p.qe * d.cs, 12);
        expect(p.F).toBeCloseTo(fuerzaPlanta(p.hTrib, d.anchoExpuesto, d.cp, d.cs, p.qe), 12);
      }
      expect(d.Ftotal).toBeCloseTo(d.plantas.reduce((s, p) => s + p.F, 0), 12);
    }
  });

  it('las mismas plantas en las dos direcciones, con ce idéntico', () => {
    expect(r.y.plantas.map((p) => p.ce)).toEqual(r.x.plantas.map((p) => p.ce));
  });

  it('sin errores ni avisos; las notas normativas van siempre', () => {
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.notas.some((n) => n.includes('3.3.2-2'))).toBe(true);
    expect(r.notas.some((n) => n.includes('3.3.4-2'))).toBe(true);
    expect(r.notas.some((n) => n.includes('0,5 kN/m²'))).toBe(false);
  });
});

describe('calcularViento — límites del DB y entradas inválidas', () => {
  const base = { zona: 'A' as const, aspereza: 'II' as const, plantas: [{ h: 3 }, { h: 6 }], dimensiones: { x: 10, y: 10 } };

  it('altitud > 2.000 m: error del art. 3.3.1-2', () => {
    expect(calcularViento({ ...base, altitud: 2100 }).errores.join()).toMatch(/3\.3\.1-2/);
    expect(calcularViento({ ...base, altitud: 2000 }).errores).toEqual([]);
  });

  it('esbeltez > 6: error del art. 3.3.1-3, en la dirección que toca', () => {
    const r = calcularViento({ ...base, plantas: [{ h: 50 }], dimensiones: { x: 5, y: 20 } });
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toMatch(/según X/);
    expect(r.errores[0]).toMatch(/3\.3\.1-3/);
  });

  it('por encima de 200 m: aviso del Anejo D.2, no error', () => {
    const r = calcularViento({ ...base, plantas: [{ h: 210 }], dimensiones: { x: 60, y: 60 } });
    expect(r.errores).toEqual([]);
    expect(r.avisos.join()).toMatch(/200 m/);
  });

  it('sin plantas, alturas nulas o repetidas', () => {
    expect(calcularViento({ ...base, plantas: [] }).errores.join()).toMatch(/al menos una planta/);
    expect(calcularViento({ ...base, plantas: [{ h: 0 }] }).errores.join()).toMatch(/mayor que cero/);
    expect(calcularViento({ ...base, plantas: [{ h: 3 }, { h: 3 }] }).errores.join()).toMatch(/misma altura/);
    expect(calcularViento({ ...base, dimensiones: { x: 0, y: 10 } }).errores.join()).toMatch(/dimensiones/);
  });

  it('qb tecleado que no es el de ninguna zona: origen manual y sin vb', () => {
    const r = calcularViento({ ...base, qbManual: 0.4225 });
    expect(r.qbOrigen).toBe('manual');
    expect(r.qb).toBe(0.4225);
    expect(r.vb).toBeNull();
    expect(calcularViento({ ...base, qbManual: 0.5 }).notas.join()).toMatch(/3\.3\.2-1/);
  });

  it('qb tecleado nulo o negativo, o una dimensión que no es un número: error (auditoría M3 y B11)', () => {
    expect(calcularViento({ ...base, qbManual: 0 }).errores.join()).toMatch(/presión dinámica tecleada/);
    expect(calcularViento({ ...base, qbManual: -0.3 }).errores.join()).toMatch(/presión dinámica tecleada/);
    expect(calcularViento({ ...base, dimensiones: { x: NaN, y: 10 } }).errores.join()).toMatch(/dimensiones/);
    expect(calcularViento({ ...base, qbManual: 0.4 }).errores).toEqual([]);
  });

  it('las notas recuerdan las condiciones de la tabla 3.5, la banda de la planta baja, la aspereza por dirección y los acantilados', () => {
    const notas = calcularViento(base).notas.join();
    expect(notas).toMatch(/3\.3\.4-1/);
    expect(notas).toMatch(/cimentación/);
    expect(notas).toMatch(/3\.3\.3-3/);
    expect(notas).toMatch(/3\.3\.3-2/);
  });
});

describe('calcularViento — rozamiento (art. 3.3.2-3)', () => {
  const alargado = {
    zona: 'A' as const,
    aspereza: 'IV' as const,
    plantas: [{ h: 3 }, { h: 6 }, { h: 9 }, { h: 12 }],
    dimensiones: { x: 40, y: 8 },
  };

  it('sin superficie no se calcula y las fuerzas son las de la banda', () => {
    const r = calcularViento(alargado);
    expect(r.x.rozamiento).toBeNull();
    for (const p of r.x.plantas) {
      expect(p.Frozamiento).toBe(0);
      expect(p.F).toBe(p.Fbanda);
    }
    expect(r.notas.join()).not.toMatch(/3\.3\.2-3/);
  });

  it('bloque de 40 × 8 según X: pasa del 10 % y se reparte por bandas, con la cubierta llevándose además la suya', () => {
    const r = calcularViento({ ...alargado, superficie: 'rugosa' });
    const roz = r.x.rozamiento!;
    expect(roz.cfr).toBe(0.02);
    // Dos fachadas de 40 m por las bandas (12 − 1,5 = 10,5 m) más la cubierta 40 × 8.
    expect(roz.area).toBeCloseTo(2 * 40 * 10.5 + 40 * 8, 9);
    const esperado = r.x.plantas.reduce((s, p, i) => s + 0.02 * p.qe * (2 * 40 * p.hTrib + (i === 3 ? 320 : 0)), 0);
    expect(roz.F).toBeCloseTo(esperado, 9);
    expect(roz.fraccion).toBeCloseTo(roz.F / r.x.plantas.reduce((s, p) => s + p.Fbanda, 0), 12);
    expect(roz.fraccion).toBeGreaterThan(0.2);
    expect(roz.aplicado).toBe(true);
    for (const p of r.x.plantas) expect(p.F).toBeCloseTo(p.Fbanda + p.Frozamiento, 12);
    expect(r.x.plantas.reduce((s, p) => s + p.Frozamiento, 0)).toBeCloseTo(roz.F, 9);
    expect(r.x.Ftotal).toBeCloseTo(r.x.plantas.reduce((s, p) => s + p.F, 0), 9);
    expect(r.avisos.join()).toMatch(/Según X el rozamiento/);
    expect(r.notas.join()).toMatch(/3\.3\.2-3/);
  });

  it('según Y (fachada de 40 m, fondo 8) no llega al 10 %: se anota y se desprecia', () => {
    const r = calcularViento({ ...alargado, superficie: 'rugosa' });
    const roz = r.y.rozamiento!;
    expect(roz.aplicado).toBe(false);
    expect(roz.fraccion).toBeLessThan(0.1);
    for (const p of r.y.plantas) expect(p.Frozamiento).toBe(0);
    expect(r.avisos.join()).not.toMatch(/Según Y el rozamiento/);
  });

  it('la superficie muy lisa da la mitad y la muy rugosa el doble que la rugosa', () => {
    const rugosa = calcularViento({ ...alargado, superficie: 'rugosa' }).x.rozamiento!.F;
    expect(calcularViento({ ...alargado, superficie: 'lisa' }).x.rozamiento!.F).toBeCloseTo(rugosa / 2, 9);
    expect(calcularViento({ ...alargado, superficie: 'muyRugosa' }).x.rozamiento!.F).toBeCloseTo(rugosa * 2, 9);
  });
});

describe('calcularViento — cubierta a dos aguas', () => {
  const base = { zona: 'A' as const, aspereza: 'IV' as const, plantas: [{ h: 3 }, { h: 6 }, { h: 9 }], dimensiones: { x: 20, y: 12 } };

  it('sin cubierta: null, y la nota de cubierta plana', () => {
    const r = calcularViento(base);
    expect(r.cubierta).toBeNull();
    expect(r.notas.join()).toMatch(/3\.3\.4-2/);
  });

  it('con cubierta: ce a la coronación, cumbrera y ancho según el eje, y las notas de la D.6 en vez de la de cubierta plana', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 11.2, cumbrera: 'x' } });
    const c = r.cubierta!;
    expect(c.cumbrera).toBe('x');
    expect(c.ce).toBeCloseTo(coeficienteExposicion(11.2, 'IV'), 12);
    expect(c.qe).toBeCloseTo(0.42 * c.ce, 12);
    expect(c.perpendicular.b).toBe(20);
    expect(c.perpendicular.d).toBe(12);
    expect(c.paralela.b).toBe(12);
    expect(c.paralela.d).toBe(20);
    expect(r.notas.join()).toMatch(/tabla D\.6/);
    expect(r.notas.join()).not.toMatch(/3\.3\.4-2/);
    expect(r.errores).toEqual([]);
    expect(r.x.plantas).toHaveLength(3);
  });

  it('la cumbrera según Y intercambia los lados', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 15, cumbrera: 'y' } });
    expect(r.cubierta!.perpendicular.b).toBe(12);
    expect(r.cubierta!.perpendicular.d).toBe(20);
  });

  it('la coronación por debajo del último forjado es un error, y los errores de la cubierta bloquean el viento', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 8, cumbrera: 'y' } });
    expect(r.errores.join()).toMatch(/último forjado/);
    const p = calcularViento({ ...base, cubierta: { pendiente: 80, alturaCoronacion: 12, cumbrera: 'y' } });
    expect(p.errores.join()).toMatch(/75º/);
    const casi = calcularViento({ ...base, cubierta: { pendiente: 2, alturaCoronacion: 9, cumbrera: 'x' } });
    expect(casi.errores).toEqual([]);
    expect(casi.avisos.join()).toMatch(/casi plana/);
  });

  it('el área de influencia tecleada llega a las zonas', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 12, cumbrera: 'x', areaInfluencia: 1 } });
    expect(r.cubierta!.areaInfluencia).toBe(1);
    expect(r.cubierta!.perpendicular.zonas.every((z) => z.A === 1)).toBe(true);
  });

  it('la altura del edificio es la coronación: la esbeltez de la 3.5 va con ella y el último forjado se rotula aparte (auditoría B1, M4)', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 11.2, cumbrera: 'x' } });
    expect(r.H).toBe(9);
    expect(r.alturaEdificio).toBe(11.2);
    expect(r.x.esbeltez).toBeCloseTo(11.2 / 20, 12);
    expect(r.y.esbeltez).toBeCloseTo(11.2 / 12, 12);
    expect(calcularViento(base).alturaEdificio).toBe(9);
    // Una coronación por debajo del forjado es un error y no rebaja el edificio.
    expect(calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 8, cumbrera: 'x' } }).alturaEdificio).toBe(9);
  });

  it('viento paralelo a la cumbrera: el hastial se suma a la planta de cubierta con los coeficientes de la 3.5 (auditoría A1)', () => {
    const hc = 9 + 6 * Math.tan(Math.PI / 9);
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: hc, cumbrera: 'x' } });
    const h = r.x.encima!;
    expect(h.tipo).toBe('hastial');
    expect(h.ancho).toBe(12);
    expect(h.altura).toBeCloseTo(hc - 9, 12);
    expect(h.area).toBeCloseTo((12 * (hc - 9)) / 2, 12);
    expect(h.z).toBe(hc);
    expect(h.ce).toBeCloseTo(coeficienteExposicion(hc, 'IV'), 12);
    expect(h.qe).toBeCloseTo(0.42 * h.ce, 12);
    expect(h.coeficiente).toBeCloseTo(r.x.cp - r.x.cs, 12);
    expect(h.F).toBeCloseTo(fuerzaHastial(12, hc - 9, r.x.cp, r.x.cs, h.qe), 12);
    // Edificio de referencia de la auditoría: 13,1 m² y unos 11,5 kN.
    expect(h.area).toBeCloseTo(13.1, 1);
    expect(h.F).toBeCloseTo(11.5, 0);
    const cubierta = r.x.plantas[2];
    expect(cubierta.Fencima).toBeCloseTo(h.F, 12);
    expect(cubierta.F).toBeCloseTo(cubierta.Fbanda + cubierta.Frozamiento + h.F, 12);
    expect(r.x.plantas[0].Fencima).toBe(0);
    expect(r.x.plantas[1].Fencima).toBe(0);
    expect(r.x.Ftotal).toBeCloseTo(r.x.plantas.reduce((s, p) => s + p.F, 0), 12);
    expect(r.notas.join()).toMatch(/hastial/);
  });

  it('viento perpendicular a la cumbrera: la resultante de los faldones (D.6) se suma a la cubierta (auditoría M1)', () => {
    const hc = 9 + 6 * Math.tan(Math.PI / 9);
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: hc, cumbrera: 'x' } });
    const f = r.y.encima!;
    expect(f.tipo).toBe('faldones');
    const res = r.cubierta!.perpendicular.resultante!;
    expect(f.F).toBe(res.haciaSotavento);
    expect(f.Fcontraria).toBe(res.haciaBarlovento);
    expect(f.area).toBeCloseTo(res.area, 12);
    expect(f.area).toBeCloseTo(20 * (hc - 9), 9); // b · (d/2) · tan α
    expect(f.ancho).toBe(20);
    expect(f.coeficiente).toBeCloseTo(f.F / (f.qe * f.area), 12);
    // Edificio de referencia: del orden de la fuerza de la propia planta de cubierta.
    expect(f.F).toBeGreaterThan(20);
    expect(f.F).toBeLessThan(35);
    expect(r.y.plantas[2].Fencima).toBe(f.F);
    expect(r.y.plantas[2].F).toBeCloseTo(r.y.plantas[2].Fbanda + r.y.plantas[2].Frozamiento + f.F, 12);
    expect(r.y.Ftotal).toBeCloseTo(r.y.plantas.reduce((s, p) => s + p.F, 0), 12);
  });

  it('con la cumbrera según Y se intercambian: hastial según Y, faldones según X', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 12, cumbrera: 'y' } });
    expect(r.y.encima?.tipo).toBe('hastial');
    expect(r.y.encima?.ancho).toBe(20);
    expect(r.x.encima?.tipo).toBe('faldones');
  });

  it('con la coronación en el propio forjado no hay nada encima', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 2, alturaCoronacion: 9, cumbrera: 'x' } });
    expect(r.x.encima).toBeNull();
    expect(r.y.encima).toBeNull();
    expect(r.x.plantas[2].F).toBe(r.x.plantas[2].Fbanda + r.x.plantas[2].Frozamiento);
  });
});

describe('calcularViento — paramentos verticales', () => {
  const base = { zona: 'A' as const, aspereza: 'IV' as const, plantas: [{ h: 3 }, { h: 6 }, { h: 9 }], dimensiones: { x: 20, y: 12 } };

  it('sin pedirlos: null', () => {
    expect(calcularViento(base).paramentos).toBeNull();
  });

  it('con cubierta plana: h es el último forjado, ce a esa altura, y d/b según el eje del viento', () => {
    const r = calcularViento({ ...base, paramentos: {} });
    const p = r.paramentos!;
    expect(p.h).toBe(9);
    expect(p.alturaFachada).toBe(9);
    expect(p.ce).toBeCloseTo(coeficienteExposicion(9, 'IV'), 12);
    expect(p.qe).toBeCloseTo(0.42 * p.ce, 12);
    expect(p.x).toMatchObject({ eje: 'x', d: 20, b: 12, e: 12 });
    expect(p.x.esbeltez).toBeCloseTo(0.45, 12);
    expect(p.y).toMatchObject({ eje: 'y', d: 12, b: 20, e: 18 });
    expect(p.x.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(p.y.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'D', 'E']);
    expect(r.notas.join()).toMatch(/tabla D\.3/);
    expect(r.errores).toEqual([]);
    expect(r.cubierta).toBeNull();
  });

  it('con cubierta a dos aguas: h es la coronación y las áreas siguen midiendo hasta el último forjado', () => {
    const r = calcularViento({ ...base, cubierta: { pendiente: 20, alturaCoronacion: 11.2, cumbrera: 'x' }, paramentos: {} });
    const p = r.paramentos!;
    expect(p.h).toBe(11.2);
    expect(p.alturaFachada).toBe(9);
    expect(p.ce).toBeCloseTo(r.cubierta!.ce, 12);
    expect(p.y.e).toBe(20); // min(20, 22,4)
  });

  it('el área de influencia tecleada llega a las zonas', () => {
    const r = calcularViento({ ...base, paramentos: { areaInfluencia: 1 } });
    expect(r.paramentos!.areaInfluencia).toBe(1);
    expect([...r.paramentos!.x.zonas, ...r.paramentos!.y.zonas].every((z) => z.A === 1)).toBe(true);
    expect(r.paramentos!.x.zonas[0].cpe).toBeCloseTo(-1.4, 12);
  });
});

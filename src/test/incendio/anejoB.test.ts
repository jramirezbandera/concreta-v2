/**
 * El tiempo equivalente de exposición al fuego, Anejo B del DB SI.
 *
 * ORÁCULO: la hoja del estudio `incendio ejemplos/Tiempo equivalente exposición
 * fuego.xls`, cuyo caso se reproduce aquí al último decimal. Es golden PARCIAL:
 * la hoja se aparta de la norma en tres cosas y el módulo hace lo que dice el
 * anejo. Las tres están aseveradas abajo COMO DIVERGENCIAS DELIBERADAS, para
 * que nadie las «arregle» dentro de seis meses creyendo que son fallos:
 *
 *   1. la hoja interpola δq1 sólo entre (250; 1,50) y (2500; 1,90);
 *   2. la hoja no aplica el suelo wf ≥ 0,5 de la (B.3);
 *   3. la hoja lleva δn en una casilla suelta, no como producto de las medidas.
 *
 * El caso de la hoja: Af = 663 m², Av = 15 m², Ah = 0, H = 4,5 m, qf,k = 365
 * (pública concurrencia), m = 0,8, δq2 = 1,25, extinción automática, δc = 1,5.
 */

import { describe, expect, it } from 'vitest';
import {
  cargaDeFuego,
  coeficienteAberturas,
  coeficienteMaterial,
  consecuenciasPorAltura,
  dn,
  dq1,
  KB_POR_DEFECTO,
  TABLA_B3,
  TABLA_B4,
  TABLA_B5,
  TABLA_B6,
  temperaturaNormalizada,
  tiempoEquivalente,
  ventilacion,
  type EntradaTiempoEquivalente,
} from '../../lib/incendio/anejoB';

/** El caso de la hoja del estudio, tal cual. */
const HOJA: EntradaTiempoEquivalente = {
  af: 663,
  av: 15,
  ah: 0,
  h: 4.5,
  at: null,
  hHuecos: null,
  kb: KB_POR_DEFECTO,
  material: 'hormigon',
  qfk: 365,
  m: 0.8,
  actividad: 'comercialAparcamientoHospitalarioPublica',
  medidas: { deteccion: false, alarmaBomberos: false, extincion: true },
  consecuencias: 'entre15y28oBajoOtroUso',
  criticidadAlta: false,
};

describe('el caso de la hoja del estudio, número a número', () => {
  const v = ventilacion(HOJA);
  const r = tiempoEquivalente(HOJA);

  it('αv topa con su límite inferior: 15/663 = 0,0226 y la norma no baja de 0,025', () => {
    expect(v.alfaV).toBeCloseTo(0.025, 10);
    expect(v.alfaVAcotada).toBe(true);
    expect(v.avisos.join(' ')).toContain('0,025 y 0,25');
  });

  it('bv = 12,5(1 + 10αv − αv²) = 15,617187', () => {
    expect(v.bv).toBeCloseTo(15.617187, 6);
  });

  it('wf = 2,616098', () => {
    expect(v.wf).toBeCloseTo(2.616098, 6);
    expect(v.formula).toBe('B.3');
  });

  it('δq1 para 663 m² = 1,573422', () => {
    expect(dq1(663)).toBeCloseTo(1.573422, 6);
  });

  it('qf,d = 525,483687 MJ/m²', () => {
    expect(r.carga.qfd).toBeCloseTo(525.483687, 6);
    expect(r.carga.dq2).toBe(1.25);
    expect(r.carga.dn).toBeCloseTo(0.61, 10);
    expect(r.carga.dc).toBe(1.5);
  });

  it('te,d = 96,230172 min, y se declara R 97', () => {
    expect(r.ted).toBeCloseTo(96.230172, 6);
    expect(r.declarado).toBe(97);
  });

  it('y no se redondea a la clase de arriba: ahí está el interés del cálculo', () => {
    // La tabla 3.1 le pediría R 120 a una pública concurrencia de esa altura.
    // Redondear 96,23 a R 120 se comería todo lo que se ha ganado.
    expect(r.declarado).toBeLessThan(120);
  });
});

describe('las tres divergencias con la hoja, deliberadas', () => {
  it('1 · δq1 se interpola sobre la tabla B.2 ENTERA, no sólo entre 250 y 2500', () => {
    // Los puntos tabulados salen exactos.
    expect(dq1(25)).toBeCloseTo(1.1, 10);
    expect(dq1(250)).toBeCloseTo(1.5, 10);
    expect(dq1(2500)).toBeCloseTo(1.9, 10);
    expect(dq1(5000)).toBeCloseTo(2.0, 10);

    // Un sector pequeño: la hoja, extrapolando su recta, daría menos de 1,50 y
    // aquí sale del tramo 25–250.
    expect(dq1(100)).toBeCloseTo(1.1 + ((100 - 25) / (250 - 25)) * 0.4, 10);
    expect(dq1(100)).toBeLessThan(1.5);

    // Y fuera de la tabla se acota, que es lo que dicen sus filas «<20» y
    // «>10 000», no se extrapola.
    expect(dq1(5)).toBe(1.0);
    expect(dq1(20)).toBe(1.0);
    expect(dq1(50000)).toBeCloseTo(2.13, 10);
  });

  it('2 · wf no baja de 0,5, aunque la fórmula dé menos', () => {
    // Hace falta un sector muy ventilado Y muy alto —una nave, un atrio—: el
    // término (6/H)^0,3 es el que hunde la fórmula. A 12 m sale 0,507, que
    // todavía pasa del suelo; a 20 m ya no.
    const suave = ventilacion({ af: 1000, av: 250, ah: 200, h: 12 });
    expect(suave.wf).toBeGreaterThan(0.5);

    const muyVentilado = ventilacion({ af: 1000, av: 250, ah: 200, h: 20 });
    expect(muyVentilado.wf).toBe(0.5);
    expect(muyVentilado.avisos.join(' ')).toContain('no admite menos de 0,5');
  });

  it('3 · δn es el PRODUCTO de las medidas que haya, no una casilla suelta', () => {
    expect(dn({ deteccion: false, alarmaBomberos: false, extincion: false })).toBe(1);
    expect(dn({ deteccion: true, alarmaBomberos: false, extincion: false })).toBeCloseTo(0.87, 10);
    expect(dn({ deteccion: false, alarmaBomberos: false, extincion: true })).toBeCloseTo(0.61, 10);
    // Las tres juntas, que es lo que la hoja no hace.
    expect(dn({ deteccion: true, alarmaBomberos: true, extincion: true })).toBeCloseTo(
      0.87 * 0.87 * 0.61,
      10,
    );
    expect(dn({ deteccion: true, alarmaBomberos: true, extincion: true })).toBeCloseTo(0.461709, 6);
  });

  it('y con las tres medidas el mismo caso de la hoja baja bastante', () => {
    const conTodo = tiempoEquivalente({
      ...HOJA,
      medidas: { deteccion: true, alarmaBomberos: true, extincion: true },
    });
    expect(conTodo.declarado).toBe(73);
  });
});

describe('las tablas, contra el papel', () => {
  it('B.3 · riesgo de iniciación por actividad', () => {
    expect(TABLA_B3).toEqual({
      viviendaAdministrativoResidencialDocente: 1.0,
      comercialAparcamientoHospitalarioPublica: 1.25,
      riesgoBajo: 1.25,
      riesgoMedio: 1.4,
      riesgoAlto: 1.6,
    });
  });

  it('B.4 · las tres medidas activas', () => {
    expect(TABLA_B4).toEqual({ deteccion: 0.87, alarmaBomberos: 0.87, extincion: 0.61 });
  });

  it('B.5 · consecuencias por altura de evacuación', () => {
    expect(TABLA_B5).toEqual({
      bajo15oAparcamiento: 1.0,
      entre15y28oBajoOtroUso: 1.5,
      masDe28: 2.0,
    });
  });

  it('B.6 · densidad de carga de fuego característica', () => {
    expect(TABLA_B6).toEqual({
      comercial: 730,
      residencialVivienda: 650,
      hospitalarioResidencialPublico: 280,
      administrativo: 520,
      docente: 350,
      publicaConcurrencia: 365,
      aparcamiento: 280,
    });
  });

  it('los hospitales llevan el ×1,5 de la B.5 encima de su fila', () => {
    const base = cargaDeFuego({
      qfk: 280,
      m: 0.8,
      af: 500,
      actividad: 'comercialAparcamientoHospitalarioPublica',
      medidas: { deteccion: false, alarmaBomberos: false, extincion: false },
      consecuencias: 'entre15y28oBajoOtroUso',
      criticidadAlta: false,
    });
    const critico = cargaDeFuego({
      qfk: 280,
      m: 0.8,
      af: 500,
      actividad: 'comercialAparcamientoHospitalarioPublica',
      medidas: { deteccion: false, alarmaBomberos: false, extincion: false },
      consecuencias: 'entre15y28oBajoOtroUso',
      criticidadAlta: true,
    });
    expect(critico.dc).toBeCloseTo(base.dc * 1.5, 10);
    expect(critico.qfd).toBeCloseTo(base.qfd * 1.5, 10);
  });
});

describe('el coeficiente de corrección por material (tabla B.1)', () => {
  it('hormigón y acero protegido valen 1', () => {
    expect(coeficienteMaterial('hormigon', null).kc).toBe(1);
    expect(coeficienteMaterial('aceroProtegido', null).kc).toBe(1);
  });

  it('el acero sin proteger vale 13,7·O', () => {
    expect(coeficienteMaterial('aceroSinProteger', 0.05).kc).toBeCloseTo(0.685, 10);
  });

  it('y sin O no se inventa: lo dice y no resuelve', () => {
    const r = coeficienteMaterial('aceroSinProteger', null);
    expect(r.kc).toBeNull();
    expect(r.aviso).toContain('13,7');

    const sinResolver = tiempoEquivalente({ ...HOJA, material: 'aceroSinProteger' });
    expect(sinResolver.ted).toBeNull();
    expect(sinResolver.declarado).toBeNull();
  });

  it('con la envolvente, el acero sin proteger sí cierra', () => {
    const r = tiempoEquivalente({
      ...HOJA,
      material: 'aceroSinProteger',
      at: 1200,
      hHuecos: 2.1,
    });
    expect(r.kc).not.toBeNull();
    expect(r.ted).not.toBeNull();
  });
});

describe('el coeficiente de aberturas O', () => {
  it('O = Av·√h / At cuando cae dentro de los límites', () => {
    const { o, acotado } = coeficienteAberturas(15, 2.1, 800);
    expect(o).toBeCloseTo((15 * Math.sqrt(2.1)) / 800, 10);
    expect(acotado).toBe(false);
  });

  it('y el mismo hueco en una envolvente mayor topa por abajo', () => {
    // 15·√2,1/1200 = 0,0181, por debajo del 0,02 que fija el anejo.
    expect(coeficienteAberturas(15, 2.1, 1200)).toEqual({ o: 0.02, acotado: true });
  });

  it('topa por abajo y por arriba, y lo dice', () => {
    expect(coeficienteAberturas(1, 1, 10000)).toEqual({ o: 0.02, acotado: true });
    expect(coeficienteAberturas(500, 4, 1000)).toEqual({ o: 0.2, acotado: true });
  });

  it('sin envolvente o sin altura de huecos, no hay O', () => {
    expect(coeficienteAberturas(15, 2.1, null).o).toBeNull();
    expect(coeficienteAberturas(15, null, 1200).o).toBeNull();
  });
});

describe('la (B.6) de los sectores pequeños', () => {
  it('se usa por debajo de 100 m² sin huecos en techo, y lo dice', () => {
    const v = ventilacion({ af: 80, av: 8, ah: 0, h: 3, at: 260, hHuecos: 2 });
    expect(v.formula).toBe('B.6');
    const o = v.o as number;
    expect(v.wf).toBeCloseTo((1 / Math.sqrt(o)) * (80 / 260), 10);
    expect(v.avisos.join(' ')).toContain('(B.6)');
  });

  it('pero no con huecos en techo, ni sin envolvente', () => {
    expect(ventilacion({ af: 80, av: 8, ah: 5, h: 3, at: 260, hHuecos: 2 }).formula).toBe('B.3');
    expect(ventilacion({ af: 80, av: 8, ah: 0, h: 3 }).formula).toBe('B.3');
  });

  it('ni por encima de 100 m²', () => {
    expect(ventilacion({ af: 120, av: 8, ah: 0, h: 3, at: 300, hHuecos: 2 }).formula).toBe('B.3');
  });
});

describe('la fila de la tabla B.5 que propone la altura', () => {
  const fila = (d: number | null, a: number | null, plantas = 0) =>
    consecuenciasPorAltura(d, a, plantas).fila;

  it('por debajo de 15 m, y sin sótano ocupado, es 1,0', () => {
    expect(fila(9, 0)).toBe('bajo15oAparcamiento');
  });

  it('entre 15 y 28, 1,5', () => {
    expect(fila(15, 0)).toBe('entre15y28oBajoOtroUso');
    expect(fila(28, 0)).toBe('entre15y28oBajoOtroUso');
  });

  it('por encima de 28, 2,0', () => {
    expect(fila(28.5, 0)).toBe('masDe28');
  });

  it('un sótano ocupado sube de fila', () => {
    expect(fila(9, 2.5, 1)).toBe('entre15y28oBajoOtroUso');
  });

  /**
   * Las dos filas de arriba de la B.5 no miden lo mismo: la de 2,0 dice
   * «ascendente de más de UNA PLANTA» y la de 1,5 «ascendente hasta 2,8 m». Un
   * solo sótano de 3,20 m cae en el hueco entre las dos, y traducir la de 2,0
   * por los metros mandaba el edificio entero a δc = 2,0 por un sótano alto.
   */
  it('pero un solo sótano NO llega a la fila de 2,0, aunque pase de 2,8 m', () => {
    const p = consecuenciasPorAltura(9, 3.2, 1);
    expect(p.fila).toBe('entre15y28oBajoOtroUso');
    expect(p.avisos.join(' ')).toContain('una sola planta');
    expect(p.avisos.join(' ')).toContain('2,8 m');
  });

  it('y dos sótanos ocupados sí: eso es más de una planta', () => {
    const p = consecuenciasPorAltura(9, 5.4, 2);
    expect(p.fila).toBe('masDe28');
    expect(p.avisos).toEqual([]);
  });

  it('sin altura no propone nada', () => {
    expect(fila(null, null)).toBeNull();
  });
});

describe('la curva normalizada (B.1)', () => {
  it('pasa por las temperaturas que el propio anejo tabula', () => {
    // «La curva supone, aproximadamente, las siguientes temperaturas».
    const esperado: [number, number][] = [
      [15, 740],
      [30, 840],
      [60, 950],
      [90, 1000],
      [120, 1050],
    ];
    for (const [t, grados] of esperado) {
      expect(temperaturaNormalizada(t)).toBeGreaterThan(grados - 12);
      expect(temperaturaNormalizada(t)).toBeLessThan(grados + 12);
    }
  });

  it('arranca en 20 ºC', () => {
    expect(temperaturaNormalizada(0)).toBe(20);
  });
});

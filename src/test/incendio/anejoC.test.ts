/**
 * El Anejo C: hasta dónde aguanta una sección de hormigón.
 *
 * Lo que se fija aquí, por orden de lo que más daño haría si se rompiera:
 *
 *  1. Las cinco tablas, celda a celda en los bordes. Se transcribieron leyendo
 *     la página rasterizada del DB SI, porque la C.1 tiene celdas combinadas y
 *     el texto extraído del PDF la devuelve mal alineada. Un test que sólo
 *     mirara «¿cumple?» no vería nunca una fila cambiada de sitio.
 *  2. Que `am` NO es el recubrimiento. Es el error clásico del anejo C, y vale
 *     15 o 20 mm, que es justo el escalón entre dos filas de la tabla.
 *  3. Que las opciones de las tablas C.3 y C.5 son ALTERNATIVAS: una viga ancha
 *     con poco recubrimiento cumple lo mismo que una estrecha con mucho.
 *  4. Que lo que no se puede comprobar se ENUNCIA. La armadura de piel, los
 *     negativos al 33 %, el mínimo de 250 mm del soporte hormigonado en obra:
 *     son condiciones vinculantes que el módulo no puede verificar, y callarlas
 *     sería peor que no comprobar nada.
 */

import { describe, expect, it } from 'vitest';
import {
  CLASES_R,
  claseNecesaria,
  correccionC1,
  distanciaAlEje,
  entradaHormigonInicial,
  resistenciaHormigon,
  TABLA_C2,
  TABLA_C3,
  TABLA_C4,
  TABLA_C5,
  type EntradaHormigon,
} from '../../lib/incendio/anejoC';

const base = (o: Partial<EntradaHormigon> = {}): EntradaHormigon => ({
  ...entradaHormigonInicial(),
  ...o,
});

/** Un soporte 300×300 con recubrimiento 35, cerco ø8 y barra ø20. */
const soporte = (o: Partial<EntradaHormigon> = {}) =>
  base({ tipo: 'soporte', b: 300, h: 300, rnom: 35, dCerco: 8, dBarra: 20, ...o });

/** Una viga 300×500 con recubrimiento 30, cerco ø8 y barra ø20. */
const viga = (o: Partial<EntradaHormigon> = {}) =>
  base({ tipo: 'vigaTresCaras', b: 300, h: 500, rnom: 30, dCerco: 8, dBarra: 20, ...o });

describe('las tablas, en los bordes', () => {
  it('la C.2 distingue soporte, muro por una cara y muro por las dos', () => {
    expect(TABLA_C2[30]).toEqual({
      soporte: { b: 150, am: 15 },
      muroUnaCara: { b: 100, am: 15 },
      muroDosCaras: { b: 120, am: 15 },
    });
    expect(TABLA_C2[240].soporte).toEqual({ b: 400, am: 50 });
    expect(TABLA_C2[120].muroDosCaras).toEqual({ b: 180, am: 35 });
  });

  it('la C.3 tiene cuatro opciones sólo de la R 90 a la R 180', () => {
    expect(TABLA_C3[30].opciones).toHaveLength(3);
    expect(TABLA_C3[90].opciones).toHaveLength(4);
    expect(TABLA_C3[180].opciones).toHaveLength(4);
    // La R 240 vuelve a tres: la tabla escribe «-» en la cuarta.
    expect(TABLA_C3[240].opciones).toHaveLength(3);
    expect(TABLA_C3[240].opciones[2]).toEqual({ b: 700, am: 60 });
    expect(TABLA_C3[120].b0).toBe(120);
  });

  it('en la C.3 las opciones cambian ancho por recubrimiento, y siempre en ese sentido', () => {
    for (const clase of CLASES_R) {
      const o = TABLA_C3[clase].opciones;
      for (let i = 1; i < o.length; i++) {
        expect(o[i].b).toBeGreaterThan(o[i - 1].b);
        expect(o[i].am).toBeLessThan(o[i - 1].am);
      }
    }
  });

  it('la C.4 pide MENOS al eje en dos direcciones que en una', () => {
    expect(TABLA_C4[90]).toEqual({
      h: 100,
      unaDireccion: 25,
      dosDirecciones: 15,
      dosDireccionesAlargada: 25,
    });
    expect(TABLA_C4[240].h).toBe(175);
    expect(TABLA_C4[30].unaDireccion).toBe(10);
  });

  it('la C.5 es la de los reticulares, con su espesor mínimo', () => {
    expect(TABLA_C5[90].opciones[0]).toEqual({ b: 120, am: 40 });
    expect(TABLA_C5[240].opciones[2]).toEqual({ b: 500, am: 70 });
    expect(TABLA_C5[120].h).toBe(120);
  });
});

describe('la distancia al eje', () => {
  it('atraviesa el cerco y medio diámetro de la barra, no es el recubrimiento', () => {
    const d = distanciaAlEje(soporte());
    expect(d.eje).toBe(53); // 35 + 8 + 20/2
    expect(d.cuenta).toContain('35 + ø8 + ø20/2');
    expect(d.aMano).toBe(false);
  });

  it('sin cerco no se escribe el sumando', () => {
    const d = distanciaAlEje(base({ tipo: 'losaUnaDireccion', rnom: 25, dCerco: 0, dBarra: 12 }));
    expect(d.eje).toBe(31);
    expect(d.cuenta).not.toContain('ø0');
  });

  it('y tecleada a mano manda, y se dice', () => {
    const d = distanciaAlEje(soporte({ ejeManual: 40 }));
    expect(d.eje).toBe(40);
    expect(d.aMano).toBe(true);
  });
});

describe('la corrección de la tabla C.1', () => {
  it('no toca a los soportes ni a los muros: su columna vale cero para todo μfi', () => {
    expect(correccionC1(soporte({ mufi: 0.4 }), 120).delta).toBe(0);
    expect(correccionC1(soporte({ mufi: 0.6 }), 120).delta).toBe(0);
    expect(correccionC1(base({ tipo: 'muroDosCaras', mufi: 0.4 }), 120).delta).toBe(0);
  });

  it('en vigas y losas va de +5 a −5, e interpola en medio', () => {
    expect(correccionC1(viga({ mufi: 0.4 }), 120).delta).toBe(5);
    expect(correccionC1(viga({ mufi: 0.5 }), 120).delta).toBe(0);
    expect(correccionC1(viga({ mufi: 0.6 }), 120).delta).toBe(-5);
    expect(correccionC1(viga({ mufi: 0.45 }), 120).delta).toBe(2.5);
    // Por debajo de 0,4 la tabla rotula su fila «≤ 0,4»: acotar ES la regla.
    expect(correccionC1(viga({ mufi: 0.2 }), 120).delta).toBe(5);
  });

  it('sin μfi declarado no se corrige nada', () => {
    expect(correccionC1(viga(), 120).delta).toBe(0);
  });

  it('por encima de 0,60 la tabla no llega, y lo dice', () => {
    const c = correccionC1(viga({ mufi: 0.8 }), 120);
    expect(c.delta).toBe(-5);
    expect(c.avisos.join(' ')).toContain('no pasa de μfi = 0,60');
    expect(c.avisos.join(' ')).toContain('isoterma 500');
  });

  it('sin cargas uniformes no se puede tomar la corrección favorable', () => {
    const c = correccionC1(viga({ mufi: 0.45, cargaUniforme: false }), 120);
    expect(c.delta).toBe(0);
    expect(c.avisos.join(' ')).toContain('cargas sensiblemente uniformes');
  });

  it('y la armadura de esquina en una capa quita 10 mm en vigas estrechas', () => {
    // R 120: la columna 3 de la tabla C.3 es la opción 2, bmín = 250.
    expect(correccionC1(viga({ b: 200, mufi: 0.5, esquinaUnaCapa: true }), 120).delta).toBe(-10);
    // Una viga de 300 ya no es estrecha para esa fila.
    expect(correccionC1(viga({ b: 300, mufi: 0.5, esquinaUnaCapa: true }), 120).delta).toBe(0);
    // Pero sí para la R 180, cuya opción 2 pide 350.
    expect(correccionC1(viga({ b: 300, mufi: 0.5, esquinaUnaCapa: true }), 180).delta).toBe(-10);
  });
});

describe('soportes y muros (tabla C.2)', () => {
  it('un 300×300 con 53 mm al eje llega a R 120 y no a R 180', () => {
    const r = resistenciaHormigon(soporte());
    expect(r.alcanza).toBe(120);
    expect(r.porOpcion).toBe('tabla C.2, 250 / 40');
    expect(r.pruebas.find((p) => p.clase === 180)?.motivo).toContain('pide 350 mm de lado y hay 300');
  });

  it('y el recubrimiento de más de 50 mm pide armadura de piel', () => {
    expect(resistenciaHormigon(soporte()).avisos.join(' ')).toContain('armadura de piel');
    // Con 45 al eje ya no.
    expect(resistenciaHormigon(soporte({ rnom: 27 })).avisos.join(' ')).not.toContain('armadura de piel');
  });

  it('un soporte hormigonado en obra de menos de 250 mm arrastra la llamada (2)', () => {
    const r = resistenciaHormigon(soporte({ b: 200, ejecutadoEnObra: true }));
    expect(r.avisos.join(' ')).toContain('dimensión mínima de 250 mm');
  });

  it('un muro por ambas caras de 200 mm llega a R 120, y se puede declarar REI', () => {
    const r = resistenciaHormigon(
      base({ tipo: 'muroDosCaras', b: 200, rnom: 25, dCerco: 0, dBarra: 20 }),
    );
    expect(r.alcanza).toBe(120); // as = 35 ≥ 35
    expect(r.avisos.join(' ')).toContain('REI 120');
  });

  it('los áridos calizos NO rebajan un soporte: el C.2.1.3 sólo habla de vigas, losas y forjados', () => {
    // 240 mm se queda a diez del lado de 250 que pide la R 90, y con calizos
    // sigue quedándose: la reducción no llega a los elementos a compresión.
    expect(resistenciaHormigon(soporte({ b: 240 })).alcanza).toBe(60);
    expect(resistenciaHormigon(soporte({ b: 240, aridoCalizo: true })).alcanza).toBe(60);
  });
});

describe('vigas (tabla C.3)', () => {
  it('una 300×500 con 48 mm al eje llega a R 120 por la segunda opción', () => {
    const r = resistenciaHormigon(viga());
    expect(r.alcanza).toBe(120);
    // La opción 1 pediría 50 mm al eje y sólo hay 48; la 2 pide 45 y 250 de ancho.
    expect(r.porOpcion).toBe('tabla C.3, opción 2 (250 / 45)');
  });

  it('el alma estrecha la tumba aunque el ancho y el eje sobren', () => {
    const r = resistenciaHormigon(viga({ b0: 90 }));
    expect(r.alcanza).toBe(30); // el alma de la R 60 pide 100
    expect(r.pruebas.find((p) => p.clase === 60)?.motivo).toContain('el alma pide 100 mm');
  });

  it('con μfi bajo la corrección la sube de opción, no de clase', () => {
    const r = resistenciaHormigon(viga({ mufi: 0.4 }));
    expect(r.alcanza).toBe(120);
    expect(r.porOpcion).toBe('tabla C.3, opción 1 (200 / 50)'); // am = 48 + 5 = 53
  });

  it('y con μfi alto baja de opción sin perder la clase', () => {
    const r = resistenciaHormigon(viga({ mufi: 0.6 }));
    expect(r.alcanza).toBe(120);
    expect(r.porOpcion).toBe('tabla C.3, opción 3 (300 / 40)'); // am = 48 − 5 = 43
  });

  it('expuesta por todas sus caras hay que mirar además el área (C.2.3.2)', () => {
    // 300×500: el área llega para la opción 2 de la R 120 (2·250² = 125.000).
    expect(resistenciaHormigon(viga({ tipo: 'vigaTodasCaras' })).alcanza).toBe(120);
    // 300×200: 60.000 mm² no llegan a ninguna opción de la R 120.
    const corta = resistenciaHormigon(viga({ tipo: 'vigaTodasCaras', h: 200 }));
    expect(corta.alcanza).toBe(90);
    expect(corta.pruebas.find((p) => p.clase === 120)?.motivo).toContain('2·bmín²');
  });

  it('cuando no llega, nombra la opción MÁS CERCANA, no la primera de la fila', () => {
    // Una 250×500 con 40 al eje: la primera opción de la R 120 es «200 / 50»,
    // pero a esta viga le sirve la «250 / 45» y sólo le faltan 5 mm. Decirle
    // que necesita 50 sería mandarla a picar 10 mm que no hacen falta.
    const r = resistenciaHormigon(viga({ b: 250, rnom: 22 }));
    const p = r.pruebas.find((x) => x.clase === 120);
    expect(p?.motivo).toBe('pide 45 mm al eje y hay 40 (opción 250 / 45)');
    expect(p?.faltaAm).toBe(5);
    expect(p?.faltaB).toBe(0);
  });

  it('y cuando lo que falta es ancho, lo separa del recubrimiento', () => {
    // Una 150×400: ni el ancho de la opción 1 de la R 120 (200 mm) llega.
    const r = resistenciaHormigon(viga({ b: 150, b0: 150 }));
    const p = r.pruebas.find((x) => x.clase === 120);
    expect(p?.faltaB).toBe(50);
    expect(p?.motivo).toContain('faltan 50 mm de ancho');
  });

  it('R 90 o más arrastra la regla de los negativos al 33 %', () => {
    expect(resistenciaHormigon(viga()).avisos.join(' ')).toContain('33 % de la luz del tramo');
    // Una viga que sólo llega a R 60 no la arrastra.
    expect(resistenciaHormigon(viga({ b: 100, b0: 100 })).avisos.join(' ')).not.toContain('33 %');
  });
});

describe('losas macizas (tabla C.4)', () => {
  const losa = (o: Partial<EntradaHormigon> = {}) =>
    base({ tipo: 'losaUnaDireccion', b: 200, h: 200, rnom: 25, dCerco: 0, dBarra: 12, ...o });

  it('con 31 mm al eje llega a R 90 en una dirección', () => {
    const r = resistenciaHormigon(losa());
    expect(r.alcanza).toBe(90);
    expect(r.porOpcion).toContain('flexión en una dirección');
  });

  it('en dos direcciones cuadradas la misma losa se va hasta la R 180', () => {
    // La columna ly/lx ≤ 1,5 pide 20 mm en la R 120 y 30 en la R 180, contra
    // los 35 y 50 de la de una dirección: dos direcciones se llevan dos clases.
    const r = resistenciaHormigon(losa({ tipo: 'losaDosDirecciones', relacionLuces: 1.2 }));
    expect(r.alcanza).toBe(180);
    expect(r.porOpcion).toContain('ly/lx ≤ 1,5');
  });

  it('y alargada vuelve a la columna de en medio', () => {
    const r = resistenciaHormigon(losa({ tipo: 'losaDosDirecciones', relacionLuces: 1.8 }));
    expect(r.porOpcion).toContain('1,5 < ly/lx ≤ 2');
  });

  it('por encima de ly/lx = 2 se comprueba como si trabajara en una sola', () => {
    const r = resistenciaHormigon(losa({ tipo: 'losaDosDirecciones', relacionLuces: 3 }));
    expect(r.alcanza).toBe(90);
    expect(r.porOpcion).toContain('flexión en una dirección');
  });

  it('los áridos calizos valen justo el escalón que faltaba', () => {
    // 32 mm al eje: la R 120 pide 35, y con calizos 31,5.
    expect(resistenciaHormigon(losa({ rnom: 26 })).alcanza).toBe(90);
    expect(resistenciaHormigon(losa({ rnom: 26, aridoCalizo: true })).alcanza).toBe(120);
  });

  it('si compartimenta, el espesor manda tanto como el recubrimiento', () => {
    const fina = resistenciaHormigon(losa({ h: 90, compartimenta: true }));
    expect(fina.alcanza).toBe(60); // la R 90 pide 100 mm de espesor
    expect(fina.pruebas.find((p) => p.clase === 90)?.motivo).toContain('100 mm de espesor');
    // Sin compartimentar, el espesor no entra: basta el criterio R.
    expect(resistenciaHormigon(losa({ h: 90 })).alcanza).toBe(90);
  });
});

describe('forjados', () => {
  it('el bidireccional va por la C.5, con su ancho de nervio', () => {
    const r = resistenciaHormigon(
      base({ tipo: 'forjadoBidireccional', b: 120, h: 300, rnom: 25, dCerco: 0, dBarra: 12 }),
    );
    expect(r.alcanza).toBe(60); // 120 / 31 pasa el 100/30 de la R 60, no el 120/40 de la R 90
    expect(r.porOpcion).toBe('tabla C.5, opción 1 (100 / 30)');
  });

  it('el unidireccional con entrevigado cerámico va por la C.4 hasta la R 120', () => {
    const r = resistenciaHormigon(
      base({ tipo: 'forjadoUnidireccional', b: 120, h: 300, rnom: 25, dCerco: 0, dBarra: 12 }),
    );
    expect(r.alcanza).toBe(90);
    expect(r.porOpcion).toContain('tabla C.4');
    expect(r.avisos.join(' ')).toContain('bovedillas cerámicas');
  });

  it('y sin entrevigado protegido se comprueba como viga de tres caras', () => {
    const r = resistenciaHormigon(
      base({
        tipo: 'forjadoUnidireccional',
        b: 120,
        h: 300,
        rnom: 25,
        dCerco: 0,
        dBarra: 12,
        entrevigadoProtegido: false,
      }),
    );
    // 120 / 31 pasa el 120/15 de la R 30 pero no el 100/30 con alma de 100 de la R 60.
    expect(r.alcanza).toBe(60);
    expect(r.porOpcion).toContain('tabla C.3');
  });
});

describe('lo que no se puede decir', () => {
  it('sin la dimensión ni el recubrimiento no se inventa una clase', () => {
    const r = resistenciaHormigon(base({ tipo: 'soporte' }));
    expect(r.alcanza).toBeNull();
    expect(r.faltan).toContain('lado menor');
    expect(r.faltan.join(' ')).toContain('recubrimiento');
    expect(r.pruebas).toEqual([]);
  });

  it('una sección que no llega ni a la R 30 lo dice sin más', () => {
    const r = resistenciaHormigon(soporte({ b: 100 }));
    expect(r.alcanza).toBeNull();
    expect(r.faltan).toEqual([]);
    expect(r.pruebas.every((p) => !p.cumple)).toBe(true);
  });

  it('y un elemento traccionado se manda al acero, que es lo que dice el C.2.2.3', () => {
    expect(resistenciaHormigon(soporte({ traccionado: true })).avisos.join(' ')).toContain(
      'acero revestido',
    );
  });
});

describe('la clase con la que se entra en las tablas', () => {
  it('los minutos del Anejo B suben a la clase tabulada de encima', () => {
    expect(claseNecesaria(97)).toBe(120);
    expect(claseNecesaria(120)).toBe(120);
    expect(claseNecesaria(30)).toBe(30);
    expect(claseNecesaria(1)).toBe(30);
  });

  it('y por encima de la R 240 las tablas no llegan', () => {
    expect(claseNecesaria(300)).toBeNull();
  });
});

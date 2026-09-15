/**
 * Los cuadros de varios módulos en un solo DXF, en columnas.
 *
 * Lo que se prueba es lo que un CAD no avisa si está mal: que las columnas no
 * se pisan, que el cuadro de dentro es EL MISMO que sale del módulo —trasladado
 * y nada más, no vuelto a dibujar—, y que la caja declarada en la cabecera del
 * fichero contiene lo dibujado. Un cuadro pisado se ve; una caja mal declarada
 * abre el dibujo en el sitio equivocado y parece que el fichero está vacío.
 */

import { describe, it, expect } from 'vitest';
import type { Block } from '../../lib/memoria/model';
import { planificarConjunto } from '../../lib/dxf/conjunto';
import { planificarDibujo } from '../../lib/dxf/cuadro';
import { escribirDxf } from '../../lib/dxf/escribir';

const H = 0.0025;

const MATERIALES: Block[] = [
  { kind: 'heading', level: 2, text: 'HORMIGÓN' },
  {
    kind: 'table',
    head: ['Localización', 'Tipificación', 'Mín. contenido de cemento'],
    rows: [
      ['Cimentación', 'HA-30/B/20/XC2', '275 kg'],
      ['Forjados', 'HA-30/F/20/XC1', '275 kg'],
    ],
  },
];

const INCENDIO: Block[] = [
  { kind: 'heading', level: 2, text: 'RESISTENCIA AL FUEGO' },
  { kind: 'table', head: ['Ámbito', 'R'], rows: [['Toda la estructura', 'R 90']] },
];

const cuadros = [
  { etiqueta: 'Cuadro de materiales', blocks: MATERIALES },
  { etiqueta: 'Resistencia al fuego', blocks: INCENDIO },
];

/** Caja de una entidad, en el mismo sistema del dibujo (y crece hacia abajo). */
function caja(d: ReturnType<typeof planificarConjunto>) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const e of d.entidades) {
    const xs = e.tipo === 'linea' ? [e.x1, e.x2] : [e.x];
    const ys = e.tipo === 'linea' ? [e.y1, e.y2] : [e.y, e.y + e.altura];
    for (const x of xs) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
    for (const y of ys) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, x1, y0, y1 };
}

describe('planificarConjunto', () => {
  it('con un solo módulo es EXACTAMENTE el dibujo de ese módulo', () => {
    // Un rótulo de columna aquí haría que el mismo cuadro saliera distinto
    // según se pidiera desde la obra o desde su módulo.
    const solo = planificarConjunto([cuadros[0]], { altura: H });
    expect(solo).toEqual(planificarDibujo(MATERIALES, { altura: H }));
  });

  it('sin ningún módulo no lanza: devuelve un dibujo vacío', () => {
    const d = planificarConjunto([], { altura: H });
    expect(d.entidades).toEqual([]);
    // `toBeCloseTo` y no `toBe`: el planificador devuelve -0 para un dibujo sin
    // nada, que en el fichero se escribe «0.000000» igual.
    expect(d.alto).toBeCloseTo(0, 10);
  });

  it('descarta los cuadros sin bloques en vez de dejarles la columna', () => {
    const conVacio = planificarConjunto([cuadros[0], { etiqueta: 'Viento y nieve', blocks: [] }], { altura: H });
    expect(conVacio).toEqual(planificarDibujo(MATERIALES, { altura: H }));
  });

  it('las columnas no se pisan: la segunda arranca pasada la primera', () => {
    const d = planificarConjunto(cuadros, { altura: H });
    const primero = planificarDibujo(MATERIALES, { altura: H });
    const rotulos = d.entidades.filter((e) => e.tipo === 'texto' && e.texto === 'RESISTENCIA AL FUEGO');
    // El rótulo de la columna va en mayúsculas y el del cuadro de dentro
    // también: son dos, y el de la columna es el que arranca la segunda.
    const inicio = Math.min(...rotulos.map((e) => (e.tipo === 'texto' ? e.x : Infinity)));
    expect(inicio).toBeGreaterThan(primero.ancho);
  });

  it('el cuadro de dentro es el del módulo trasladado, no otro dibujo', () => {
    const d = planificarConjunto(cuadros, { altura: H });
    const suelto = planificarDibujo(MATERIALES, { altura: H });
    // Cada columna añade dos entidades suyas: el rótulo y su filete.
    const propias = 2 * cuadros.length;
    expect(d.entidades).toHaveLength(
      suelto.entidades.length + planificarDibujo(INCENDIO, { altura: H }).entidades.length + propias,
    );
    // Y la geometría de dentro conserva medidas: las anchuras de las celdas de
    // la primera columna son las mismas que en su módulo, con dx = 0.
    const verticalesSueltas = suelto.entidades.filter((e) => e.tipo === 'linea' && e.x1 === e.x2).map((e) => (e.tipo === 'linea' ? e.x1 : 0));
    const verticalesDentro = d.entidades
      .filter((e) => e.tipo === 'linea' && e.x1 === e.x2 && e.x1 <= suelto.ancho + 1e-9)
      .map((e) => (e.tipo === 'linea' ? e.x1 : 0));
    expect(verticalesDentro.sort()).toEqual(verticalesSueltas.sort());
  });

  it('las columnas se alinean ARRIBA y todo cuelga del rótulo', () => {
    const d = planificarConjunto(cuadros, { altura: H });
    // Nada por encima del origen: el dibujo crece hacia abajo, como el de un
    // módulo, y así la cabecera del fichero puede declarar la caja igual.
    expect(caja(d).y1).toBeLessThanOrEqual(1e-9);
    // Los dos rótulos de columna a la misma cota.
    const alturaRotulo = Math.max(
      ...d.entidades.filter((e) => e.tipo === 'texto').map((e) => (e.tipo === 'texto' ? e.altura : 0)),
    );
    const deColumna = d.entidades.filter((e) => e.tipo === 'texto' && e.altura === alturaRotulo);
    expect(deColumna).toHaveLength(2);
    expect(new Set(deColumna.map((e) => (e.tipo === 'texto' ? e.y : 0))).size).toBe(1);
  });

  it('el rótulo de la columna pesa más que los del cuadro', () => {
    // Con la misma altura no se veía dónde acababa un módulo y empezaba otro.
    const d = planificarConjunto(cuadros, { altura: H });
    const rotulo = d.entidades.find((e) => e.tipo === 'texto' && e.texto === 'CUADRO DE MATERIALES');
    expect(rotulo?.tipo === 'texto' && rotulo.altura).toBeGreaterThan(H);
    const interno = d.entidades.find((e) => e.tipo === 'texto' && e.texto === 'HORMIGÓN');
    expect(interno?.tipo === 'texto' && interno.altura).toBe(H);
  });

  it('la caja declarada contiene lo dibujado', () => {
    // Es lo que decide con qué vista abre el CAD: una caja corta deja cuadros
    // fuera de pantalla y el fichero parece vacío.
    const d = planificarConjunto(cuadros, { altura: H });
    const c = caja(d);
    expect(c.x0).toBeGreaterThanOrEqual(-1e-9);
    expect(c.x1).toBeLessThanOrEqual(d.ancho + 1e-9);
    expect(-c.y0).toBeLessThanOrEqual(d.alto + 1e-9);
  });

  it('el alto lo manda la columna más alta, no la suma', () => {
    // Es para lo que existe esto: apilados, los cuatro cuadros pasaban del
    // margen de un A1.
    const d = planificarConjunto(cuadros, { altura: H });
    const altos = [MATERIALES, INCENDIO].map((b) => planificarDibujo(b, { altura: H }).alto);
    expect(d.alto).toBeLessThan(altos[0] + altos[1]);
    expect(d.alto).toBeGreaterThan(Math.max(...altos));
  });

  it('todo se escala con la altura del texto', () => {
    const a = planificarConjunto(cuadros, { altura: 0.0025 });
    const b = planificarConjunto(cuadros, { altura: 0.005 });
    expect(b.ancho).toBeCloseTo(a.ancho * 2, 9);
    expect(b.alto).toBeCloseTo(a.alto * 2, 9);
  });

  it('el fichero sale con las tres capas de siempre y pares completos', () => {
    // Una capa nueva por módulo obligaría a darla de alta en cada plantilla.
    const dxf = escribirDxf(planificarConjunto(cuadros, { altura: H }));
    const lineas = dxf.split('\r\n');
    lineas.pop();
    expect(lineas.length % 2).toBe(0);
    for (const capa of ['CUADRO-TITULO', 'CUADRO-TEXTO', 'CUADRO-LINEAS']) {
      expect(dxf).toContain(capa);
    }
    expect(dxf).not.toMatch(/\r\n2\r\nCUADRO-MATERIALES-/);
    expect(dxf.endsWith('0\r\nEOF\r\n')).toBe(true);
  });
});

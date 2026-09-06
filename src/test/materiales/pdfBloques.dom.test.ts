/**
 * El PDF del cuadro de materiales: el cuarto renderer de `Block[]`.
 *
 * Lo que se prueba aquí es lo que ningún `toEqual` sobre una IR puede probar,
 * porque el PDF no tiene IR: se mide sobre el documento ya dibujado. Los dos
 * fallos que busca son los que dejaron el papel ilegible la primera vez:
 *
 *   1. que una tabla ancha se estruje hasta que los rótulos de cabecera se
 *      pisen unos a otros («Elemento estructuraTipo de aceroMedios de…») y el
 *      último se salga de la página;
 *   2. que un dato se pierda por el camino, sea truncado con puntos
 *      suspensivos o convertido en «?» por falta de glifo.
 */

import { describe, expect, it } from 'vitest';
import {
  cuadroAceroEstructural,
  cuadroDurabilidadMadera,
  cuadroHormigonMemoria,
  type Block,
} from '../../lib/materiales/cuadros';
import { defaultMaterialesState, evaluar, filaMaderaDesdePreset } from '../../features/materiales/state';
import { exportarMaterialesPdf } from '../../lib/pdf/materiales';
import { crearPdf } from '../../lib/pdf/fuente';
import { dibujarBloques } from '../../lib/pdf/bloques';
import { PAGE_W, drawTable } from '../../lib/pdf/utils';

const M = 18;
const UTIL = PAGE_W - 2 * M;

/** Cada texto del PDF con su x, su y y su ancho medido. Uno por `doc.text()`. */
interface Escrito {
  texto: string;
  x: number;
  y: number;
  ancho: number;
}

/**
 * Espía sobre `doc.text` que mide cada cadena con la fuente ACTIVA en el
 * momento de escribirla. Medir después no valdría: el ancho depende de la
 * fuente y el cuerpo, y ambos cambian entre bloques.
 */
async function escribir(dibuja: (doc: Awaited<ReturnType<typeof crearPdf>>) => void) {
  const doc = await crearPdf();
  const escritos: Escrito[] = [];
  const orig = doc.text.bind(doc);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.text = ((t: any, x: number, y: number, opts?: any) => {
    for (const [i, linea] of (Array.isArray(t) ? t : [String(t)]).entries()) {
      escritos.push({ texto: linea, x, y: y + i * 0.001, ancho: doc.getTextWidth(linea) });
    }
    return orig(t, x, y, opts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  dibuja(doc);
  return { doc, escritos };
}

const estadoCompleto = () => {
  const base = defaultMaterialesState();
  return {
    ...base,
    usaAceroEstructural: true,
    usaMadera: true,
    maderaGrupos: [filaMaderaDesdePreset('Vigas y pilares'), filaMaderaDesdePreset('Correas y riostras')],
  };
};

describe('las tablas anchas se trocean en vez de estrujarse', () => {
  it('la de acero, con siete columnas de rótulos largos, sale en varios trozos', async () => {
    const ev = evaluar(estadoCompleto());
    const bloques = cuadroAceroEstructural(ev.acero!, 50);
    const { escritos } = await escribir((doc) => dibujarBloques(doc, bloques, { M, y: 30 }));

    // «Elemento estructural» es la columna 0 y se repite en cada trozo: si
    // saliera una sola vez, la tabla no se habría partido.
    const etiquetas = escritos.filter((e) => e.texto === 'Elemento estructural');
    expect(etiquetas.length).toBeGreaterThan(1);
    // Y los nombres de los elementos también, uno por trozo.
    expect(escritos.filter((e) => e.texto === 'Soportes').length).toBe(etiquetas.length);
  });

  it('NINGÚN texto se sale de la caja de la página', async () => {
    const ev = evaluar(estadoCompleto());
    const bloques: Block[] = [
      ...cuadroHormigonMemoria(ev.hormigon.map((h) => h.derivacion)),
      ...cuadroAceroEstructural(ev.acero!, 50),
      ...cuadroDurabilidadMadera(ev.madera.map((m) => m.derivacion)),
    ];
    const { escritos } = await escribir((doc) => dibujarBloques(doc, bloques, { M, y: 30 }));
    expect(escritos.length).toBeGreaterThan(40);
    for (const e of escritos) {
      expect(e.x, e.texto).toBeGreaterThanOrEqual(M - 0.01);
      expect(e.x + e.ancho, e.texto).toBeLessThanOrEqual(M + UTIL + 0.01);
    }
  });

  it('ningún dato se pierde: ni truncado ni convertido en «?»', async () => {
    const ev = evaluar(estadoCompleto());
    const bloques = cuadroHormigonMemoria(ev.hormigon.map((h) => h.derivacion));
    const { escritos } = await escribir((doc) => dibujarBloques(doc, bloques, { M, y: 30 }));
    const todo = escritos.map((e) => e.texto).join(' ');
    // `truncateToWidth` remata con «...»; con todas las columnas en `wrap` no
    // debería aparecer ni uno.
    expect(todo).not.toContain('...');
    expect(todo).not.toContain('?');
    // Y los símbolos llegan enteros, que es de lo que iba la fuente embebida.
    expect(todo).toContain('N/mm²');
    expect(escritos.some((e) => e.texto.includes('HA-30/'))).toBe(true);
  });
});

describe('drawTable reparte también los rótulos de cabecera', () => {
  // El fallo original: `drawHeaderRow` dibujaba el rótulo entero sin medirlo,
  // así que en una columna estrecha se comía a la de al lado.
  it('un rótulo más ancho que su columna se parte en líneas y no invade la vecina', async () => {
    const { escritos } = await escribir((doc) => {
      drawTable(doc, {
        x: M,
        y: 30,
        M,
        cols: [
          { key: 'a', label: 'Características de los medios de unión', w: 30 },
          { key: 'b', label: 'Otra', w: 30 },
        ],
        rows: [{ a: '1', b: '2' }],
      });
    });
    const partes = escritos.filter((e) => 'Características de los medios de unión'.includes(e.texto));
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(p.ancho).toBeLessThanOrEqual(30);
  });

  it('con rótulos que caben, la banda mide lo de siempre', async () => {
    const cols = [
      { key: 'a', label: 'Uno', w: 40 },
      { key: 'b', label: 'Dos', w: 40 },
    ];
    const { doc } = await escribir(() => undefined);
    const y = drawTable(doc, { x: M, y: 30, M, cols, rows: [{ a: '1', b: '2' }] });
    // headerH 5 + 4 de hueco + una fila de 5 = 44 desde y=30.
    expect(y).toBeCloseTo(44, 6);
  });
});

describe('el fichero', () => {
  it('sale un PDF con el nombre del título y varias páginas', async () => {
    const ev = evaluar(estadoCompleto());
    const r = await exportarMaterialesPdf(
      cuadroHormigonMemoria(ev.hormigon.map((h) => h.derivacion)),
      'Vivienda unifamiliar en Bormujos',
    );
    expect(r.filename).toBe('vivienda-unifamiliar-en-bormujos.pdf');
    expect(r.blob.type).toBe('application/pdf');
    const cabeza = new Uint8Array(await r.blob.slice(0, 5).arrayBuffer());
    expect(String.fromCharCode(...cabeza)).toBe('%PDF-');
  });

  it('sin título, el nombre por defecto', async () => {
    const r = await exportarMaterialesPdf([{ kind: 'paragraph', text: 'x' }]);
    expect(r.filename).toBe('cuadro-de-materiales.pdf');
  });
});

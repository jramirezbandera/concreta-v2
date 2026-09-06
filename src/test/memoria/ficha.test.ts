/**
 * Los bloques de la ficha, cotejados con la estructura de la ficha colegial:
 * el orden de los apartados, la supresión de lo que no procede, la tabla
 * sísmica de dieciséis filas, la numeración consecutiva de los forjados, y lo
 * que ningún renderer podría pintar (encabezados de nivel 4, tablas de nueve
 * columnas, saltos de línea dentro de una celda).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultSeismicState } from '../../features/seismic-ncse02/state';
import { SIN_SOBRES, ensamblar } from '../../lib/memoria/ensamblar';
import { apartados, bloquesFicha } from '../../lib/memoria/ficha';
import type { Block } from '../../lib/memoria/model';
import { NCSE, TITULO } from '../../lib/memoria/plantilla';
import { MAX_COLUMNAS } from '../../lib/docx/plan';
import { completar, fichaGranada, fichaGranadaConFabrica, sobresGranada, tomarTodo } from './fixtures';

const headings = (bs: Block[], level?: 1 | 2 | 3) => bs.filter((b): b is Extract<Block, { kind: 'heading' }> => b.kind === 'heading' && (level === undefined || b.level === level)).map((b) => b.text);
const kvs = (bs: Block[]) => bs.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable');
const texto = (bs: Block[]) =>
  bs
    .map((b) => (b.kind === 'heading' || b.kind === 'paragraph' ? b.text : b.kind === 'notes' ? b.items.join(' ') : b.kind === 'kvTable' ? b.rows.flat().join(' ') : [...b.head, ...b.rows.flat()].join(' ')))
    .join('\n');

/** Todo procede: acero y madera en materiales, y la fábrica marcada a mano. */
const fichaCompleta = () => {
  const sobres = sobresGranada();
  return { sobres, datos: ensamblar(completar(fichaGranadaConFabrica(), sobres), sobres) };
};

describe('orden y supresión de apartados', () => {
  it('con todo procediendo: 3.1 y los nueve apartados en el orden de la JS-662', () => {
    const { datos } = fichaCompleta();
    const bs = bloquesFicha(datos);
    expect(headings(bs, 1)).toEqual([TITULO]);
    expect(headings(bs, 2).map((h) => h.slice(0, 5))).toEqual(['3.1.1', '3.1.2', '3.1.3', '3.1.4', '3.1.5', '3.1.6', '3.1.7', '3.1.8', '3.1.9']);
  });

  it('sin acero ni madera ni fábrica: 3.1.7, 3.1.8 y 3.1.9 desaparecen del cuerpo y el índice dice «No procede»', () => {
    const sobres = sobresGranada({ acero: false, madera: false });
    const datos = ensamblar(completar(fichaGranada(), sobres), sobres);
    const bs = bloquesFicha(datos);
    expect(headings(bs, 2).map((h) => h.slice(0, 5))).toEqual(['3.1.1', '3.1.2', '3.1.3', '3.1.4', '3.1.5', '3.1.6']);
    expect(headings(bs).some((h) => h.startsWith('3.1.7') || h.startsWith('3.1.8') || h.startsWith('3.1.9'))).toBe(false);
    const indice = bs.find((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')!;
    const fila = (doc: string) => indice.rows.find((r) => r[0] === doc)!;
    expect(fila('DB-SE-A')[3]).toBe('No procede');
    expect(fila('DB-SE-F')[3]).toBe('No procede');
    expect(fila('DB-SE-M')[3]).toBe('No procede');
    expect(fila('DB-SE-C')[3]).toBe('Procede');
  });

  it('con fábrica marcada a mano aparece el 3.1.8 redactado, entre el 3.1.7 y el 3.1.9', () => {
    const { datos } = fichaCompleta();
    const bs = bloquesFicha(datos);
    const h2 = headings(bs, 2);
    expect(h2[7]).toMatch(/^3\.1\.8\. Estructuras de fábrica/);
    expect(headings(bs, 3).filter((h) => h.startsWith('3.1.8.'))).toHaveLength(6);
  });

  it('cada apartado sabe si procede, y el que no procede no tiene bloques', () => {
    const sobres = sobresGranada({ acero: false, madera: false });
    const ap = apartados(ensamblar(tomarTodo(fichaGranada(), sobres), sobres));
    expect(ap.map((a) => [a.numero, a.procede])).toEqual([
      ['', true],
      ['3.1.1', true],
      ['3.1.2', true],
      ['3.1.3', true],
      ['3.1.4', true],
      ['3.1.5', true],
      ['3.1.6', true],
      ['3.1.7', false],
      ['3.1.8', false],
      ['3.1.9', false],
    ]);
    expect(ap.find((a) => a.id === 'sea')!.bloques).toEqual([]);
  });
});

describe('la tabla sísmica', () => {
  type Fixture = { corta: { bloques: ({ tipo: 'p' } | { tipo: 'tabla'; filas: string[][] })[] } };
  const fixture: Fixture = JSON.parse(readFileSync(join('src', 'test', 'fixtures', 'dbse-plantilla.json'), 'utf8'));

  it('obligatoria y calculada: las dieciséis filas de la ficha del estudio, en su orden', () => {
    const { datos } = fichaCompleta();
    const ap = apartados(datos).find((a) => a.id === 'ncse')!;
    const rotulos = kvs(ap.bloques)[0].rows.map((r) => r[0]);
    const corta = fixture.corta.bloques.find((b): b is { tipo: 'tabla'; filas: string[][] } => b.tipo === 'tabla' && b.filas.length > 20)!;
    const esperados = corta.filas
      .map((f) => f[0].replace(/\s+/g, ' ').replace('∆', 'Δ').trim())
      .filter(Boolean)
      .filter((r) => r !== NCSE.rotulos.observaciones);
    expect(rotulos).toEqual(esperados);
    expect(rotulos).toHaveLength(16);
  });

  it('exenta: cuatro filas, con el motivo del módulo en «Observaciones»', () => {
    const sobres = sobresGranada({ sismo: { ...defaultSeismicState(), ab: 0.02 } });
    const datos = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    const ap = apartados(datos).find((a) => a.id === 'ncse')!;
    const filas = kvs(ap.bloques)[0].rows;
    expect(filas.map((r) => r[0])).toEqual([NCSE.rotulos.clasificacion, NCSE.rotulos.tipoEstructura, NCSE.rotulos.ab, NCSE.rotulos.observaciones]);
    expect(filas[3][1]).toMatch(/0,04.*Por tanto, no se han considerado acciones sísmicas\.$/);
  });
});

describe('forjados', () => {
  it('se numeran consecutivos 3.1.6.1…n según las tipologías que haya', () => {
    const { datos } = fichaCompleta();
    const ap = apartados(datos).find((a) => a.id === 'forjados')!;
    const h3 = headings(ap.bloques, 3);
    expect(h3.length).toBe(datos.forjados.valor!.length);
    h3.forEach((h, i) => expect(h.startsWith(`3.1.6.${i + 1}. `), h).toBe(true));
    expect(h3[0]).toMatch(/reticulares \(h = 30 cm\)$/);
  });
});

describe('lo que los renderers no pueden pintar', () => {
  const casos = () => {
    const { datos } = fichaCompleta();
    const sinSobres = ensamblar(fichaGranada(), SIN_SOBRES);
    return [bloquesFicha(datos), bloquesFicha(sinSobres)];
  };

  it('ningún encabezado pasa de nivel 3, ninguna tabla de 8 columnas, ninguna celda lleva saltos de línea', () => {
    for (const bs of casos()) {
      for (const b of bs) {
        if (b.kind === 'heading') expect(b.level).toBeLessThanOrEqual(3);
        if (b.kind === 'table') {
          expect(b.head.length).toBeLessThanOrEqual(MAX_COLUMNAS);
          for (const r of b.rows) expect(r.length).toBe(b.head.length);
        }
        const celdas = b.kind === 'table' ? [...b.head, ...b.rows.flat()] : b.kind === 'kvTable' ? b.rows.flat() : b.kind === 'notes' ? b.items : [b.text];
        for (const c of celdas) {
          expect(c, `salto de línea en «${c.slice(0, 40)}»`).not.toContain('\n');
          expect(c.trim()).toBe(c);
        }
      }
    }
  });

  it('sin resolver, la ficha se compone igual: los huecos imprimen «—» y nada revienta', () => {
    const bs = bloquesFicha(ensamblar(fichaGranada(), SIN_SOBRES));
    expect(headings(bs, 2).length).toBe(6);
    expect(texto(bs)).toContain('—');
  });
});

describe('lo que dice la ficha completa', () => {
  const { datos, sobres } = fichaCompleta();
  const t = texto(bloquesFicha(datos));

  it('el viento y la nieve, con el lugar y los números publicados', () => {
    const v = sobres.vientoNieve!.datos;
    expect(t).toContain(`${v.municipio} está en zona ${v.viento!.zonaEolica}, con lo que v=${v.viento!.vb} m/s`);
    expect(t).toContain(`qb = ${v.viento!.qb.toFixed(2).replace('.', ',')} kN/m²`);
    expect(t).toContain('zona de clima invernal');
  });

  it('las fórmulas van con su símbolo y los textos tecleados llegan al documento', () => {
    expect(t).toContain('Ed,dst ≤ Ed,stb');
    expect(t).toContain('Ed ≤ Rd');
    expect(t).toContain('Eser ≤ Clim');
    expect(t).toContain('dato de la obra (empresa)');
    expect(t).toContain('dato de la obra (descripcionSistema)');
  });

  it('el acero y la madera del cuadro de materiales, con sus cuadros reutilizados', () => {
    expect(t).toContain('S275JR');
    expect(t).toContain('Clase de Ejecución');
    expect(t).toContain('Vigas y pilares');
    expect(t).toContain('Clase de servicio');
  });

  it('ni un valor de la obra de ejemplo de la plantilla', () => {
    for (const p of ['Madrid', 'Sevilla', 'Elabora', 'Entrenúcleos']) expect(t).not.toContain(p);
  });
});

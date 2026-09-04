/**
 * Las dos exportaciones del módulo, en tres capas:
 *
 *   1. el reparto en pestañas del Excel (`seccionesPlanoXlsx`), puro;
 *   2. los planes de Word y de hoja sobre los cuadros REALES del módulo: que
 *      la tabla de ocho columnas de cada dirección no se trocea, que los anchos
 *      de la hoja no se disparan y que el μ y el ² llegan enteros;
 *   3. el .docx y el .xlsx de verdad, empaquetados, por si la librería
 *      cambiara lo que el plan promete.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { defaultVientoNieveState, evaluar, nuevoFaldon, type VientoNieveState } from '../../features/viento-nieve/state';
import {
  CAPTION_FUERZAS,
  cuadroAccionesPlano,
  cuadroNieveMemoria,
  cuadroVientoMemoria,
  seccionesPlanoXlsx,
  TITULO_FUERZAS_XLSX,
  type EmplazamientoCuadro,
} from '../../lib/acciones/cuadros';
import { MAX_COLUMNAS, planificarDocx, type BloquePlan } from '../../lib/docx/plan';
import { documentoDeBloques } from '../../lib/docx/render';
import { exportarVientoNieveDocx } from '../../lib/docx/vientoNieve';
import type { Block } from '../../lib/materiales/cuadros';
import { planificarHoja } from '../../lib/xlsx/hoja';
import { exportarVientoNieveXlsx } from '../../lib/xlsx/vientoNieve';

/** Ávila a 1.130 m, con limahoya, acumulación y voladizo: el caso que lo pinta todo. */
function avila(): VientoNieveState {
  const s = defaultVientoNieveState();
  s.emplazamiento = { ...s.emplazamiento, provincia: '05', municipio: 'Ávila', altitud: 1130 };
  s.nieve.faldones = [
    { ...nuevoFaldon('Faldón norte', 25), limahoya: 'contrario', inclinacionOtro: 25, L: 6 },
    { ...nuevoFaldon('Faldón sur', 45), L: 8, voladizo: true },
  ];
  return s;
}

function cuadros(state = avila()) {
  const ev = evaluar(state);
  const e: EmplazamientoCuadro = {
    provincia: ev.zonas.provincia!.nombre,
    municipio: state.emplazamiento.municipio,
    altitud: state.emplazamiento.altitud,
    zonaEolica: ev.zonas.zonaEolica,
    zonaInvernal: ev.zonas.zonaInvernal,
  };
  return {
    ev,
    memoria: [
      ...(ev.viento ? cuadroVientoMemoria(ev.viento, e) : []),
      ...(ev.nieve ? cuadroNieveMemoria(ev.nieve, e) : []),
    ],
    plano: cuadroAccionesPlano(ev.viento, ev.nieve, e),
  };
}

const textos = (blocks: Block[]) => blocks.map((b) => ('text' in b ? b.text : b.kind));

describe('pestañas del Excel del plano', () => {
  it('viento, fuerzas por planta y nieve, cada uno en la suya, sin perder ni repetir bloques', () => {
    const { plano } = cuadros();
    const secciones = seccionesPlanoXlsx(plano);
    expect(secciones.map((s) => s.nombre)).toEqual(['Viento', 'Fuerzas por planta', 'Nieve']);

    const viento = textos(secciones[0].blocks);
    expect(viento[0]).toBe('VIENTO (SEGÚN DB SE-AE)');
    expect(viento).not.toContain('NIEVE (SEGÚN DB SE-AE)');
    expect(secciones[0].blocks.some((b) => b.kind === 'table')).toBe(false);

    // La tabla de fuerzas viaja con el mismo contenido pero sin `caption`: en
    // su pestaña el rótulo de la hoja ya dice lo que es.
    const fuerzas = secciones[1].blocks;
    const enPantalla = plano.find((b) => b.kind === 'table' && b.caption === CAPTION_FUERZAS)!;
    expect(fuerzas[0]).toEqual({ kind: 'heading', level: 2, text: TITULO_FUERZAS_XLSX });
    expect(fuerzas[1]).toEqual({ kind: 'table', head: (enPantalla as { head: string[] }).head, rows: (enPantalla as { rows: string[][] }).rows });

    expect(textos(secciones[2].blocks)[0]).toBe('NIEVE (SEGÚN DB SE-AE)');

    // Todo bloque de pantalla está en una pestaña y sólo en una (la tabla de
    // fuerzas, por su copia sin caption).
    const repartidos = secciones.flatMap((s) => s.blocks).filter((b) => plano.includes(b));
    expect(repartidos).toHaveLength(plano.length - 1);
    expect(new Set(repartidos).size).toBe(plano.length - 1);
    expect(repartidos).not.toContain(enPantalla);
  });

  it('sin nieve no hay pestaña de nieve; sin viento, ni viento ni fuerzas', () => {
    const s = avila();
    s.nieve.activo = false;
    expect(seccionesPlanoXlsx(cuadros(s).plano).map((x) => x.nombre)).toEqual(['Viento', 'Fuerzas por planta']);
    const t = avila();
    t.viento.activo = false;
    expect(seccionesPlanoXlsx(cuadros(t).plano).map((x) => x.nombre)).toEqual(['Nieve']);
  });
});

describe('plan de Word de la memoria', () => {
  const plan = planificarDocx(cuadros().memoria, 'Edificio en Ávila');
  const tablas = plan.bloques.filter((b): b is Extract<BloquePlan, { tipo: 'tabla' }> => b.tipo === 'tabla');

  it('abre con el título como Heading1 y los cuadros como Heading2', () => {
    expect(plan.bloques[0]).toEqual({ tipo: 'parrafo', estilo: 'Heading1', texto: 'Edificio en Ávila' });
    const h2 = plan.bloques.filter((b) => b.tipo === 'parrafo' && b.estilo === 'Heading2').map((b) => (b as { texto: string }).texto);
    expect(h2).toEqual(['ACCIÓN DEL VIENTO (DB SE-AE, art. 3.3 y Anejo D)', 'CARGA DE NIEVE (DB SE-AE, art. 3.5 y Anejo E)']);
  });

  it('las tablas de ocho columnas de cada dirección caben enteras: ninguna se trocea', () => {
    // Dos kvTable (viento y nieve) + dos direcciones + faldones = 5 tablas.
    expect(tablas).toHaveLength(5);
    for (const t of tablas) {
      expect(t.filas[0].celdas.length).toBeLessThanOrEqual(MAX_COLUMNAS);
      expect(t.anchos.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    }
    const direccionX = tablas[1];
    expect(direccionX.filas[0].cabecera).toBe(true);
    expect(direccionX.filas[0].celdas.map((c) => c.texto)).toEqual([
      'Planta', 'z (m)', 'h trib. (m)', 'ce', 'qb·ce (kN/m²)', 'Presión (kN/m²)', 'Succión (kN/m²)', 'F (kN)',
    ]);
    expect(direccionX.filas[direccionX.filas.length - 1].celdas[0].texto).toBe('Total');
  });

  it('las notas normativas van como párrafos Caption, con su artículo', () => {
    const captions = plan.bloques.filter((b) => b.tipo === 'parrafo' && b.estilo === 'Caption').map((b) => (b as { texto: string }).texto);
    expect(captions.some((c) => c.includes('3.3.2-2'))).toBe(true);
    expect(captions.some((c) => c.includes('3.5.1-4'))).toBe(true);
  });
});

describe('plan de hoja del plano', () => {
  it('ninguna pestaña se dispara de ancho y todas abren con su banda de título', () => {
    for (const s of seccionesPlanoXlsx(cuadros().plano)) {
      const hoja = planificarHoja(s.blocks, s.nombre);
      expect(hoja.nombre).toBe(s.nombre);
      expect(hoja.filas[0].celdas[0].estilo).toBe('titulo');
      for (const a of hoja.anchos) expect(a).toBeLessThanOrEqual(34);
      expect(hoja.anchos.reduce((a, b) => a + b, 0)).toBeLessThan(120);
    }
  });

  it('las etiquetas del bloque de nieve caben en su columna: el tope de ancho las cortaría sin avisar', () => {
    // Abriendo el fichero en Excel, «Carga de nieve — Faldón norte (25º, μ = 1,00)»
    // salía cortada en «μ = 1»: la columna de etiquetas tiene un tope de 34 y no
    // envuelve. De ahí la regla: etiquetas de ≤ 33 caracteres, parámetros en el valor.
    const [, , nieve] = seccionesPlanoXlsx(cuadros().plano);
    const kv = nieve.blocks.find((b) => b.kind === 'kvTable') as { rows: [string, string][] };
    for (const [etiqueta] of kv.rows) expect(etiqueta.length, etiqueta).toBeLessThanOrEqual(33);
    expect(kv.rows.map(([k]) => k)).toEqual([
      'Zona de clima invernal',
      'Altitud',
      'Nieve sobre terreno horizontal',
      'Carga de nieve — Faldón norte',
      'Faldón norte — limahoya (2 m)',
      'Carga de nieve — Faldón sur',
      'Faldón sur — acumulación (2 m)',
      'Faldón sur — hielo en voladizos',
    ]);
  });

  it('la pestaña de fuerzas tiene cuatro columnas y su total', () => {
    const [, fuerzas] = seccionesPlanoXlsx(cuadros().plano);
    const hoja = planificarHoja(fuerzas.blocks, fuerzas.nombre);
    expect(hoja.anchos).toHaveLength(4);
    const ultima = hoja.filas[hoja.filas.length - 1];
    expect(ultima.celdas[0].texto).toBe('Total');
  });
});

describe('ficheros de verdad', () => {
  it('el .docx se empaqueta y dentro dice viento, nieve, μ y kN/m²', async () => {
    const b64 = await Packer.toBase64String(documentoDeBloques(cuadros().memoria, { titulo: 'Ávila' }));
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('ACCIÓN DEL VIENTO');
    expect(xml).toContain('CARGA DE NIEVE');
    expect(xml).toContain('μ');
    expect(xml).toContain('kN/m²');
    expect(xml).toContain('Faldón norte');
  });

  it('las entradas perezosas devuelven blob y nombre de fichero con la extensión que toca', async () => {
    const { memoria, plano } = cuadros();
    const docx = await exportarVientoNieveDocx(memoria, 'Edificio en Ávila');
    expect(docx.filename).toBe('edificio-en-avila.docx');
    expect(docx.blob.size).toBeGreaterThan(1000);
    const xlsx = await exportarVientoNieveXlsx(seccionesPlanoXlsx(plano));
    expect(xlsx.filename).toBe('viento-y-nieve.xlsx');
    expect(xlsx.blob.size).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(await xlsx.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((f) => f.startsWith('xl/worksheets/sheet'))).toHaveLength(3);
  });
});

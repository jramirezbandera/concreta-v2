/**
 * Los cuadros de cargas por planta: la tabla de memoria como la escriben las
 * memorias del estudio, el cuadro del plano como el png del estudio, el
 * predimensionado del Excel, el reparto en pestañas, y que ninguna etiqueta
 * del plano se salga del ancho de columna del Excel.
 */

import { describe, expect, it } from 'vitest';
import { calcularCargas, type CargasInput } from '../../lib/acciones/cargas';
import {
  cuadroAccionesPlanoCargas,
  cuadroCargasMemoria,
  cuadroPredimensionado,
  etiquetaPesoPropioPlano,
  nombreLineal,
  nombrePesoPropio,
  seccionesCargasXlsx,
  TITULO_CARGAS_MEMORIA,
  TITULO_GRAVITATORIAS_PLANO,
  TITULO_HORIZONTALES_PLANO,
  TITULO_LINEALES_PLANO,
  TITULO_MUROS,
  TITULO_PREDIMENSIONADO,
} from '../../lib/acciones/cuadrosCargas';
import { MAX_COLUMNAS, planificarDocx, type BloquePlan } from '../../lib/docx/plan';
import type { Block } from '../../lib/materiales/cuadros';
import { planificarHoja } from '../../lib/xlsx/hoja';

function obra(): CargasInput {
  return {
    altitud: 660,
    plantas: [
      {
        nombre: 'Planta Primera',
        esCubierta: false,
        zonas: [{ forjado: { tipo: 'reticular', canto: 30, ppManual: 5 }, permanentes: [{ concepto: 'Acabado de suelo', valor: 1 }, { concepto: 'Tabiquerías', valor: 1 }], uso: { categoria: 'A1' } }],
      },
      {
        nombre: 'Planta Cubierta',
        esCubierta: true,
        nieve: 0.56,
        zonas: [{ forjado: { tipo: 'reticular', canto: 30, ppManual: 5 }, permanentes: [{ concepto: 'Acabados de cubierta', valor: 2.5 }], uso: { categoria: 'G' } }],
      },
    ],
    lineales: [
      { concepto: 'Cerramientos de fachada', valor: 7 },
      { concepto: 'Barandillas', valor: 1 },
    ],
  };
}

const tablas = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table');
const titulos = (blocks: Block[]) => blocks.filter((b) => b.kind === 'heading').map((b) => (b as { text: string }).text);

describe('memoria', () => {
  const r = calcularCargas(obra());
  const memoria = cuadroCargasMemoria(r);

  it('abre con el rótulo del capítulo y una tabla por planta, como las memorias del estudio', () => {
    expect(memoria[0]).toEqual({ kind: 'heading', level: 2, text: TITULO_CARGAS_MEMORIA });
    const [primera, cubierta] = tablas(memoria);
    expect(primera.head).toEqual(['Planta Primera', 'Carga (kN/m²)']);
    expect(primera.rows).toEqual([
      ['Peso propio forjado reticular h = 30 cm', '5,00'],
      ['Resto de carga permanente', '2,00'],
      ['Sobrecarga de uso (A1 — viviendas, tabla 3.1)', '2,00'],
      ['TOTAL', '9,00'],
    ]);
    expect(cubierta.head[0]).toBe('Planta Cubierta');
    expect(cubierta.rows).toEqual([
      ['Peso propio forjado reticular h = 30 cm', '5,00'],
      ['Resto de carga permanente', '2,50'],
      ['Sobrecarga de uso (G1 — cubierta no transitable, tabla 3.1)', '1,00'],
      ['Nieve', '0,56'],
      ['TOTAL', '8,50'], // 7,5 + la mayor de uso (1) y nieve (0,56): no concomitantes
    ]);
  });

  it('cargas lineales, γ de la tabla 4.1 y ψ de la 4.2 sólo con las filas presentes, y las notas', () => {
    expect(titulos(memoria)).toEqual([
      TITULO_CARGAS_MEMORIA,
      'Cargas lineales',
      'Coeficientes parciales de seguridad (DB SE, tabla 4.1)',
      'Coeficientes de simultaneidad (DB SE, tabla 4.2)',
    ]);
    const [, , lineales, psi] = tablas(memoria);
    expect(lineales.head).toEqual(['Elemento', 'Carga (kN/m)']);
    expect(lineales.rows).toEqual([
      ['Cerramientos de fachada', '7,00'],
      ['Barandillas', '1,00'],
    ]);
    const gamma = memoria.find((b) => b.kind === 'kvTable') as Extract<Block, { kind: 'kvTable' }>;
    expect(gamma.rows).toEqual([
      ['Acciones permanentes (G)', 'γG = 1,35'],
      ['Acciones variables (Q)', 'γQ = 1,50'],
      ['Acciones accidentales (A)', 'γA = 1,00'],
    ]);
    expect(psi.head).toEqual(['Acción', 'ψ0', 'ψ1', 'ψ2']);
    expect(psi.rows).toEqual([
      ['Zonas residenciales (categoría A)', '0,7', '0,5', '0,3'],
      ['Cubiertas accesibles únicamente para mantenimiento (categoría G)', '0,0', '0,0', '0,0'],
      ['Nieve, altitud ≤ 1.000 m', '0,5', '0,2', '0,0'],
    ]);
    const notas = memoria[memoria.length - 1] as Extract<Block, { kind: 'notes' }>;
    expect(notas.kind).toBe('notes');
    expect(notas.items).toEqual(r.notas);
  });

  it('los nombres del peso propio llevan el tipo y el canto como en las memorias; madera y «otro» sin canto', () => {
    const f = (tipo: Parameters<typeof nombrePesoPropio>[0]['tipo'], canto: number) => ({ tipo, canto, pp: 0, ppOrigen: 'manual' as const, fueraDeTabla: false });
    expect(nombrePesoPropio(f('reticular', 40))).toBe('Peso propio forjado reticular h = 40 cm');
    expect(nombrePesoPropio(f('losa', 35))).toBe('Peso propio losa maciza h = 35 cm');
    expect(nombrePesoPropio(f('solera', 30))).toBe('Peso propio solera h = 30 cm');
    expect(nombrePesoPropio(f('unidireccional', 30))).toBe('Peso propio forjado unidireccional h = 30 cm');
    expect(nombrePesoPropio(f('chapa', 20))).toBe('Peso propio forjado de chapa colaborante h = 20 cm');
    expect(nombrePesoPropio(f('madera', 0))).toBe('Peso propio forjado de madera');
    expect(nombrePesoPropio(f('madera', 24))).toBe('Peso propio forjado de madera h = 24 cm');
    expect(nombrePesoPropio(f('otro', 0))).toBe('Peso propio forjado');
  });

  it('sin resto de carga permanente no hay fila (la losa del helipuerto), sin escaleras no se cita', () => {
    const o = obra();
    o.plantas[0].zonas[0].permanentes = [];
    o.plantas[0].zonas[0].uso = { categoria: 'A1', escalera: true };
    const [primera] = tablas(cuadroCargasMemoria(calcularCargas(o)));
    expect(primera.rows.map((r) => r[0])).toEqual(['Peso propio forjado reticular h = 30 cm', 'Sobrecarga de uso (A1 — viviendas, escaleras +1, tabla 3.1)', 'TOTAL']);
    expect(primera.rows[1][1]).toBe('3,00');
  });

  it('el plan de Word cabe: ninguna tabla pasa de las columnas máximas', () => {
    const plan = planificarDocx(memoria, 'Obra');
    const t = plan.bloques.filter((b): b is Extract<BloquePlan, { tipo: 'tabla' }> => b.tipo === 'tabla');
    expect(t.length).toBeGreaterThanOrEqual(5);
    for (const x of t) expect(x.filas[0].celdas.length).toBeLessThanOrEqual(MAX_COLUMNAS);
    const h2 = plan.bloques.filter((b) => b.tipo === 'parrafo' && b.estilo === 'Heading2').map((b) => (b as { texto: string }).texto);
    expect(h2).toEqual([TITULO_CARGAS_MEMORIA]);
  });
});

describe('plano', () => {
  const r = calcularCargas(obra());
  const viento = { zonaEolica: 'A' as const, vb: 26, aspereza: 'IV' as const };
  const sismo = { ac: 0.084, K: 1.0, mu: 1, ductilidad: 'baja', vidaUtil: 50 };

  it('un bloque por planta como en el cuadro del estudio: peso propio, carga muerta, sobrecarga, total', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, sismo);
    expect(plano[0]).toEqual({ kind: 'heading', level: 2, text: TITULO_GRAVITATORIAS_PLANO });
    const [primera, cubierta] = tablas(plano);
    expect(primera.head).toEqual(['Planta Primera', 'kN/m²']);
    expect(primera.rows).toEqual([
      ['Peso propio reticular H=30 cm', '5,00'],
      ['Carga muerta', '2,00'],
      ['Sobrecarga de uso', '2,00'],
      ['Total', '9,00'],
    ]);
    expect(cubierta.rows.map((f) => f[0])).toEqual(['Peso propio reticular H=30 cm', 'Carga muerta', 'Sobrecarga de uso', 'Nieve', 'Total']);
  });

  it('acciones horizontales ensambladas de viento y sismo, y los γ de ejecución', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, sismo);
    expect(titulos(plano)).toEqual([
      TITULO_GRAVITATORIAS_PLANO,
      TITULO_LINEALES_PLANO,
      TITULO_HORIZONTALES_PLANO,
      'VIENTO (SEGÚN DB SE-AE)',
      'SISMO (SEGÚN NCSE-02)',
      'EJECUCIÓN',
    ]);
    const kv = plano.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable');
    expect(kv[0].rows).toEqual([
      ['Zona eólica', 'A (velocidad básica 26 m/s)'],
      ['Grado de aspereza', 'IV (zona urbana, industrial o forestal)'],
    ]);
    expect(kv[1].rows).toEqual([
      ['Aceleración sísmica de cálculo', '0,08g'],
      ['Coeficiente de contribución K', '1,00'],
      ['Vida útil', '50 años'],
      ['Ductilidad', 'baja, μ = 1,0'],
    ]);
    const ejecucion = tablas(plano)[tablas(plano).length - 1];
    expect(ejecucion.head).toEqual(['Tipo de acción', 'Nivel de control', 'γ']);
    expect(ejecucion.rows).toEqual([
      ['Permanentes', 'Normal', '1,35'],
      ['Variables', 'Normal', '1,50'],
      ['Accidentales', 'Normal', '1,00'],
    ]);
  });

  it('sin publicaciones: viento y sismo remiten a su módulo; el vb sale de la zona si no viene', () => {
    const plano = cuadroAccionesPlanoCargas(r, null, null);
    // El hueco se dice, no se calla: un cuadro sin la línea del sismo no
    // distingue «no aplica» de «no se ha mirado».
    expect(titulos(plano)).toContain('SISMO (SEGÚN NCSE-02)');
    expect(plano.some((b) => b.kind === 'paragraph' && b.text.includes('Viento y nieve'))).toBe(true);
    expect(plano.some((b) => b.kind === 'paragraph' && b.text.includes('módulo Sismo'))).toBe(true);
    const sinVb = cuadroAccionesPlanoCargas(r, { zonaEolica: 'C', vb: null, aspereza: 'II' }, null);
    const kv = sinVb.find((b) => b.kind === 'kvTable') as Extract<Block, { kind: 'kvTable' }>;
    expect(kv.rows[0]).toEqual(['Zona eólica', 'C (velocidad básica 29 m/s)']);
  });

  it('edificio exento del art. 1.2.3: sin ductilidad y con el motivo escrito al lado', () => {
    const exento = {
      ac: 0.04,
      K: 1.0,
      mu: 2,
      ductilidad: 'baja',
      vidaUtil: 50,
      obligatoria: false,
      exencion: 'La NCSE-02 no es de aplicación obligatoria: ab < 0,04 g (art. 1.2.3).',
    };
    const plano = cuadroAccionesPlanoCargas(r, viento, exento);
    const kv = plano.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable');
    // ac, K y vida útil siguen: son los datos que JUSTIFICAN la exención. La
    // ductilidad no, porque no hay cálculo del que declararla.
    expect(kv[1].rows.map(([k]) => k)).toEqual(['Aceleración sísmica de cálculo', 'Coeficiente de contribución K', 'Vida útil']);
    expect(plano.some((b) => b.kind === 'paragraph' && b.text === exento.exencion)).toBe(true);
  });

  it('exento sin motivo redactado: el cuadro pone el del artículo, nunca un hueco', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, { ac: 0.04, K: 1, mu: 2, obligatoria: false });
    expect(plano.some((b) => b.kind === 'paragraph' && b.text.includes('art. 1.2.3'))).toBe(true);
  });

  it('ninguna etiqueta del plano pasa de 33 caracteres, ni con tres cifras de canto', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, sismo);
    for (const t of tablas(plano)) for (const fila of t.rows) expect(fila[0].length, fila[0]).toBeLessThanOrEqual(33);
    for (const kv of plano.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable')) {
      for (const [k] of kv.rows) expect(k.length, k).toBeLessThanOrEqual(33);
    }
    const tipos = ['losa', 'solera', 'reticular', 'unidireccional', 'chapa', 'madera', 'otro'] as const;
    for (const tipo of tipos) {
      const e = etiquetaPesoPropioPlano({ tipo, canto: 100, pp: 0, ppOrigen: 'manual', fueraDeTabla: false });
      expect(e.length, e).toBeLessThanOrEqual(33);
    }
    expect(etiquetaPesoPropioPlano({ tipo: 'chapa', canto: 20, pp: 0, ppOrigen: 'manual', fueraDeTabla: false })).toBe('Peso propio chapa colab. H=20 cm');
  });
});

describe('predimensionado y pestañas del Excel', () => {
  const r = calcularCargas(obra());
  const viento = { zonaEolica: 'A' as const, vb: 26, aspereza: 'IV' as const };

  it('la tabla de Gd / Qd / qd con su hipótesis, en las ocho columnas que admite Word', () => {
    const predim = cuadroPredimensionado(r);
    expect(predim[0]).toEqual({ kind: 'heading', level: 2, text: TITULO_PREDIMENSIONADO });
    const [zonas, lineales] = tablas(predim);
    expect(zonas.head).toEqual(['Planta / zona', 'G', 'Q uso', 'Nieve', 'Gd', 'Qd', 'qd', 'Hipótesis']);
    expect(zonas.head).toHaveLength(MAX_COLUMNAS);
    expect(zonas.rows).toEqual([
      ['Planta Primera', '7,00', '2,00', '-', '9,45', '3,00', '12,45', 'Uso'],
      ['Planta Cubierta', '7,50', '1,00', '0,56', '10,13', '1,50', '11,63', 'Uso'],
    ]);
    expect(lineales.rows).toEqual([
      ['Cerramientos de fachada', '7,00', '9,45'],
      ['Barandillas', '1,00', '1,35'],
    ]);
    expect(predim[predim.length - 1].kind).toBe('notes');
  });

  it('cuatro pestañas en su orden; sin lineales, tres; todo bloque del plano en una y sólo una', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, null);
    const predim = cuadroPredimensionado(r);
    const secciones = seccionesCargasXlsx(plano, predim);
    expect(secciones.map((s) => s.nombre)).toEqual(['Cargas por planta', 'Cargas lineales', 'Predimensionado', 'Acciones horizontales']);
    expect(secciones[2].blocks).toBe(predim);
    const repartidos = secciones.flatMap((s) => s.blocks).filter((b) => plano.includes(b));
    expect(repartidos).toHaveLength(plano.length);
    expect(new Set(repartidos).size).toBe(plano.length);
    expect(titulos(secciones[0].blocks)).toEqual([TITULO_GRAVITATORIAS_PLANO]);
    expect(titulos(secciones[3].blocks)[0]).toBe(TITULO_HORIZONTALES_PLANO);

    const o = obra();
    o.lineales = [];
    const sin = calcularCargas(o);
    expect(seccionesCargasXlsx(cuadroAccionesPlanoCargas(sin, viento, null), cuadroPredimensionado(sin)).map((s) => s.nombre)).toEqual([
      'Cargas por planta',
      'Predimensionado',
      'Acciones horizontales',
    ]);
  });

  it('ninguna pestaña se dispara de ancho y todas abren con su banda de título', () => {
    for (const s of seccionesCargasXlsx(cuadroAccionesPlanoCargas(r, viento, { ac: 0.08, K: 1, mu: 2 }), cuadroPredimensionado(r))) {
      const hoja = planificarHoja(s.blocks, s.nombre);
      expect(hoja.nombre).toBe(s.nombre);
      expect(hoja.filas[0].celdas[0].estilo).toBe('titulo');
      for (const a of hoja.anchos) expect(a, s.nombre).toBeLessThanOrEqual(34);
      expect(hoja.anchos.reduce((a, b) => a + b, 0), s.nombre).toBeLessThan(120);
    }
  });
});

/**
 * Los dos bloques sueltos de la hoja del estudio: los muros (terreno de
 * relleno, filas 60-65) y las cargas lineales medidas por alzado y altura
 * (fila 46). El terreno se DECLARA —no se calcula ningún empuje aquí—, y la
 * altura de un muro viaja en su nombre igual que el canto en el del peso
 * propio: sin ella el kN/m no hay quien lo compruebe.
 */
describe('muros y muros medidos por alzado', () => {
  const conMuros = (): CargasInput => ({
    ...obra(),
    lineales: [
      { concepto: 'Cerramiento de fachada', valor: 0, alzado: 7 / 3, altura: 2.6 },
      { concepto: 'Barandillas', valor: 1 },
    ],
    muros: { terreno: 'Terreno de relleno', phi: 30, gamma: 19, sobrecarga: 2 },
  });
  const r = calcularCargas(conMuros());
  const viento = { zonaEolica: 'A' as const, vb: 26, aspereza: 'IV' as const };

  it('la memoria pone el terreno detrás de las lineales y antes de los γ, con las filas de la hoja', () => {
    const memoria = cuadroCargasMemoria(r);
    expect(titulos(memoria)).toEqual([
      TITULO_CARGAS_MEMORIA,
      'Cargas lineales',
      'Empuje del terreno sobre los muros',
      'Coeficientes parciales de seguridad (DB SE, tabla 4.1)',
      'Coeficientes de simultaneidad (DB SE, tabla 4.2)',
    ]);
    const [terreno] = memoria.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable');
    expect(terreno.rows).toEqual([
      ['Terreno', 'Terreno de relleno'],
      ['Ángulo de rozamiento interno', 'φ = 30º'],
      ['Peso específico aparente', 'γ = 19,00 kN/m³'],
      ['Sobrecarga sobre el terreno', '2,00 kN/m²'],
    ]);
  });

  it('un muro lleva su altura en el nombre en la memoria y en el predimensionado; lo que no es muro, no', () => {
    const [, , lineales] = tablas(cuadroCargasMemoria(r));
    expect(lineales.rows).toEqual([
      ['Cerramiento de fachada h = 2,60 m', '6,07'],
      ['Barandillas', '1,00'],
    ]);
    const [, predimLineales] = tablas(cuadroPredimensionado(r));
    expect(predimLineales.rows[0]).toEqual(['Cerramiento de fachada h = 2,60 m', '6,07', '8,19']);
    expect(nombreLineal({ concepto: 'Peto', alzado: 5, altura: 1, gk: 5, Gd: 6.75 })).toBe('Peto h = 1,00 m');
  });

  it('el plano enuncia el terreno entre el sismo y la ejecución, y sin muros no lo enuncia', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, null);
    expect(titulos(plano)).toEqual([
      TITULO_GRAVITATORIAS_PLANO,
      TITULO_LINEALES_PLANO,
      TITULO_HORIZONTALES_PLANO,
      'VIENTO (SEGÚN DB SE-AE)',
      'SISMO (SEGÚN NCSE-02)',
      TITULO_MUROS,
      'EJECUCIÓN',
    ]);
    // La etiqueta del muro en el plano NO lleva la altura: no cabe en 33.
    const lineales = tablas(plano)[2];
    expect(lineales.rows[0]).toEqual(['Cerramiento de fachada', '6,07']);
    for (const kv of plano.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable')) {
      for (const [k] of kv.rows) expect(k.length, k).toBeLessThanOrEqual(33);
    }
    const sinMuros = cuadroAccionesPlanoCargas(calcularCargas(obra()), viento, null);
    expect(titulos(sinMuros)).not.toContain(TITULO_MUROS);
  });

  it('el terreno cae en la pestaña de acciones horizontales del Excel', () => {
    const plano = cuadroAccionesPlanoCargas(r, viento, null);
    const secciones = seccionesCargasXlsx(plano, cuadroPredimensionado(r));
    const horizontales = secciones.find((x) => x.nombre === 'Acciones horizontales')!;
    expect(titulos(horizontales.blocks)).toContain(TITULO_MUROS);
  });
});

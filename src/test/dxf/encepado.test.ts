/**
 * El plano tipo del estudio, relleno con los números del cálculo.
 *
 * Lo que se prueba aquí no es «que parezca un DXF» —eso no lo nota nadie hasta
 * que el CAD abre un dibujo vacío— sino las tres cosas que pueden salir mal al
 * rellenar una plantilla ajena:
 *
 *  1. **Que cada cifra caiga en su casilla.** La fila de datos se lee del
 *     fichero generado por su coordenada y se compara columna a columna. Las
 *     cotas de la fila (las y de cada tipo) y el orden de las columnas están
 *     MEDIDOS en los .dxf del estudio, no tomados del código que se prueba: son
 *     el oráculo. Las geométricas van a mano (1200 + 2·375 = 1950 mm = 195 cm)
 *     y las de armadura contra lo que calcula el motor, que es de quien tienen
 *     que ser noticia.
 *  2. **Que no se toque nada más.** El fichero de salida debe ser el de entrada
 *     línea a línea salvo las celdas, el $HANDSEED y las dos notas al pie. Si
 *     algún día el relleno se lleva por delante una entidad del dibujo, esto
 *     lo dice.
 *  3. **Que el fichero siga siendo legible.** Pares código/valor completos y
 *     manejadores sin repetir: un manejador duplicado es de las poquísimas
 *     cosas que AutoCAD rechaza abiertamente.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { pileCapDefaults, type PileCapInputs } from '../../data/defaults';
import { calcPileCap } from '../../lib/calculations/pileCap';
import {
  ErrorPlantilla,
  anchoTexto,
  exportarEncepadoDxf,
  rellenarEncepado,
  rutaPlantilla,
} from '../../lib/dxf/encepado';

const leerPlantilla = (n: number) => readFileSync(join('public', rutaPlantilla(n)), 'utf8');

/** Cota de la fila de datos y orden de las columnas, medidos en los planos. */
const TABLA: Record<number, { y: number; columnas: string[] }> = {
  2: { y: 1.6449, columnas: ['MICROPILOTE', 'H', 'A', 'L1', 'L2', 'D', 'As1', 'As2', 'As3', 'As4'] },
  3: { y: 1.3701, columnas: ['MICROPILOTE', 'H', 'A', 'B', 'D', 'As1', 'As2', 'As3', 'As4', 'As5'] },
  4: { y: 1.6601, columnas: ['MICROPILOTE', 'H', 'A', 'L', 'D', 'As1', 'As2', 'As3', 'As4', 'As5'] },
  6: { y: 1.5338, columnas: ['MICROPILOTE', 'H', 'A', 'B', 'L1', 'L2', 'D', 'As1', 'As2', 'As3', 'As4', 'As5'] },
};

/** Los TEXT del fichero, con lo justo para localizarlos. Lector propio del test. */
function textos(dxf: string): { texto: string; x: number; y: number; h: number }[] {
  const lineas = dxf.split(/\r\n|\n/);
  const out: { texto: string; x: number; y: number; h: number }[] = [];
  let tipo = '';
  let g: Record<number, string> = {};
  const cerrar = () => {
    if (tipo === 'TEXT' && g[1] !== undefined) {
      out.push({ texto: g[1], x: Number(g[10]), y: Number(g[20]), h: Number(g[40]) });
    }
  };
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const codigo = Number(lineas[i].trim());
    const valor = lineas[i + 1].trim();
    if (lineas[i].trim() === '') break;
    if (codigo === 0) {
      cerrar();
      tipo = valor;
      g = {};
    } else if (g[codigo] === undefined) {
      g[codigo] = valor;
    }
  }
  cerrar();
  return out;
}

/**
 * La fila de datos del DXF generado, etiquetada con las columnas medidas. Una
 * celda partida en dos líneas (la de arriba a +0,19 y la de abajo a −0,19 de
 * la cota de la fila) se devuelve como «arriba abajo», con un espacio.
 */
function filaDeDatos(dxf: string, n: number): Record<string, string> {
  const { y, columnas } = TABLA[n];
  const enFila = textos(dxf).filter((t) => Math.abs(t.y - y) < 0.3 && Math.abs(t.h - 0.256) < 0.001);
  const porColumna = new Map<string, typeof enFila>();
  for (const t of enFila) {
    const k = t.x.toFixed(4);
    porColumna.set(k, [...(porColumna.get(k) ?? []), t]);
  }
  const celdas = [...porColumna.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, ts]) => ts.sort((a, b) => b.y - a.y).map((t) => t.texto).join(' '));
  expect(celdas.length).toBe(columnas.length);
  return Object.fromEntries(columnas.map((c, i) => [c, celdas[i]]));
}

/** Las notas al pie: los textos de cuerpo menor que la tabla, de abajo del todo. */
function notas(dxf: string): string[] {
  return textos(dxf)
    .filter((t) => t.h < 0.25 && t.y < 1)
    .sort((a, b) => b.y - a.y)
    .map((t) => t.texto);
}

/** Ancho de casilla de las columnas de armadura, medido en los cuatro planos. */
const CASILLA_AS = 1.345;

function rellenar(inp: PileCapInputs) {
  return rellenarEncepado(leerPlantilla(inp.n), inp, calcPileCap(inp));
}

const base = (n: number, extra: Partial<PileCapInputs> = {}): PileCapInputs => ({
  ...pileCapDefaults,
  n,
  // Con 6 micropilotes el canto por defecto no da el ángulo de biela; el plano
  // se rellena igual, pero se calcula con el canto que el módulo pide.
  h_enc: n === 6 ? 1400 : pileCapDefaults.h_enc,
  ...extra,
});

describe('DXF de encepados — la tabla del plano tipo', () => {
  it('2 micropilotes: cotas de obra en cm y armaduras del cálculo', () => {
    const inp = base(2);
    const res = calcPileCap(inp);
    const fila = filaDeDatos(rellenar(inp), 2);
    // Geometría a mano: s = 1200, e = 375 → L1 = 1950, L2 = 1150, canto 800.
    expect(fila.MICROPILOTE).toBe('220');
    expect(fila.H).toBe('80');
    expect(fila.A).toBe('120');
    expect(fila.L1).toBe('195');
    expect(fila.L2).toBe('115');
    expect(fila.D).toBe('37,5');
    // Armadura: los tirantes por número de barras de la banda, el reparto por
    // separación. Con 2 pilotes las dos últimas casillas del estudio son el
    // anillo horizontal de piel y el cerco vertical, no la malla.
    expect(fila.As1).toBe(`${res.n_bars_x}%%C12`);
    expect(fila.As2).toBe('2%%C12');
    // «Ø12c/10» mide 5,9 alturas y la casilla 5,2: va en dos líneas.
    expect(fila.As3).toBe('%%C12 c/10');
    expect(fila.As4).toBe('%%C12 c/10');
  });

  it('2 micropilotes: la malla, que no tiene casilla, va en la nota', () => {
    const dxf = rellenar(base(2, { phi_g: 16, s_g: 250, phi_ch: 10, s_ch: 150 }));
    const fila = filaDeDatos(dxf, 2);
    expect(fila.As3).toBe('%%C10 c/15'); // anillos de piel
    expect(notas(dxf)[0]).toContain('malla %%C16c/25 en las dos caras');
  });

  it('3 micropilotes: B es la altura del triángulo y hay tres reparticiones', () => {
    const inp = base(3);
    const res = calcPileCap(inp);
    const fila = filaDeDatos(rellenar(inp), 3);
    expect(fila.A).toBe('120');
    expect(fila.B).toBe('103,9'); // 1200·√3/2 = 1039,2 mm
    expect(fila.D).toBe(`${(res.e_borde / 10).toFixed(0)}`);
    expect(fila.As1).toBe(`${res.n_bars_x}%%C12`);
    expect(fila.As3).toBe('%%C12 c/10'); // malla inferior
    expect(fila.As4).toBe('%%C12 c/10'); // anillos de piel
    expect(fila.As5).toBe(fila.As3);     // la malla es la misma arriba y abajo
  });

  it('D es la distancia al borde en el sentido de la cota, no la menor de las dos', () => {
    // 2 pilotes con un ancho estrecho: el motor da e_borde = L_y/2 = 300 (la
    // menor), pero la D del plano es la de los extremos, (1900 − 1200)/2 = 350.
    const estrecho = base(2, { dims_auto: false, L_x: 1900, L_y: 600 });
    expect(calcPileCap(estrecho).e_borde).toBe(300);
    expect(filaDeDatos(rellenar(estrecho), 2).D).toBe('35');
    // 6 pilotes con cotas manuales distintas por sentido: se escriben las dos.
    const desigual = base(6, { dims_auto: false, L_x: 3100, L_y: 3200 });
    const fila = filaDeDatos(rellenar(desigual), 6);
    expect(fila.D).toBe('35/40'); // (3100 − 2400)/2 y (3200 − 2·1200)/2; cabe en una línea
    expect(fila.L1).toBe('310');
    expect(fila.L2).toBe('320');
  });

  it('4 micropilotes: una sola casilla de lado, y las dos cuando no son iguales', () => {
    expect(filaDeDatos(rellenar(base(4)), 4).L).toBe('195');
    const rectangular = base(4, { dims_auto: false, L_x: 2000, L_y: 1800 });
    // «200/180» no cabe en la casilla: una cota encima de la otra.
    expect(filaDeDatos(rellenar(rectangular), 4).L).toBe('200 180');
  });

  it('6 micropilotes: A entre columnas y B entre filas', () => {
    const inp = base(6);
    const fila = filaDeDatos(rellenar(inp), 6);
    expect(fila.A).toBe('240');  // s_x, las dos columnas
    expect(fila.B).toBe('120');  // s, las tres filas
    expect(fila.L1).toBe('315'); // 2400 + 2·375
    expect(fila.L2).toBe('315'); // 2·1200 + 2·375
    expect(fila.H).toBe('140');
  });

  it('la armadura de los tirantes es la mayor de las dos direcciones', () => {
    const inp = base(6);
    const res = calcPileCap(inp);
    const esperado = Math.max(res.n_bars_x, res.n_bars_y ?? 0);
    expect(filaDeDatos(rellenar(inp), 6).As1).toBe(`${esperado}%%C12`);
    expect(esperado).toBeGreaterThanOrEqual(res.n_bars_x);
  });

  for (const n of [2, 3, 4, 6]) {
    it(`${n} micropilotes: ningún texto de la fila de datos se sale de su casilla`, () => {
      const dxf = rellenar(base(n, { title: 'Encepado P-5' }));
      const { y } = TABLA[n];
      const enFila = textos(dxf).filter(
        (t) => Math.abs(t.y - y) < 0.3 && Math.abs(t.h - 0.256) < 0.001 && t.x > 5,
      );
      expect(enFila.length).toBeGreaterThan(5);
      for (const t of enFila) {
        expect(anchoTexto(t.texto, t.h), t.texto).toBeLessThanOrEqual(0.9 * CASILLA_AS);
      }
    });
  }

  it('sin armadura superior la casilla lo dice, no queda en blanco', () => {
    expect(filaDeDatos(rellenar(base(4, { n_top: 0 })), 4).As2).toBe('-');
  });
});

describe('DXF de encepados — la nota al pie', () => {
  it('título, materiales, recubrimiento, axil y la armadura sin casilla, en una línea', () => {
    const dxf = rellenar(base(4, { title: 'Encepado P-5', fck: 30, N_Ed: 750 }));
    expect(notas(dxf)).toEqual([
      'Encepado P-5 · HA-30 · B500S · rec. 6 cm · NEd = 750 kN · cercos de banda %%C12c/10 de 2 ramas',
    ]);
  });

  it('sin título, la nota empieza por el hormigón', () => {
    expect(notas(rellenar(base(4)))[0]).toMatch(/^HA-25 · B500S/);
  });

  it('con 3 o más pilotes la nota lleva los cercos de banda, que no tienen casilla', () => {
    for (const n of [3, 4, 6]) {
      const nota = notas(rellenar(base(n, { phi_cv: 10, s_cv: 200, n_cv: 4 })))[0];
      expect(nota).toContain('cercos de banda %%C10c/20 de 4 ramas');
    }
  });
});

describe('DXF de encepados — la nota cabe entre la tabla y el marco, y en el ancho de la tabla', () => {
  /** Medidos en los .dxf del estudio: borde inferior de la tabla, su borde derecho y el marco. */
  const PIE: Record<number, number> = { 2: 1.11, 3: 0.835, 4: 1.125, 6: 0.999 };
  const DERECHA: Record<number, number> = { 2: 15.98, 3: 16.77, 4: 17.43, 6: 18.36 };
  const MARCO: Record<number, number> = { 2: 0.142, 3: 0.228, 4: 0.158, 6: 0.031 };
  for (const n of [2, 3, 4, 6]) {
    it(`${n} micropilotes: al cuerpo de los rótulos del plano y sin tocar nada`, () => {
      const dxf = rellenar(base(n, { title: 'Encepado pilar P-12' }));
      const [nota, ...resto] = textos(dxf).filter((t) => t.h < 0.25 && t.y < 1);
      expect(resto).toEqual([]); // una sola línea
      // 0,78 de la letra de la tabla = 0,2, el cuerpo de «As4», «Hormigón de limpieza»…
      expect(nota.h).toBeCloseTo(0.2, 2);
      // Aire por arriba (la mayúscula no toca la tabla) y por abajo (el marco).
      expect(nota.y + nota.h).toBeLessThan(PIE[n] - 0.1);
      expect(nota.y - MARCO[n]).toBeGreaterThan(nota.h);
      // Y no se sale de la tabla por la derecha, con la fuente del plano.
      expect(nota.x + anchoTexto(nota.texto, nota.h)).toBeLessThan(DERECHA[n]);
    });
  }

  it('con un título muy largo la nota se encoge lo justo para no salirse de la tabla', () => {
    const largo = 'Encepado del pilar P-12 del sótano segundo, junto al muro pantalla';
    const dxf = rellenar(base(2, { title: largo }));
    const [nota] = textos(dxf).filter((t) => t.h < 0.25 && t.y < 1);
    expect(nota.h).toBeLessThan(0.2);
    expect(nota.h).toBeGreaterThanOrEqual(0.128); // nunca por debajo de media letra de tabla
    expect(nota.x + anchoTexto(nota.texto, nota.h)).toBeLessThan(DERECHA[2]);
  });
});

describe('DXF de encepados — el fichero', () => {
  for (const n of [2, 3, 4, 6]) {
    it(`${n} micropilotes: sólo cambian las celdas, el HANDSEED, la nota y las segundas líneas`, () => {
      const plantilla = leerPlantilla(n);
      const salida = rellenar(base(n));
      const antes = plantilla.split(/\r\n|\n/);
      const despues = salida.split(/\r\n|\n/);
      // Con los valores por defecto se parten las casillas de reparto (As3 y
      // As4 con 2 pilotes; As3, As4 y As5 con más): cada una es un TEXT nuevo
      // clonado de la celda, y la nota otro TEXT de 13 pares.
      const partidas = n === 2 ? 2 : 3;
      expect(despues.length).toBeGreaterThan(antes.length + 26);
      // Ninguna línea de la plantilla desaparece salvo las celdas y el
      // HANDSEED. Se cuenta como multiconjunto y no por posición porque las
      // notas se insertan en medio y corren todo lo que va detrás.
      const quedan = new Map<string, number>();
      for (const l of despues) quedan.set(l, (quedan.get(l) ?? 0) + 1);
      const perdidas = antes.filter((l) => {
        const c = quedan.get(l) ?? 0;
        if (c === 0) return true;
        quedan.set(l, c - 1);
        return false;
      });
      expect(perdidas.length).toBeGreaterThan(0);
      // Cada celda partida cambia además sus dos cotas y (grupos 20 y 21).
      expect(perdidas.length).toBeLessThanOrEqual(TABLA[n].columnas.length + 1 + 2 * partidas);
      // Y no se pierde ninguna entidad: los TEXT son los de antes más los nuevos.
      const cuenta = (t: string, txt: string) => txt.split(`\r\n${t}\r\n`).length - 1;
      expect(cuenta('TEXT', salida)).toBe(cuenta('TEXT', plantilla.replace(/\r?\n/g, '\r\n')) + 1 + partidas);
      for (const t of ['LINE', 'LWPOLYLINE', 'CIRCLE', 'DIMENSION', 'MTEXT']) {
        expect(cuenta(t, salida)).toBe(cuenta(t, plantilla.replace(/\r?\n/g, '\r\n')));
      }
      // Las secciones siguen ahí.
      for (const s of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) {
        expect(salida).toContain(`\r\n${s}\r\n`);
      }
      expect(salida.trimEnd().endsWith('EOF')).toBe(true);
    });

    it(`${n} micropilotes: pares completos y manejadores sin repetir`, () => {
      const lineas = rellenar(base(n)).split('\r\n');
      const manejadores = new Set<string>();
      let repetidos = 0;
      for (let i = 0; i + 1 < lineas.length; i += 2) {
        const crudo = lineas[i].trim();
        if (crudo === '') break;
        expect(Number.isInteger(Number(crudo))).toBe(true);
        if (Number(crudo) === 5) {
          const h = lineas[i + 1].trim();
          if (manejadores.has(h)) repetidos++;
          manejadores.add(h);
        }
      }
      // El único código 5 repetido admisible es el $HANDSEED de la cabecera,
      // que apunta al siguiente libre y no es manejador de nadie.
      expect(repetidos).toBeLessThanOrEqual(1);
      // Y el $HANDSEED de salida queda por encima de TODO manejador en uso,
      // incluidos los dos nuevos: el siguiente que asigne el CAD no chocará.
      const iSeed = lineas.findIndex((l) => l.trim() === '$HANDSEED');
      const seed = parseInt(lineas[iSeed + 2].trim(), 16);
      const usados = [...manejadores].map((h) => parseInt(h, 16)).filter(Number.isFinite);
      expect(seed).toBeGreaterThan(Math.max(...usados.filter((h) => h !== seed)));
    });
  }

  it('una plantilla que no es el plano tipo se rechaza con su motivo', () => {
    const inp = base(2);
    const res = calcPileCap(inp);
    expect(() => rellenarEncepado('esto no es un dxf', inp, res)).toThrow(ErrorPlantilla);
    expect(() => rellenarEncepado('  0\r\nSECTION\r\n  2\r\nHEADER\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n', inp, res))
      .toThrow(/ENTITIES/);
  });
});

describe('DXF de encepados — el punto de entrada del botón', () => {
  afterEach(() => vi.unstubAllGlobals());

  const conPlantilla = (n: number) => {
    const mock = vi.fn(async () => ({ ok: true, text: async () => leerPlantilla(n) }) as unknown as Response);
    vi.stubGlobal('fetch', mock);
    return mock;
  };

  it('pide la plantilla de su tipo y la nota lleva el título recién tecleado, no el del estado', async () => {
    const fetchMock = conPlantilla(3);
    // El estado todavía dice «viejo»: setField es un setState y al exportar
    // no ha vuelto a pintar. El título bueno llega por parámetro.
    const inp = base(3, { title: 'viejo' });
    const { blob, filename } = await exportarEncepadoDxf(inp, calcPileCap(inp), 'Encepado P-7');
    expect(fetchMock).toHaveBeenCalledWith('/plantillas/encepado-3.dxf');
    expect(filename).toBe('encepado-p-7.dxf');
    const dxf = await blob.text();
    expect(notas(dxf)[0]).toMatch(/^Encepado P-7 · HA-25/);
    expect(dxf).not.toContain('viejo');
    expect(blob.type).toBe('image/vnd.dxf');
  });

  it('sin título, el nombre lleva el tipo y la fecha', async () => {
    conPlantilla(2);
    const inp = base(2, { title: '' });
    const { filename } = await exportarEncepadoDxf(inp, calcPileCap(inp), '');
    expect(filename).toMatch(/^concreta-encepado-2p-\d{4}-\d{2}-\d{2}\.dxf$/);
  });

  it('si la plantilla no llega, falla con su motivo en vez de bajar un fichero vacío', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));
    const inp = base(4);
    await expect(exportarEncepadoDxf(inp, calcPileCap(inp), 'x')).rejects.toThrow(ErrorPlantilla);
  });
});

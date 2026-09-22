/**
 * Los planos tipo de muro de contención del estudio, rellenos con los números
 * del cálculo.
 *
 * Se prueba lo mismo que en los encepados, que es lo que puede salir mal al
 * rellenar una plantilla ajena —que cada cifra caiga en su casilla, que no se
 * toque nada más y que el fichero siga siendo legible— y una cosa más que aquí
 * es nueva: **las casillas de armadura vienen ya partidas en dos líneas** en
 * los tres .dxf del estudio («Ø16» encima, «c/15» debajo). Las dos caen en la
 * misma cabecera, así que si el relleno no las agrupara escribiría el valor
 * entero dos veces, una encima de la otra. Los tres primeros casos de aquí
 * abajo fallan si eso vuelve a pasar.
 *
 * Las cotas de la fila de datos, los bordes de cada tabla y el orden de las
 * columnas están MEDIDOS en los .dxf del estudio, no tomados del código que se
 * prueba: son el oráculo. Las geométricas van a mano (1,50 + 0,30 + 0,60 =
 * 2,40 m = 240 cm) y las de armadura son las que se teclean en el módulo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { retainingWallDefaults, type RetainingWallInputs } from '../../data/defaults';
import {
  ErrorPlantilla,
  anchoTexto,
  exportarMuroDxf,
  rellenarMuro,
  rutaPlantilla,
} from '../../lib/dxf/muro';
import { armadurasSinDefinir, tipoDeMuro, type TipoMuro } from '../../lib/dxf/muroPlano';

const leerPlantilla = (tipo: TipoMuro) => readFileSync(join('public', rutaPlantilla(tipo)), 'utf8');

/**
 * Cota de la fila de datos, orden de las columnas y bordes de la tabla,
 * medidos en los tres planos. `pie` es el borde inferior y `derecha` el
 * derecho: por ahí no puede asomar la nota.
 */
const TABLA: Record<TipoMuro, { y: number; pie: number; derecha: number; columnas: string[] }> = {
  1: {
    y: 2.445, pie: 1.910, derecha: 23.192,
    columnas: ['H', 'A', 'B', 'C', 'E', 'D', 'As1', 'As2', 'As3', 'As4', 'As5', 'As6', 'As7'],
  },
  2: {
    y: 2.445, pie: 1.910, derecha: 18.037,
    columnas: ['H', 'A', 'B', 'C', 'E', 'As1', 'As2', 'As3', 'As4', 'As6'],
  },
  3: {
    y: 2.105, pie: 1.569, derecha: 19.351,
    columnas: ['H', 'A', 'B', 'E', 'D', 'As1', 'As2', 'As3', 'As4', 'As5', 'As6', 'As7'],
  },
};

/** Ancho de casilla: 1,3455 las de armadura y 1,2055 las de cota. La estrecha. */
const CASILLA = 1.2055;

/**
 * Los TEXT del fichero, con lo justo para localizarlos. Lector propio del test.
 *
 * La x es la del punto de alineación (grupo 11) porque los textos de la tabla
 * van centrados y es ese punto, no el de inserción, el que comparten las dos
 * líneas de una misma casilla.
 */
function textos(dxf: string): { texto: string; x: number; y: number; h: number }[] {
  const lineas = dxf.split(/\r\n|\n/);
  const out: { texto: string; x: number; y: number; h: number }[] = [];
  let tipo = '';
  let g: Record<number, string> = {};
  const cerrar = () => {
    if (tipo === 'TEXT' && g[1] !== undefined) {
      out.push({
        texto: g[1],
        x: Number(g[11] ?? g[10]),
        y: Number(g[21] ?? g[20]),
        h: Number(g[40]),
      });
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
 * casilla de dos líneas se devuelve como «arriba abajo», con un espacio.
 */
function filaDeDatos(dxf: string, tipo: TipoMuro): Record<string, string> {
  const { y, columnas } = TABLA[tipo];
  const enFila = textos(dxf).filter((t) => Math.abs(t.y - y) < 0.3 && Math.abs(t.h - 0.256) < 0.001);
  const porColumna = new Map<string, typeof enFila>();
  for (const t of enFila) {
    const k = t.x.toFixed(4);
    porColumna.set(k, [...(porColumna.get(k) ?? []), t]);
  }
  const celdas = [...porColumna.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, ts]) =>
      ts.sort((a, b) => b.y - a.y).map((t) => t.texto).filter(Boolean).join(' '),
    );
  expect(celdas.length).toBe(columnas.length);
  return Object.fromEntries(columnas.map((c, i) => [c, celdas[i]]));
}

/** La nota al pie: el único texto del plano con cuerpo menor que la tabla. */
function notas(dxf: string): string[] {
  return textos(dxf)
    .filter((t) => t.h < 0.25)
    .sort((a, b) => b.y - a.y)
    .map((t) => t.texto);
}

/** Un muro armado del todo; la geometría es la de fábrica del módulo. */
const base = (extra: Partial<RetainingWallInputs> = {}): RetainingWallInputs => ({
  ...retainingWallDefaults,
  diam_fv_int: 16, sep_fv_int: 150,
  diam_fv_ext: 12, sep_fv_ext: 200,
  diam_fh:     10, sep_fh:     250,
  diam_zs:     16, sep_zs:     150,
  diam_zi:     20, sep_zi:     100,
  diam_zt_inf: 12, sep_zt_inf: 200,
  diam_zt_sup: 12, sep_zt_sup: 250,
  ...extra,
});

const rellenar = (inp: RetainingWallInputs) => rellenarMuro(leerPlantilla(tipoDeMuro(inp)), inp);

describe('DXF de muros — qué plano tipo le toca a cada muro', () => {
  it('con los dos vuelos, el tipo 1', () => {
    expect(tipoDeMuro(base())).toBe(1);
  });

  it('sin talón, el tipo 2; sin puntera, el tipo 3', () => {
    expect(tipoDeMuro(base({ bTalon: 0 }))).toBe(2);
    expect(tipoDeMuro(base({ bPunta: 0 }))).toBe(3);
  });

  it('un vuelo que se escribiría «0 cm» es un vuelo que no existe', () => {
    expect(tipoDeMuro(base({ bTalon: 0.004 }))).toBe(2);
    expect(tipoDeMuro(base({ bTalon: 0.006 }))).toBe(1);
  });

  it('sin ninguno de los dos sale el tipo 2, que es el que menos dibuja de más', () => {
    expect(tipoDeMuro(base({ bTalon: 0, bPunta: 0 }))).toBe(2);
  });
});

describe('DXF de muros — la tabla del plano tipo', () => {
  it('tipo 1: cotas de obra en cm y armaduras del módulo', () => {
    const fila = filaDeDatos(rellenar(base()), 1);
    // Geometría a mano: hf = 0,50 · H = 3,00 · talón 1,50 + fuste 0,30 +
    // puntera 0,60 = 2,40 de ancho total.
    expect(fila.H).toBe('50');
    expect(fila.A).toBe('300');
    expect(fila.B).toBe('240');
    expect(fila.C).toBe('60');
    expect(fila.D).toBe('150');
    expect(fila.E).toBe('30');
    // «Ø16c/15» mide 5,9 alturas de letra y la casilla 5,2: va en dos líneas.
    expect(fila.As1).toBe('%%C16 c/15'); // vertical de trasdós
    expect(fila.As2).toBe('%%C12 c/20'); // vertical de intradós
    expect(fila.As3).toBe('%%C10 c/25'); // horizontal del fuste
    expect(fila.As4).toBe('%%C20 c/10'); // inferior de la zapata (punta)
    expect(fila.As5).toBe('%%C16 c/15'); // superior de la zapata (talón)
    expect(fila.As6).toBe('%%C12 c/20'); // transversal inferior
    expect(fila.As7).toBe('%%C12 c/25'); // transversal superior
  });

  it('tipo 2: sin columna D, y B es lo que queda de zapata', () => {
    const fila = filaDeDatos(rellenar(base({ bTalon: 0 })), 2);
    expect(fila.B).toBe('90'); // 0 + 30 + 60
    expect(fila.C).toBe('60');
    expect(fila.E).toBe('30');
    expect(fila.D).toBeUndefined();
    expect(fila.As4).toBe('%%C20 c/10');
    expect(fila.As6).toBe('%%C12 c/20');
  });

  it('tipo 3: sin columna C, y el talón entero en D', () => {
    const fila = filaDeDatos(rellenar(base({ bPunta: 0 })), 3);
    expect(fila.B).toBe('180'); // 150 + 30 + 0
    expect(fila.D).toBe('150');
    expect(fila.C).toBeUndefined();
    expect(fila.As5).toBe('%%C16 c/15');
    expect(fila.As7).toBe('%%C12 c/25');
  });

  it('las cotas con decimal se escriben con coma, como el resto del plano', () => {
    const fila = filaDeDatos(rellenar(base({ hf: 0.325, tFuste: 0.225 })), 1);
    expect(fila.H).toBe('32,5');
    expect(fila.E).toBe('22,5');
  });

  it('una separación con decimal no se pierde ni se redondea a mano', () => {
    expect(filaDeDatos(rellenar(base({ sep_fh: 125 })), 1).As3).toBe('%%C10 c/12,5');
  });

  it('las dos líneas de una casilla no se escriben la una encima de la otra', () => {
    // La trampa de estos planos: «Ø16» y «c/15» son dos TEXT de la misma
    // casilla. Sin agrupar, las dos acabarían diciendo «Ø16» (o el valor
    // entero) y el plano pediría una armadura sin separación.
    const dxf = rellenar(base());
    const { y } = TABLA[1];
    const enFila = textos(dxf).filter((t) => Math.abs(t.y - y) < 0.3 && t.h > 0.25);
    const repetidos = enFila.filter((t) => t.texto.includes('c/') && t.texto.includes('%%C'));
    expect(repetidos).toEqual([]);
    // Y cada casilla de armadura tiene exactamente dos líneas distintas.
    const fila = filaDeDatos(dxf, 1);
    for (const as of ['As1', 'As2', 'As3', 'As4', 'As5', 'As6', 'As7']) {
      const [arriba, abajo] = fila[as].split(' ');
      expect(arriba, as).toMatch(/^%%C\d+$/);
      expect(abajo, as).toMatch(/^c\/[\d,]+$/);
    }
  });

  for (const tipo of [1, 2, 3] as TipoMuro[]) {
    it(`tipo ${tipo}: ningún texto de la fila de datos se sale de su casilla`, () => {
      const dxf = rellenar(
        base({ title: 'Muro M-3', ...(tipo === 2 ? { bTalon: 0 } : tipo === 3 ? { bPunta: 0 } : {}) }),
      );
      const { y } = TABLA[tipo];
      const enFila = textos(dxf).filter((t) => Math.abs(t.y - y) < 0.3 && t.h > 0.25);
      expect(enFila.length).toBeGreaterThan(TABLA[tipo].columnas.length);
      for (const t of enFila) {
        expect(anchoTexto(t.texto, t.h), t.texto).toBeLessThanOrEqual(0.9 * CASILLA);
      }
    });
  }

  it('sin definir una armadura la casilla lo dice, no queda en blanco', () => {
    expect(filaDeDatos(rellenar(base({ diam_zt_sup: 0 })), 1).As7).toBe('-');
  });
});

describe('DXF de muros — la nota al pie', () => {
  it('título, materiales y recubrimiento, en una línea', () => {
    const dxf = rellenar(base({ title: 'Muro M-3', fck: 30, cover: 50 }));
    expect(notas(dxf)).toEqual(['Muro M-3 · HA-30 · B500S · rec. 5 cm']);
  });

  it('sin título, la nota empieza por el hormigón', () => {
    expect(notas(rellenar(base()))[0]).toMatch(/^HA-25 · B500S · rec. 4 cm$/);
  });

  it('la armadura que el plano elegido no sabe dibujar se dice en la nota', () => {
    // Un muro sin talón no tiene casillas As5 ni As7. Si el cálculo dispone
    // armadura superior de zapata, callarla dejaría un plano pidiendo menos
    // acero del comprobado.
    const nota = notas(rellenar(base({ bTalon: 0 })))[0];
    expect(nota).toContain('arm. superior de la zapata %%C16c/15');
    expect(nota).toContain('arm. transversal superior de la zapata %%C12c/25');
  });

  it('y si no la hay, la nota no la inventa', () => {
    const nota = notas(rellenar(base({ bTalon: 0, diam_zs: 0, diam_zt_sup: 0 })))[0];
    expect(nota).toBe('HA-25 · B500S · rec. 4 cm');
  });

  for (const tipo of [1, 2, 3] as TipoMuro[]) {
    it(`tipo ${tipo}: la nota va bajo la tabla, al cuerpo de los rótulos y sin salirse`, () => {
      const dxf = rellenar(
        base({
          title: 'Muro de sótano M-12',
          // Sin la armadura superior en el tipo 2, que no tiene casillas y se
          // iría a la nota alargándola: eso se prueba aparte.
          ...(tipo === 2 ? { bTalon: 0, diam_zs: 0, diam_zt_sup: 0 } : {}),
          ...(tipo === 3 ? { bPunta: 0 } : {}),
        }),
      );
      const bajoLaTabla = textos(dxf).filter((t) => t.h < 0.25);
      expect(bajoLaTabla.length).toBe(1); // una sola línea
      const [nota] = bajoLaTabla;
      // 0,78 de la letra de la tabla = 0,2, el cuerpo de «As4» o de «Hormigón
      // de limpieza» en el propio dibujo del estudio.
      expect(nota.h).toBeCloseTo(0.2, 2);
      // Por debajo del borde inferior de la tabla, y sin que la mayúscula lo toque.
      expect(nota.y + nota.h).toBeLessThan(TABLA[tipo].pie - 0.1);
      // Y no se sale de la tabla por la derecha, con la fuente del plano.
      expect(nota.x + anchoTexto(nota.texto, nota.h)).toBeLessThan(TABLA[tipo].derecha);
    });
  }

  it('una nota larga se encoge, y si ni así cabe se parte en dos renglones', () => {
    // Un título largo en el plano más estrecho, y encima con la armadura
    // superior que el tipo 2 no sabe dibujar: en un renglón no cabe ni al
    // cuerpo mínimo legible.
    const largo = 'Muro de contención del lindero este, entre los ejes 4 y 11 del sótano segundo';
    const renglones = textos(rellenar(base({ bTalon: 0, title: largo }))).filter((t) => t.h < 0.25);
    expect(renglones).toHaveLength(2);
    expect(renglones.map((r) => r.texto).join(' · ')).toMatch(
      /^Muro de contención del lindero este.* · HA-25 · B500S · rec\. 4 cm · arm\. superior/,
    );
    for (const r of renglones) {
      expect(r.h).toBeGreaterThanOrEqual(0.128); // nunca por debajo de media letra de tabla
      expect(r.x + anchoTexto(r.texto, r.h), r.texto).toBeLessThan(TABLA[2].derecha);
    }
    // Y el segundo renglón va debajo del primero, no encima.
    expect(renglones[1].y).toBeLessThan(renglones[0].y);
  });
});

describe('DXF de muros — qué armadura pide cada plano', () => {
  it('en modo dimensionado no falta una, faltan todas', () => {
    expect(armadurasSinDefinir(retainingWallDefaults, 1)).toHaveLength(7);
  });

  it('el tipo 2 no pide la superior de zapata: sin talón no hay flexión que la pida', () => {
    const sinSuperior = base({ bTalon: 0, diam_zs: 0, diam_zt_sup: 0 });
    expect(armadurasSinDefinir(sinSuperior, 2)).toEqual([]);
    // El mismo armado en un plano con talón sí deja dos casillas sin llenar.
    expect(armadurasSinDefinir(sinSuperior, 1)).toEqual([
      'superior de la zapata',
      'transversal superior de la zapata',
    ]);
  });

  it('una separación a cero cuenta como no definida', () => {
    expect(armadurasSinDefinir(base({ sep_fh: 0 }), 1)).toEqual(['horizontal del fuste']);
  });
});

describe('DXF de muros — el fichero', () => {
  /** TEXT de la fila de datos que trae cada plantilla: las de dos líneas cuentan dos. */
  const TEXTOS_DE_FILA: Record<TipoMuro, number> = { 1: 18, 2: 13, 3: 17 };

  for (const tipo of [1, 2, 3] as TipoMuro[]) {
    const inp = base(tipo === 2 ? { bTalon: 0 } : tipo === 3 ? { bPunta: 0 } : {});

    it(`tipo ${tipo}: sólo cambian las celdas, el HANDSEED, la nota y las segundas líneas`, () => {
      const plantilla = leerPlantilla(tipo);
      const salida = rellenarMuro(plantilla, inp);
      const antes = plantilla.split(/\r\n|\n/);
      const despues = salida.split(/\r\n|\n/);
      // As1 y As2 vienen de una línea en la plantilla y su valor no cabe: cada
      // una estrena un TEXT clonado. Y la nota, otro TEXT de 13 pares.
      const partidas = 2;
      expect(despues.length).toBeGreaterThan(antes.length + 26);
      // Ninguna línea de la plantilla desaparece salvo las celdas y el
      // HANDSEED. Se cuenta como multiconjunto y no por posición porque la
      // nota se inserta en medio y corre todo lo que va detrás.
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
      expect(perdidas.length).toBeLessThanOrEqual(TEXTOS_DE_FILA[tipo] + 1 + 2 * partidas);
      // Y no se pierde ninguna entidad: los TEXT son los de antes más los nuevos.
      const cuenta = (t: string, txt: string) => txt.split(`\r\n${t}\r\n`).length - 1;
      const original = plantilla.replace(/\r?\n/g, '\r\n');
      expect(cuenta('TEXT', salida)).toBe(cuenta('TEXT', original) + 1 + partidas);
      for (const t of ['LINE', 'LWPOLYLINE', 'CIRCLE', 'DIMENSION', 'MTEXT', 'HATCH', 'INSERT']) {
        expect(cuenta(t, salida), t).toBe(cuenta(t, original));
      }
      // Las secciones siguen ahí.
      for (const s of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) {
        expect(salida).toContain(`\r\n${s}\r\n`);
      }
      expect(salida.trimEnd().endsWith('EOF')).toBe(true);
    });

    it(`tipo ${tipo}: pares completos y manejadores sin repetir`, () => {
      const lineas = rellenarMuro(leerPlantilla(tipo), inp).split('\r\n');
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
      // incluidos los nuevos: el siguiente que asigne el CAD no chocará.
      const iSeed = lineas.findIndex((l) => l.trim() === '$HANDSEED');
      const seed = parseInt(lineas[iSeed + 2].trim(), 16);
      const usados = [...manejadores].map((h) => parseInt(h, 16)).filter(Number.isFinite);
      expect(seed).toBeGreaterThan(Math.max(...usados.filter((h) => h !== seed)));
    });
  }

  it('una plantilla que no es el plano tipo se rechaza con su motivo', () => {
    const inp = base();
    expect(() => rellenarMuro('esto no es un dxf', inp)).toThrow(ErrorPlantilla);
    expect(() => rellenarMuro('  0\r\nSECTION\r\n  2\r\nHEADER\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n', inp))
      .toThrow(/ENTITIES/);
  });

  it('el plano de encepados no cuela por muro, aunque su tabla también tenga As1', () => {
    // Sin este guardarraíl el relleno escribiría las cotas del muro en las
    // casillas del encepado —H, A, B y D se llaman igual— y el error saldría
    // en obra y no aquí.
    expect(() => rellenarMuro(readFileSync(join('public', 'plantillas', 'encepado-3.dxf'), 'utf8'), base()))
      .toThrow(/no es la de un muro/);
  });
});

describe('DXF de muros — el punto de entrada del botón', () => {
  afterEach(() => vi.unstubAllGlobals());

  const conPlantilla = (tipo: TipoMuro) => {
    const mock = vi.fn(async () => ({ ok: true, text: async () => leerPlantilla(tipo) }) as unknown as Response);
    vi.stubGlobal('fetch', mock);
    return mock;
  };

  it('pide la plantilla de su tipo y la nota lleva el título recién tecleado, no el del estado', async () => {
    const fetchMock = conPlantilla(1);
    // El estado todavía dice «viejo»: setField es un setState y al exportar no
    // ha vuelto a pintar. El título bueno llega por parámetro.
    const { blob, filename } = await exportarMuroDxf(base({ title: 'viejo' }), 'Muro M-3');
    expect(fetchMock).toHaveBeenCalledWith('/plantillas/muro-1.dxf');
    expect(filename).toBe('muro-m-3.dxf');
    const dxf = await blob.text();
    expect(notas(dxf)[0]).toBe('Muro M-3 · HA-25 · B500S · rec. 4 cm');
    expect(dxf).not.toContain('viejo');
    expect(blob.type).toBe('image/vnd.dxf');
  });

  it('un muro sin puntera se lleva el plano sin puntera', async () => {
    const fetchMock = conPlantilla(3);
    await exportarMuroDxf(base({ bPunta: 0 }), 'Muro del lindero');
    expect(fetchMock).toHaveBeenCalledWith('/plantillas/muro-3.dxf');
  });

  it('sin título, el nombre lleva el tipo y la fecha', async () => {
    conPlantilla(2);
    const { filename } = await exportarMuroDxf(base({ bTalon: 0, title: '' }), '');
    expect(filename).toMatch(/^concreta-muro-tipo2-\d{4}-\d{2}-\d{2}\.dxf$/);
  });

  it('si la plantilla no llega, falla con su motivo en vez de bajar un fichero vacío', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));
    await expect(exportarMuroDxf(base(), 'x')).rejects.toThrow(ErrorPlantilla);
  });
});

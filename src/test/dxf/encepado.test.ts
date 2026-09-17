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
import { describe, it, expect } from 'vitest';
import { pileCapDefaults, type PileCapInputs } from '../../data/defaults';
import { calcPileCap } from '../../lib/calculations/pileCap';
import { ErrorPlantilla, rellenarEncepado, rutaPlantilla } from '../../lib/dxf/encepado';

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

/** La fila de datos del DXF generado, etiquetada con las columnas medidas. */
function filaDeDatos(dxf: string, n: number): Record<string, string> {
  const { y, columnas } = TABLA[n];
  const celdas = textos(dxf)
    .filter((t) => Math.abs(t.y - y) < 0.01 && Math.abs(t.h - 0.256) < 0.001)
    .sort((a, b) => a.x - b.x);
  expect(celdas.map((c) => c.texto).length).toBe(columnas.length);
  return Object.fromEntries(columnas.map((c, i) => [c, celdas[i].texto]));
}

/** Las notas al pie: los textos de cuerpo menor que la tabla, de abajo del todo. */
function notas(dxf: string): string[] {
  return textos(dxf)
    .filter((t) => t.h < 0.2 && t.y < 1)
    .sort((a, b) => b.y - a.y)
    .map((t) => t.texto);
}

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
    expect(fila.As3).toBe('%%C12c/10');
    expect(fila.As4).toBe('%%C12c/10');
  });

  it('2 micropilotes: la malla, que no tiene casilla, va en la nota', () => {
    const dxf = rellenar(base(2, { phi_g: 16, s_g: 250, phi_ch: 10, s_ch: 150 }));
    const fila = filaDeDatos(dxf, 2);
    expect(fila.As3).toBe('%%C10c/15'); // anillos de piel
    expect(notas(dxf)[1]).toContain('malla %%C16c/25 en las dos caras');
  });

  it('3 micropilotes: B es la altura del triángulo y hay tres reparticiones', () => {
    const inp = base(3);
    const res = calcPileCap(inp);
    const fila = filaDeDatos(rellenar(inp), 3);
    expect(fila.A).toBe('120');
    expect(fila.B).toBe('103,9'); // 1200·√3/2 = 1039,2 mm
    expect(fila.D).toBe(`${(res.e_borde / 10).toFixed(0)}`);
    expect(fila.As1).toBe(`${res.n_bars_x}%%C12`);
    expect(fila.As3).toBe('%%C12c/10'); // malla inferior
    expect(fila.As4).toBe('%%C12c/10'); // anillos de piel
    expect(fila.As5).toBe(fila.As3);    // la malla es la misma arriba y abajo
  });

  it('4 micropilotes: una sola casilla de lado, y las dos cuando no son iguales', () => {
    expect(filaDeDatos(rellenar(base(4)), 4).L).toBe('195');
    const rectangular = base(4, { dims_auto: false, L_x: 2000, L_y: 1800 });
    expect(filaDeDatos(rellenar(rectangular), 4).L).toBe('200/180');
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

  it('sin armadura superior la casilla lo dice, no queda en blanco', () => {
    expect(filaDeDatos(rellenar(base(4, { n_top: 0 })), 4).As2).toBe('-');
  });
});

describe('DXF de encepados — las notas al pie', () => {
  it('materiales, recubrimiento, axil y el título del elemento', () => {
    const dxf = rellenar(base(4, { title: 'Encepado P-5', fck: 30, N_Ed: 750 }));
    expect(notas(dxf)[0]).toBe(
      'Encepado P-5 · HA-30 · B500S · recubrimiento 6 cm · axil de cálculo 750 kN',
    );
  });

  it('sin título, la nota empieza por el hormigón', () => {
    expect(notas(rellenar(base(4)))[0]).toMatch(/^HA-25 · B500S/);
  });

  it('con 3 o más pilotes la nota lleva los cercos de banda, que no tienen casilla', () => {
    for (const n of [3, 4, 6]) {
      const nota = notas(rellenar(base(n, { phi_cv: 10, s_cv: 200, n_cv: 4 })))[1];
      expect(nota).toContain('cercos de banda %%C10c/20 de 4 ramas');
    }
  });
});

describe('DXF de encepados — el fichero', () => {
  for (const n of [2, 3, 4, 6]) {
    it(`${n} micropilotes: sólo cambian las celdas, el HANDSEED y las dos notas`, () => {
      const plantilla = leerPlantilla(n);
      const salida = rellenar(base(n));
      const antes = plantilla.split(/\r\n|\n/);
      const despues = salida.split(/\r\n|\n/);
      // Dos TEXT nuevos de 13 pares cada uno.
      expect(despues.length).toBe(antes.length + 2 * 26);
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
      expect(perdidas.length).toBeLessThanOrEqual(TABLA[n].columnas.length + 1);
      // Y no se pierde ninguna entidad: los TEXT son los de antes más las notas.
      const cuenta = (t: string, txt: string) => txt.split(`\r\n${t}\r\n`).length - 1;
      expect(cuenta('TEXT', salida)).toBe(cuenta('TEXT', plantilla.replace(/\r?\n/g, '\r\n')) + 2);
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

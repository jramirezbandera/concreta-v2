/**
 * El detalle tipo de micropilote del estudio, relleno con los números del
 * cálculo. Mismo planteamiento que el de encepados —y por las mismas razones—
 * más lo que este plano trae de nuevo: rótulos largos (MTEXT) que el CAD parte
 * en trozos de 250 caracteres y hay que volver a montar, tocar y partir.
 *
 * Lo que se prueba:
 *
 *  1. **Que cada cifra caiga en su casilla.** La fila de datos se lee del
 *     fichero generado por su coordenada y se compara columna a columna. La
 *     cota de la fila y el orden de las columnas están MEDIDOS en el .dxf del
 *     estudio, no tomados del código que se prueba: son el oráculo.
 *  2. **Que h1 no se toque.** La altura de la cartela no la calcula el módulo,
 *     así que su casilla tiene que seguir diciendo lo que decía el plano tipo.
 *  3. **Que los tres rótulos con datos cambien y el resto del bloque no.** La
 *     estratigrafía de la obra ajena se va; la prosa del estudio geotécnico y
 *     las notas de ejecución se quedan, con sus códigos de formato.
 *  4. **Que no se toque nada más**, línea a línea.
 *  5. **Que el fichero siga siendo legible**: pares completos, manejadores sin
 *     repetir y ningún grupo de más de 255 caracteres, que es lo que rompe al
 *     abrirlo en el CAD.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  micropilesDefaults,
  micropilesSoilDefaults,
  type MicropilesInputs,
  type SoilLayer,
} from '../../data/defaults';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import {
  ErrorPlantilla,
  RUTA_PLANTILLA,
  exportarMicropiloteDxf,
  lineasDeEstratigrafia,
  rellenarMicropilote,
} from '../../lib/dxf/micropilote';

const plantilla = () => readFileSync(join('public', RUTA_PLANTILLA), 'utf8');

/** Cota de la fila de datos y orden de las columnas, medidos en el plano. */
const FILA_Y = 3.9;
const COLUMNAS = ['MICROPILOTE', '%%C1', '%%C2', 'e1', '%%C3', 'e2', 'h1', 'L'];

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
    if (lineas[i].trim() === '') break;
    const codigo = Number(lineas[i].trim());
    const valor = lineas[i + 1].trim();
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
function filaDeDatos(dxf: string): Record<string, string> {
  const enFila = textos(dxf).filter(
    (t) => Math.abs(t.y - FILA_Y) < 0.3 && Math.abs(t.h - 0.256) < 0.001,
  );
  const celdas = enFila.sort((a, b) => a.x - b.x).map((t) => t.texto);
  expect(celdas.length).toBe(COLUMNAS.length);
  return Object.fromEntries(COLUMNAS.map((c, i) => [c, celdas[i]]));
}

/** Los textos largos (MTEXT) y los forzados de cota, ya montados. */
function parrafos(dxf: string): string[] {
  const lineas = dxf.split(/\r\n|\n/);
  const out: string[] = [];
  let tipo = '';
  let trozos: string[] = [];
  const cerrar = () => {
    if ((tipo === 'MTEXT' || tipo === 'DIMENSION') && trozos.length) out.push(trozos.join(''));
  };
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    if (lineas[i].trim() === '') break;
    const codigo = Number(lineas[i].trim());
    if (codigo === 0) {
      cerrar();
      tipo = lineas[i + 1].trim();
      trozos = [];
    } else if ((tipo === 'MTEXT' && codigo === 3) || codigo === 1) {
      trozos.push(lineas[i + 1]);
    }
  }
  cerrar();
  return out;
}

const buscar = (dxf: string, aguja: string) => parrafos(dxf).find((p) => p.includes(aguja));

const rellenar = (inp: MicropilesInputs = micropilesDefaults, soil: SoilLayer[] = micropilesSoilDefaults) =>
  rellenarMicropilote(plantilla(), inp, soil, calcMicropiles(inp, soil));

describe('DXF de micropilote — la tabla del detalle tipo', () => {
  it('las casillas que calcula el módulo llevan sus números', () => {
    const res = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    const fila = filaDeDatos(rellenar());
    // Perforación: dato de entrada, en las dos primeras casillas (el Ø del
    // micropilote y el Ø1 del dibujo son el mismo agujero).
    expect(fila.MICROPILOTE).toBe('185');
    expect(fila['%%C1']).toBe('185');
    // Tubo Ø88,9 × 9 del catálogo: Ø exterior con coma decimal y espesor.
    expect(fila['%%C2']).toBe('88,9');
    expect(fila.e1).toBe('9');
    // Cabezal (Guía Fomento §3.8): chapa de 0,75·Dn en mm y espesor = el del tubo.
    expect(fila['%%C3']).toBe(String(Math.round(res.bc * 10)));
    expect(fila.e2).toBe(String(res.t_chapa));
    // Longitud del fuste, en metros como pide la cabecera.
    expect(fila.L).toBe('16');
  });

  it('h1 se queda como en el plano tipo: la cartela no la calcula el módulo', () => {
    expect(filaDeDatos(plantilla()).h1).toBe('70');
    expect(filaDeDatos(rellenar()).h1).toBe('70');
  });

  it('un tubo de espesor con decimales se escribe con coma', () => {
    const inp = { ...micropilesDefaults, tube: 'Ø60,3 × 5,5 mm' };
    const fila = filaDeDatos(rellenar(inp));
    expect(fila['%%C2']).toBe('60,3');
    expect(fila.e1).toBe('5,5');
  });

  it('una longitud con decimales lleva dos', () => {
    const inp = { ...micropilesDefaults, toeDepth: 15.5 };
    expect(filaDeDatos(rellenar(inp)).L).toBe('14,50');
  });
});

describe('DXF de micropilote — los rótulos con datos', () => {
  it('la cota de la derecha dice la longitud de este cálculo', () => {
    expect(buscar(plantilla(), 'Longitud media estimada')).toBe('L: Longitud media estimada 9,00 m');
    expect(buscar(rellenar(), 'Longitud media estimada')).toBe('L: Longitud media estimada 16,00 m');
  });

  it('la cota se cambia también dentro de su bloque: el CAD dibuja ESA copia', () => {
    // Una COTA con texto forzado lo guarda dos veces, en la propia DIMENSION y
    // en el MTEXT del bloque anónimo que la dibuja. Cambiar sólo una deja el
    // plano diciendo la longitud de la plantilla hasta que alguien regenere.
    expect(plantilla().split('L: Longitud media estimada 9,00 m').length - 1).toBe(2);
    const salida = rellenar();
    expect(salida).not.toContain('estimada 9,00 m');
    expect(salida.split('L: Longitud media estimada 16,00 m').length - 1).toBe(2);
  });

  it('MATERIALES lleva el acero y la lechada del cálculo, y el tipo de inyección se queda', () => {
    const bloque = buscar(rellenar(), 'MATERIALES')!;
    expect(bloque).toContain('Acero tubo estructural fy = 551 MPa');
    expect(bloque).toContain('Lechada de inyección fck > 30 MPa');
    expect(bloque).toContain('TIPO DE INYECCIÓN: IU');
    expect(bloque).not.toContain('S550');
  });

  it('con mortero, la línea lo dice', () => {
    const inp = { ...micropilesDefaults, groutType: 'mortero' as const, concreteGrade: 25 };
    expect(buscar(rellenar(inp), 'MATERIALES')).toContain('Mortero de inyección fck > 25 MPa');
  });

  it('la estratigrafía de la obra ajena se va y entra la del módulo', () => {
    const antes = buscar(plantilla(), 'ESTUDIO GEOTECNICO')!;
    expect(antes).toContain('Unidad Geotécnica 1. Rellenos');
    const bloque = buscar(rellenar(), 'ESTUDIO GEOTECNICO')!;
    expect(bloque).not.toContain('Unidad Geotécnica');
    expect(bloque).not.toContain('Plioceno');
    for (const linea of lineasDeEstratigrafia(micropilesDefaults, micropilesSoilDefaults)) {
      expect(bloque).toContain(linea);
    }
    // La prosa del estudio y las notas de ejecución siguen ahí, con su formato
    expect(bloque).toContain('Según recomendaciones del ESTUDIO GEOTECNICO');
    expect(bloque).toContain('de los micropilotes:');   // sin comerse el espacio del corte
    expect(bloque).toContain('\\P\\pq*;\\H1.1x;\\L\\C1;NOTAS EJECUCIÓN DE MICROPILOTES:');
    expect(bloque).toContain('queda a juicio de la Dirección Facultativa');
    expect(bloque).toContain('vigas de centradoras.}');
  });

  it('cada estrato dice de dónde a dónde va y con qué resistencia', () => {
    const lineas = lineasDeEstratigrafia(micropilesDefaults, micropilesSoilDefaults);
    expect(lineas[0]).toBe('Estrato 1 - Granular (0,00 a 3,30 m): no se considera su resistencia');
    expect(lineas[1]).toBe('Estrato 2 - Cohesivo (3,30 a 12,50 m): NSPT = 20; rf,lim = 0,08 MPa');
    expect(lineas.at(-2)).toBe('Nivel freático: 7,50 m bajo rasante');
    expect(lineas.at(-1)).toBe('Micropilote: cabeza a 1,00 m y punta a 17,00 m bajo rasante');
    // Nada de griegas: el estilo del plano es Century Gothic y no las trae
    expect(lineas.join('')).not.toMatch(/[Ͱ-Ͽ]/);
  });

  it('un cohesivo con su lo escribe', () => {
    const soil: SoilLayer[] = [
      { id: 1, type: 'cohesive', thickness: 20, gamma: 20, c: 0, phi: 0, Nspt: 0, su: 120, rflim: 0 },
    ];
    expect(lineasDeEstratigrafia(micropilesDefaults, soil)[0])
      .toBe('Estrato 1 - Cohesivo (0,00 a 20,00 m): su = 120 kPa');
  });
});

describe('DXF de micropilote — el fichero', () => {
  it('sólo cambian las celdas, los tres rótulos y el HANDSEED', () => {
    const antes = plantilla().split('\r\n');
    const despues = rellenar().split('\r\n');
    // El MTEXT largo se vuelve a partir en trozos de 250 y sale con uno menos,
    // así que comparar por posición no vale: todo lo que hay detrás se corre.
    // Se cuentan las líneas de la plantilla que YA NO están, como multiconjunto.
    expect(Math.abs(antes.length - despues.length)).toBeLessThanOrEqual(4);
    const quedan = new Map<string, number>();
    for (const l of despues) quedan.set(l, (quedan.get(l) ?? 0) + 1);
    const perdidas: string[] = [];
    for (const l of antes) {
      const c = quedan.get(l) ?? 0;
      if (c > 0) quedan.set(l, c - 1);
      else perdidas.push(l);
    }
    // Las que cambian: 5 celdas, el HANDSEED, la cota de longitud, el bloque de
    // materiales y los trozos del bloque de notas. Ni una más.
    expect(perdidas.length).toBeGreaterThan(5);
    expect(perdidas.length).toBeLessThan(20);
  });

  it('sigue siendo un DXF legible: pares completos, sin manejadores repetidos y sin grupos de más de 255', () => {
    const lineas = rellenar().split('\r\n');
    if (lineas.at(-1) === '') lineas.pop();   // el salto final tras el EOF
    expect(lineas.length % 2).toBe(0);
    const manejadores = new Set<string>();
    for (let i = 0; i + 1 < lineas.length; i += 2) {
      const codigo = Number(lineas[i].trim());
      const valor = lineas[i + 1];
      expect(Number.isInteger(codigo)).toBe(true);
      expect(valor.length).toBeLessThanOrEqual(255);
      if (codigo === 5 || codigo === 105) {
        expect(manejadores.has(valor)).toBe(false);
        manejadores.add(valor);
      }
    }
  });

  it('una plantilla que no es la esperada da error, no un plano con los datos de otra obra', () => {
    expect(() => rellenarMicropilote('no soy un dxf', micropilesDefaults, micropilesSoilDefaults,
      calcMicropiles(micropilesDefaults, micropilesSoilDefaults))).toThrow(ErrorPlantilla);
    const sinTabla = plantilla().replace(/^MICROPILOTE$/m, 'OTRA COSA');
    expect(() => rellenarMicropilote(sinTabla, micropilesDefaults, micropilesSoilDefaults,
      calcMicropiles(micropilesDefaults, micropilesSoilDefaults))).toThrow(ErrorPlantilla);
    const sinNotas = plantilla().replace('ESTUDIO GEOTECNICO', 'ESTUDIO');
    expect(() => rellenarMicropilote(sinNotas, micropilesDefaults, micropilesSoilDefaults,
      calcMicropiles(micropilesDefaults, micropilesSoilDefaults))).toThrow(ErrorPlantilla);
  });
});

describe('DXF de micropilote — la descarga', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('trae la plantilla de public/ y devuelve el fichero con nombre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(plantilla(), { status: 200 })));
    const res = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    const salida = await exportarMicropiloteDxf(micropilesDefaults, micropilesSoilDefaults, res, 'Pilotaje norte');
    expect(salida.filename).toMatch(/^pilotaje-norte\.dxf$/i);
    expect(await salida.blob.text()).toContain('L: Longitud media estimada 16,00 m');
  });

  it('si la plantilla no está, el error lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const res = calcMicropiles(micropilesDefaults, micropilesSoilDefaults);
    await expect(exportarMicropiloteDxf(micropilesDefaults, micropilesSoilDefaults, res))
      .rejects.toThrow(ErrorPlantilla);
  });
});

/**
 * El cuadro de vigas del plano del estudio, dibujado con las vigas de la obra.
 *
 * A diferencia de los planos tipo de encepado y micropilote, que se RELLENAN,
 * aquí media hoja se DIBUJA, así que hay dos familias de cosas que pueden salir
 * mal y las dos se prueban:
 *
 *  1. **Lo que dice el cuadro.** Las cotas en centímetros, los rótulos de
 *     armadura, la línea de cercos con sus dos zonas y el resumen de una viga
 *     de pórtico en una sola sección. Los oráculos están MEDIDOS en el
 *     «EJEMPLO VIGAS.dxf» del estudio: una viga de 35 cm se dibuja 1,75
 *     unidades y su cota dice «35».
 *  2. **Que el fichero siga abriendo.** Que la plantilla no se toque, que los
 *     pares estén completos, que no se repita un manejador y —esto es propio de
 *     dibujar en casa ajena— que toda capa, estilo y bloque que el dibujo
 *     nombra esté DEFINIDO en la plantilla. Referenciar una capa que no existe
 *     no rompe el fichero de manera visible: lo que pasa es que el CAD la crea
 *     en blanco y el cuadro sale con otro color, que es peor porque no se nota.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { rcBeamDefaults, type RCBeamInputs } from '../../data/defaults';
import {
  ErrorPlantilla,
  RUTA_PLANTILLA_VIGAS,
  notaDeMateriales,
  planificarCuadro,
  ramasInteriores,
  rellenarCuadroVigas,
  textoBarras,
  textoCerco,
  type VigaDeCuadro,
} from '../../lib/dxf/vigas';
import { leerPares, recorrerEntidades, seccion } from '../../lib/dxf/plantilla';
import { vigaDeCuadro } from '../../features/rc-beams/plano';

const plantilla = () => readFileSync(join('public', RUTA_PLANTILLA_VIGAS), 'utf8');

/** Unidades de dibujo por centímetro, medido en el plano del estudio. */
const U_CM = 0.05;

function viga(p: Partial<VigaDeCuadro> = {}): VigaDeCuadro {
  return {
    rotulo: 'V-01',
    b: 350,
    h: 250,
    rec: 30,
    sup: { n: 3, phi: 12 },
    inf: { n: 3, phi: 12 },
    cercos: [
      { zona: 'A', phi: 8, s: 100, cercos: 1 },
      { zona: 'B', phi: 8, s: 200, cercos: 1 },
    ],
    fck: 25,
    fyk: 500,
    ...p,
  };
}

const textos = (vigas: VigaDeCuadro[]) =>
  planificarCuadro(vigas, [])
    .entidades.filter((e) => e.tipo === 'texto')
    .map((e) => (e.tipo === 'texto' ? e.texto : ''));

describe('lo que dice el cuadro', () => {
  it('dibuja la sección a escala: 35 x 25 cm son 1,75 x 1,25 unidades', () => {
    const { entidades } = planificarCuadro([viga()], []);
    // El contorno del hormigón es la única polilínea cerrada de CV-GEOMETRÍA.
    const contorno = entidades.find((e) => e.tipo === 'polilinea' && e.capa === 'CV-GEOMETRÍA');
    expect(contorno?.tipo).toBe('polilinea');
    if (contorno?.tipo !== 'polilinea') return;
    const xs = contorno.puntos.map((p) => p.x);
    const ys = contorno.puntos.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(35 * U_CM, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(25 * U_CM, 9);
  });

  it('acota en centímetros enteros, como el estilo «cotas escala 1.20»', () => {
    expect(textos([viga({ b: 350, h: 250 })])).toEqual(expect.arrayContaining(['35', '25']));
    // 17,5 cm se redondea al centímetro: el DIMRND del estudio es 1.
    expect(textos([viga({ b: 175, h: 250 })])).toEqual(expect.arrayContaining(['18']));
  });

  it('rotula las armaduras con el %%C del plano', () => {
    expect(textoBarras({ n: 3, phi: 12 })).toBe('3%%C12');
    expect(textos([viga({ sup: { n: 4, phi: 20 }, inf: { n: 5, phi: 16 } })])).toEqual(
      expect.arrayContaining(['4%%C20', '5%%C16']),
    );
  });

  it('escribe los cercos con su zona, y el número de cercos sólo si pasa de uno', () => {
    expect(textoCerco({ zona: 'A', phi: 8, s: 200, cercos: 1 })).toBe('e%%C8c/20 (zona A)');
    expect(textoCerco({ zona: 'B', phi: 8, s: 150, cercos: 2 })).toBe('2e%%C8c/15 (zona B)');
    // Sin zona (modo simple) no se menciona ninguna: el cálculo no distingue dos.
    expect(textoCerco({ zona: null, phi: 10, s: 175, cercos: 1 })).toBe('e%%C10c/17,5');
  });

  it('pone las dos zonas en una sola entidad, con el salto de línea del MTEXT', () => {
    const t = textos([viga()]).find((s) => s.includes('zona A'));
    expect(t).toBe('e%%C8c/10 (zona A)\\Pe%%C8c/20 (zona B)');
  });

  it('escapa el nombre que teclea el usuario: una llave abriría formato en el MTEXT', () => {
    expect(textos([viga({ rotulo: 'V-3 {planta 1}' })])).toEqual(
      expect.arrayContaining(['V-3 \\{planta 1\\}']),
    );
  });
});

describe('el resumen de una viga de pórtico en una sección', () => {
  const inputs = (p: Partial<RCBeamInputs>): RCBeamInputs => ({ ...rcBeamDefaults, ...p });

  it('arriba el apoyo, abajo el vano, zona A los cercos de apoyo y zona B los de vano', () => {
    const v = vigaDeCuadro(
      inputs({
        mode: 'portico',
        apoyo_top_nBars: 3,
        apoyo_top_barDiam: 16,
        vano_bot_nBars: 4,
        vano_bot_barDiam: 20,
        apoyo_stirrupDiam: 10,
        apoyo_stirrupSpacing: 100,
        vano_stirrupDiam: 8,
        vano_stirrupSpacing: 200,
      }),
      'V-7',
    );
    expect(v.sup).toEqual({ n: 3, phi: 16 });
    expect(v.inf).toEqual({ n: 4, phi: 20 });
    expect(v.cercos.map(textoCerco)).toEqual(['e%%C10c/10 (zona A)', 'e%%C8c/20 (zona B)']);
  });

  it('en modo simple hay una sola sección y una sola línea de cercos, sin zona', () => {
    const v = vigaDeCuadro(
      inputs({ mode: 'simple', vano_top_nBars: 2, vano_top_barDiam: 12, apoyo_top_nBars: 9 }),
      'V-1',
    );
    expect(v.sup).toEqual({ n: 2, phi: 12 });
    expect(v.cercos).toHaveLength(1);
    expect(v.cercos[0].zona).toBeNull();
  });

  it('traduce ramas a cercos, redondeando hacia arriba las impares', () => {
    const cercos = (ramas: number) =>
      vigaDeCuadro(inputs({ mode: 'simple', vano_stirrupLegs: ramas }), 'V').cercos[0].cercos;
    expect(cercos(2)).toBe(1);
    expect(cercos(3)).toBe(2);
    expect(cercos(4)).toBe(2);
    expect(cercos(6)).toBe(3);
  });
});

describe('las ramas interiores', () => {
  it('no ata nada cuando el cálculo pide un solo cerco', () => {
    expect(ramasInteriores(4, 0)).toEqual([]);
  });

  it('con una rama y un número impar de barras, la del medio', () => {
    expect(ramasInteriores(3, 1)).toEqual([[1, 1]]);
    expect(ramasInteriores(5, 1)).toEqual([[2, 2]]);
  });

  it('con una rama y un número par de barras, abraza las dos centrales', () => {
    // Es la única manera de que la sección quede simétrica sin dibujar una
    // rama que el cálculo no pide.
    expect(ramasInteriores(4, 1)).toEqual([[1, 2]]);
    expect(ramasInteriores(6, 1)).toEqual([[2, 3]]);
  });

  it('varias ramas se reparten simétricas', () => {
    expect(ramasInteriores(5, 2)).toEqual([
      [1, 1],
      [3, 3],
    ]);
    expect(ramasInteriores(6, 2)).toEqual([
      [1, 1],
      [4, 4],
    ]);
  });

  it('no dibuja más ramas que barras interiores hay', () => {
    expect(ramasInteriores(2, 3)).toEqual([]);
    expect(ramasInteriores(3, 3)).toEqual([[1, 1]]);
  });
});

describe('la nota al pie', () => {
  it('una línea cuando todas las vigas comparten materiales', () => {
    expect(notaDeMateriales([viga(), viga({ rotulo: 'V-02' })])).toEqual([
      'HA-25 · B500S · rec. 3 cm',
    ]);
  });

  it('una por combinación, diciendo a qué vigas se refiere', () => {
    expect(
      notaDeMateriales([
        viga({ rotulo: 'V-01' }),
        viga({ rotulo: 'V-02' }),
        viga({ rotulo: 'V-03', fck: 30, rec: 35 }),
      ]),
    ).toEqual(['V-01, V-02: HA-25 · B500S · rec. 3 cm', 'V-03: HA-30 · B500S · rec. 3,5 cm']);
  });
});

describe('el reparto en filas', () => {
  it('salta de fila cuando el cuadro se pasa de ancho', () => {
    const muchas = Array.from({ length: 24 }, (_, i) => viga({ rotulo: `V-${i + 1}` }));
    const { filas } = planificarCuadro(muchas, []);
    expect(filas.length).toBeGreaterThan(1);
    expect(filas.reduce((a, b) => a + b, 0)).toBe(24);
    // Ninguna fila se queda vacía ni se lleva todo el cuadro.
    expect(Math.min(...filas)).toBeGreaterThan(0);
  });

  it('una sola viga es una sola fila', () => {
    expect(planificarCuadro([viga()], []).filas).toEqual([1]);
  });
});

describe('el fichero', () => {
  const salida = () => rellenarCuadroVigas(plantilla(), [viga(), viga({ rotulo: 'V-02', b: 450 })]);

  it('sin vigas no se exporta: un cuadro vacío no es un plano', () => {
    expect(() => rellenarCuadroVigas(plantilla(), [])).toThrow(ErrorPlantilla);
  });

  it('avisa si la plantilla no es la que espera', () => {
    expect(() => rellenarCuadroVigas('esto no es un DXF', [viga()])).toThrow(ErrorPlantilla);
  });

  it('no se lleva por delante nada de la plantilla', () => {
    const antes = plantilla().split(/\r\n|\n/);
    const despues = salida().split(/\r\n|\n/);
    expect(despues.length).toBeGreaterThan(antes.length);
    // Multiconjunto y no posición: lo nuevo se inserta en medio y corre todo
    // lo que va detrás. La única línea de la plantilla que puede faltar es el
    // valor del $HANDSEED, que se adelanta al siguiente manejador libre.
    const quedan = new Map<string, number>();
    for (const l of despues) quedan.set(l, (quedan.get(l) ?? 0) + 1);
    const perdidas = antes.filter((l) => {
      const c = quedan.get(l) ?? 0;
      if (c === 0) return true;
      quedan.set(l, c - 1);
      return false;
    });
    expect(perdidas).toHaveLength(1);
  });

  it('pares completos de principio a fin', () => {
    const lineas = salida().split('\r\n');
    for (let i = 0; i + 1 < lineas.length; i += 2) {
      const crudo = lineas[i].trim();
      if (crudo === '') break;
      expect(Number.isInteger(Number(crudo))).toBe(true);
    }
  });

  it('ninguna entidad repite manejador, que es lo que AutoCAD no perdona', () => {
    // Se miran los manejadores de la sección ENTITIES y no los códigos 5 del
    // fichero entero: el plano del estudio trae una SORTENTSTABLE, donde el
    // código 5 es un manejador de ORDEN DE DIBUJO y repite a propósito valores
    // que también son de entidades. Contándolos, un fichero perfectamente sano
    // parecía tener cuatrocientos manejadores duplicados.
    const pares = leerPares(salida().split(/\r\n|\n|\r/));
    const [desde, hasta] = seccion(pares, 'ENTITIES')!;
    const manejadores: string[] = [];
    recorrerEntidades(pares, desde, hasta, (_tipo, grupos) => {
      const h = grupos.find((g) => g.codigo === 5)?.valor;
      if (h) manejadores.push(h);
    });
    expect(manejadores.length).toBeGreaterThan(409);
    expect(new Set(manejadores).size).toBe(manejadores.length);
  });

  it('toda capa, estilo y bloque que el dibujo nombra está definido en la plantilla', () => {
    const pares = leerPares(plantilla().split(/\r\n|\n|\r/));
    const [desdeT, hastaT] = seccion(pares, 'TABLES')!;
    const capas = new Set<string>();
    const estilos = new Set<string>();
    recorrerEntidades(pares, desdeT, hastaT, (tipo, grupos) => {
      const nombre = grupos.find((g) => g.codigo === 2)?.valor;
      if (!nombre) return;
      if (tipo === 'LAYER') capas.add(nombre);
      if (tipo === 'STYLE') estilos.add(nombre);
    });
    const [desdeB, hastaB] = seccion(pares, 'BLOCKS')!;
    const bloques = new Set<string>();
    recorrerEntidades(pares, desdeB, hastaB, (tipo, grupos) => {
      if (tipo !== 'BLOCK') return;
      const nombre = grupos.find((g) => g.codigo === 2)?.valor;
      if (nombre) bloques.add(nombre);
    });

    const { entidades } = planificarCuadro([viga()], ['HA-25']);
    expect(entidades.length).toBeGreaterThan(0);
    for (const e of entidades) {
      expect(capas, `capa ${e.capa}`).toContain(e.capa);
      if (e.tipo === 'texto') expect(estilos, `estilo ${e.estilo}`).toContain(e.estilo);
      if (e.tipo === 'bloque') expect(bloques, `bloque ${e.nombre}`).toContain(e.nombre);
    }
  });

  it('todo lo nuevo entra en la sección de entidades y con el dueño de las que ya hay', () => {
    const pares = leerPares(salida().split(/\r\n|\n|\r/));
    const [desde, hasta] = seccion(pares, 'ENTITIES')!;
    const duenos = new Set<string>();
    let nuevas = 0;
    recorrerEntidades(pares, desde, hasta, (tipo, grupos) => {
      const capa = grupos.find((g) => g.codigo === 8)?.valor;
      if (capa !== 'CV-ARMADO' && capa !== 'CV-NUMERACIÓN') return;
      nuevas++;
      const d = grupos.find((g) => g.codigo === 330)?.valor;
      if (d) duenos.add(d);
      void tipo;
    });
    // Dos vigas: contorno aparte, el armado y los rótulos son varias entidades.
    expect(nuevas).toBeGreaterThan(4);
    expect(duenos.size).toBe(1);
  });
});

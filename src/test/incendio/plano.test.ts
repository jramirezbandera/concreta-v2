/**
 * El cuadro del plano: qué dice, y sobre todo qué NO dice.
 *
 * El módulo produce DOS documentos de los mismos datos, y la diferencia entre
 * ellos no es de espacio sino de qué se está firmando en cada papel. La memoria
 * comprueba: puede escribir «el soporte P1 alcanza R 120 por su propia sección
 * (tabla C.2, opción 250/45)». El plano manda: dice qué R se exige y qué hay
 * que poner en obra, y no certifica ninguna sección.
 *
 * Lo que se fija aquí:
 *
 *  - la columna «cómo alcanza la R» NO está en el plano, ni siquiera cuando
 *    todos los elementos llegan solos;
 *  - las protecciones SÍ, porque un revestimiento es una partida que alguien
 *    tiene que ejecutar y lo que no está en el plano no se ejecuta;
 *  - y toda cifra de protección arrastra su «orientativo», una sola vez: en un
 *    plano, un espesor sin ese rótulo se compra.
 */

import { describe, expect, it } from 'vitest';
import type { Block } from '../../lib/memoria/model';
import { entradaHormigonInicial } from '../../lib/incendio/anejoC';
import { entradaAceroInicial } from '../../lib/incendio/anejoD';
import { cuadroIncendioPlano, TITULO_INCENDIO_PLANO } from '../../lib/incendio/cuadros';
import { resolverElementos, type ElementoEntrada } from '../../lib/incendio/elementos';
import { claseUso, resolverSectores, type SectorEntrada } from '../../lib/incendio/sectores';

const sector = (o: Partial<SectorEntrada> = {}): SectorEntrada => ({
  id: 's1',
  nombre: 'Plantas sobre rasante',
  clase: claseUso('residencialVivienda'),
  sotano: false,
  robotizado: false,
  adosada: false,
  bajoCubiertaSinRiesgo: false,
  minutosManual: null,
  anejoB: null,
  ...o,
});

const elemento = (o: Partial<ElementoEntrada> = {}): ElementoEntrada => ({
  id: 'e1',
  nombre: 'Soportes',
  sectorId: 's1',
  exigidaManual: null,
  material: 'hormigon',
  hormigon: { ...entradaHormigonInicial(), tipo: 'soporte', b: 300, h: 300, rnom: 35, dCerco: 8, dBarra: 20 },
  acero: entradaAceroInicial(),
  proteccion: { familia: '', lambda: null },
  ...o,
});

/** Vivienda a 10 m: la tabla 3.1 pide R 60. */
const sectores = (o: Partial<SectorEntrada> = {}) => resolverSectores([sector(o)], 10);

function plano(elementos: ElementoEntrada[] = [], s: Partial<SectorEntrada> = {}): Block[] {
  const ss = sectores(s);
  const resueltos = resolverElementos(elementos, ss);
  const exigencias = ss
    .filter((x) => x.minutos !== null)
    .map((x) => ({ ambito: x.nombre, minutos: x.minutos as number }));
  return cuadroIncendioPlano({ hormigon: true }, exigencias, {
    alturaEvacuacion: 10,
    alturaAMano: false,
    sectores: ss,
    sueltas: [],
    elementos: resueltos,
  });
}

const texto = (bs: Block[]) => JSON.stringify(bs);
const titulos = (bs: Block[]) => bs.filter((b) => b.kind === 'heading').map((b) => (b.kind === 'heading' ? b.text : ''));

describe('lo que el cuadro del plano enuncia', () => {
  it('el título, la altura de evacuación y la R de cada parte', () => {
    const bs = plano();
    expect(titulos(bs)).toContain(TITULO_INCENDIO_PLANO);
    expect(texto(bs)).toContain('Altura de evacuación');
    expect(texto(bs)).toContain('10,00 m');
    const tabla = bs.find((b) => b.kind === 'table');
    expect(tabla?.kind === 'table' && tabla.head).toEqual(['Parte de la estructura', 'Exigida']);
    expect(tabla?.kind === 'table' && tabla.rows).toEqual([['Plantas sobre rasante', 'R 60']]);
  });

  it('y la nota de las dos vías, que es la de siempre', () => {
    const notas = plano().filter((b) => b.kind === 'notes');
    expect(JSON.stringify(notas)).toContain('bien por su propia configuración');
    expect(JSON.stringify(notas)).toContain('bien disponiendo protecciones adicionales');
  });

  it('sin nada que decir no sale cuadro ninguno', () => {
    expect(cuadroIncendioPlano({}, [])).toEqual([]);
  });
});

describe('lo que el cuadro del plano NO dice', () => {
  it('no certifica una sección que llega sola: ni la nombra', () => {
    // El pilar de 300 con 35 de recubrimiento pasa R 60 de sobra. En la memoria
    // sale con su tabla y su opción; aquí no tiene nada que pedirle a nadie.
    const bs = plano([elemento()]);
    expect(texto(bs)).not.toContain('Por su propia sección');
    expect(texto(bs)).not.toContain('tabla C.2');
    expect(texto(bs)).not.toContain('Soportes');
  });

  it('ni pone la columna «cómo alcanza la R» de la memoria', () => {
    const cabeceras = plano([elemento()])
      .filter((b) => b.kind === 'table')
      .flatMap((b) => (b.kind === 'table' ? b.head : []));
    expect(cabeceras).not.toContain('Cómo alcanza la R');
  });
});

describe('las protecciones sí entran, y como requisito', () => {
  /** Viga 250×500 con 40 al eje a la que le piden R 120: le faltan 5 mm. */
  const viga = (proteccion = 'morteroYeso') =>
    elemento({
      id: 'e2',
      nombre: 'Vigas',
      hormigon: {
        ...entradaHormigonInicial(),
        tipo: 'vigaTresCaras',
        b: 250,
        h: 500,
        rnom: 22,
        dCerco: 8,
        dBarra: 20,
      },
      proteccion: { familia: proteccion, lambda: null },
    });

  it('el elemento que no llega solo sale con lo que hay que ponerle', () => {
    const bs = plano([viga()], { minutosManual: 120 });
    expect(titulos(bs)).toContain('PROTECCIONES PREVISTAS');
    const tabla = bs.filter((b) => b.kind === 'table')[1];
    expect(tabla?.kind === 'table' && tabla.head).toEqual(['Elemento', 'R exigida', 'Protección']);
    expect(texto(bs)).toContain('Vigas');
    expect(texto(bs)).toContain('R 120');
    expect(texto(bs)).toContain('Revestimiento de mortero de yeso');
  });

  it('con la coletilla del marcado CE, y UNA sola vez', () => {
    const t = texto(plano([viga(), { ...viga(), id: 'e3', nombre: 'Vigas de cubierta' }], { minutosManual: 120 }));
    expect((t.match(/marcado CE o por el ensayo UNE-EN 13381/g) ?? []).length).toBe(1);
  });

  it('sin elementos protegidos no hay tabla de protecciones ni coletilla', () => {
    const t = texto(plano([elemento()]));
    expect(t).not.toContain('PROTECCIONES PREVISTAS');
    expect(t).not.toContain('marcado CE o por el ensayo UNE-EN 13381');
  });
});

describe('una obra vieja, sin sectores', () => {
  it('imprime las exigencias sueltas, que es lo que el cuadro de materiales imprimía', () => {
    const bs = cuadroIncendioPlano({ hormigon: true }, [
      { ambito: 'toda la estructura', minutos: 90 },
    ]);
    const tabla = bs.find((b) => b.kind === 'table');
    expect(tabla?.kind === 'table' && tabla.rows).toEqual([['toda la estructura', 'R 90']]);
    // Sin sectores no hay cadena de cotas que enseñar, así que tampoco altura.
    expect(texto(bs)).not.toContain('Altura de evacuación');
  });
});

/**
 * De la R exigida a cómo la alcanza cada elemento.
 *
 * Es la juntura de las dos mitades del módulo, y lo que se fija aquí es la
 * distinción que la memoria tiene que saber hacer: «aguanta por su propia
 * sección», «necesita protección» y «con estas tablas no se puede decir». Las
 * tres son respuestas distintas y la tercera NO es un suspenso: confundirla con
 * un «no cumple» haría que alguien reforzara una estructura por un dato que
 * falta, y confundirla con un «cumple» es peor todavía.
 */

import { describe, expect, it } from 'vitest';
import { entradaHormigonInicial } from '../../lib/incendio/anejoC';
import { entradaAceroInicial } from '../../lib/incendio/anejoD';
import { bloquesElementos } from '../../lib/incendio/cuadros';
import {
  resolverElementos,
  resumenElementos,
  type ElementoEntrada,
} from '../../lib/incendio/elementos';
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
  ...o,
});

/** Un sector de vivienda a 10 m: la tabla 3.1 le pide R 60. */
const sectores = (o: Partial<SectorEntrada> = {}) => resolverSectores([sector(o)], 10);

const uno = (e: Partial<ElementoEntrada> = {}, s: Partial<SectorEntrada> = {}) =>
  resolverElementos([elemento(e)], sectores(s))[0];

describe('de dónde sale la R que se le exige', () => {
  it('del sector al que pertenece', () => {
    const r = uno();
    expect(r.exigida).toBe(60);
    expect(r.sector).toBe('Plantas sobre rasante');
  });

  it('y tecleada a mano manda sobre la del sector', () => {
    expect(uno({ exigidaManual: 180 }).exigida).toBe(180);
  });

  it('sin sector ni R tecleada, el elemento se describe pero no se juzga', () => {
    const r = uno({ sectorId: '' });
    expect(r.exigida).toBeNull();
    expect(r.via).toBe('sinResolver');
    // Y NO es un hueco: describir una sección y no haberle asignado sector
    // todavía es un estado de trabajo legítimo.
    expect(r.hueco).toBe(false);
  });
});

describe('las tres vías', () => {
  it('un soporte 300×300 aguanta los R 60 de la vivienda por su propia sección', () => {
    const r = uno();
    expect(r.via).toBe('propia');
    expect(r.alcanza).toBe(120);
    expect(r.justificacion).toContain('tabla C.2');
  });

  it('el mismo soporte en un sector que pide R 180 necesita protección, y se dice cuánto le falta', () => {
    const r = uno({}, { clase: claseUso('comercial'), minutosManual: 180 });
    expect(r.via).toBe('proteccion');
    expect(r.alcanza).toBe(120);
    expect(r.loQueFalta).toContain('pide 350 mm de lado y hay 300');
  });

  it('y una sección a medio teclear no se juzga: es un hueco', () => {
    const r = uno({ hormigon: { ...entradaHormigonInicial(), tipo: 'soporte', b: 300 } });
    expect(r.via).toBe('sinResolver');
    expect(r.hueco).toBe(true);
  });

  it('un elemento sin nombre también, porque la memoria no puede imprimirlo', () => {
    expect(uno({ nombre: '  ' }).hueco).toBe(true);
  });
});

describe('los elementos de acero', () => {
  const metalico = (o: Partial<ElementoEntrada> = {}) =>
    uno({
      nombre: 'Jácenas',
      material: 'acero',
      acero: { ...entradaAceroInicial(), perfil: 'IPE 300', modo: 'contorno3' },
      ...o,
    });

  it('un IPE 300 no llega a los R 60 desnudo: la vía es la protección', () => {
    const r = metalico();
    expect(r.via).toBe('proteccion');
    expect(r.alcanza).toBeNull();
    expect(r.loQueFalta).toContain('d/λp = 0,15');
    expect(r.masividad).toBe(193);
  });

  it('y el perfil que sí llega desnudo va por su propia sección', () => {
    const r = metalico({
      acero: { ...entradaAceroInicial(), masividadManual: 30, mufi: 0.55 },
      exigidaManual: 30,
    });
    expect(r.via).toBe('propia');
    expect(r.dLambda).toBe(0);
    expect(r.justificacion).toContain('desnudo');
  });

  it('cuando la tabla no da valor, la vía es «sin resolver», no «no cumple»', () => {
    const r = metalico({
      acero: { ...entradaAceroInicial(), masividadManual: 200, mufi: 0.65 },
      exigidaManual: 240,
    });
    expect(r.via).toBe('sinResolver');
    expect(r.avisos.join(' ')).toContain('no da valor');
  });
});

describe('cambiar de material no borra lo tecleado', () => {
  it('la sección de hormigón sigue ahí después de pasar a acero y volver', () => {
    const e = elemento({ material: 'acero', acero: { ...entradaAceroInicial(), perfil: 'IPE 300' } });
    expect(e.hormigon.b).toBe(300);
    expect(resolverElementos([{ ...e, material: 'hormigon' }], sectores())[0].via).toBe('propia');
  });
});

describe('el resumen', () => {
  it('cuenta las tres vías, y no cuenta las filas sin nombre', () => {
    const ss = sectores();
    const rs = resolverElementos(
      [
        elemento({ id: 'a', nombre: 'Soportes' }),
        elemento({ id: 'b', nombre: 'Vigas', exigidaManual: 240 }),
        elemento({ id: 'c', nombre: 'Sin terminar', hormigon: entradaHormigonInicial() }),
        elemento({ id: 'd', nombre: '' }),
      ],
      ss,
    );
    expect(resumenElementos(rs)).toEqual({ propia: 2, proteccion: 1, sinResolver: 1 });
  });
});

describe('los avisos del anejo llevan el nombre del elemento delante', () => {
  it('para que en una lista de veinte se sepa de cuál habla', () => {
    expect(uno().avisos[0]).toMatch(/^«Soportes»: /);
  });
});

/**
 * Y lo que de todo esto llega al papel.
 *
 * El capítulo de incendio existía antes de que hubiera elementos, así que la
 * regla es que sin elementos comprobados NO cambia: enuncia la R exigida y deja
 * abiertas las dos vías del SI 6 § 3.1, como hacía el cuadro de materiales.
 */
describe('el documento', () => {
  const bloques = (es: ElementoEntrada[]) =>
    bloquesElementos(resolverElementos(es, sectores()));

  it('sin elementos no añade nada', () => {
    expect(bloques([])).toEqual([]);
  });

  it('ni con elementos que todavía no se pueden juzgar', () => {
    expect(bloques([elemento({ hormigon: entradaHormigonInicial() })])).toEqual([]);
  });

  it('con elementos comprobados saca su tabla y la cuenta de am al pie', () => {
    const bs = bloques([
      elemento({ id: 'a', nombre: 'Soportes' }),
      elemento({ id: 'b', nombre: 'Vigas', exigidaManual: 240 }),
    ]);
    const tabla = bs.find((b) => b.kind === 'table');
    expect(tabla?.head).toEqual(['Elemento', 'Sector', 'R exigida', 'Sección', 'Cómo alcanza la R']);
    expect(tabla?.rows[0]).toEqual([
      'Soportes',
      'Plantas sobre rasante',
      'R 60',
      'Soporte, am = 53 mm',
      'Por su propia sección (tabla C.2, 250 / 40)',
    ]);
    expect(tabla?.rows[1][4]).toContain('Con protección');

    const notas = bs.find((b) => b.kind === 'notes');
    expect(notas?.items[0]).toContain('Σ[Asi·fyki·(asi + Δasi)]');
    expect(notas?.items.join(' ')).toContain('Soportes: as = 35 + ø8 + ø20/2 = 53 mm');
    expect(notas?.items.join(' ')).toContain('SI 6 § 6.1.a');
  });

  it('y para el acero escribe la masividad, que es su dato equivalente', () => {
    const bs = bloques([
      elemento({
        nombre: 'Jácenas',
        material: 'acero',
        acero: { ...entradaAceroInicial(), perfil: 'IPE 300', modo: 'contorno3' },
      }),
    ]);
    const tabla = bs.find((b) => b.kind === 'table');
    expect(tabla?.rows[0][3]).toBe('Viga, Am/V = 193 m⁻¹');
    const notas = bs.find((b) => b.kind === 'notes');
    expect(notas?.items.join(' ')).toContain('Am = 3·150 + 2·300 − 2·7,1');
  });
});

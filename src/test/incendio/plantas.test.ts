/**
 * Las plantas heredadas de «Cargas por planta» y lo que este módulo les anota.
 *
 * El enganche es por NOMBRE, porque es lo único que identifica a una planta en
 * aquel sobre: no lleva id. De ahí los dos casos que hay que cuidar —renombrar
 * una planta allí deja huérfana la altura tecleada aquí, y dos plantas con el
 * mismo nombre comparten anotación— y de ahí que una anotación huérfana se
 * avise en vez de tirarse.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultIncendioState,
  evaluar,
  nuevoSector,
  plantasAnotadas,
  type AnotacionPlanta,
  type IncendioState,
} from '../../features/incendio/state';
import { cuentaParaEvacuacion, type PlantaPublicada } from '../../features/incendio/plantasPub';
import { claseUso } from '../../lib/incendio/sectores';

/** Las plantas llegan de `plantasPublicadas()` YA de abajo arriba. */
const publicadas = (...ps: [string, string[], boolean?][]): PlantaPublicada[] =>
  ps.map(([nombre, filas, esCubierta]) => ({
    nombre,
    filas,
    esCubierta: esCubierta ?? false,
    canto: 0.3,
    cantosDistintos: false,
  }));

const EDIFICIO = publicadas(
  ['Planta Baja', ['A1']],
  ['Planta Primera', ['A1']],
  ['Cubierta', ['G1'], true],
);

const anot = (nombre: string, o: Partial<AnotacionPlanta> = {}): AnotacionPlanta => ({
  nombre,
  altura: null,
  cantoManual: null,
  bajoRasante: false,
  cuenta: null,
  ...o,
});

const estado = (o: Partial<IncendioState> = {}): IncendioState => ({
  ...defaultIncendioState(),
  ...o,
});

beforeEach(() => {
  localStorage.clear();
});

describe('la ocupación propuesta', () => {
  it('una cubierta accesible sólo para conservación no cuenta', () => {
    for (const fila of ['G1', 'G1ligera', 'G2', 'G1-G2']) {
      expect(cuentaParaEvacuacion({ nombre: 'C', esCubierta: true, filas: [fila], canto: 0.3, cantosDistintos: false })).toBe(false);
    }
  });

  it('una cubierta transitable privada sí cuenta', () => {
    expect(cuentaParaEvacuacion({ nombre: 'C', esCubierta: true, filas: ['F'], canto: 0.3, cantosDistintos: false })).toBe(true);
  });

  it('basta una zona habitable para que la planta cuente', () => {
    expect(cuentaParaEvacuacion({ nombre: 'C', esCubierta: true, filas: ['G1', 'A1'], canto: 0.3, cantosDistintos: false })).toBe(true);
  });

  it('una sobrecarga tecleada a mano cuenta: no se sabe para qué es', () => {
    expect(cuentaParaEvacuacion({ nombre: 'P', esCubierta: false, filas: ['otro'], canto: 0.3, cantosDistintos: false })).toBe(true);
  });

  it('y una planta sin zonas, también', () => {
    expect(cuentaParaEvacuacion({ nombre: 'P', esCubierta: false, filas: [], canto: 0.3, cantosDistintos: false })).toBe(true);
  });
});

describe('el enganche por nombre', () => {
  it('pega la anotación a su planta y deja ver quién decidió qué', () => {
    const r = plantasAnotadas(EDIFICIO, [anot('Planta Baja', { altura: 3.2, bajoRasante: true })]);
    expect(r[0]).toMatchObject({ nombre: 'Planta Baja', altura: 3.2, bajoRasante: true });
    // Sin decisión, se usa la propuesta.
    expect(r[0].decidida).toBeNull();
    expect(r[0].cuenta).toBe(true);
    // La cubierta de conservación viene propuesta como que no cuenta.
    expect(r[2]).toMatchObject({ nombre: 'Cubierta', propuesta: false, cuenta: false, decidida: null });
  });

  it('una decisión a mano manda sobre la propuesta', () => {
    const r = plantasAnotadas(EDIFICIO, [anot('Cubierta', { cuenta: true })]);
    expect(r[2]).toMatchObject({ propuesta: false, decidida: true, cuenta: true });
  });

  it('una planta sin anotar sale con sus valores de partida', () => {
    const r = plantasAnotadas(EDIFICIO, []);
    expect(r.map((p) => p.altura)).toEqual([null, null, null]);
    expect(r.every((p) => !p.bajoRasante)).toBe(true);
  });
});

describe('la evaluación con plantas', () => {
  it('con la cadena de alturas cortada no hay R, y el hueco dice qué falta', () => {
    // Cuatro plantas, y la cubierta cuenta: con sólo la altura de la baja,
    // antes salía 3,2 m y R 60 impresos y publicados, sin ninguna señal.
    const cuatro = publicadas(
      ['Planta Baja', ['A1']],
      ['Planta Primera', ['A1']],
      ['Planta Segunda', ['A1']],
      ['Cubierta', ['F'], true],
    );
    const s = estado({
      plantas: [anot('Planta Baja', { altura: 3.2 })],
      sectores: [{ ...nuevoSector('Plantas'), clase: claseUso('residencialVivienda') }],
    });
    const ev = evaluar(s, cuatro);
    expect(ev.alturaEvacuacion).toBeNull();
    expect(ev.exigencias).toEqual([]);
    expect(ev.listo).toBe(false);
    expect(ev.huecos.map((h) => h.que)).toEqual([
      'la altura de evacuación (falta la altura de Planta Primera, Planta Segunda)',
      'Plantas',
    ]);
  });

  it('el hueco de la altura sólo sale cuando hace falta: un documento de exigencias sueltas no la usa', () => {
    const s = estado({
      exigencias: [{ id: 'f1', ambito: 'Toda la estructura', minutos: 60 }],
    });
    const ev = evaluar(s, EDIFICIO);
    expect(ev.alturaEvacuacion).toBeNull();
    expect(ev.huecos).toEqual([]);
    expect(ev.listo).toBe(true);
  });

  it('deriva la altura de evacuación y la mete en la tabla 3.1', () => {
    const s = estado({
      plantas: [anot('Planta Baja', { altura: 3.2 }), anot('Planta Primera', { altura: 3 })],
      sectores: [{ ...nuevoSector('Plantas'), clase: claseUso('residencialVivienda') }],
    });
    const ev = evaluar(s, EDIFICIO);
    // La cubierta es de conservación: la altura llega al forjado de la primera.
    expect(ev.alturaEvacuacion).toBe(3.2);
    expect(ev.alturaAMano).toBe(false);
    expect(ev.sectores[0].minutos).toBe(60);
    expect(ev.exigencias).toEqual([{ ambito: 'Plantas', minutos: 60 }]);
    expect(ev.listo).toBe(true);
  });

  it('la altura tecleada a mano manda sobre la derivada', () => {
    const s = estado({
      plantas: [anot('Planta Baja', { altura: 3.2 }), anot('Planta Primera', { altura: 3 })],
      alturaEvacuacionManual: 30,
      sectores: [{ ...nuevoSector('Plantas'), clase: claseUso('residencialVivienda') }],
    });
    const ev = evaluar(s, EDIFICIO);
    expect(ev.alturaEvacuacion).toBe(30);
    expect(ev.alturaAMano).toBe(true);
    expect(ev.sectores[0].minutos).toBe(120);
  });

  it('una anotación huérfana se avisa y no se tira', () => {
    const s = estado({ plantas: [anot('Planta Ática', { altura: 2.8 })] });
    const ev = evaluar(s, EDIFICIO);
    expect(ev.avisos.join(' ')).toContain('ya no están en «Cargas por planta»: Planta Ática');
    // Y sigue guardada, por si la planta vuelve.
    expect(s.plantas).toHaveLength(1);
  });

  it('sin sobre de cargas, lo dice y deja teclear la altura', () => {
    const s = estado({ sectores: [{ ...nuevoSector('Plantas'), clase: claseUso('administrativo') }] });
    const ev = evaluar(s, null);
    expect(ev.sinPlantas).toBe(true);
    expect(ev.plantas).toEqual([]);
    expect(ev.avisos.join(' ')).toContain('No hay plantas publicadas');
    expect(ev.sectores[0].hueco).toBe(true);

    const conAltura = evaluar({ ...s, alturaEvacuacionManual: 12 }, null);
    expect(conAltura.sectores[0].minutos).toBe(60);
    expect(conAltura.listo).toBe(true);
  });

  it('un sector sin exigencia deja el módulo listo aunque no imprima ninguna R', () => {
    const s = estado({
      sectores: [
        { ...nuevoSector('Escalera especialmente protegida'), clase: 'regla:escaleraEspecialmenteProtegida' },
      ],
    });
    const ev = evaluar(s, EDIFICIO);
    expect(ev.exigencias).toEqual([]);
    expect(ev.huecos).toEqual([]);
    expect(ev.listo).toBe(true);
  });
});

/**
 * El estado del módulo de incendio: huecos, evaluación y publicación.
 *
 * El candado que antes cerraba el cuadro de materiales —una exigencia a medio
 * rellenar bloquea exportar y publicar— se muda aquí con el dato. Y hay una
 * regla nueva que no existía allí: NUNCA se publica un sobre vacío, porque la
 * ficha del DB SE convierte un sobre sin configurar en «falta» aunque el
 * módulo sea opcional, y «falta» bloquea la exportación del DB SE.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  datosPublicacion,
  defaultIncendioState,
  esEstadoInicial,
  estaConfigurado,
  evaluar,
  normalizar,
  publicarResultado,
  type FilaExigencia,
  type IncendioState,
} from '../../features/incendio/state';
import { leerPublicacion } from '../../lib/pub';

const con = (filas: FilaExigencia[]): IncendioState => ({ ...defaultIncendioState(), exigencias: filas });

beforeEach(() => {
  localStorage.clear();
});

describe('huecos', () => {
  it('una exigencia a medias bloquea exportar y publicar', () => {
    const sinR = con([{ id: 'f1', ambito: 'Sótano', minutos: null }]);
    const ev = evaluar(sinR);
    expect(ev.huecos).toHaveLength(1);
    expect(ev.listo).toBe(false);
    expect(datosPublicacion(ev)).toBeNull();
  });

  it('entera, se publica', () => {
    const entera = con([{ id: 'f1', ambito: 'Sótano', minutos: 120 }]);
    const ev = evaluar(entera);
    expect(ev.huecos).toHaveLength(0);
    expect(ev.listo).toBe(true);
    expect(datosPublicacion(ev)?.exigencias).toEqual([{ ambito: 'Sótano', minutos: 120 }]);
  });

  it('un ámbito en blanco también es hueco', () => {
    expect(evaluar(con([{ id: 'f1', ambito: '   ', minutos: 60 }])).huecos).toHaveLength(1);
  });

  it('el estado por defecto no trae ninguna, y no publica nada', () => {
    const d = defaultIncendioState();
    expect(d.exigencias).toEqual([]);
    expect(esEstadoInicial(d)).toBe(true);
    expect(estaConfigurado(d)).toBe(false);
    // `listo` es false SIN exigencias: no hay documento que exportar.
    expect(evaluar(d).listo).toBe(false);
    expect(datosPublicacion(evaluar(d))).toBeNull();
  });
});

describe('la publicación', () => {
  it('no escribe sobre ninguno mientras no haya nada que decir', () => {
    const d = defaultIncendioState();
    publicarResultado(d, evaluar(d));
    expect(leerPublicacion('incendio', 1)).toBeNull();
  });

  it('viaja SIN emplazamiento, para que el guardia de la provincia no la tire', () => {
    // La R de la tabla 3.1 depende del uso y de la altura de evacuación, no de
    // dónde esté el edificio: filtrarla por provincia sería un falso positivo.
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    const sobre = leerPublicacion<{ exigencias: unknown[] }>('incendio', 1);
    expect(sobre).not.toBeNull();
    expect(sobre?.obra.ine).toBeNull();
    expect(sobre?.obra.provincia).toBeNull();
    expect(sobre?.configurado).toBe(true);
    expect(sobre?.datos.exigencias).toEqual([{ ambito: 'Plantas sobre rasante', minutos: 90 }]);
  });
});

describe('lectura defensiva', () => {
  it('valida entrada por entrada, sin tirar las buenas', () => {
    const s = normalizar({
      exigencias: [
        { id: 'f1', ambito: 'Sótano', minutos: 120 },
        { ambito: 7, minutos: 30 },
        'basura',
      ],
    });
    expect(s.exigencias).toEqual([
      { id: 'f1', ambito: 'Sótano', minutos: 120 },
      { id: expect.any(String), ambito: '', minutos: 30 },
    ]);
  });

  it('acepta cualquier entero positivo de minutos, no sólo las seis clases', () => {
    // El Anejo B da el tiempo equivalente en minutos exactos —su propio ejemplo
    // sale en 96,23— y el DB SI 6 §3.1.b admite declararlo así. Acotar a la
    // lista del desplegable tiraría ese dato al releer.
    expect(normalizar({ exigencias: [{ id: 'f1', ambito: 'Sector 1', minutos: 97 }] }).exigencias[0].minutos).toBe(97);
    expect(normalizar({ exigencias: [{ id: 'f1', ambito: 'Sector 1', minutos: 96.23 }] }).exigencias[0].minutos).toBe(97);
  });

  it('lo que no es un número positivo queda como hueco', () => {
    const s = normalizar({
      exigencias: [
        { id: 'a', ambito: 'A', minutos: 0 },
        { id: 'b', ambito: 'B', minutos: -30 },
        { id: 'c', ambito: 'C', minutos: 'R60' },
        { id: 'd', ambito: 'D', minutos: Number.NaN },
      ],
    });
    expect(s.exigencias.map((f) => f.minutos)).toEqual([null, null, null, null]);
  });

  it('de una basura cualquiera sale el estado por defecto', () => {
    expect(normalizar(null)).toEqual(defaultIncendioState());
    expect(normalizar('vaya')).toEqual(defaultIncendioState());
    expect(normalizar({}).exigencias).toEqual([]);
  });
});

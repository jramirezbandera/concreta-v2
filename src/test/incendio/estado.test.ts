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
import { leerPublicacion, publicar, versionDePubs } from '../../lib/pub';

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
    expect(datosPublicacion(ev)?.exigencias).toEqual([
      { ambito: 'Sótano', minutos: 120, cita: 'declarada en el proyecto' },
    ]);
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
    expect(sobre?.datos.exigencias).toEqual([
      { ambito: 'Plantas sobre rasante', minutos: 90, cita: 'declarada en el proyecto' },
    ]);
  });
});

describe('el sobre se retira cuando ya no hay nada que decir', () => {
  it('quitar la última exigencia borra el sobre anterior', () => {
    // Si se quedara, el cuadro de materiales y la ficha del DB SE seguirían
    // imprimiendo una R que ya no existe en ningún sitio.
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    expect(leerPublicacion('incendio', 1)).not.toBeNull();

    const vacio = defaultIncendioState();
    publicarResultado(vacio, evaluar(vacio));
    expect(leerPublicacion('incendio', 1)).toBeNull();
  });

  it('y una exigencia a medias también lo retira: el sobre refleja la evaluación de ahora', () => {
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    const aMedias = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: null }]);
    publicarResultado(aMedias, evaluar(aMedias));
    expect(leerPublicacion('incendio', 1)).toBeNull();
  });

  it('sin sobre que retirar no se mueve la marca de cambio', () => {
    const d = defaultIncendioState();
    publicarResultado(d, evaluar(d));
    expect(localStorage.getItem('concreta-pub-incendio')).toBeNull();
  });
});

/**
 * La R sale de la altura de evacuación, y ésta de las plantas que publica
 * «Cargas por planta». El sobre deja dicho CON QUÉ publicación de plantas se
 * calculó, para que quien lo consuma pueda ver que han cambiado después.
 */
describe('la marca de las plantas con las que se calculó', () => {
  const plantas = () =>
    publicar(
      'cargas-planta',
      1,
      { plantas: [{ nombre: 'Planta Baja', esCubierta: false, zonas: [] }] },
      {},
      true,
    );

  it('viaja en el sobre, con la fecha de la publicación de plantas', () => {
    const p = plantas();
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    const sobre = leerPublicacion<{ plantasOrigen: { ts: string } | null }>('incendio', 1);
    expect(sobre?.datos.plantasOrigen).toEqual({ ts: p?.ts });
  });

  it('y sin plantas publicadas queda en null, no se inventa una fecha', () => {
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    const sobre = leerPublicacion<{ plantasOrigen: unknown }>('incendio', 1);
    expect(sobre?.datos.plantasOrigen).toBeNull();
  });

  /**
   * Republicar lo mismo mueve la marca de cambio de los sobres, y la
   * evaluación de este módulo depende de ella —las plantas son de otro
   * módulo—: el módulo se republicaba a sí mismo en bucle.
   */
  it('publicar dos veces lo mismo no mueve la marca de cambio', () => {
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    const v = versionDePubs();
    publicarResultado(s, evaluar(s));
    expect(versionDePubs()).toBe(v);
  });

  it('pero un cambio de verdad sí la mueve', () => {
    const s = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 90 }]);
    publicarResultado(s, evaluar(s));
    const v = versionDePubs();
    const otra = con([{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 120 }]);
    publicarResultado(otra, evaluar(otra));
    expect(versionDePubs()).toBeGreaterThan(v);
  });
});

describe('lectura defensiva', () => {
  it('el λp guardado sólo sobrevive en las familias que lo piden', () => {
    // Un λp pegado a una placa de yeso es el de OTRO producto: el que se
    // tecleó antes de cambiar de familia. La cuenta usaría esa conductividad
    // con el λ tabulado del yeso... o peor, en vez de él.
    const elemento = (familia: string) =>
      normalizar({ elementos: [{ id: 'e1', nombre: 'Jácenas', proteccion: { familia, lambda: 0.05 } }] })
        .elementos[0].proteccion;
    expect(elemento('lanaMineral')).toEqual({ familia: 'lanaMineral', lambda: 0.05 });
    expect(elemento('silicatoCalcico')).toEqual({ familia: 'silicatoCalcico', lambda: 0.05 });
    expect(elemento('placaYeso')).toEqual({ familia: 'placaYeso', lambda: null });
    expect(elemento('morteroVermiculita')).toEqual({ familia: 'morteroVermiculita', lambda: null });
    expect(elemento('intumescente')).toEqual({ familia: 'intumescente', lambda: null });
    expect(elemento('morteroYeso')).toEqual({ familia: 'morteroYeso', lambda: null });
    expect(elemento('')).toEqual({ familia: '', lambda: null });
    expect(elemento('inventada')).toEqual({ familia: '', lambda: null });
  });

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

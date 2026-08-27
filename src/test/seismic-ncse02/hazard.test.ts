/**
 * El buscador de municipios.
 *
 * Es la única puerta entre el dataset y el módulo, y su modo de fallo es
 * desagradable: si un municipio existe pero no se encuentra, el usuario lee
 * "no figura en el Anejo 1", que significa "la Norma no te obliga". Un fallo de
 * búsqueda se disfraza de exención normativa, así que se prueba contra el
 * dataset real, no contra un fixture.
 */
import { describe, expect, it } from 'vitest';

import {
  MENSAJE_NO_ENCONTRADO,
  buscarMunicipios,
  cargarHazard,
  municipioPorIne,
  plegarConsulta,
} from '../../features/seismic-ncse02/hazard';

describe('plegarConsulta', () => {
  it('quita acentos, baja a minusculas y colapsa la puntuacion', () => {
    expect(plegarConsulta('Málaga')).toBe('malaga');
    expect(plegarConsulta('  A CORUÑA ')).toBe('a coruna');
    expect(plegarConsulta("L'Hospitalet")).toBe('l hospitalet');
    expect(plegarConsulta('Vitoria-Gasteiz')).toBe('vitoria gasteiz');
  });

  it('una consulta vacia o solo signos se pliega a cadena vacia', () => {
    expect(plegarConsulta('   ')).toBe('');
    expect(plegarConsulta('¿?-')).toBe('');
  });
});

describe('cargarHazard', () => {
  it('memoiza: teclear no dispara una descarga por pulsacion', async () => {
    expect(cargarHazard()).toBe(cargarHazard());
  });
});

describe('buscarMunicipios', () => {
  it('no busca nada con una consulta vacia', async () => {
    expect(await buscarMunicipios('')).toEqual([]);
    expect(await buscarMunicipios('   ')).toEqual([]);
  });

  it('encuentra Granada con los valores que calibran el barrido', async () => {
    const r = await buscarMunicipios('granada');
    const g = r.find((m) => m.ine === '18087');
    expect(g).toEqual({ ine: '18087', nombre: 'Granada', ab: 0.23, k: 1.0 });
  });

  it('encuentra sin que el usuario escriba los acentos', async () => {
    expect((await buscarMunicipios('malaga')).some((m) => m.nombre === 'Málaga')).toBe(true);
    expect((await buscarMunicipios('Málaga')).some((m) => m.nombre === 'Málaga')).toBe(true);
    expect((await buscarMunicipios('almeria')).some((m) => m.nombre === 'Almería')).toBe(true);
  });

  it('encuentra un nombre bilingue por sus DOS formas', async () => {
    // Sin esto, quien teclea "Alacant" recibe el mensaje de exencion.
    const porCastellano = await buscarMunicipios('alicante');
    const porValenciano = await buscarMunicipios('alacant');
    expect(porCastellano.some((m) => m.ine === '03014')).toBe(true);
    expect(porValenciano.some((m) => m.ine === '03014')).toBe(true);
  });

  it('encuentra con el articulo delante, que es como se teclea', async () => {
    const conArticulo = await buscarMunicipios('la union');
    const sinArticulo = await buscarMunicipios('union');
    expect(conArticulo.some((m) => m.nombre === 'Unión (La)')).toBe(true);
    expect(sinArticulo.some((m) => m.nombre === 'Unión (La)')).toBe(true);
  });

  it('los que empiezan por la consulta van antes que los que la contienen', async () => {
    const r = await buscarMunicipios('cor', 40);
    const empieza = r.map((m) => plegarConsulta(m.nombre).split('/').some((s) => s.trim().startsWith('cor')));
    // Una vez aparece el primer "solo contiene", ya no puede volver un "empieza".
    const primerNo = empieza.indexOf(false);
    if (primerNo >= 0) expect(empieza.slice(primerNo).every((x) => !x)).toBe(true);
  });

  it('respeta el limite pedido', async () => {
    expect((await buscarMunicipios('a', 5)).length).toBeLessThanOrEqual(5);
    expect((await buscarMunicipios('a', 3)).length).toBeLessThanOrEqual(3);
  });

  it('devuelve ab y K utilizables, no cadenas ni indices', async () => {
    for (const m of await buscarMunicipios('mur', 10)) {
      expect(typeof m.ab).toBe('number');
      expect(m.ab).toBeGreaterThanOrEqual(0.04);
      expect(typeof m.k).toBe('number');
      expect(m.k).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('municipioPorIne', () => {
  it('encuentra por codigo exacto', async () => {
    expect(await municipioPorIne('18087')).toEqual({
      ine: '18087',
      nombre: 'Granada',
      ab: 0.23,
      k: 1.0,
    });
  });

  it('la busqueda binaria acierta en todo el rango, no solo en el centro', async () => {
    const d = await cargarHazard();
    for (const i of [0, 1, 7, 500, 1305, d.ine.length - 2, d.ine.length - 1]) {
      const m = await municipioPorIne(d.ine[i]);
      expect(m?.ine).toBe(d.ine[i]);
      expect(m?.nombre).toBe(d.nombre[i]);
    }
  });

  it('devuelve null para un municipio real que NO esta en el Anejo 1', async () => {
    // Oviedo existe y tiene ab < 0,04 g: el dataset no lo lleva (decision 5).
    expect(await municipioPorIne('33044')).toBeNull();
  });

  it('devuelve null para un codigo inexistente', async () => {
    expect(await municipioPorIne('99999')).toBeNull();
    expect(await municipioPorIne('')).toBeNull();
  });
});

describe('mensaje de "no encontrado"', () => {
  it('cubre los DOS casos, exencion y errata', () => {
    // Si solo dijera "revisa la ortografia", el exento seguiria buscando algo
    // que no existe. Si solo dijera "la Norma no te obliga", una falta de
    // ortografia se leeria como exencion normativa.
    expect(MENSAJE_NO_ENCONTRADO).toContain('Anejo 1');
    expect(MENSAJE_NO_ENCONTRADO).toContain('art. 1.2.3');
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/ortograf/i);
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/0,04/);
  });
});

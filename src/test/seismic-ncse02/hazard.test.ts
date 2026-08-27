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
  provinciaDe,
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

  it('la coincidencia EXACTA manda sobre el orden del codigo INE', async () => {
    // M5: "granada" listaba antes «Granada (La)» —Barcelona, 08, ab 0,04 g—
    // que Granada capital —18, ab 0,23 g—, porque las dos empiezan igual y
    // dentro del nivel mandaba el codigo INE. Un factor SEIS en la
    // aceleracion, decidido por el numero de la provincia.
    const r = await buscarMunicipios('granada', 20);
    expect(r[0].ine).toBe('18087');
    expect(r[0].ab).toBe(0.23);
    // Y la otra sigue estando: no se trata de esconderla, sino de ordenar.
    expect(r.some((m) => m.nombre.startsWith('Granada (La)'))).toBe(true);
  });

  it('encuentra Granada con los valores que calibran el barrido', async () => {
    const r = await buscarMunicipios('granada');
    const g = r.find((m) => m.ine === '18087');
    // `procedencia: null` = sale de la capa del IGN tal cual, sin suplemento.
    expect(g).toEqual({
      ine: '18087',
      nombre: 'Granada',
      provincia: 'Granada',
      ab: 0.23,
      k: 1.0,
      procedencia: null,
    });
  });

  it('devuelve la procedencia de un municipio que no sale de la capa', async () => {
    // Ceuta no la publica la capa del IGN: sale del texto del BOE. El buscador
    // tiene que decirlo, porque de aqui lo toman el panel y el PDF.
    const ceuta = (await buscarMunicipios('ceuta')).find((m) => m.ine === '51001');
    expect(ceuta?.ab).toBe(0.05);
    expect(ceuta?.k).toBe(1.2);
    expect(ceuta?.procedencia?.tipo).toBe('anejo1-texto');

    // Y un municipio creado despues de 2002 nombra a aquel del que hereda.
    const fornes = (await buscarMunicipios('fornes')).find((m) => m.ine === '18077');
    expect(fornes?.ab).toBe(0.24);
    expect(fornes?.procedencia).toMatchObject({
      tipo: 'segregado',
      padre: { ine: '18020', nombre: 'Arenas del Rey' },
    });
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
      provincia: 'Granada',
      ab: 0.23,
      k: 1.0,
      procedencia: null,
    });
  });

  it('la provincia sale de los dos primeros digitos del codigo INE', async () => {
    // Sin ella los homonimos son indistinguibles en el desplegable, y hay
    // pares con peligrosidades muy distintas.
    expect(provinciaDe('17199')).toBe('Girona');
    expect(provinciaDe('46244')).toBe('Valencia');
    expect(provinciaDe('51001')).toBe('Ceuta');
    expect(provinciaDe('52001')).toBe('Melilla');
    // Prefijo que no existe: cadena vacia, nunca "undefined" pintado en la UI.
    expect(provinciaDe('99999')).toBe('');
  });

  it('los dos Torrent se distinguen por provincia, y no tienen el mismo ab', async () => {
    // El caso de M5, con numeros: elegir el que no era rebaja el cortante
    // basal un 30 % y no hay nada en pantalla que lo delate.
    const r = await buscarMunicipios('torrent', 20);
    const torrents = r.filter((m) => m.nombre.toLowerCase().startsWith('torrent'));
    const girona = torrents.find((m) => m.provincia === 'Girona');
    const valencia = torrents.find((m) => m.provincia === 'Valencia');
    expect(girona).toBeTruthy();
    expect(valencia).toBeTruthy();
    expect(girona!.ab).not.toBe(valencia!.ab);
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
  it('cubre las TRES causas: exencion, errata y municipio posterior a 2002', () => {
    // Si solo dijera "revisa la ortografia", el exento seguiria buscando algo
    // que no existe. Si solo dijera "la Norma no te obliga", una falta de
    // ortografia se leeria como exencion normativa. Y si callara la tercera,
    // un municipio segregado despues de 2002 —que el Anejo 1 no puede nombrar
    // porque no existia— se leeria tambien como exento.
    expect(MENSAJE_NO_ENCONTRADO).toContain('Anejo 1');
    expect(MENSAJE_NO_ENCONTRADO).toContain('art. 1.2.3');
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/errata/i);
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/0,04/);
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/2002/);
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/segreg/i);
  });

  it('NO afirma la exencion: la ofrece como una posibilidad entre tres', () => {
    // La regresion que este test existe para impedir. La version anterior decia
    // "si el nombre es correcto, SIGNIFICA ab < 0,04 g y la Norma no es de
    // aplicacion obligatoria": una conclusion normativa deducida de un fallo de
    // busqueda. Con Ceuta, Melilla y los segregados posteriores a 2002 fuera de
    // la capa del IGN, esa frase convertia un hueco de datos en una exencion.
    expect(MENSAJE_NO_ENCONTRADO).not.toMatch(/significa/i);
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/puede ser|compru[eé]balo/i);
    // Y ofrece la salida, en vez de dejar al usuario en un callejon.
    expect(MENSAJE_NO_ENCONTRADO).toMatch(/a mano/i);
  });
});

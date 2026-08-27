/**
 * La share-URL del módulo de sismo.
 *
 * El enlace lo abre otro técnico, así que el fallo que importa no es que
 * reviente —eso se ve— sino que cargue un caso PARECIDO al original. Un signo
 * perdido en la coordenada de un plano resistente, o una declaración de
 * regularidad que llega como `true` sin que nadie la firmara, producen un
 * cálculo distinto sin avisar.
 */
import { describe, expect, it } from 'vitest';

import {
  buildShareUrl,
  decodeShareString,
  encodeShareString,
} from '../../features/seismic-ncse02/serialize';
import {
  blankSeismicState,
  defaultSeismicState,
  evaluarSismo,
  type SeismicState,
} from '../../features/seismic-ncse02/state';

const ida = (s: SeismicState) => decodeShareString(encodeShareString(s));

describe('round-trip', () => {
  it('el estado por defecto vuelve idéntico', () => {
    const s = defaultSeismicState();
    expect(ida(s)).toEqual(s);
  });

  it('el estado en blanco vuelve idéntico', () => {
    const s = blankSeismicState();
    expect(ida(s)).toEqual(s);
  });

  it('y el caso que vuelve calcula lo mismo que el original', () => {
    const s = defaultSeismicState();
    const v = ida(s)!;
    expect(evaluarSismo(v).resultado?.x.Vk).toEqual(evaluarSismo(s).resultado?.x.Vk);
    expect(evaluarSismo(v).resultado?.pesoSismico).toBe(evaluarSismo(s).resultado?.pesoSismico);
  });

  it('conserva el SIGNO de cada plano resistente', () => {
    const s = defaultSeismicState();
    s.x.elementos = [
      { id: 'a', x: -10, k: 1 },
      { id: 'b', x: -5, k: 2 },
      { id: 'c', x: 5, k: 3 },
      { id: 'd', x: 10, k: 4 },
    ];
    expect(ida(s)!.x.elementos.map((e) => e.x)).toEqual([-10, -5, 5, 10]);
  });

  it('conserva una sobrecarga excluida, que es una declaración del proyectista', () => {
    const v = ida(defaultSeismicState())!;
    const cubierta = v.plantas[v.plantas.length - 1];
    expect(cubierta.componentes?.some((c) => c.excluida === true)).toBe(true);
  });

  it('conserva los conmutadores auto/manual', () => {
    const s: SeismicState = {
      ...defaultSeismicState(),
      nModosModo: 'manual',
      nModosManual: 3,
      terrenoModo: 'perfil',
    };
    s.x = { ...s.x, TFModo: 'manual', TFManual: 0.62 };
    const v = ida(s)!;
    expect(v.nModosModo).toBe('manual');
    expect(v.nModosManual).toBe(3);
    expect(v.terrenoModo).toBe('perfil');
    expect(v.x.TFModo).toBe('manual');
    expect(v.x.TFManual).toBe(0.62);
  });

  it('una declaración sin contestar sigue sin contestar al otro lado', () => {
    const s: SeismicState = { ...defaultSeismicState(), regularidadMecanica: null };
    expect(ida(s)!.regularidadMecanica).toBeNull();
  });
});

describe('entradas que no son un caso de sismo', () => {
  it('devuelve null en lugar de un caso a medias', () => {
    expect(decodeShareString('')).toBeNull();
    expect(decodeShareString('no-es-lz-string')).toBeNull();
    expect(decodeShareString(encodeShareString({} as unknown as SeismicState))).toBeNull();
  });

  it('rechaza el modelo de OTRO módulo de Concreta', () => {
    // Pegar el enlace de muros de fábrica aquí no puede cargar medio edificio.
    const otro = { fabricaModo: 'tabla', pieza: 'LP', fb: 10, fm: 5, plantas: [{ id: 'a', H: 3 }] };
    expect(decodeShareString(encodeShareString(otro as unknown as SeismicState))).toBeNull();
  });

  it('rechaza un caso sin plantas o sin direcciones', () => {
    const sinPlantas = { ...defaultSeismicState(), plantas: [] };
    expect(decodeShareString(encodeShareString(sinPlantas))).toBeNull();
    const sinY = { ...defaultSeismicState(), y: undefined };
    expect(decodeShareString(encodeShareString(sinY as unknown as SeismicState))).toBeNull();
  });
});

describe('buildShareUrl', () => {
  it('produce una URL con el caso en ?model=', () => {
    const s = defaultSeismicState();
    const url = buildShareUrl(s, 'https://ejemplo.test/ciment/sismo');
    expect(url.startsWith('https://ejemplo.test/ciment/sismo?model=')).toBe(true);
    expect(decodeShareString(url.slice(url.indexOf('=') + 1))).toEqual(s);
  });

  it('descarta los query params que ya trajera la URL', () => {
    const url = buildShareUrl(defaultSeismicState(), 'https://ejemplo.test/x?model=viejo&otro=1');
    expect(url.match(/\?/g)).toHaveLength(1);
    expect(url).not.toContain('otro=1');
  });

  it('el enlace de un edificio real cabe donde cortan los correos corporativos', () => {
    // Diez plantas con desglose de cargas y ocho planos resistentes. Sin
    // comprimir se va por encima del limite; comprimido tiene que entrar.
    const url = buildShareUrl(defaultSeismicState(), 'https://ejemplo.test/ciment/sismo');
    expect(url.length).toBeLessThan(4000);
    expect(url.length).toBeLessThan(JSON.stringify(defaultSeismicState()).length);
  });

  it('sobrevive a que el navegador convierta el "+" en espacio', () => {
    // El alfabeto de lz-string incluye "+", y URLSearchParams lo lee como
    // espacio. Es el camino REAL de un enlace pegado en la barra, asi que se
    // prueba ese, no una comparacion con encodeURIComponent.
    const s = defaultSeismicState();
    const url = buildShareUrl(s, 'https://ejemplo.test/ciment/sismo');
    const leido = new URLSearchParams(new URL(url).search).get('model');
    expect(leido).not.toBeNull();
    expect(decodeShareString(leido!)).toEqual(s);
  });
});

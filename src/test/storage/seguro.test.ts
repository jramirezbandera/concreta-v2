/**
 * `lib/storage/seguro`: el único punto de contacto con localStorage.
 *
 * Lo que se protege: que un fallo de escritura NUNCA sea mudo (se clasifica y
 * se publica), que la cola diferida escriba el último valor y se pueda volcar
 * desde fuera, y que borrar o escribir ahora descarte lo encolado de esa clave.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _reiniciarAlmacenParaTests,
  borrarClave,
  clavesAlmacenadas,
  conEscrituraLibre,
  escribirClave,
  escribirClaveDiferida,
  estadoAlmacen,
  fijarFiltroDeEscritura,
  hayPendientes,
  leerClave,
  RETARDO_ESCRITURA_MS,
  suscribirAlmacen,
  volcarPendientes,
} from '../../lib/storage/seguro';

function errorCuota(): Error {
  return new DOMException('QuotaExceededError', 'QuotaExceededError');
}

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('lectura, escritura y borrado', () => {
  it('ida y vuelta, y enumeración', () => {
    expect(leerClave('a')).toBeNull();
    expect(escribirClave('a', '1')).toBe(true);
    expect(escribirClave('b', '2')).toBe(true);
    expect(leerClave('a')).toBe('1');
    expect(clavesAlmacenadas().sort()).toEqual(['a', 'b']);
    expect(borrarClave('a')).toBe(true);
    expect(leerClave('a')).toBeNull();
    expect(estadoAlmacen().fallo).toBeNull();
  });

  it('cuota llena: devuelve false, clasifica "cuota" con la clave, y avisa UNA vez', () => {
    escribirClave('previa', 'x'); // el almacén no está vacío: es cuota, no modo privado
    const avisos: string[] = [];
    suscribirAlmacen(() => avisos.push(`${estadoAlmacen().fallo}:${estadoAlmacen().clave}`));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw errorCuota();
    });

    expect(escribirClave('rc-beams', '{}')).toBe(false);
    expect(estadoAlmacen()).toEqual({ fallo: 'cuota', clave: 'rc-beams' });
    expect(escribirClave('rc-beams', '{"L":5}')).toBe(false);
    expect(avisos).toEqual(['cuota:rc-beams']); // el segundo fallo igual no repite el aviso
  });

  it('al volver a escribir bien, el fallo se levanta y se avisa', () => {
    escribirClave('previa', 'x');
    const avisos: string[] = [];
    suscribirAlmacen(() => avisos.push(String(estadoAlmacen().fallo)));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw errorCuota();
    });
    escribirClave('k', 'v');
    spy.mockRestore();

    expect(escribirClave('k', 'v')).toBe(true);
    expect(estadoAlmacen().fallo).toBeNull();
    expect(avisos).toEqual(['cuota', 'null']);
  });

  it('QuotaExceededError con el almacén VACÍO es "no-disponible" (Safari antiguo en privado)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw errorCuota();
    });
    expect(escribirClave('k', 'v')).toBe(false);
    expect(estadoAlmacen().fallo).toBe('no-disponible');
  });

  it('cualquier otra excepción es "no-disponible", también al leer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(leerClave('k')).toBeNull();
    expect(estadoAlmacen()).toEqual({ fallo: 'no-disponible', clave: 'k' });
  });

  it('la instantánea es estable mientras no cambia (useSyncExternalStore)', () => {
    const antes = estadoAlmacen();
    escribirClave('k', 'v');
    escribirClave('k', 'w');
    expect(estadoAlmacen()).toBe(antes);
  });
});

describe('cola diferida', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('no escribe al encolar; escribe el ÚLTIMO valor al vencer el retardo', () => {
    escribirClaveDiferida('k', '1');
    escribirClaveDiferida('k', '2');
    expect(hayPendientes()).toBe(true);
    expect(leerClave('k')).toBeNull();
    vi.advanceTimersByTime(RETARDO_ESCRITURA_MS - 1);
    expect(leerClave('k')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(leerClave('k')).toBe('2');
    expect(hayPendientes()).toBe(false);
  });

  it('cada encolado rearma el temporizador (debounce, no throttle)', () => {
    escribirClaveDiferida('k', '1');
    vi.advanceTimersByTime(200);
    escribirClaveDiferida('k', '2');
    vi.advanceTimersByTime(200);
    expect(leerClave('k')).toBeNull();
    vi.advanceTimersByTime(100);
    expect(leerClave('k')).toBe('2');
  });

  it('el valor perezoso se serializa al volcar, no al encolar', () => {
    let n = 0;
    escribirClaveDiferida('k', () => String(++n));
    expect(n).toBe(0);
    expect(volcarPendientes()).toBe(true);
    expect(n).toBe(1);
    expect(leerClave('k')).toBe('1');
  });

  it('volcarPendientes() escribe ahora y desarma el temporizador', () => {
    escribirClaveDiferida('a', '1');
    escribirClaveDiferida('b', '2');
    expect(volcarPendientes()).toBe(true);
    expect(leerClave('a')).toBe('1');
    expect(leerClave('b')).toBe('2');
    expect(hayPendientes()).toBe(false);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    vi.advanceTimersByTime(RETARDO_ESCRITURA_MS * 2);
    expect(spy).not.toHaveBeenCalled(); // el temporizador quedó desarmado: no vuelve a escribir
  });

  it('borrarClave() descarta lo encolado de esa clave: reset() no resucita el estado', () => {
    escribirClave('k', 'viejo');
    escribirClaveDiferida('k', 'nuevo');
    borrarClave('k');
    vi.advanceTimersByTime(RETARDO_ESCRITURA_MS);
    expect(leerClave('k')).toBeNull();
  });

  it('escribirClave() ahora sustituye a lo encolado de esa clave', () => {
    escribirClaveDiferida('k', 'diferido');
    escribirClave('k', 'inmediato');
    vi.advanceTimersByTime(RETARDO_ESCRITURA_MS);
    expect(leerClave('k')).toBe('inmediato');
  });

  it('un fallo de cuota al volcar devuelve false y publica el fallo; el resto del lote se intenta igual', () => {
    escribirClave('previa', 'x');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string) => {
      if (k === 'grande') throw errorCuota();
    });
    escribirClaveDiferida('grande', 'x'.repeat(10));
    escribirClaveDiferida('pequena', 'y');
    expect(volcarPendientes()).toBe(false);
    // 'pequena' (1 carácter) fue bien DESPUÉS, y aun así el fallo sigue en pie:
    // es el lote estado + versión de cualquier módulo con la cuota llena.
    expect(estadoAlmacen().fallo).toBe('cuota');
    expect(estadoAlmacen().clave).toBe('grande');
  });

  it('un éxito pequeño no levanta el fallo de cuota; uno igual de grande, o de la misma clave, sí', () => {
    escribirClave('previa', 'x');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string) => {
      if (k === 'grande') throw errorCuota();
    });
    expect(escribirClave('grande', 'x'.repeat(100))).toBe(false);
    expect(escribirClave('version', '1')).toBe(true);
    expect(estadoAlmacen().fallo).toBe('cuota'); // un carácter no demuestra que haya sitio
    expect(escribirClave('otra', 'y'.repeat(100))).toBe(true);
    expect(estadoAlmacen().fallo).toBeNull(); // cien caracteres sí
    escribirClave('grande', 'x'.repeat(100));
    expect(estadoAlmacen().fallo).toBe('cuota');
    spy.mockRestore();
    expect(escribirClave('grande', 'z')).toBe(true); // la misma clave levanta aunque sea pequeña
    expect(estadoAlmacen().fallo).toBeNull();
  });

  it('un serializador que revienta no tumba el vuelco: se registra y sigue', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    escribirClaveDiferida('rota', () => {
      throw new Error('circular');
    });
    escribirClaveDiferida('sana', 'ok');
    expect(volcarPendientes()).toBe(false);
    expect(leerClave('sana')).toBe('ok');
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('filtro de escritura', () => {
  it('la clave vetada no se escribe ni se encola; la permitida pasa', () => {
    fijarFiltroDeEscritura((clave) => clave !== 'vetada');
    expect(escribirClave('vetada', 'x')).toBe(false);
    expect(leerClave('vetada')).toBeNull();
    escribirClaveDiferida('vetada', 'x');
    expect(hayPendientes()).toBe(false);
    expect(escribirClave('libre', 'y')).toBe(true);
    expect(leerClave('libre')).toBe('y');
  });

  it('un veto NO es un fallo del almacén: no levanta la banda', () => {
    fijarFiltroDeEscritura(() => false);
    escribirClave('lo-que-sea', 'x');
    expect(estadoAlmacen().fallo).toBeNull();
  });

  it('borrar también queda vetado: lo guardado no se puede destruir desde el veto', () => {
    escribirClave('mia', '1');
    fijarFiltroDeEscritura(() => false);
    expect(borrarClave('mia')).toBe(false);
    expect(leerClave('mia')).toBe('1');
  });

  it('lo encolado ANTES del veto tampoco llega al almacén al volcar', () => {
    escribirClaveDiferida('tarde', 'v');
    fijarFiltroDeEscritura(() => false);
    expect(volcarPendientes()).toBe(false);
    expect(leerClave('tarde')).toBeNull();
    expect(hayPendientes()).toBe(false);
  });

  it('conEscrituraLibre levanta el veto sólo durante el cuerpo, y lo repone aunque lance', () => {
    fijarFiltroDeEscritura(() => false);
    conEscrituraLibre(() => escribirClave('a', '1'));
    expect(leerClave('a')).toBe('1');
    expect(escribirClave('b', '2')).toBe(false);
    expect(() =>
      conEscrituraLibre(() => {
        throw new Error('a mitad');
      }),
    ).toThrow('a mitad');
    expect(escribirClave('c', '3')).toBe(false);
  });
});

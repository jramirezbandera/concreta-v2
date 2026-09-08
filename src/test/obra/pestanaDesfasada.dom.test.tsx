/**
 * Dos pestañas, y la que se queda atrás DEJA DE ESCRIBIR las claves de la obra
 * (`vigilarPestanaDesfasada`).
 *
 * El agujero que cierra: con Vigas montado en la pestaña 1 y la pestaña 2
 * abriendo otra obra, el siguiente teclazo de la 1 escribía su viga en la clave
 * `rc-beams`, que ya pertenece a la obra nueva; el «Guardar» de la 2 la
 * archivaba dentro, y las dos obras acababan mezcladas sin que nadie lo viera.
 * La banda decía «no guardes desde aquí» mientras la propia app guardaba.
 *
 * Lo que SÍ se sigue escribiendo: las preferencias de la máquina (tema,
 * unidades) y la infraestructura del contenedor, que es quien arregla la
 * situación desplegando la obra buena.
 */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rcBeamDefaults } from '../../data/defaults';
import { CLAVE_OBRA, CLAVE_PROYECTO_ACTIVO } from '../../data/proyectoKeys';
import { useModuleState } from '../../hooks/useModuleState';
import { guardarObra, leerObra } from '../../lib/obra';
import {
  _reiniciarProyectoParaTests,
  desplegar,
  fijarProyectoActivo,
  pestanaDesfasada,
  proyectoNuevo,
  vigilarPestanaDesfasada,
} from '../../lib/proyecto';
import { publicar, retirarPublicacion } from '../../lib/pub';
import { _reiniciarAlmacenParaTests, escribirClave, leerClave, RETARDO_ESCRITURA_MS } from '../../lib/storage/seguro';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const montarVigas = () => renderHook(() => useModuleState('rc-beams', rcBeamDefaults), { wrapper });

const vigaGuardada = () => {
  const raw = window.localStorage.getItem('rc-beams');
  return raw ? (JSON.parse(raw) as { L: number }) : null;
};

/** La otra pestaña abre otra obra: cambia el activo de la máquina por debajo. */
function otraPestanaAbre(id: string) {
  window.localStorage.setItem(CLAVE_PROYECTO_ACTIVO, id);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  fijarProyectoActivo('la-mia');
  vigilarPestanaDesfasada();
});

afterEach(() => {
  vi.useRealTimers();
  _reiniciarProyectoParaTests();
  _reiniciarAlmacenParaTests();
});

describe('una pestaña desfasada no escribe las claves de la obra', () => {
  it('teclear en un módulo no llega al almacén, ni a los 300 ms ni al desmontar', () => {
    const { result, unmount } = montarVigas();
    act(() => result.current.setField('L', 6));
    act(() => vi.advanceTimersByTime(RETARDO_ESCRITURA_MS));
    expect(vigaGuardada()?.L).toBe(6); // en hora: se guarda como siempre

    otraPestanaAbre('la-de-la-otra');
    expect(pestanaDesfasada()).toBe(true);

    act(() => result.current.setField('L', 99));
    act(() => vi.advanceTimersByTime(RETARDO_ESCRITURA_MS));
    expect(vigaGuardada()?.L).toBe(6);
    unmount();
    expect(vigaGuardada()?.L).toBe(6);
  });

  it('tampoco la obra, el título del documento ni los sobres publicados', () => {
    guardarObra({ municipio: 'Ávila' });
    otraPestanaAbre('la-de-la-otra');

    guardarObra({ municipio: 'Sevilla' });
    expect(leerObra()?.municipio).toBe('Ávila');

    expect(escribirClave('concreta-viento-nieve-title', 'Nave nueva')).toBe(false);
    expect(leerClave('concreta-viento-nieve-title')).toBeNull();

    expect(publicar('viento-nieve', 1, { q: 1 })).toBeNull();
    expect(leerClave('concreta-pub-viento-nieve')).toBeNull();
  });

  it('las preferencias de la máquina siguen escribiéndose: no son de la obra', () => {
    otraPestanaAbre('la-de-la-otra');
    expect(escribirClave('concreta-theme', 'dark')).toBe(true);
    expect(escribirClave('unitSystem', 'SI')).toBe(true);
  });

  it('el contenedor SÍ escribe: desplegar la obra nueva no se queda a medias', () => {
    escribirClave('rc-beams', JSON.stringify({ L: 4 }));
    otraPestanaAbre('la-de-la-otra');

    const destino = proyectoNuevo('Obra nueva');
    destino.claves = { 'rc-beams': JSON.stringify({ L: 12 }), 'rc-beams-version': '1' };
    destino.obra = { ...destino.obra, municipio: 'Dos Hermanas' };
    const r = desplegar(destino);

    expect(r.ok).toBe(true);
    expect(vigaGuardada()?.L).toBe(12);
    expect(leerObra()?.municipio).toBe('Dos Hermanas');
    expect(window.localStorage.getItem(CLAVE_OBRA)).not.toBeNull();
  });

  it('al ponerse en hora, la pestaña vuelve a guardar', () => {
    const { result } = montarVigas();
    otraPestanaAbre('la-de-la-otra');
    act(() => result.current.setField('L', 99));
    act(() => vi.advanceTimersByTime(RETARDO_ESCRITURA_MS));
    expect(vigaGuardada()).toBeNull();

    act(() => fijarProyectoActivo('la-de-la-otra')); // esta pestaña recarga o adopta la obra
    expect(pestanaDesfasada()).toBe(false);
    act(() => result.current.setField('L', 7));
    act(() => vi.advanceTimersByTime(RETARDO_ESCRITURA_MS));
    expect(vigaGuardada()?.L).toBe(7);
  });

  it('sin guardia instalado, nada cambia (los módulos sueltos y los tests siguen igual)', () => {
    _reiniciarProyectoParaTests();
    otraPestanaAbre('la-de-la-otra');
    expect(escribirClave('rc-beams', JSON.stringify({ L: 3 }))).toBe(true);
    retirarPublicacion('viento-nieve');
  });
});

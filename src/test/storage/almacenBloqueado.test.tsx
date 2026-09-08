/**
 * El navegador BLOQUEA el almacenamiento del sitio (Chrome con los datos de
 * sitio bloqueados, un `<iframe sandbox>`, algunas WebView): ahí el ACCESO al
 * identificador `localStorage` lanza `SecurityError`, no sólo la lectura, y
 * `typeof localStorage` propaga esa excepción igual.
 *
 * Lo que se protege: que eso no tumbe la app. `main.tsx` llama a
 * `repararAlArrancar()` ANTES del primer render, así que una excepción ahí es
 * una pantalla en blanco, no un módulo que no guarda. La app tiene que
 * arrancar en modo memoria y avisar con la banda.
 */

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { rcBeamDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { _reiniciarProyectoParaTests, hayTrabajoVivo, repararAlArrancar, serializar } from '../../lib/proyecto';
import {
  _reiniciarAlmacenParaTests,
  borrarClave,
  clavesAlmacenadas,
  escribirClave,
  escribirClaveDiferida,
  estadoAlmacen,
  leerClave,
  volcarPendientes,
} from '../../lib/storage/seguro';

/** Un `localStorage` cuyo simple ACCESO lanza, como el del navegador con el sitio bloqueado. */
function conAlmacenBloqueado<T>(cuerpo: () => T): T {
  const propio = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('El acceso al almacenamiento está bloqueado', 'SecurityError');
    },
  });
  try {
    return cuerpo();
  } finally {
    if (propio) Object.defineProperty(window, 'localStorage', propio);
    else delete (window as unknown as Record<string, unknown>).localStorage;
  }
}

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
});

describe('con el almacenamiento bloqueado por el navegador', () => {
  it('el acceso que lanza no se propaga: se lee vacío, no se escribe, y se avisa una vez', () => {
    conAlmacenBloqueado(() => {
      expect(leerClave('rc-beams')).toBeNull();
      expect(escribirClave('rc-beams', '{}')).toBe(false);
      expect(borrarClave('rc-beams')).toBe(false);
      expect(clavesAlmacenadas()).toEqual([]);
      // Sin clave: el fallo es de todo el almacén, y así la banda no parpadea
      // con una notificación por cada clave que se intente leer.
      expect(estadoAlmacen()).toEqual({ fallo: 'no-disponible', clave: null });
    });
  });

  it('la cola diferida tampoco revienta al volcar', () => {
    conAlmacenBloqueado(() => {
      escribirClaveDiferida('rc-beams', '{"L":6}');
      expect(volcarPendientes()).toBe(false);
      expect(estadoAlmacen().fallo).toBe('no-disponible');
    });
  });

  it('el arranque de la app no lanza: se repara sin nada que reparar', () => {
    conAlmacenBloqueado(() => {
      const informe = repararAlArrancar();
      expect(informe).toEqual({ indiceReparado: false, recuperacion: null });
      expect(hayTrabajoVivo()).toBe(false);
      expect(() => serializar('p1')).not.toThrow();
    });
  });

  it('un módulo se monta y se puede teclear: el cálculo vive en memoria', () => {
    conAlmacenBloqueado(() => {
      const { result, unmount } = renderHook(() => useModuleState('rc-beams', rcBeamDefaults), { wrapper });
      expect(result.current.state.L).toBe(rcBeamDefaults.L);
      expect(() => unmount()).not.toThrow();
    });
  });
});

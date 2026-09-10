/**
 * El desplegable de la topbar (`PiezaMenu`): qué cálculo de la obra tienes
 * abierto en el módulo, el salto a los otros sin pasar por el anejo, y «Nuevo
 * cálculo». No aparece si no hay nada que enseñar, avisa antes de pisar un
 * cálculo sin guardar, y pide el remonte —los módulos leen el almacén sólo al
 * montarse, así que sin él cambiarían los datos por debajo sin que se note.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PiezaMenu } from '../../components/layout/PiezaMenu';
import { adaptadorDe, escribirAnejo, huellaDeModulo, leerVinculo, type Pieza } from '../../lib/anejo';
import { _reiniciarRemonteParaTests, instantaneaRemonte } from '../../lib/anejo/remonte';
import { _reiniciarProyectoParaTests } from '../../lib/proyecto';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const V3 = '{"title":"Viga V-3","L":6}';

function pieza(id: string, titulo: string, datos: Record<string, string> | null, extra: Partial<Pieza> = {}): Pieza {
  return {
    id,
    modulo: 'concreta-rc-beams',
    clave: 'rc-beams',
    titulo,
    ts: '2026-09-10T10:00:00.000Z',
    esquema: '1',
    blobId: `blob-${id}`,
    paginas: 2,
    huella: null,
    datos,
    tituloEnPdf: true,
    incluida: true,
    ...extra,
  };
}

const montar = (ruta = '/horm/vigas') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <PiezaMenu />
    </MemoryRouter>,
  );

const disparador = () => screen.getByRole('button', { name: /Cálculo abierto|Elegir un cálculo/ });

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  _reiniciarRemonteParaTests();
});

afterEach(() => vi.restoreAllMocks());

describe('cuándo aparece', () => {
  it('no aparece sin nada guardado de este módulo: un módulo virgen no carga con un desplegable vacío', () => {
    montar();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tampoco fuera de un módulo', () => {
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', { 'rc-beams': V3 })] });
    montar('/proyecto/anejo');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sólo enseña las de SU módulo', async () => {
    escribirAnejo({
      v: 1,
      piezas: [
        pieza('p1', 'Viga V-3', { 'rc-beams': V3 }),
        pieza('p2', 'Pilar P-7', null, { modulo: 'concreta-rc-columns', clave: 'rc-columns' }),
      ],
    });
    montar();
    await userEvent.click(disparador());
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Viga V-3/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Pilar P-7/ })).toBeNull();
  });
});

describe('saltar de un cálculo a otro', () => {
  beforeEach(() => {
    // El módulo tiene EXACTAMENTE lo que hay guardado en p1: así no hay trabajo
    // sin guardar y el menú actúa sin preguntar (el aviso tiene su propio test).
    localStorage.setItem('rc-beams', V3);
    localStorage.setItem('rc-beams-version', '1');
    const huella = huellaDeModulo(adaptadorDe('concreta-rc-beams'));
    escribirAnejo({
      v: 1,
      piezas: [
        pieza('p1', 'Viga V-3', { 'rc-beams': V3, 'rc-beams-version': '1' }, { huella }),
        pieza('p2', 'Viga V-4', { 'rc-beams': '{"title":"Viga V-4","L":9}', 'rc-beams-version': '1' }),
      ],
    });
    localStorage.setItem('concreta-anejo-abierta', JSON.stringify({ modulo: 'concreta-rc-beams', piezaId: 'p1' }));
  });

  it('el disparador dice cuál tienes abierto, y la lista lo marca', async () => {
    montar();
    expect(disparador()).toHaveTextContent('Viga V-3');
    await userEvent.click(disparador());
    expect(screen.getByRole('menuitem', { name: /Viga V-3/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('menuitem', { name: /Viga V-4/ })).not.toHaveAttribute('aria-current');
  });

  it('elegir otra la carga en el módulo, cambia el vínculo y pide el remonte', async () => {
    montar();
    const antes = instantaneaRemonte();
    await userEvent.click(disparador());
    await userEvent.click(screen.getByRole('menuitem', { name: /Viga V-4/ }));
    expect(localStorage.getItem('rc-beams')).toBe('{"title":"Viga V-4","L":9}');
    expect(leerVinculo()).toEqual({ modulo: 'concreta-rc-beams', piezaId: 'p2' });
    expect(instantaneaRemonte()).toBeGreaterThan(antes);
  });

  it('con un cálculo sin guardar avisa antes de pisarlo, y cancelar no toca nada', async () => {
    localStorage.setItem('rc-beams', '{"title":"Viga V-9","L":4}');
    montar();
    await userEvent.click(disparador());
    await userEvent.click(screen.getByRole('menuitem', { name: /Viga V-4/ }));
    expect(screen.getByText(/no está guardado en el anejo/)).toBeInTheDocument();
    expect(localStorage.getItem('rc-beams')).toBe('{"title":"Viga V-9","L":4}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(localStorage.getItem('rc-beams')).toBe('{"title":"Viga V-9","L":4}');

    await userEvent.click(disparador());
    await userEvent.click(screen.getByRole('menuitem', { name: /Viga V-4/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar igualmente' }));
    expect(localStorage.getItem('rc-beams')).toBe('{"title":"Viga V-4","L":9}');
  });
});

describe('nuevo cálculo', () => {
  it('deja el módulo en blanco, lo desengancha y pide el remonte', async () => {
    localStorage.setItem('rc-beams', V3);
    localStorage.setItem('rc-beams-version', '1');
    const huella = huellaDeModulo(adaptadorDe('concreta-rc-beams'));
    escribirAnejo({ v: 1, piezas: [pieza('p1', 'Viga V-3', { 'rc-beams': V3, 'rc-beams-version': '1' }, { huella })] });
    localStorage.setItem('concreta-anejo-abierta', JSON.stringify({ modulo: 'concreta-rc-beams', piezaId: 'p1' }));
    montar();
    const antes = instantaneaRemonte();
    await userEvent.click(disparador());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nuevo cálculo' }));
    expect(localStorage.getItem('rc-beams')).toBeNull();
    expect(localStorage.getItem('rc-beams-version')).toBeNull();
    expect(leerVinculo()).toBeNull();
    expect(instantaneaRemonte()).toBeGreaterThan(antes);
    // Y lo que había sigue en el anejo, con su PDF y sus datos.
    expect(localStorage.getItem('concreta-anejo')).toContain('Viga V-3');
  });
});

/**
 * El buscador de municipios como CONTROL: teclado y modo de fallo.
 *
 * Los dos defectos que se prueban aquí comparten víctima. En esta pantalla «no
 * figura en el Anejo 1» significa «la Norma no te obliga», así que cualquier
 * forma de no encontrar un municipio —porque la tabla no cargó, o porque no se
 * puede llegar a la opción con el teclado— acaba en el mismo sitio: alguien
 * dando por exento un edificio que no lo está.
 *
 * Se monta `SeismicInputs` sola, sin el módulo entero, porque lo que se prueba
 * es el control y no el cableado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { useState } from 'react';

import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { SeismicInputs } from '../../features/seismic-ncse02/SeismicInputs';
import {
  defaultSeismicState,
  evaluarSismo,
  type SeismicState,
} from '../../features/seismic-ncse02/state';
import type { Municipio } from '../../features/seismic-ncse02/hazard';

const buscar = vi.fn<(q: string, limite?: number) => Promise<Municipio[]>>();

vi.mock('../../features/seismic-ncse02/hazard', async (original) => {
  const real = await original<typeof import('../../features/seismic-ncse02/hazard')>();
  return { ...real, buscarMunicipios: (q: string, n?: number) => buscar(q, n) };
});

const M = (ine: string, nombre: string, provincia: string, ab: number): Municipio => ({
  ine,
  nombre,
  provincia,
  ab,
  k: 1,
  procedencia: null,
});

/** Los dos Torrent de M5: mismo nombre, 40 % de diferencia en la aceleración. */
const TORRENTS = [M('17199', 'Torrent', 'Girona', 0.05), M('46244', 'Torrent', 'Valencia', 0.07)];

function Anfitrion() {
  const [state, setState] = useState<SeismicState>(defaultSeismicState);
  // El panel lee el sistema de unidades del contexto (Σ P y los campos con
  // `quantity`): en la app lo provee el shell, aquí hay que dárselo.
  return (
    <UnitSystemProvider>
      <SeismicInputs
        state={state}
        setState={setState}
        evaluacion={evaluarSismo(state)}
        onEditPlantas={() => {}}
        onEditGeometria={() => {}}
      />
    </UnitSystemProvider>
  );
}

/** El rótulo lleva su referencia normativa pegada: «Municipio Anejo 1». */
const caja = () => screen.getByLabelText(/^Municipio/);

beforeEach(() => {
  buscar.mockReset();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('el buscador se maneja con el teclado', () => {
  // M10. Sin patrón combobox la lista sólo existía para el ratón: desde la caja
  // de búsqueda se tabulaba al siguiente campo sin poder llegar a ninguna de
  // las opciones que uno acababa de pedir.

  it('flechas y Enter eligen una opción, y la elegida es la resaltada', async () => {
    buscar.mockResolvedValue(TORRENTS);
    render(<Anfitrion />);

    fireEvent.change(caja(), { target: { value: 'torrent' } });
    const lista = await screen.findByRole('listbox', {}, { timeout: 3000 });
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(2));

    // Abajo dos veces: la segunda opción (Valencia, 0,07 g).
    fireEvent.keyDown(caja(), { key: 'ArrowDown' });
    fireEvent.keyDown(caja(), { key: 'ArrowDown' });

    const opciones = within(lista).getAllByRole('option');
    expect(opciones[1].getAttribute('aria-selected')).toBe('true');
    // Y el foco virtual del combobox apunta a ESA opción, que es lo que un
    // lector de pantalla lee en voz alta.
    expect(caja().getAttribute('aria-activedescendant')).toBe(opciones[1].id);

    fireEvent.keyDown(caja(), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/INE 46244/)).toBeTruthy());
  });

  it('la lista da la vuelta y Escape la cierra', async () => {
    buscar.mockResolvedValue(TORRENTS);
    render(<Anfitrion />);
    fireEvent.change(caja(), { target: { value: 'torrent' } });
    const lista = await screen.findByRole('listbox', {}, { timeout: 3000 });
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(2));

    // Arriba desde "ninguna" lleva a la ÚLTIMA: es lo que hace un desplegable.
    fireEvent.keyDown(caja(), { key: 'ArrowUp' });
    expect(within(lista).getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(caja(), { key: 'Escape' });
    expect(caja().getAttribute('aria-expanded')).toBe('false');
  });

  it('los homónimos se distinguen por provincia', async () => {
    // M5. Sin ella el desplegable ofrecía dos filas de texto idéntico, y elegir
    // la que no era rebaja el cortante basal un 30 % sin ningún aviso.
    buscar.mockResolvedValue(TORRENTS);
    render(<Anfitrion />);
    fireEvent.change(caja(), { target: { value: 'torrent' } });

    const lista = await screen.findByRole('listbox', {}, { timeout: 3000 });
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(2));
    const opciones = within(lista).getAllByRole('option');
    expect(opciones[0].textContent).toContain('Girona');
    expect(opciones[1].textContent).toContain('Valencia');
  });
});

describe('si la tabla no carga, el buscador lo dice', () => {
  // M3. La promesa del import() quedaba memoizada TAMBIÉN al fallar, así que
  // toda búsqueda posterior reutilizaba el rechazo hasta recargar la página. Y
  // el `.then` no tenía rama de error: promesa rechazada sin dueño, `buscando`
  // colgado en true —lo que además suprime el mensaje de «no figura»— y una
  // caja que simplemente no responde.

  it('avisa del fallo, y NO lo confunde con una exención', async () => {
    buscar.mockRejectedValue(new Error('red caida'));
    render(<Anfitrion />);
    fireEvent.change(caja(), { target: { value: 'granada' } });

    const aviso = await screen.findByText(/No se ha podido cargar la tabla/i, {}, { timeout: 3000 });
    expect(aviso.textContent).toMatch(/no.*significa que el municipio no figure/i);
    // Lo que NO puede salir: el mensaje que en esta pantalla se lee como que la
    // Norma no obliga.
    expect(screen.queryByText(/No figura en el Anejo 1/)).toBeNull();
  });

  it('volver a teclear reintenta de verdad', async () => {
    buscar.mockRejectedValueOnce(new Error('red caida')).mockResolvedValue(TORRENTS);
    render(<Anfitrion />);

    fireEvent.change(caja(), { target: { value: 'torrent' } });
    await screen.findByText(/No se ha podido cargar la tabla/i, {}, { timeout: 3000 });

    fireEvent.change(caja(), { target: { value: 'torrent ' } });
    const lista = await screen.findByRole('listbox', {}, { timeout: 3000 });
    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(2));
    // Y el aviso de fallo desaparece con el reintento bueno.
    expect(screen.queryByText(/No se ha podido cargar la tabla/i)).toBeNull();
  });
});

/**
 * El control de obra del Sidebar: Nueva · Guardar · Exportar · Importar y los
 * recientes. Lo que se protege: la creación perezosa (pedir UN nombre), que
 * nunca se pise trabajo sin obra sin preguntar, que abrir avise de esquemas
 * distintos y de una versión nueva esperando, que importar rechace lo que no
 * es un proyecto, y que la pestaña desfasada no pueda guardar.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObraMenu } from '../../components/layout/ObraMenu';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { showToast } from '../../components/ui/Toast';
import { CLAVE_PROYECTO_ACTIVO } from '../../data/proyectoKeys';
import { leerObra } from '../../lib/obra';
import { cargarEstado, guardarEstado } from '../../features/memoria-dbse/state';
import { teclear } from '../../lib/memoria/estado';
import {
  _reiniciarProyectoParaTests,
  cargar,
  fijarProyectoActivo,
  guardar,
  listar,
  proyectoActivo,
  proyectoNuevo,
  type ProyectoFile,
} from '../../lib/proyecto';
import { hayActualizacionEnEspera, recargar } from '../../lib/proyecto/navegador';
import { _reiniciarAlmacenParaTests, leerClave } from '../../lib/storage/seguro';

vi.mock('../../lib/proyecto/navegador', () => ({
  recargar: vi.fn(),
  hayActualizacionEnEspera: vi.fn(async () => false),
}));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

/** Con el contexto de unidades: el diálogo de obra pide la altitud con `RawNumberInput`. */
const montar = () => render(<ObraMenu />, { wrapper: UnitSystemProvider });

const abrirMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /menú de obra/i }));
};

/** Los dos campos obligatorios del diálogo de obra nueva: denominación y provincia. */
const rellenarObra = async (user: ReturnType<typeof userEvent.setup>, nombre: string, provincia = '18') => {
  await user.type(screen.getByLabelText('Nombre de la obra'), nombre);
  await user.selectOptions(screen.getByLabelText('Provincia'), provincia);
};

const toasts = () => vi.mocked(showToast).mock.calls.map((c) => c[0]);

function archivada(nombre: string, id: string, extra: Partial<ProyectoFile> = {}): ProyectoFile {
  const p = { ...proyectoNuevo(nombre), id, ...extra };
  guardar(p);
  return p;
}

beforeEach(() => {
  window.localStorage.clear();
  _reiniciarAlmacenParaTests();
  _reiniciarProyectoParaTests();
  vi.mocked(recargar).mockClear();
  vi.mocked(hayActualizacionEnEspera).mockReset().mockResolvedValue(false);
  vi.mocked(showToast).mockClear();
});

describe('ObraMenu', () => {
  it('sin obra: el disparador dice «Sin obra» y no hay recientes', async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.getByRole('button', { name: /menú de obra/i }).textContent).toMatch(/Sin obra/);
    await abrirMenu(user);
    expect(screen.getByRole('menu', { name: 'Obra' })).toBeInTheDocument();
    expect(screen.getByText(/Ninguna obra guardada/)).toBeInTheDocument();
  });

  it('Nueva obra: pide el nombre, la crea, la deja activa y recarga', async () => {
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /^nueva obra/i }));
    await rellenarObra(user, 'Nave nueva');
    await user.click(screen.getByRole('button', { name: 'Crear y abrir' }));

    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
    expect(listar().map((e) => e.nombre)).toEqual(['Nave nueva']);
    expect(proyectoActivo()).toBe(listar()[0].id);
    expect(leerObra()?.denominacion).toBe('Nave nueva');
  });

  it('Nueva obra con cálculos sin obra: ofrece guardarlos con nombre antes de pisarlos', async () => {
    window.localStorage.setItem('rc-beams', '{"L":6}');
    window.localStorage.setItem('rc-beams-version', '1');
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /^nueva obra/i }));
    await rellenarObra(user, 'Nave nueva');
    await user.click(screen.getByRole('button', { name: 'Crear y abrir' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Hay cálculos sin obra' });
    expect(dialogo).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre de la obra'), 'La vieja');
    await user.click(screen.getByRole('button', { name: 'Guardar y seguir' }));

    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
    const nombres = listar().map((e) => e.nombre).sort();
    expect(nombres).toEqual(['La vieja', 'Nave nueva']);
    const vieja = listar().find((e) => e.nombre === 'La vieja')!;
    expect(cargar(vieja.id)?.claves['rc-beams']).toBe('{"L":6}');
    expect(leerClave('rc-beams')).toBeNull(); // la nueva está en blanco
  });

  it('Nueva obra no se crea sin provincia, y escribe los cinco datos', async () => {
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /^nueva obra/i }));

    // Con nombre pero sin provincia el botón no confirma, y dice por qué: sin
    // provincia no hay zona eólica, ni de nieve, ni peligrosidad sísmica.
    await user.type(screen.getByLabelText('Nombre de la obra'), 'Nave en Dos Hermanas');
    const crear = screen.getByRole('button', { name: 'Crear y abrir' });
    expect(crear).toBeDisabled();
    expect(screen.getByRole('status').textContent).toMatch(/provincia/i);

    await user.selectOptions(screen.getByLabelText('Provincia'), '41');
    await user.type(screen.getByLabelText('Uso'), 'Nave industrial');
    await user.type(screen.getByLabelText('Municipio'), 'Dos Hermanas');
    await user.type(screen.getByLabelText('Altitud'), '42');
    expect(crear).toBeEnabled();
    await user.click(crear);

    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
    expect(leerObra()).toEqual({
      denominacion: 'Nave en Dos Hermanas',
      uso: 'Nave industrial',
      provincia: '41',
      municipio: 'Dos Hermanas',
      altitud: 42,
    });
  });

  it('«Datos de la obra…» abre los mismos cinco campos con lo que ya hay, y los guarda', async () => {
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /^nueva obra/i }));
    await rellenarObra(user, 'Nave nueva', '18');
    await user.click(screen.getByRole('button', { name: 'Crear y abrir' }));
    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));

    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /datos de la obra/i }));
    expect(screen.getByLabelText('Nombre de la obra')).toHaveValue('Nave nueva');
    expect(screen.getByLabelText('Provincia')).toHaveValue('18');

    await user.selectOptions(screen.getByLabelText('Provincia'), '41');
    await user.click(screen.getByRole('button', { name: 'Guardar los datos' }));

    expect(leerObra()?.provincia).toBe('41');
    expect(leerObra()?.denominacion).toBe('Nave nueva');
  });

  it('Guardar y Exportar siguen pidiendo UN campo: no heredan los cinco de la obra', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('forjados', '{"x":1}');
    montar();

    for (const item of ['Guardar', 'Exportar…'] as const) {
      await abrirMenu(user);
      await user.click(screen.getByRole('menuitem', { name: item }));
      expect(screen.getByLabelText('Nombre de la obra')).toBeInTheDocument();
      expect(screen.queryByLabelText('Provincia')).toBeNull();
      expect(screen.queryByLabelText('Altitud')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    }
  });

  it('Duplicar guarda la original intacta y abre una copia con el solar en ámbar', async () => {
    const user = userEvent.setup();
    montar();

    // Una obra con la ficha rellena: la geotecnia confirmada y la sobrecarga
    // en el terreno tecleada.
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /^nueva obra/i }));
    await rellenarObra(user, 'Nave A', '18');
    await user.click(screen.getByRole('button', { name: 'Crear y abrir' }));
    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));

    let ficha = teclear(cargarEstado(), 'obra.geotecnia.empresa', 'Geotecnia SL');
    ficha = teclear(ficha, 'obra.sobrecargaTerreno', 12);
    guardarEstado(ficha);

    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /duplicar esta obra/i }));
    await rellenarObra(user, 'Nave B', '18');
    await user.click(screen.getByRole('button', { name: 'Duplicar y abrir' }));
    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(2));

    // Dos obras, y la nueva es la activa.
    const nombres = listar().map((e) => e.nombre).sort();
    expect(nombres).toEqual(['Nave A', 'Nave B']);
    expect(listar().find((e) => e.id === proyectoActivo())?.nombre).toBe('Nave B');

    // La original, intacta: su geotecnia sigue confirmada.
    const a = listar().find((e) => e.nombre === 'Nave A')!;
    const fichaA = JSON.parse(cargar(a.id)!.claves['concreta-memoria-dbse-model']) as { obra: { geotecnia: { empresa: { origen: string } } } };
    expect(fichaA.obra.geotecnia.empresa.origen).toBe('tecleado');

    // La copia: el solar en ámbar, los criterios del despacho tal cual.
    const copia = cargarEstado();
    expect(copia.obra.geotecnia.empresa.valor).toBe('Geotecnia SL');
    expect(copia.obra.geotecnia.empresa.origen).toBe('heredado');
    expect(copia.obra.sobrecargaTerreno.origen).toBe('tecleado');
    expect(leerObra()?.denominacion).toBe('Nave B');
  });

  it('Guardar sin obra pide el nombre y la crea; con obra, guarda sin preguntar', async () => {
    window.localStorage.setItem('forjados', '{"x":1}');
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Guardar' }));
    await user.type(screen.getByLabelText('Nombre de la obra'), 'Mi obra');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(listar().map((e) => e.nombre)).toEqual(['Mi obra']);
    expect(proyectoActivo()).toBe(listar()[0].id);
    expect(cargar(proyectoActivo()!)?.claves.forjados).toBe('{"x":1}');
    expect(toasts()).toEqual([expect.stringMatching(/Obra guardada: Mi obra/)]);
    expect(screen.getByRole('button', { name: /menú de obra/i }).textContent).toMatch(/Mi obra/);

    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Guardar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toasts()).toHaveLength(2);
    expect(recargar).not.toHaveBeenCalled();
  });

  it('pestaña desfasada: Guardar y Exportar quedan deshabilitados', async () => {
    fijarProyectoActivo('mia');
    const user = userEvent.setup();
    montar();
    act(() => {
      window.localStorage.setItem(CLAVE_PROYECTO_ACTIVO, 'otra');
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_PROYECTO_ACTIVO, newValue: 'otra' }));
    });
    await abrirMenu(user);
    expect(screen.getByRole('menuitem', { name: 'Guardar' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /exportar/i })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /importar/i })).toBeEnabled();
  });

  it('abrir un reciente guardado con otro esquema: diálogo que nombra el módulo, y al confirmar cambia y recarga', async () => {
    archivada('Nave B', 'b', { claves: { 'rc-beams': '{}', 'rc-beams-version': '0' }, esquemas: { 'rc-beams': '0' } });
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Nave B/ }));

    const dialogo = await screen.findByRole('dialog', { name: 'Abrir obra' });
    expect(dialogo.textContent).toMatch(/Hormigón · Vigas/);
    expect(dialogo.textContent).not.toMatch(/versión nueva/);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
    expect(proyectoActivo()).toBe('b');
    expect(leerObra()?.denominacion).toBe('Nave B');
  });

  it('abrir un reciente limpio no pregunta; con una versión nueva esperando, lo dice', async () => {
    archivada('Nave C', 'c');
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Nave C/ }));
    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();

    vi.mocked(hayActualizacionEnEspera).mockResolvedValue(true);
    archivada('Nave D', 'd');
    await abrirMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Nave D/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Abrir obra' });
    expect(dialogo.textContent).toMatch(/versión nueva de Concreta/);
  });

  it('importar un fichero que no es un proyecto: toast con el motivo, y nada cambia', async () => {
    montar();
    const input = screen.getByLabelText('Fichero de obra');
    fireEvent.change(input, { target: { files: [new File(['{no es json'], 'x.json', { type: 'application/json' })] } });
    await waitFor(() => expect(toasts()).toEqual([expect.stringMatching(/JSON/)]));
    expect(listar()).toEqual([]);
    expect(recargar).not.toHaveBeenCalled();
  });

  it('importar un proyecto: diálogo que cuenta las claves ignoradas, y al abrir lo archiva, cambia y recarga', async () => {
    window.localStorage.setItem('concreta-ai-settings', '{"key":"mia"}');
    const p = { ...proyectoNuevo('Importada'), id: 'imp', claves: { forjados: '{}', 'concreta-ai-settings': '{"key":"robada"}' } };
    const user = userEvent.setup();
    montar();
    const input = screen.getByLabelText('Fichero de obra');
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(p)], 'importada.concreta.json', { type: 'application/json' })] } });

    const dialogo = await screen.findByRole('dialog', { name: 'Importar obra' });
    expect(dialogo.textContent).toMatch(/Se abrirá «Importada»/);
    expect(dialogo.textContent).toMatch(/1 clave que no es de proyecto/);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
    expect(listar().map((e) => e.id)).toEqual(['imp']);
    expect(proyectoActivo()).toBe('imp');
    expect(leerClave('forjados')).toBe('{}');
    expect(leerClave('concreta-ai-settings')).toBe('{"key":"mia"}');
  });

  it('borrar un reciente: confirma y desaparece del listado', async () => {
    archivada('Para borrar', 'pb');
    const user = userEvent.setup();
    montar();
    await abrirMenu(user);
    await user.click(screen.getByRole('button', { name: 'Borrar Para borrar' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(listar()).toEqual([]);
    expect(toasts()).toEqual([expect.stringMatching(/Obra borrada/)]);
  });
});

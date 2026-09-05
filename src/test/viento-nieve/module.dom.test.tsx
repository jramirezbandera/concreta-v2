/**
 * Smoke de integración del módulo en jsdom: que el cable entre la pregunta de
 * obra, el motor, la pantalla y la publicación existe.
 *
 *   1. sin provincia el módulo enseña el hueco y no publica;
 *   2. elegir la provincia rellena las zonas y las fuerzas por planta;
 *   3. las pestañas del documento pintan lo mismo que dice el editor;
 *   4. la publicación aparece en `concreta-pub-viento-nieve`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { VientoNieveModule } from '../../features/viento-nieve';
import { MODULO_PUB } from '../../features/viento-nieve/state';
import { leerPublicacion } from '../../lib/pub';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

// Los ficheros de verdad tienen su test (`exportacion.test.ts`). Aquí sólo el
// CABLE: que el botón abre el modal, que el título llega al exportador y que
// cada pestaña exporta lo suyo.
const exportarVientoNieveDocx = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.docx` : 'viento-y-nieve.docx',
}));
vi.mock('../../lib/docx/vientoNieve', () => ({
  exportarVientoNieveDocx: (blocks: unknown, titulo?: string) => exportarVientoNieveDocx(blocks, titulo),
}));
const exportarVientoNieveXlsx = vi.fn(async (_secciones: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.xlsx` : 'viento-y-nieve.xlsx',
}));
vi.mock('../../lib/xlsx/vientoNieve', () => ({
  exportarVientoNieveXlsx: (secciones: unknown, titulo?: string) => exportarVientoNieveXlsx(secciones, titulo),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/viento-nieve']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <VientoNieveModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  exportarVientoNieveDocx.mockClear();
  exportarVientoNieveXlsx.mockClear();
});

/** Madrid a 660 m, tecleado en el formulario. */
function rellenarMadrid() {
  fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '28' } });
  fireEvent.change(screen.getByLabelText('Altitud'), { target: { value: '660' } });
}

afterEach(() => {
  cleanup();
});

describe('Viento y nieve — módulo', () => {
  it('arranca en hueco: pide la provincia y la altitud, y no publica', () => {
    montar();
    expect(screen.getByRole('heading', { name: '¿Dónde está la obra?' })).toBeInTheDocument();
    expect(screen.getByText(/falta la provincia y la altitud/i)).toBeInTheDocument();
    expect(screen.getByText(/Elija la provincia \(o fuerce la zona eólica\)/)).toBeInTheDocument();
    expect(leerPublicacion(MODULO_PUB)).toBeNull();
  });

  it('elegir Madrid y una altitud rellena zonas, fuerzas por planta y publica', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText('Altitud'), { target: { value: '660' } });

    // Las zonas derivadas de la provincia, en sus desplegables.
    expect((screen.getByLabelText('Zona eólica') as HTMLSelectElement).options[0].text).toMatch(/^A — la de la provincia/);
    expect((screen.getByLabelText('Zona de clima invernal') as HTMLSelectElement).options[0].text).toMatch(/^4 — la de la provincia/);

    // La tabla de plantas tiene sus columnas derivadas rellenas.
    const filaCubierta = (screen.getAllByLabelText('Nombre de la planta') as HTMLInputElement[])
      .find((i) => i.value === 'Cubierta')!
      .closest('tr')!;
    const celdas = within(filaCubierta).getAllByRole('cell');
    expect(celdas[2].textContent).not.toBe('—'); // ce
    expect(celdas[4].textContent).not.toBe('—'); // Fx

    // La nieve sale de la tabla E.2.
    expect(screen.getByText(/sk = 0,56 kN\/m² \(tabla E\.2\)/)).toBeInTheDocument();

    await waitFor(() => expect(leerPublicacion(MODULO_PUB)).not.toBeNull());
    const pub = leerPublicacion<{ viento: { fuerzas: unknown[] } | null }>(MODULO_PUB);
    expect(pub!.obra.provincia).toBe('Madrid');
    expect(pub!.datos.viento?.fuerzas).toHaveLength(3);
  });

  it('las pestañas Plano y Memoria pintan el cuadro', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '08' } });
    // La caja de altitud enseña «0» en hueco; el atajo «0 m» es lo que fija el dato.
    fireEvent.click(screen.getByRole('button', { name: '0 m' }));
    expect(screen.queryByText(/falta la altitud/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText('VIENTO (SEGÚN DB SE-AE)')).toBeInTheDocument();
    expect(screen.getByText(/C \(velocidad básica 29 m\/s\)/)).toBeInTheDocument();
    expect(screen.getByText('NIEVE (SEGÚN DB SE-AE)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getByText(/ACCIÓN DEL VIENTO \(DB SE-AE/)).toBeInTheDocument();
    expect(screen.getByText(/CARGA DE NIEVE \(DB SE-AE/)).toBeInTheDocument();
    expect(screen.getByText(/Viento según X/)).toBeInTheDocument();
  });

  it('omitir el viento lo quita del documento y de la publicación', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText('Altitud'), { target: { value: '660' } });
    fireEvent.click(screen.getByRole('button', { name: 'Incluir el viento' }));
    expect(screen.getByText(/El viento no entra en esta obra/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.queryByText('VIENTO (SEGÚN DB SE-AE)')).not.toBeInTheDocument();
    expect(screen.getByText('NIEVE (SEGÚN DB SE-AE)')).toBeInTheDocument();

    await waitFor(() => {
      const pub = leerPublicacion<{ viento: unknown; nieve: unknown }>(MODULO_PUB);
      expect(pub?.datos.viento).toBeNull();
      expect(pub?.datos.nieve).not.toBeNull();
    });
  });
});

describe('exportación', () => {
  it('con huecos, exportar avisa en vez de abrir el modal', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByText('Rellene la provincia y la altitud antes de exportar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título del elemento')).not.toBeInTheDocument();
  });

  it('el título confirmado llega al exportador de Word con los bloques de MEMORIA', async () => {
    let descargado = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargado = this.download;
    });
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByText('viento-y-nieve.docx')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título del elemento'), { target: { value: 'Bloque en Madrid' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exportar Word' }));

    await waitFor(() => expect(exportarVientoNieveDocx).toHaveBeenCalled());
    expect(exportarVientoNieveDocx.mock.calls[0][1]).toBe('Bloque en Madrid');
    const bloques = exportarVientoNieveDocx.mock.calls[0][0] as { text?: string }[];
    expect(bloques.some((b) => b.text === 'ACCIÓN DEL VIENTO (DB SE-AE, art. 3.3 y Anejo D)')).toBe(true);
    expect(bloques.some((b) => b.text === 'VIENTO (SEGÚN DB SE-AE)')).toBe(false);
    await waitFor(() => expect(descargado).toBe('bloque-en-madrid.docx'));
    click.mockRestore();
  });

  it('en la pestaña Plano el botón pasa a Excel y exporta las tres pestañas del plano', async () => {
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.queryByRole('button', { name: 'Exportar Word' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(screen.getByText('viento-y-nieve.xlsx')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => expect(exportarVientoNieveXlsx).toHaveBeenCalled());
    expect(exportarVientoNieveDocx).not.toHaveBeenCalled();
    const secciones = exportarVientoNieveXlsx.mock.calls[0][0] as { nombre: string; blocks: { text?: string }[] }[];
    expect(secciones.map((s) => s.nombre)).toEqual(['Viento', 'Fuerzas por planta', 'Nieve']);
    expect(secciones[0].blocks.map((b) => b.text)).toContain('VIENTO (SEGÚN DB SE-AE)');
  });
});

describe('cubierta a dos aguas', () => {
  it('incluirla despliega las zonas de las dos direcciones y las lleva al plano', () => {
    montar();
    rellenarMadrid();
    expect(screen.queryByLabelText('Pendiente de los faldones')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Incluir la cubierta a dos aguas' }));
    expect(screen.getByLabelText('Pendiente de los faldones')).toBeInTheDocument();
    expect(screen.getByText(/Viento perpendicular a la cumbrera \(θ = 0º, según Y\)/)).toBeInTheDocument();
    expect(screen.getByText(/Viento paralelo a la cumbrera \(θ = 90º, según X\)/)).toBeInTheDocument();
    // La zona J sólo existe con viento perpendicular: una fila; F está en las dos tablas.
    expect(screen.getAllByText('J')).toHaveLength(1);
    expect(screen.getAllByText('F')).toHaveLength(2);
    // La altura de coronación sale deducida del último forjado.
    expect(screen.getByText('último forjado + pendiente')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText('CUBIERTA A DOS AGUAS (SEGÚN DB SE-AE)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getByText(/Cubierta a dos aguas — tabla D\.6/)).toBeInTheDocument();
  });
});

describe('paramentos verticales', () => {
  it('incluirlos despliega las zonas de las fachadas en las dos direcciones y las lleva al plano', () => {
    montar();
    rellenarMadrid();
    expect(screen.queryByLabelText('Área de influencia de las fachadas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Incluir los paramentos verticales' }));
    expect(screen.getByLabelText('Área de influencia de las fachadas')).toBeInTheDocument();
    expect(screen.getByText(/Paramentos con viento según X/)).toBeInTheDocument();
    expect(screen.getByText(/Paramentos con viento según Y/)).toBeInTheDocument();
    // Madrid 20 × 12 y 9 m: según X hay zona C (e = 12 < d = 20); según Y no (e = 18 > d = 12).
    expect(screen.getAllByRole('cell', { name: 'E' })).toHaveLength(2);
    expect(screen.getAllByRole('cell', { name: 'C' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText('PARAMENTOS VERTICALES (SEGÚN DB SE-AE)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getByText('Paramentos verticales — tabla D.3')).toBeInTheDocument();
  });
});

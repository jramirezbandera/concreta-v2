/**
 * Smoke de integración del módulo en jsdom: que el cable entre la pregunta de
 * obra, el motor, la pantalla y la publicación existe.
 *
 *   1. sin provincia el módulo enseña el hueco, dibuja el edificio y no publica;
 *   2. elegir la provincia rellena las zonas, la cota de cada planta y las
 *      fuerzas por planta del panel de resultados;
 *   3. cada vista del lienzo enseña sus zonas en resultados;
 *   4. los dos botones de la barra exportan lo suyo (Word la memoria, Excel el
 *      cuadro del plano) sin pasar por ninguna pestaña;
 *   5. la publicación aparece en `concreta-pub-viento-nieve`.
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
// cada botón exporta lo suyo.
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

afterEach(() => {
  cleanup();
});

/** Madrid a 660 m, tecleado en el formulario. */
function rellenarMadrid() {
  fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '28' } });
  fireEvent.change(screen.getByLabelText('Altitud'), { target: { value: '660' } });
}

/** La columna de resultados y las pestañas del lienzo, por su nombre accesible. */
const resultados = () => screen.getByRole('complementary', { name: 'Resultados' });
const vista = (nombre: string) => fireEvent.click(within(screen.getByRole('group', { name: 'Vistas del lienzo' })).getByRole('button', { name: nombre }));

/**
 * El único sitio que sabe cómo se pide cada formato en la barra. Cuando la
 * topbar cambie los dos botones por el desplegable «Exportar», sólo cambia esto.
 */
function pulsarExportar(formato: 'docx' | 'xlsx') {
  fireEvent.click(screen.getByRole('button', { name: formato === 'docx' ? 'Memoria en Word' : 'Cuadro en Excel' }));
}

/** Filas de una tabla de resultados cuya primera celda empieza por el texto. */
function filasQueEmpiezan(texto: string) {
  return within(resultados())
    .getAllByRole('row')
    .filter((r) => within(r).queryAllByRole('cell')[0]?.textContent?.trim().startsWith(texto));
}

describe('Viento y nieve — módulo', () => {
  it('arranca en hueco: pide la provincia y la altitud, dibuja el edificio y no publica', () => {
    montar();
    expect(screen.getAllByText(/falta la provincia y la altitud/i).length).toBeGreaterThan(0);
    expect(within(resultados()).getByText('Falta la provincia y la altitud')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Aviso de caso de ejemplo' })).toBeInTheDocument();
    // El alzado ya está, con lo que se teclea: tres plantas rotuladas.
    const alzado = screen.getByRole('img', { name: /Alzado del edificio/ });
    expect(alzado.textContent).toContain('Cubierta');
    expect(alzado.textContent).toContain('aparecerán aquí');
    expect(leerPublicacion(MODULO_PUB)).toBeNull();
  });

  it('elegir Madrid y una altitud rellena zonas, cotas, fuerzas por planta y publica', async () => {
    montar();
    rellenarMadrid();

    // Las zonas derivadas de la provincia, en sus desplegables.
    expect((screen.getByLabelText('Zona eólica') as HTMLSelectElement).options[0].text).toMatch(/^A — la de la provincia/);
    expect((screen.getByLabelText('Zona de clima invernal') as HTMLSelectElement).options[0].text).toMatch(/^4 — la de la provincia/);

    // Las plantas se teclean por altura y enseñan su cota: la cubierta, tres de 3 m, a 9,00.
    const filaCubierta = (screen.getAllByLabelText('Nombre de la planta') as HTMLInputElement[]).find((i) => i.value === 'Cubierta')!.closest('[data-planta]')!;
    expect(filaCubierta.textContent).toContain('9,00');

    // Resultados: la tabla de fuerzas por planta tiene Fx y Fy.
    const fila = filasQueEmpiezan('Cubierta')[0];
    const celdas = within(fila).getAllByRole('cell');
    expect(celdas[1].textContent).toBe('9,00');
    expect(celdas[3].textContent).toMatch(/\d/);
    expect(celdas[4].textContent).toMatch(/\d/);
    // Madrid 20 × 12 trae el aviso del rozamiento según X: publicado con avisos.
    expect(within(resultados()).getByRole('status').textContent).toMatch(/PUBLICADO|AVISOS/);
    expect(screen.getByText(/· publicado/)).toBeInTheDocument();

    // La nieve sale de la tabla E.2, en su vista.
    vista('Nieve');
    expect(within(resultados()).getByText('sk · tabla E.2')).toBeInTheDocument();
    expect(within(resultados()).getByText('0,56 kN/m²')).toBeInTheDocument();

    await waitFor(() => expect(leerPublicacion(MODULO_PUB)).not.toBeNull());
    const pub = leerPublicacion<{ viento: { fuerzas: { z: number }[] } | null }>(MODULO_PUB);
    expect(pub!.obra.provincia).toBe('Madrid');
    expect(pub!.datos.viento?.fuerzas.map((f) => f.z)).toEqual([3, 6, 9]);
  });

  it('el atajo «0 m» fija la altitud y el estado pasa a viento y nieve', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '08' } });
    // La caja de altitud enseña «0» en hueco; el atajo «0 m» es lo que fija el dato.
    fireEvent.click(screen.getByRole('button', { name: '0 m' }));
    expect(screen.queryByText(/falta la altitud/i)).not.toBeInTheDocument();
    expect(screen.getByText('viento y nieve')).toBeInTheDocument();
    expect(within(resultados()).getByText(/qb · zona C/)).toBeInTheDocument();
  });

  it('cambiar la altura de una planta mueve su cota y la de las de encima', () => {
    montar();
    rellenarMadrid();
    fireEvent.change(screen.getByLabelText('Altura de Planta 1'), { target: { value: '4' } });
    fireEvent.blur(screen.getByLabelText('Altura de Planta 1'));
    const filaCubierta = (screen.getAllByLabelText('Nombre de la planta') as HTMLInputElement[]).find((i) => i.value === 'Cubierta')!.closest('[data-planta]')!;
    expect(filaCubierta.textContent).toContain('10,00');
    expect(within(filasQueEmpiezan('Cubierta')[0]).getAllByRole('cell')[1].textContent).toBe('10,00');
  });

  it('omitir el viento lo quita de resultados y de la publicación', async () => {
    montar();
    rellenarMadrid();
    fireEvent.click(screen.getByRole('button', { name: 'Incluir el viento' }));
    // Lo dicen la columna de datos y la de resultados.
    expect(screen.getAllByText(/El viento no entra en esta obra/)).toHaveLength(2);
    expect(within(resultados()).getByText('El viento no entra en esta obra')).toBeInTheDocument();
    expect(screen.getByText('nieve')).toBeInTheDocument();

    await waitFor(() => {
      const pub = leerPublicacion<{ viento: unknown; nieve: unknown }>(MODULO_PUB);
      expect(pub?.datos.viento).toBeNull();
      expect(pub?.datos.nieve).not.toBeNull();
    });
  });

  it('«Ver ejemplo» carga Aranda de Duero con cubierta y quita la banda', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo' }));
    expect(screen.queryByRole('region', { name: 'Aviso de caso de ejemplo' })).not.toBeInTheDocument();
    expect((screen.getByLabelText('Provincia') as HTMLSelectElement).value).toBe('09');
    expect(screen.getByLabelText('Pendiente de los faldones')).toBeInTheDocument();
    expect(within(resultados()).getByRole('status').textContent).toMatch(/PUBLICADO|AVISOS/);
    expect(screen.getByText(/· publicado/)).toBeInTheDocument();
    expect(localStorage.getItem('concreta-viento-nieve-example-dismissed')).toBe('1');
  });
});

describe('exportación', () => {
  it('con huecos, exportar avisa en vez de abrir el modal', () => {
    montar();
    pulsarExportar('docx');
    expect(screen.getByText('Rellene la provincia y la altitud antes de exportar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título del elemento')).not.toBeInTheDocument();
  });

  it('«Memoria en Word»: el título confirmado llega al exportador con los bloques de MEMORIA', async () => {
    let descargado = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargado = this.download;
    });
    montar();
    rellenarMadrid();
    pulsarExportar('docx');
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

  it('«Cuadro en Excel» exporta las tres pestañas del plano desde cualquier vista', async () => {
    montar();
    rellenarMadrid();
    vista('Nieve');
    pulsarExportar('xlsx');
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
  it('incluirla despliega las zonas de las dos direcciones en la vista Cubierta y las publica', async () => {
    montar();
    rellenarMadrid();
    expect(screen.queryByLabelText('Pendiente de los faldones')).not.toBeInTheDocument();
    vista('Cubierta');
    expect(within(resultados()).getByText('Cubierta plana u omitida')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Incluir la cubierta a dos aguas' }));
    expect(screen.getByLabelText('Pendiente de los faldones')).toBeInTheDocument();
    // La altura de coronación sale deducida del último forjado.
    expect(screen.getByText('último forjado + pendiente')).toBeInTheDocument();

    expect(within(resultados()).getByText(/Viento perpendicular a la cumbrera \(θ = 0º, según Y\)/)).toBeInTheDocument();
    expect(within(resultados()).getByText(/Viento paralelo a la cumbrera \(θ = 90º, según X\)/)).toBeInTheDocument();
    // La zona J sólo existe con viento perpendicular: una fila; F está en las dos tablas.
    expect(filasQueEmpiezan('J')).toHaveLength(1);
    expect(filasQueEmpiezan('F')).toHaveLength(2);

    await waitFor(() => {
      const pub = leerPublicacion<{ viento: { cubierta?: { pendiente: number } } | null }>(MODULO_PUB);
      expect(pub?.datos.viento?.cubierta?.pendiente).toBe(20);
    });
  });
});

describe('paramentos verticales', () => {
  it('incluirlos despliega las zonas de las fachadas en las dos direcciones en la vista Fachadas', async () => {
    montar();
    rellenarMadrid();
    expect(screen.queryByLabelText('Área de influencia de las fachadas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Incluir los paramentos verticales' }));
    expect(screen.getByLabelText('Área de influencia de las fachadas')).toBeInTheDocument();

    vista('Fachadas');
    expect(within(resultados()).getByText(/Paramentos con viento según X/)).toBeInTheDocument();
    expect(within(resultados()).getByText(/Paramentos con viento según Y/)).toBeInTheDocument();
    // Madrid 20 × 12 y 9 m: según X hay zona C (e = 12 < d = 20); según Y no (e = 18 > d = 12).
    expect(filasQueEmpiezan('E')).toHaveLength(2);
    expect(filasQueEmpiezan('C')).toHaveLength(1);

    await waitFor(() => {
      const pub = leerPublicacion<{ viento: { paramentos?: { h: number } } | null }>(MODULO_PUB);
      expect(pub?.datos.viento?.paramentos?.h).toBe(9);
    });
  });
});

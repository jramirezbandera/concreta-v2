/**
 * Smoke de integración del módulo en jsdom: que el cable entre el formulario,
 * el motor, la pantalla, la publicación de Viento y nieve y la publicación
 * propia existe.
 *
 *   1. arranca con tres plantas, calcula y publica;
 *   2. cambiar el uso cambia la columna derivada;
 *   3. «Usar la nieve publicada» trae la nieve del sobre de Viento y nieve;
 *   4. las pestañas Plano y Memoria pintan los cuadros;
 *   5. la exportación abre el modal y cada pestaña exporta lo suyo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { CargasPlantaModule } from '../../features/cargas-planta';
import { MODULO_PUB, type PubCargasPlanta } from '../../features/cargas-planta/state';
import { defaultVientoNieveState, evaluar as evaluarVN, publicarResultado as publicarVN } from '../../features/viento-nieve/state';
import { leerPublicacion } from '../../lib/pub';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

const exportarCargasPlantaDocx = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.docx` : 'cargas-por-planta.docx',
}));
vi.mock('../../lib/docx/cargasPlanta', () => ({
  exportarCargasPlantaDocx: (blocks: unknown, titulo?: string) => exportarCargasPlantaDocx(blocks, titulo),
}));
const exportarCargasPlantaXlsx = vi.fn(async (_secciones: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.xlsx` : 'cargas-por-planta.xlsx',
}));
vi.mock('../../lib/xlsx/cargasPlanta', () => ({
  exportarCargasPlantaXlsx: (secciones: unknown, titulo?: string) => exportarCargasPlantaXlsx(secciones, titulo),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/cargas-planta']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <CargasPlantaModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Viento y nieve publicado en Madrid a 660 m: zona A, aspereza IV, sk 0,56. */
function publicarMadrid() {
  const vn = defaultVientoNieveState();
  vn.emplazamiento = { ...vn.emplazamiento, provincia: '28', municipio: 'Madrid', altitud: 660 };
  publicarVN(vn, evaluarVN(vn));
}

beforeEach(() => {
  localStorage.clear();
  exportarCargasPlantaDocx.mockClear();
  exportarCargasPlantaXlsx.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Cargas por planta — módulo', () => {
  it('arranca con tres plantas, calcula con la norma y publica', async () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Plantas y cargas' })).toBeInTheDocument();
    const nombres = (screen.getAllByLabelText('Nombre de la planta') as HTMLInputElement[]).map((i) => i.value);
    expect(nombres).toEqual(['Planta Baja', 'Planta Primera', 'Cubierta']);
    // Reticular de 30 cm sin valor propio: 5 kN/m² de la tabla C.5, en azul.
    expect(screen.getAllByText('tabla C.5').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/3 plantas · 3 zonas/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^· publicado$/)).toBeInTheDocument();
    await waitFor(() => expect(leerPublicacion(MODULO_PUB)).not.toBeNull());
    const pub = leerPublicacion<PubCargasPlanta>(MODULO_PUB)!;
    expect(pub.datos.plantas).toHaveLength(3);
    expect(pub.datos.plantas[0].zonas[0].qd).toBeCloseTo(1.35 * 7 + 1.5 * 2, 12);
  });

  it('cambiar «¿Para qué se usa?» a gimnasio cambia la sobrecarga derivada a 5', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Uso de Planta Baja'), { target: { value: 'C4' } });
    expect(screen.getByTitle('C4 — gimnasios').textContent).toContain('5,00');
    await waitFor(() => expect(leerPublicacion<PubCargasPlanta>(MODULO_PUB)!.datos.plantas[0].zonas[0].qUso).toBe(5));
  });

  it('un peso propio propio manda sobre la norma, y se puede volver a ella', () => {
    montar();
    const pp = screen.getByLabelText('Peso propio de Planta Baja');
    fireEvent.change(pp, { target: { value: '4.49' } });
    expect(screen.getAllByTitle('Peso propio del forjado')[0].textContent).toContain('4,49');
    fireEvent.click(screen.getAllByRole('button', { name: 'usar el de la norma' })[0]);
    expect(screen.getAllByTitle('Peso propio del forjado')[0].textContent).toContain('5,00');
  });

  it('un forjado de madera sin peso propio es un error que bloquea exportar', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Tipo de forjado de Planta Baja'), { target: { value: 'madera' } });
    expect(screen.getByText(/«Planta Baja»: indique el peso propio del forjado/)).toBeInTheDocument();
    expect(screen.queryByText(/^· publicado$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByText('Corrija los errores antes de exportar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título del elemento')).not.toBeInTheDocument();
  });
});

describe('la nieve de Viento y nieve', () => {
  it('sin publicación, la opción está deshabilitada y no hay botón', () => {
    montar();
    expect(screen.queryByRole('button', { name: /Usar la nieve publicada/ })).not.toBeInTheDocument();
    const origen = screen.getByLabelText('Origen de la nieve de Cubierta') as HTMLSelectElement;
    expect(Array.from(origen.options).find((o) => o.value === 'publicada')?.disabled).toBe(true);
  });

  it('«Usar la nieve publicada» trae la nieve del sobre, la pinta y la publica', async () => {
    publicarMadrid();
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Usar la nieve publicada \(0,56 kN\/m²\)/ }));
    expect(screen.getByText('qn = 0,56 kN/m²')).toBeInTheDocument();
    expect(screen.getByTitle('Carga de nieve de la cubierta').textContent).toContain('0,56');
    // La cubierta G1 con nieve 0,56: manda el uso (1 > 0,56), Qd 1,50.
    expect(screen.getAllByTitle(/1,50 · Q, hipótesis Uso/)[2].textContent).toContain('1,50');
    await waitFor(() => expect(leerPublicacion<PubCargasPlanta>(MODULO_PUB)!.datos.plantas[2].zonas[0].nieve).toBeCloseTo(0.56, 12));
    expect(leerPublicacion<PubCargasPlanta>(MODULO_PUB)!.datos.nieveOrigen?.ine).toBe('28');
  });

  it('si Viento y nieve vuelve a publicar, el módulo avisa en ámbar sin bloquear', async () => {
    publicarMadrid();
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Usar la nieve publicada/ }));
    expect(screen.queryByText(/ha publicado de nuevo/)).not.toBeInTheDocument();
    // Un sobre más nuevo: el módulo lo ve al siguiente cambio.
    await new Promise((r) => setTimeout(r, 5));
    publicarMadrid();
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: 'Madrid' } });
    expect(screen.getByText(/«Cubierta»: Viento y nieve ha publicado de nuevo/)).toBeInTheDocument();
    expect(screen.getByText(/1 aviso/)).toBeInTheDocument();
    expect(screen.getByText(/^· publicado$/)).toBeInTheDocument();
  });
});

describe('pestañas y exportación', () => {
  it('Plano y Memoria pintan los cuadros, con el viento del sobre cuando lo hay', () => {
    publicarMadrid();
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText('ACCIONES GRAVITATORIAS (SEGÚN DB SE-AE)')).toBeInTheDocument();
    expect(screen.getByText('A (velocidad básica 26 m/s)')).toBeInTheDocument();
    expect(screen.getByText('EJECUCIÓN')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getByText('CARGAS POR PLANTA (DB SE-AE, art. 2 y 3.1; Anejo C)')).toBeInTheDocument();
    expect(screen.getAllByText('Peso propio forjado reticular h = 30 cm')).toHaveLength(3);
    expect(screen.getByText('Coeficientes de simultaneidad (DB SE, tabla 4.2)')).toBeInTheDocument();
  });

  it('sin publicación de viento, el plano remite al módulo Viento y nieve', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText(/Ver el módulo Viento y nieve/)).toBeInTheDocument();
  });

  it('el título confirmado llega al exportador de Word con los bloques de MEMORIA', async () => {
    let descargado = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargado = this.download;
    });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByText('cargas-por-planta.docx')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Título del elemento'), { target: { value: 'Bloque en Madrid' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exportar Word' }));

    await waitFor(() => expect(exportarCargasPlantaDocx).toHaveBeenCalled());
    expect(exportarCargasPlantaDocx.mock.calls[0][1]).toBe('Bloque en Madrid');
    const bloques = exportarCargasPlantaDocx.mock.calls[0][0] as { text?: string }[];
    expect(bloques.some((b) => b.text === 'CARGAS POR PLANTA (DB SE-AE, art. 2 y 3.1; Anejo C)')).toBe(true);
    expect(bloques.some((b) => b.text === 'ACCIONES GRAVITATORIAS (SEGÚN DB SE-AE)')).toBe(false);
    await waitFor(() => expect(descargado).toBe('bloque-en-madrid.docx'));
    click.mockRestore();
  });

  it('en la pestaña Plano el botón pasa a Excel y exporta las cuatro pestañas', async () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.queryByRole('button', { name: 'Exportar Word' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(screen.getByText('cargas-por-planta.xlsx')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => expect(exportarCargasPlantaXlsx).toHaveBeenCalled());
    expect(exportarCargasPlantaDocx).not.toHaveBeenCalled();
    const secciones = exportarCargasPlantaXlsx.mock.calls[0][0] as { nombre: string; blocks: { text?: string }[] }[];
    expect(secciones.map((s) => s.nombre)).toEqual(['Cargas por planta', 'Cargas lineales', 'Predimensionado', 'Acciones horizontales']);
    expect(secciones[2].blocks.map((b) => b.text)).toContain('PREDIMENSIONADO (γG = 1,35 · γQ = 1,50)');
  });
});

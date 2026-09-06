/**
 * Smoke de integración del módulo en jsdom: que el cable entre el estado, los
 * sobres de los otros módulos, la cola de huecos y la exportación existe.
 *
 *   1. arranca con huecos y Exportar avisa con el toast, sin exportar;
 *   2. publicar los otros módulos y «Usar lo publicado» apaga el ámbar y
 *      enseña la frase del viento con la zona;
 *   3. «Siguiente hueco» lleva el foco al primer hueco, y Enter en un dato
 *      heredado lo confirma;
 *   4. «Nueva obra» deja la obra en ámbar y vacía el nombre;
 *   5. la sección de acero aparece cuando el cuadro de materiales lo publica;
 *   6. con la ficha completa, Word y PDF llaman a su exportador con los
 *      bloques de la ficha, que empiezan por «3.1. Seguridad estructural»;
 *   7. «Guardar como datos de la obra» escribe nombre y uso en `concreta-obra`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { MemoriaDBSEModule } from '../../features/memoria-dbse';
import { guardarEstado } from '../../features/memoria-dbse/state';
import { leerSobres } from '../../features/memoria-dbse/sobres';
import { defaultCargasState, evaluar as evaluarCargas, publicarResultado as publicarCargas } from '../../features/cargas-planta/state';
import { defaultMaterialesState, evaluar as evaluarMateriales, publicarResultado as publicarMateriales } from '../../features/materiales/state';
import { defaultSeismicState, evaluarSismo, publicarResultado as publicarSismo } from '../../features/seismic-ncse02/state';
import type { Block } from '../../lib/memoria/model';
import { guardarObra, leerObra } from '../../lib/obra';
import { completar, fichaGranada } from './fixtures';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

const exportarDocx = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.docx` : 'memoria-db-se.docx',
}));
vi.mock('../../lib/docx/memoriaDBSE', () => ({
  exportarMemoriaDBSEDocx: (blocks: unknown, titulo?: string) => exportarDocx(blocks, titulo),
}));
const exportarPdf = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['%PDF-'], { type: 'application/pdf' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.pdf` : 'memoria-db-se.pdf',
}));
vi.mock('../../lib/pdf/memoriaDBSE', () => ({
  exportarMemoriaDBSEPdf: (blocks: unknown, titulo?: string) => exportarPdf(blocks, titulo),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/memorias/db-se']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <MemoriaDBSEModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** La obra de la ficha, en el contexto compartido: Granada. */
const obraGranada = () => guardarObra({ denominacion: 'Edificio en Granada', municipio: 'Granada', ine: '18087', provincia: '18', altitud: 680, uso: 'Edificio de viviendas' });

/** Los otros tres módulos publicados para Granada (viento es opcional y no se publica). */
function publicarLosOtros(acero = false) {
  const m = { ...defaultMaterialesState(), usaAceroEstructural: acero };
  publicarMateriales(m, evaluarMateriales(m));
  const c = defaultCargasState();
  c.emplazamiento = { provincia: '18', municipio: 'Granada', altitud: 680 };
  publicarCargas(c, evaluarCargas(c, null));
  const s = defaultSeismicState();
  publicarSismo(s, evaluarSismo(s));
}

function pulsarExportar(formato: 'docx' | 'pdf') {
  fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
  fireEvent.click(screen.getByRole('menuitem', { name: formato === 'docx' ? /^Word/ : /^PDF/ }));
}

beforeEach(() => {
  localStorage.clear();
  exportarDocx.mockClear();
  exportarPdf.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Cumplimiento del DB SE — el módulo', () => {
  it('arranca con huecos y Exportar avisa sin exportar', async () => {
    obraGranada();
    montar();
    expect(screen.getByText(/huecos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente hueco/ })).toBeEnabled();
    pulsarExportar('docx');
    expect(await screen.findByText(/Quedan \d+ huecos/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(exportarDocx).not.toHaveBeenCalled();
  });

  it('«Usar lo publicado» acepta los sobres y el viento se deriva de la provincia', async () => {
    obraGranada();
    publicarLosOtros();
    montar();
    // Tres sobres por revisar (materiales, cargas, sismo); viento es opcional.
    const botones = screen.getAllByRole('button', { name: 'Usar lo publicado' });
    expect(botones).toHaveLength(3);
    for (const b of botones) fireEvent.click(b);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Usar lo publicado' })).toHaveLength(0));
    expect(screen.getAllByText('tomada').length).toBe(3);
    expect(screen.getByText('opcional')).toBeInTheDocument();
    // La frase del viento, en azul, con la zona de la provincia.
    expect(screen.getByText(/Granada \(Granada\) está en zona [ABC], con lo que v=\d+ m\/s/)).toBeInTheDocument();
    // Y la tabla sísmica de Granada.
    expect(screen.getByText(/ab=0,23 g/)).toBeInTheDocument();
  });

  it('«Siguiente hueco» lleva el foco al primer hueco, y Enter confirma un dato heredado', async () => {
    obraGranada();
    publicarLosOtros();
    montar();
    // El primer hueco es la primera publicación por tomar: su botón recibe el foco.
    fireEvent.click(screen.getByRole('button', { name: /Siguiente hueco/ }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('button', { name: 'Usar lo publicado' })[0]));
    // Un dato heredado con su botón de confirmar: la sobrecarga en el terreno.
    const sobrecarga = document.getElementById('campo-obra-sobrecargaTerreno') as HTMLInputElement;
    expect(sobrecarga).not.toBeNull();
    const antes = screen.getAllByRole('button', { name: '✓ Confirmar' }).length;
    sobrecarga.focus();
    fireEvent.keyDown(sobrecarga, { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByRole('button', { name: '✓ Confirmar' }).length).toBe(antes - 1));
  });

  it('«Nueva obra» deja la obra en ámbar y vacía el nombre', async () => {
    obraGranada();
    montar();
    const nombre = screen.getByLabelText('Nombre de la obra') as HTMLInputElement;
    expect(nombre.value).toBe('Edificio en Granada');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva obra' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Empezar la obra nueva' }));
    await waitFor(() => expect((screen.getByLabelText('Nombre de la obra') as HTMLInputElement).value).toBe(''));
    // El municipio sigue, pero heredado: con su ✓ al lado.
    expect((screen.getByLabelText('Municipio') as HTMLInputElement).value).toBe('Granada');
    expect(screen.getAllByRole('button', { name: '✓' }).length).toBeGreaterThan(0);
  });

  it('la sección de acero aparece cuando el cuadro de materiales lo publica', async () => {
    obraGranada();
    publicarLosOtros(true);
    montar();
    for (const b of screen.getAllByRole('button', { name: 'Usar lo publicado' })) fireEvent.click(b);
    const acero = await screen.findByRole('region', { name: /Estructuras de acero/ });
    expect(within(acero).getByRole('button', { expanded: false })).toBeInTheDocument();
    fireEvent.click(within(acero).getByRole('button'));
    expect(within(acero).getByText(/S275JR/)).toBeInTheDocument();
    // Y la madera, que no está en el cuadro, no procede.
    const madera = screen.getByRole('region', { name: /Estructuras de madera/ });
    expect(within(madera).getByText('no procede')).toBeInTheDocument();
  });

  it('con la ficha completa, Word y PDF reciben los bloques de la ficha', async () => {
    obraGranada();
    publicarLosOtros();
    // La ficha se completa contra los sobres REALES recién publicados (con su fecha).
    guardarEstado(completar(fichaGranada(), leerSobres()));
    montar();
    expect(screen.getByText(/lista para exportar/)).toBeInTheDocument();

    pulsarExportar('docx');
    const modal = await screen.findByRole('dialog');
    expect((within(modal).getByRole('textbox') as HTMLInputElement).value).toBe('Memoria DB SE — Edificio en Granada');
    fireEvent.click(within(modal).getByRole('button', { name: /Exportar|Descargar/ }));
    await waitFor(() => expect(exportarDocx).toHaveBeenCalledTimes(1));
    const bloques = exportarDocx.mock.calls[0][0] as Block[];
    expect(bloques[0]).toEqual({ kind: 'heading', level: 1, text: '3.1. Seguridad estructural' });
    expect(bloques.some((b) => b.kind === 'heading' && b.text.startsWith('3.1.4'))).toBe(true);

    pulsarExportar('pdf');
    const modal2 = await screen.findByRole('dialog');
    fireEvent.click(within(modal2).getByRole('button', { name: /Exportar|Descargar/ }));
    await waitFor(() => expect(exportarPdf).toHaveBeenCalledTimes(1));
  });

  it('«Guardar como datos de la obra» escribe nombre y uso en el contexto compartido', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Nombre de la obra'), { target: { value: 'Nave en Ávila' } });
    fireEvent.change(screen.getByLabelText('¿Para qué es el edificio?'), { target: { value: 'Nave industrial' } });
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: '05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como datos de la obra' }));
    await waitFor(() => expect(leerObra()?.denominacion).toBe('Nave en Ávila'));
    expect(leerObra()?.uso).toBe('Nave industrial');
    expect(leerObra()?.provincia).toBe('05');
  });
});

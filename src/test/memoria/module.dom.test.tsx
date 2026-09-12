/**
 * Smoke de integración del módulo en jsdom: que el cable entre el estado, los
 * sobres de los otros módulos, la cola de huecos y la exportación existe.
 *
 *   1. arranca con huecos y Exportar avisa con el toast, sin exportar;
 *   2. publicar los otros módulos y «Usar lo publicado» apaga el ámbar y
 *      enseña la frase del viento con la zona;
 *   3. «Siguiente hueco» lleva el foco al primer hueco, y Enter en un dato
 *      heredado lo confirma;
 *   4. «Nueva obra» deja la ficha en ámbar sin tocar los datos de la obra;
 *   5. la sección de acero aparece cuando el cuadro de materiales lo publica;
 *   6. con la ficha completa, Word y PDF llaman a su exportador con los
 *      bloques de la ficha, que empiezan por «3.1. Seguridad estructural»;
 *   7. «Editar…» escribe los cinco datos en `concreta-obra`.
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
const obraGranada = () => guardarObra({ denominacion: 'Edificio en Granada', municipio: 'Granada', provincia: '18', altitud: 680, uso: 'Edificio de viviendas' });

/**
 * Los otros tres módulos publicados para Granada (viento es opcional y no se
 * publica). Los tres estados salen TOCADOS a propósito: desde que el sobre
 * lleva `configurado`, publicar los valores de arranque de un módulo no cuenta
 * como haberlo calculado, y la ficha los daría por falta. Es justo lo que
 * comprueba `test/pub/configurado.test.ts`.
 */
function publicarLosOtros(acero = false) {
  const m = { ...defaultMaterialesState(), usaAceroEstructural: acero, costa: true };
  publicarMateriales(m, evaluarMateriales(m));
  const c0 = defaultCargasState();
  const c = { ...c0, emplazamiento: { provincia: '18', municipio: 'Granada', altitud: 680 }, plantas: c0.plantas.slice(0, 2) };
  publicarCargas(c, evaluarCargas(c, null));
  const s = { ...defaultSeismicState(), sotanos: 1 };
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

  it('lo publicado se usa sin pedir permiso, y no queda tabla de publicaciones que leer', async () => {
    obraGranada();
    publicarLosOtros();
    montar();

    // Se acabó el «tomar»: ni botones ni tabla de estados de publicación.
    expect(screen.queryByRole('button', { name: /Usar lo publicado/ })).toBeNull();
    expect(screen.queryByText('Lo que publican los otros módulos')).toBeNull();
    // Ni avisos: los tres sobres son de Granada y están configurados.
    expect(screen.queryByText('Lo que falta calcular en otros módulos')).toBeNull();

    // La frase del viento, con la zona de la provincia (no hay sobre de viento).
    expect(screen.getByText(/Granada \(Granada\) está en zona [ABC], con lo que v=\d+ m\/s/)).toBeInTheDocument();
    // Y la tabla sísmica de Granada, ya impresa.
    expect(screen.getByText(/ab=0,23 g/)).toBeInTheDocument();
  });

  it('un módulo con sus valores de partida NO entra: se avisa y se ofrece la salida', async () => {
    obraGranada();
    // Los tres tal cual arrancan. El de sismo es el peligroso: Granada con
    // ab = 0,23 g cableado, publicado por el mero hecho de abrir el módulo.
    const m = defaultMaterialesState();
    publicarMateriales(m, evaluarMateriales(m));
    const c = { ...defaultCargasState(), emplazamiento: { provincia: '18', municipio: 'Granada', altitud: 680 } };
    publicarCargas(c, evaluarCargas(c, null));
    const sis = defaultSeismicState();
    publicarSismo(sis, evaluarSismo(sis));
    montar();

    expect(screen.getByText('Lo que falta calcular en otros módulos')).toBeInTheDocument();
    expect(screen.getAllByText(/sigue con sus valores de partida/).length).toBe(3);
    expect(screen.queryByText(/ab=0,23 g/)).toBeNull();

    // La salida para quien SÍ quiere los de partida: declararlo.
    const botones = screen.getAllByRole('button', { name: 'Son los de esta obra' });
    expect(botones).toHaveLength(3);
    for (const b of botones) fireEvent.click(b);
    await waitFor(() => expect(screen.queryByText('Lo que falta calcular en otros módulos')).toBeNull());
    expect(screen.getByText(/ab=0,23 g/)).toBeInTheDocument();
  });

  it('«Siguiente hueco» lleva el foco al primer hueco, y Enter confirma un dato heredado', async () => {
    obraGranada();
    publicarLosOtros();
    montar();
    // Ya no hay publicaciones que tomar, así que el primer hueco es un dato de
    // la ficha, no un trámite.
    fireEvent.click(screen.getByRole('button', { name: /Siguiente hueco/ }));
    await waitFor(() => expect(document.activeElement?.id).toMatch(/^campo-obra-/));
    // Un dato heredado con su botón de confirmar: la sobrecarga en el terreno.
    const sobrecarga = document.getElementById('campo-obra-sobrecargaTerreno') as HTMLInputElement;
    expect(sobrecarga).not.toBeNull();
    const antes = screen.getAllByRole('button', { name: '✓ Confirmar' }).length;
    sobrecarga.focus();
    fireEvent.keyDown(sobrecarga, { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByRole('button', { name: '✓ Confirmar' }).length).toBe(antes - 1));
  });

  /**
   * La sobrecarga en el terreno era la única caja con dimensión de la ficha, y
   * llevaba el «kN/m²» escrito a mano: en el rótulo del campo y en el chip. Con
   * el técnico puesto, la ficha entera hablaba en kg menos ese dato.
   */
  it('la sobrecarga en el terreno se teclea en la unidad activa', () => {
    localStorage.setItem('unitSystem', 'tecnico');
    obraGranada();
    montar();
    // 10 kN/m² heredados son 1020 kg/m².
    const caja = document.getElementById('campo-obra-sobrecargaTerreno') as HTMLInputElement;
    expect(caja.value).toBe('1020');
    // Y el rótulo ya no lleva una unidad escrita a mano que la contradiga.
    expect(screen.getByText('Sobrecarga en el terreno')).toBeInTheDocument();
    expect(screen.queryByText(/Sobrecarga en el terreno \(kN\/m²\)/)).toBeNull();
  });

  it('«Nueva obra» deja la ficha en ámbar y no toca los datos de la obra', async () => {
    obraGranada();
    montar();
    const barra = screen.getByText('¿Qué obra es?').parentElement!;
    expect(barra.textContent).toContain('Edificio en Granada');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva obra' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Empezar la obra nueva' }));

    // Lo de la FICHA queda heredado: el contador pasa a tener «por confirmar».
    await waitFor(() => expect(barra.textContent).toMatch(/\d+ por confirmar/));
    // ...y los cinco datos de la obra siguen donde estaban: no son suyos, se
    // cambian en el menú de obra, que es quien abre otra obra de verdad.
    expect(barra.textContent).toContain('Edificio en Granada');
    expect(leerObra()?.denominacion).toBe('Edificio en Granada');
  });

  it('la sección de acero aparece cuando el cuadro de materiales lo publica', async () => {
    obraGranada();
    publicarLosOtros(true);
    montar();
    // Sin trámite: el cuadro publica acero y el apartado aparece solo.
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

  it('«Editar…» abre el diálogo de obra y escribe los cinco en el contexto compartido', async () => {
    montar();
    // La barra ENSEÑA los datos; para cambiarlos hay un solo sitio.
    expect(screen.queryByLabelText('Municipio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));

    const dialogo = await screen.findByRole('dialog', { name: 'Datos de la obra' });
    fireEvent.change(within(dialogo).getByLabelText('Nombre de la obra'), { target: { value: 'Nave en Ávila' } });
    fireEvent.change(within(dialogo).getByLabelText('Uso'), { target: { value: 'Nave industrial' } });
    fireEvent.change(within(dialogo).getByLabelText('Provincia'), { target: { value: '05' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar los datos' }));

    await waitFor(() => expect(leerObra()?.denominacion).toBe('Nave en Ávila'));
    expect(leerObra()?.uso).toBe('Nave industrial');
    expect(leerObra()?.provincia).toBe('05');
    // Y la barra lo refleja sin recargar: es una proyección, no una copia.
    await waitFor(() => expect(screen.getByText('¿Qué obra es?').parentElement!.textContent).toContain('Nave en Ávila'));
  });
});

/**
 * «Leer el PDF del geotécnico» de punta a punta en jsdom, con pdf.js y el
 * proveedor de IA sustituidos: elegir el fichero, la ficha del PDF, leer, el
 * resumen, y los campos del 3.1.3 en ámbar con su fuente debajo; lo que el
 * usuario ya había tecleado no se toca.
 *
 * Y el ritmo de después, que es la mitad del valor de leer el informe: con los
 * catorce datos en ámbar, confirmarlos es pulsar Enter catorce veces.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ToastContainer } from '../../components/ui/Toast';
import { MemoriaDBSEModule } from '../../features/memoria-dbse';
import { guardarEstado } from '../../features/memoria-dbse/state';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';
import type { ChatRequest } from '../../lib/ai/types';
import { estadoPorDefecto } from '../../lib/memoria/estado';
import { aplicarExtraccion, CLAVES_GEOTECNICO, GEOTECNICO_SCHEMA, type ExtraccionGeotecnico } from '../../lib/memoria/geotecnico';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

const cerrar = vi.fn();
vi.mock('../../lib/ai/pdfPrep', () => ({
  leerPdf: vi.fn(async (file: File) => ({
    nombre: file.name,
    bytes: file.size,
    paginas: 3,
    textos: [
      { n: 1, texto: 'GEOLABOR · Estudio geotécnico · Paseo del Pedregal 41 · Málaga '.repeat(8) },
      { n: 2, texto: 'Conclusiones y recomendaciones. Tensión admisible 2,0 kg/cm². Nivel freático no detectado. '.repeat(6) },
      { n: 3, texto: 'Anejo de sondeos '.repeat(30) },
    ],
    imagenes: vi.fn(async () => []),
    cerrar,
  })),
}));

const runChatTurn = vi.fn(async (_provider: string, _key: string, _req: ChatRequest) => ({
  reply: 'He encontrado la tensión admisible y el freático; falta el balasto.',
  proposal: {
    empresa: { texto: 'Geolabor S.L.', pagina: 1 },
    tensionAdmisible: { texto: '2,0 kg/cm²', pagina: 2 },
    nivelFreatico: { texto: 'No detectado', pagina: 2 },
    balasto: { texto: '', pagina: 0 },
    avisos: ['La tensión admisible es la de zapatas; para losa el informe da 1,5 kg/cm².'],
  },
}));
vi.mock('../../lib/ai/providers', () => ({
  runChatTurn: (p: string, k: string, r: ChatRequest) => runChatTurn(p, k, r),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/memorias/db-se']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <AiSettingsProvider>
            <ToastContainer />
            <MemoriaDBSEModule />
          </AiSettingsProvider>
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('concreta-ai-settings', JSON.stringify({ provider: 'anthropic', keys: { anthropic: 'sk-ant-prueba' } }));
  runChatTurn.mockClear();
  cerrar.mockClear();
});

afterEach(() => {
  cleanup();
});

const campo = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('Leer el PDF del geotécnico', () => {
  it('elegir el PDF, leerlo y ver los datos en ámbar con su fuente; lo tecleado se conserva', async () => {
    montar();
    // El usuario ya había tecleado la empresa: no se pisa.
    fireEvent.change(campo('campo-obra-geotecnia-empresa'), { target: { value: 'Mi empresa' } });

    fireEvent.click(screen.getByRole('button', { name: 'Leer el PDF del geotécnico' }));
    const modal = screen.getByRole('dialog', { name: 'Leer el PDF del geotécnico' });

    const fichero = new File(['%PDF-1.4'], 'GT-3654.pdf', { type: 'application/pdf' });
    fireEvent.change(within(modal).getByLabelText('PDF del estudio geotécnico'), { target: { files: [fichero] } });

    await within(modal).findByText('GT-3654.pdf');
    expect(within(modal).getByText(/3 páginas/)).toHaveTextContent('texto de 3 páginas');
    expect(within(modal).getByText(/se envía a Anthropic/)).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole('button', { name: 'Leer con IA' }));
    await within(modal).findByText(/Rellenados en ámbar \(2\)/);

    // La petición: el proveedor y la clave de los ajustes, el schema del lector y el texto por páginas.
    expect(runChatTurn).toHaveBeenCalledTimes(1);
    const [proveedor, clave, req] = runChatTurn.mock.calls[0];
    expect(proveedor).toBe('anthropic');
    expect(clave).toBe('sk-ant-prueba');
    expect(req.schema).toBe(GEOTECNICO_SCHEMA);
    expect(req.turns[0].text).toContain('=== Página 2 ===');
    expect(req.system.volatile).toContain('«GT-3654.pdf»');

    // El resumen.
    expect(within(modal).getByText('Tensión admisible · pág. 2')).toBeInTheDocument();
    expect(within(modal).getByText('Conservados: ya los había tecleado')).toBeInTheDocument();
    expect(within(modal).getByText(/para losa el informe da/)).toBeInTheDocument();
    expect(within(modal).getByText('El informe no los dice')).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cerrar).toHaveBeenCalled();

    // Los campos: en ámbar, con el valor y la fuente; el tecleado, intacto.
    expect(campo('campo-obra-geotecnia-tensionAdmisible').value).toBe('2,0 kg/cm²');
    expect(campo('campo-obra-geotecnia-nivelFreatico').value).toBe('No detectado');
    expect(campo('campo-obra-geotecnia-empresa').value).toBe('Mi empresa');
    expect(screen.getAllByText('Del geotécnico «GT-3654.pdf», pág. 2')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '✓ Confirmar' }).length).toBeGreaterThanOrEqual(2);

    // Y persiste: al remontar sigue ahí, con su fuente.
    cleanup();
    montar();
    expect(campo('campo-obra-geotecnia-tensionAdmisible').value).toBe('2,0 kg/cm²');
    expect(screen.getAllByText('Del geotécnico «GT-3654.pdf», pág. 2')).toHaveLength(2);
  });

  it('sin API key no se puede leer, y un fichero que no es PDF avisa', async () => {
    localStorage.setItem('concreta-ai-settings', JSON.stringify({ provider: 'anthropic', keys: {} }));
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Leer el PDF del geotécnico' }));
    const modal = screen.getByRole('dialog', { name: 'Leer el PDF del geotécnico' });
    fireEvent.change(within(modal).getByLabelText('PDF del estudio geotécnico'), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    await within(modal).findByText('a.pdf');
    expect(within(modal).getByRole('button', { name: 'Leer con IA' })).toBeDisabled();
    expect(within(modal).getByText('Falta la API key')).toBeInTheDocument();
    expect(runChatTurn).not.toHaveBeenCalled();
  });
});

// ── El ritmo de confirmar ───────────────────────────────────────────────────

/** La ficha con el informe ya leído: los catorce datos en ámbar, con su página. */
function conGeotecnicoLeido() {
  const ex: ExtraccionGeotecnico = {
    datos: Object.fromEntries(CLAVES_GEOTECNICO.map((k, i) => [k, { texto: `lo que dice el informe de ${k}`, pagina: i + 1 }])) as ExtraccionGeotecnico['datos'],
    avisos: [],
  };
  guardarEstado(aplicarExtraccion(estadoPorDefecto(null), ex, 'GT-3654.pdf').state);
}

const confirmarVisibles = () => screen.getAllByRole('button', { name: '✓ Confirmar' }).length;

describe('el ritmo de confirmar', () => {
  it('«Marcar como revisados» da por buenos los datos del apartado de una vez, y se deshace', async () => {
    // Catorce pulsaciones para decir catorce veces «sí» no eran un control de
    // nada: quien las daba acababa dándolas sin mirar. Era la queja literal.
    conGeotecnicoLeido();
    montar();

    const antes = confirmarVisibles();
    expect(antes).toBeGreaterThan(5);

    // Cada apartado tiene el suyo: el del terreno se lleva los catorce del
    // informe, y los de los demás apartados siguen ahí.
    const botones = screen.getAllByRole('button', { name: /Marcar como revisados los \d+ datos de otra obra/ });
    expect(botones.length).toBeGreaterThan(1);
    const terreno = screen.getByRole('region', { name: /Cimentaciones/i });
    fireEvent.click(within(terreno).getByRole('button', { name: /Marcar como revisados/ }));

    await waitFor(() => expect(confirmarVisibles()).toBeLessThan(antes));
    expect(within(terreno).queryByRole('button', { name: /Marcar como revisados/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Marcar como revisados/ }).length).toBe(botones.length - 1);

    // Y se puede deshacer: no es obligatorio y no debe parecerlo.
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(confirmarVisibles()).toBe(antes));
  });

  it('Enter ya no confirma ni encadena: escribir en un campo no dispara nada', async () => {
    conGeotecnicoLeido();
    montar();

    const cota = document.getElementById('campo-obra-geotecnia-cotaCimentacion') as HTMLInputElement;
    const antes = confirmarVisibles();
    cota.focus();
    fireEvent.keyDown(cota, { key: 'Enter' });

    // Ni confirma, ni mueve el foco. El encadenado global se fue con el
    // «Marcar como revisados», que hace lo mismo sin catorce pulsaciones.
    await waitFor(() => expect(confirmarVisibles()).toBe(antes));
    expect(document.activeElement).toBe(cota);
  });

  it('en un área, Enter parte la línea como en cualquier cuadro de texto', () => {
    conGeotecnicoLeido();
    montar();
    const terreno = document.getElementById('campo-obra-geotecnia-descripcionTerrenos') as HTMLTextAreaElement;
    expect(terreno.tagName).toBe('TEXTAREA');

    const antes = confirmarVisibles();
    terreno.focus();
    fireEvent.keyDown(terreno, { key: 'Enter' });
    expect(confirmarVisibles()).toBe(antes);
    expect(document.activeElement).toBe(terreno);
  });
});

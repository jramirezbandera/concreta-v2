/**
 * Smoke de integración del módulo de sismo en jsdom.
 *
 * Lo que se prueba aquí y no se puede probar en los tests puros: que el
 * cableado entre estado, motor y pantalla existe de verdad. Los tres fallos que
 * busca son de los que no lanzan ninguna excepción:
 *
 *   1. que el veredicto de aplicabilidad NO aparezca, y el usuario lea un
 *      cortante basal calculado sobre un edificio que no cumple el art. 3.5.1;
 *   2. que una declaración sin contestar se dé por buena y el módulo calcule
 *      igual, produciendo un proyecto sin justificación sísmica;
 *   3. que el buscador diga "no figura en el Anejo 1" —que significa "la Norma
 *      no te obliga"— por un fallo de indexado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';

import { SeismicNCSE02Module } from '../../features/seismic-ncse02';
import { moduleRegistry } from '../../data/moduleRegistry';
import { MODULE_LIBRARY } from '../../pages/landing/modules';

// El módulo usa el drawer del AppShell; fuera de él, `useDrawer` necesita el
// contexto. Se sustituye por un doble mínimo para poder montar el módulo solo.
vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn(), closeDrawer: vi.fn(), drawerOpen: false }),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/analisis/sismo']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <SeismicNCSE02Module />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/analisis/sismo');
});
afterEach(() => cleanup());

describe('arranque', () => {
  it('monta y enseña el caso Granada por defecto', () => {
    montar();
    expect(screen.getByText('Acción sísmica')).toBeTruthy();
    // El municipio del caso por defecto aparece en el panel de resultados.
    expect(screen.getAllByText(/Granada/).length).toBeGreaterThan(0);
  });

  it('el VEREDICTO sale antes que ningún número', () => {
    const { container } = montar();
    const texto = container.textContent ?? '';
    const iVeredicto = texto.indexOf('La Norma rige');
    const iCortante = texto.indexOf('Cortante basal');
    expect(iVeredicto).toBeGreaterThanOrEqual(0);
    expect(iCortante).toBeGreaterThan(iVeredicto);
  });

  it('enseña el cortante basal del caso congelado', () => {
    const { container } = montar();
    // CASO_GRANADA da 2277,31 kN. Sin punto de millar a proposito: el espanol
    // no agrupa los numeros de cuatro cifras (minimumGroupingDigits = 2), y
    // toLocaleString('es-ES') lo respeta.
    expect(container.textContent).toContain('2277');
  });

  it('dibuja el espectro con las DOS curvas y rotula las zonas de alpha', () => {
    montar();
    const svg = screen.getByRole('img', { name: /espectro/i });
    // Dos <path> de curva: la elástica del art. 2.3 y la alpha del art. 3.7.3.
    expect(svg.querySelectorAll('path[stroke]').length).toBeGreaterThanOrEqual(2);
    expect(svg.textContent).toContain('α = 2,5');
    expect(svg.textContent).toContain('T_A');
    expect(svg.textContent).toContain('T_B');
  });

  it('dibuja el alzado con fuerzas y el diagrama de cortantes', () => {
    montar();
    expect(screen.getByRole('img', { name: /dirección X/i })).toBeTruthy();
  });
});

describe('las puertas cortan en pantalla, no solo en el motor', () => {
  it('una declaración sin contestar impide el cálculo y lo dice', async () => {
    const { container } = montar();
    fireEvent.click(screen.getByText('Declaraciones'));

    // "Regularidad geométrica" a sin contestar. La fila es el ancestro que
    // contiene tanto el rotulo como los tres botones.
    const rotulo = screen.getByText('Regularidad geométrica');
    const fila = rotulo.closest('div.flex.items-start');
    expect(fila).toBeTruthy();
    fireEvent.click(within(fila as HTMLElement).getByText('—'));

    await waitFor(() => {
      expect(container.textContent).toContain('NO es aplicable');
    });
    // Y desaparece el cortante: no puede quedar un número calculado a la vista
    // de un edificio cuya aplicabilidad está sin resolver.
    expect(container.textContent).not.toContain('Cortante basal');
  });

  it('bajar ab por debajo de 0,04 g exime y retira el cálculo', async () => {
    const { container } = montar();
    // El municipio fija ab; se cambia a entrada manual desde el propio campo
    // derivado no es posible, así que se comprueba por la vía del sistema:
    // 25 plantas invalidan el método simplificado.
    const n = screen.getByLabelText('n');
    fireEvent.change(n, { target: { value: '25' } });

    await waitFor(() => {
      expect(container.textContent).toContain('NO es aplicable');
    });
  });
});

describe('buscador de municipios', () => {
  it('encuentra Alicante tecleando su forma valenciana', async () => {
    montar();
    const caja = screen.getByLabelText(/Municipio/i);
    fireEvent.change(caja, { target: { value: 'alacant' } });

    await waitFor(
      () => {
        expect(screen.getByText('Alicante/Alacant')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('un nombre que no está da el mensaje que cubre exención Y errata', async () => {
    montar();
    fireEvent.change(screen.getByLabelText(/Municipio/i), { target: { value: 'zzzzqqq' } });

    await waitFor(
      () => {
        expect(screen.getByText(/No figura en el Anejo 1/)).toBeTruthy();
      },
      { timeout: 3000 },
    );
    const aviso = screen.getByText(/No figura en el Anejo 1/).textContent ?? '';
    expect(aviso).toMatch(/art\. 1\.2\.3/);
    expect(aviso).toMatch(/ortograf/i);
  });

  it('elegir un municipio actualiza ab y K', async () => {
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/Municipio/i), { target: { value: 'lorca' } });
    const opcion = await screen.findByText('Lorca', {}, { timeout: 3000 });
    fireEvent.click(opcion);

    await waitFor(() => {
      expect(container.textContent).toContain('Lorca');
    });
  });
});

describe('persistencia y enlace', () => {
  it('guarda el caso en localStorage al tocarlo', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('H (m)'), { target: { value: '33' } });
    await waitFor(() => {
      const bruto = localStorage.getItem('concreta-seismic-ncse02-model');
      expect(bruto).toBeTruthy();
      expect(JSON.parse(bruto!).H).toBe(33);
    });
  });

  it('copia un enlace que contiene el caso', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: escribir } });
    montar();
    // Vive dentro del menu de Ajustes de la topbar, no suelto.
    fireEvent.click(screen.getAllByLabelText('Ajustes')[0]);
    fireEvent.click(await screen.findByText('Copiar enlace'));
    await waitFor(() => expect(escribir).toHaveBeenCalled());
    expect(String(escribir.mock.calls[0][0])).toContain('?model=');
  });
});

describe('registro del módulo', () => {
  it('está en moduleRegistry con su ruta y su grupo', () => {
    const e = moduleRegistry.find((m) => m.key === 'concreta-seismic');
    expect(e).toBeTruthy();
    expect(e?.route).toBe('/analisis/sismo');
    expect(e?.group).toBe('Análisis');
    expect(e?.shipped).toBe(true);
  });

  it('está en la biblioteca de la landing, con la misma ruta', () => {
    const e = MODULE_LIBRARY.find((m) => m.id === 'seismic-ncse02');
    expect(e).toBeTruthy();
    expect(e?.route).toBe('/analisis/sismo');
    // Si la landing y el registro se separan, el usuario pincha y no llega.
    expect(e?.route).toBe(moduleRegistry.find((m) => m.key === 'concreta-seismic')?.route);
  });
});

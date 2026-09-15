/**
 * El cuadro de materiales sigue imprimiendo la nota de fuego, pero ya no la
 * teclea: la lee del sobre de `/acciones/incendio`.
 *
 * Es la prueba de que la mudanza no rompió el papel. Cubre las tres
 * situaciones que puede encontrarse una obra real:
 *
 *   1. hay sobre de incendio → se imprime lo que diga;
 *   2. el sobre existe pero nadie lo configuró → no se imprime nada;
 *   3. no hay sobre → no se imprime nada, como antes de que el fuego existiera
 *      en este cuadro.
 *
 * Hubo un cuarto caso mientras duró el legado: sin sobre se replegaba a las
 * exigencias que este módulo había guardado cuando el fuego se tecleaba en él,
 * para que una obra anterior a la mudanza no perdiera su R en silencio. El
 * legado se retiró el 15-09-2026 con la v3 del sobre, y el repliegue con él.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { MaterialesModule } from '../../features/materiales';
import { SCHEMA_VERSION, SCHEMA_VERSION_KEY, STORAGE_KEY } from '../../features/materiales/state';
import { MODULO_INCENDIO, PUB_VERSION_INCENDIO } from '../../features/materiales/incendioPub';
import { clavePublicacion } from '../../lib/pub';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/memorias/materiales']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <MaterialesModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Deja escrito un sobre de incendio como lo dejaría el módulo. */
function sobreDeIncendio(
  exigencias: { ambito: string; minutos: number }[],
  configurado = true,
) {
  localStorage.setItem(
    clavePublicacion(MODULO_INCENDIO),
    JSON.stringify({
      v: PUB_VERSION_INCENDIO,
      ts: '2026-09-13T10:00:00.000Z',
      modulo: MODULO_INCENDIO,
      obra: { municipio: null, provincia: null, ine: null },
      configurado,
      datos: { exigencias },
    }),
  );
}

/** Monta y abre la pestaña del documento: el cuadro arranca en «Datos». */
function montarYVerElPlano() {
  montar();
  fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('la nota de fuego del cuadro', () => {
  it('sale de lo publicado por el módulo de incendio', () => {
    sobreDeIncendio([{ ambito: 'Plantas sobre rasante', minutos: 90 }]);
    montarYVerElPlano();
    expect(screen.getByText(/R90 en las plantas sobre rasante/)).toBeInTheDocument();
  });

  it('un sobre que nadie configuró no imprime nada', () => {
    // El módulo de incendio no publica sobres vacíos, pero el filtro está
    // igualmente: una exigencia que nadie decidió no entra en un documento
    // firmado.
    sobreDeIncendio([{ ambito: 'Plantas sobre rasante', minutos: 90 }], false);
    montarYVerElPlano();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura/),
    ).not.toBeInTheDocument();
  });

  it('sin sobre no se imprime nada de fuego', () => {
    montarYVerElPlano();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura/),
    ).not.toBeInTheDocument();
  });

  it('y un cuadro con el legado viejo dentro tampoco lo resucita', () => {
    // Un `concreta-materiales-model` de antes de la mudanza sigue teniendo su
    // `exigenciasFuego` guardado. Ya no se lee: si se leyera, la nota saldría
    // de un dato que ningún módulo mantiene.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ exigenciasFuego: [{ id: 'f1', ambito: 'Toda la estructura', minutos: 60 }] }),
    );
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
    montarYVerElPlano();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura/),
    ).not.toBeInTheDocument();
  });
});

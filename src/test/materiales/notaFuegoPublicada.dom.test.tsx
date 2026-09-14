/**
 * El cuadro de materiales sigue imprimiendo la nota de fuego, pero ya no la
 * teclea: la lee del sobre de `/acciones/incendio`.
 *
 * Es la prueba de que la mudanza no rompió el papel. Cubre las cuatro
 * situaciones que puede encontrarse una obra real:
 *
 *   1. hay sobre de incendio → se imprime lo que diga;
 *   2. el sobre existe pero nadie lo configuró → no se imprime nada;
 *   3. no hay sobre pero sí legado (la obra no ha pasado aún por el módulo
 *      nuevo, o viene de un `.concreta` anterior al cambio) → se imprime el
 *      legado;
 *   4. ni sobre ni legado → no se imprime nada, como siempre.
 *
 * El caso 3 es el que evita la regresión silenciosa: `desplegar()` REEMPLAZA
 * las claves de proyecto al abrir un `.concreta`, así que una obra guardada
 * antes del cambio llega sin `concreta-pub-incendio` y, sin el repliegue, su
 * memoria perdería la R sin que nadie se enterase.
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

/** Deja escrito un cuadro de materiales con el legado de fuego dentro. */
function cuadroConLegado(exigencias: { id: string; ambito: string; minutos: number }[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ exigenciasFuegoLegado: exigencias }),
  );
  localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
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

  it('sin sobre, se repliega al legado que este módulo guardó en su día', () => {
    cuadroConLegado([{ id: 'f1', ambito: 'Toda la estructura', minutos: 60 }]);
    montarYVerElPlano();
    expect(
      screen.getByText(/Resistencia al fuego exigida a la estructura: R60/),
    ).toBeInTheDocument();
  });

  it('el sobre manda sobre el legado', () => {
    cuadroConLegado([{ id: 'f1', ambito: 'Toda la estructura', minutos: 60 }]);
    sobreDeIncendio([{ ambito: 'Plantas sobre rasante', minutos: 120 }]);
    montarYVerElPlano();
    expect(screen.getByText(/R120 en las plantas sobre rasante/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura: R60/),
    ).not.toBeInTheDocument();
  });

  it('sin sobre ni legado no se imprime nada de fuego', () => {
    montarYVerElPlano();
    expect(
      screen.queryByText(/Resistencia al fuego exigida a la estructura/),
    ).not.toBeInTheDocument();
  });
});

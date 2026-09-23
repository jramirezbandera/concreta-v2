// El reparto de la barra en móvil (T7 del plan de diseño de 2026-09-22).
//
// jsdom no maqueta: aquí no se puede medir un truncado. Lo que se fija es el
// CONTRATO del que salen las medidas, porque lo que falló en su día no fue un
// número mal calculado sino una prioridad escrita al revés.
//
// Medido en el navegador a 375 px (`/memorias/db-se`, el título más largo de
// los 27 módulos):
//
//   ancho útil ................... 335 px (375 − 40 de padding)
//   hamburguesa 42 · desplegables 110 · huecos y «/» 34
//   → para el título, en UNA fila ... 75 px
//   «Acción sísmica» pide ........... 91 px
//   «Cumplimiento del DB SE» pide .. 148 px
//
// O sea que UNA fila no cabe, y la barra se queda en dos. Pero medirlo destapó
// que el reparto anterior tampoco aguantaba: el título cabía sólo porque el
// marcador «Sin obra» mide 74 px, y con una obra de verdad («EDIFICIO 12
// VIVIENDAS») se quedaba en 99 de los 148 que pide. La obra era `shrink-0` y el
// título cedía. Ahora la obra sube a la fila de arriba —que estaba medio
// vacía—, el título se queda solo con los 335 px y no se corta nunca.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { Topbar } from '../../components/layout/Topbar';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const TITULO = 'Cumplimiento del DB SE';

function montar() {
  render(
    <MemoryRouter initialEntries={['/memorias/db-se']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <Topbar moduleLabel={TITULO} moduleGroup="Memorias" onMenuOpen={() => {}} />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const barra = () => document.querySelector('header')!;
/** El hijo directo de la barra que contiene a este elemento: o sea, su fila. */
const filaDe = (el: Element) => [...barra().children].find((c) => c === el || c.contains(el))!;

const obra = () => screen.getByRole('button', { name: /^Obra:/ });
const titulo = () => screen.getByText(TITULO);
const desplegables = () => filaDe(screen.getByRole('button', { name: 'Menú' }));

describe('Topbar en móvil — el reparto de las dos filas (T7)', () => {
  it('arriba lo que se pulsa, abajo lo que se lee', () => {
    montar();

    // La obra dejó de vivir dentro de la miga: ahora es hermana de los
    // desplegables, en la fila de arriba.
    expect(obra().parentElement).toBe(barra());
    expect(filaDe(obra())).toBe(obra());
    expect(filaDe(obra())).not.toBe(filaDe(titulo()));

    // Y el título se queda solo en su fila, a todo el ancho, hasta `sm`.
    const suFila = filaDe(titulo());
    expect(suFila.className).toContain('w-full');
    expect(suFila.className).toContain('sm:w-auto');
    expect(suFila).not.toBe(desplegables());
  });

  it('al truncar cede la obra, nunca el título', () => {
    montar();

    // Esto es la decisión, no un detalle: en qué obra estás lo contesta también
    // el cajón; en qué pantalla estás sólo lo contesta esta miga.
    expect(obra().className).toContain('min-w-0');
    expect(obra().className).not.toContain('shrink-0');
    expect(titulo().className).toContain('truncate');
  });

  it('la obra arranca de cero para no empujar a nadie a una tercera fila', () => {
    montar();

    // `flex-1` (base 0) y no un ancho máximo a ojo: el reparto por líneas se
    // decide con el tamaño BASE de cada pieza y sólo después se encoge, así que
    // con su ancho natural un nombre largo manda los desplegables abajo.
    expect(obra().className).toContain('flex-1');
  });

  it('en escritorio el título va antes que los desplegables', () => {
    montar();

    // Hace falta orden explícito en `sm`: al resetearlo mandaría el orden del
    // DOM, que en móvil pone los desplegables ANTES de la miga, y en escritorio
    // los dejaba plantados en mitad de la barra.
    expect(filaDe(titulo()).className).toContain('sm:order-3');
    expect(desplegables().className).toContain('sm:order-4');
    expect(desplegables().className).toContain('sm:ml-auto');
  });

  it('el grupo y la barra «/» sólo salen desde `sm`', () => {
    montar();

    // En móvil la obra ya no está al lado, así que un «/» suelto delante del
    // título no separaría nada; y el grupo es contexto que ya da el cajón.
    const grupo = screen.getByText('Memorias');
    expect(grupo.className).toContain('hidden');
    expect(grupo.className).toContain('sm:inline');

    const separador = [...barra().querySelectorAll('span')].find((s) => s.textContent === '/');
    expect(separador?.className).toContain('hidden');
    expect(separador?.className).toContain('sm:inline');
  });
});

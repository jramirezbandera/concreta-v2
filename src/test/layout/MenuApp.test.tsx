// Tests del «Menú» de la topbar (src/components/layout/MenuApp.tsx), que sucede
// al viejo «Ajustes» el 2026-09-22 y recoge además el Asistente IA y la
// Calculadora. Cubre las decisiones de la revisión de diseño que son
// verificables sin navegador:
//
//   D-I3  — el disparador se llama «Menú».
//   D-I7  — UNA sola forma: las filas que no aplican salen APAGADAS con la
//           razón, no se esconden.
//   D-I14 — al elegir una herramienta el foco vuelve al disparador ANTES de
//           abrirla (si no, el asistente memoriza como origen una fila que ya
//           no existe y al cerrarse el foco cae al <body>).
//   D-I18 — NO se anuncia `role="menu"`: es un panel con botones.
//   R6/R7 — los atajos siguen a la vista y las filas de herramienta miden 44 px.
//
// ThemeProvider por el <ThemeToggle>; UnitSystemProvider por el conmutador de
// unidades; MemoryRouter por el <NavLink> de Mi estudio.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { MenuApp } from '../../components/layout/MenuApp';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

interface Opciones {
  onCopyLink?: () => void;
  onOpenAssistant?: (() => void) | undefined;
  onOpenCalculator?: () => void;
  ruta?: string;
  conAsistente?: boolean;
}

function renderMenu(o: Opciones = {}) {
  const onCopyLink = o.onCopyLink ?? vi.fn();
  const onOpenAssistant = o.onOpenAssistant ?? vi.fn();
  const onOpenCalculator = o.onOpenCalculator ?? vi.fn();
  const conAsistente = o.conAsistente ?? true;
  render(
    <MemoryRouter initialEntries={[o.ruta ?? '/horm/vigas']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <MenuApp
            onCopyLink={onCopyLink}
            onOpenAssistant={conAsistente ? onOpenAssistant : undefined}
            onOpenCalculator={onOpenCalculator}
          />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { onCopyLink, onOpenAssistant, onOpenCalculator };
}

const abrir = async () => {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'Menú' });
  await user.click(trigger);
  return { user, trigger };
};

describe('MenuApp', () => {
  it('cerrado por defecto; se llama «Menú» y trae los tres grupos', async () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Menú' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Copiar enlace/ })).not.toBeInTheDocument();

    await abrir();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Herramientas' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Preferencias' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Estudio y compartir' })).toBeInTheDocument();
  });

  // D-I18: anunciarse como menú promete navegación por flechas, y aquí hay dos
  // conmutadores y un enlace, que no son `menuitem`. Mejor no prometerlo.
  it('NO se anuncia como menú: es un panel con botones', async () => {
    renderMenu();
    await abrir();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Asistente IA/ })).toBeInTheDocument();
  });

  // R6: el atajo se sigue viendo aunque el botón ya no esté en la barra.
  // R7: 44 px de alto, que es el mínimo táctil.
  it('las dos herramientas enseñan su atajo y miden 44 px', async () => {
    renderMenu();
    await abrir();

    const asistente = screen.getByRole('button', { name: /Asistente IA/ });
    const calculadora = screen.getByRole('button', { name: /Calculadora/ });

    expect(asistente).toHaveTextContent('A');
    expect(calculadora).toHaveTextContent('C');
    expect(asistente.className).toContain('min-h-11');
    expect(calculadora.className).toContain('min-h-11');
  });

  // D-I14: el orden importa. La herramienta memoriza `document.activeElement`
  // al montarse para devolverle el foco al cerrarse.
  it('al abrir una herramienta, cierra y devuelve el foco al disparador', async () => {
    const { onOpenAssistant } = renderMenu();
    const { user, trigger } = await abrir();

    await user.click(screen.getByRole('button', { name: /Asistente IA/ }));

    expect(onOpenAssistant).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('group', { name: 'Herramientas' })).not.toBeInTheDocument();
  });

  it('la calculadora se abre igual que el asistente', async () => {
    const { onOpenCalculator } = renderMenu();
    const { user, trigger } = await abrir();

    await user.click(screen.getByRole('button', { name: /Calculadora/ }));

    expect(onOpenCalculator).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  // D-I7: en las cuatro pantallas sin asistente la fila NO desaparece. Si
  // desapareciera, el menú cambiaría de forma y además nadie sabría que la
  // función existe.
  it('sin asistente, la fila sale apagada y con la razón, no se esconde', async () => {
    renderMenu({ conAsistente: false });
    await abrir();

    expect(screen.queryByRole('button', { name: /Asistente IA/ })).not.toBeInTheDocument();
    expect(screen.getByText('Asistente IA')).toBeInTheDocument();
    expect(screen.getByText('El asistente no trabaja en esta pantalla.')).toBeInTheDocument();
    // La forma del menú no cambia: los tres grupos siguen ahí.
    expect(screen.getByRole('group', { name: 'Herramientas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculadora/ })).toBeInTheDocument();
  });

  it('«Mi estudio» lleva a /ajustes/estudio y cierra el menú', async () => {
    renderMenu();
    const { user } = await abrir();

    const estudio = screen.getByRole('link', { name: /Mi estudio/ });
    expect(estudio).toHaveAttribute('href', '/ajustes/estudio');
    expect(estudio).not.toHaveAttribute('aria-current', 'page');

    await user.click(estudio);
    expect(screen.queryByRole('group', { name: 'Herramientas' })).not.toBeInTheDocument();
  });

  it('estando ya en Mi estudio, la entrada se marca como la página actual', async () => {
    renderMenu({ ruta: '/ajustes/estudio' });
    await abrir();

    expect(screen.getByRole('link', { name: /Mi estudio/ })).toHaveAttribute('aria-current', 'page');
  });

  it('«Copiar enlace» llama al handler y cierra el menú', async () => {
    const { onCopyLink } = renderMenu();
    const { user } = await abrir();

    await user.click(screen.getByRole('button', { name: /Copiar enlace/ }));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Herramientas' })).not.toBeInTheDocument();
  });

  it('Escape cierra el menú', async () => {
    renderMenu();
    await abrir();
    expect(screen.getByRole('group', { name: 'Herramientas' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Herramientas' })).not.toBeInTheDocument();
  });

  it('un clic fuera cierra el menú', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <UnitSystemProvider>
            <div>
              <MenuApp onCopyLink={vi.fn()} onOpenAssistant={vi.fn()} onOpenCalculator={vi.fn()} />
              <button>fuera</button>
            </div>
          </UnitSystemProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Menú' }));
    expect(screen.getByRole('group', { name: 'Herramientas' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'fuera' }));
    expect(screen.queryByRole('group', { name: 'Herramientas' })).not.toBeInTheDocument();
  });
});

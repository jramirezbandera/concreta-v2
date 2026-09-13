// Tests del menú "Ajustes" de la topbar (src/components/layout/AjustesMenu.tsx).
// Recoge Mi estudio + Tema + Copiar enlace tras un desplegable. Cubre: cerrado
// por defecto, abrir/cerrar, contenido, la entrada a Mi estudio (F6), la acción
// de copiar + cierre, y a11y (Escape, clic fuera). ThemeProvider necesario por
// el <ThemeToggle>; MemoryRouter, por el <NavLink> de Mi estudio.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { AjustesMenu } from '../../components/layout/AjustesMenu';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

function renderMenu(onCopyLink = vi.fn(), ruta = '/horm/vigas') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ThemeProvider>
        <UnitSystemProvider>
          <AjustesMenu onCopyLink={onCopyLink} />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { onCopyLink };
}

describe('AjustesMenu', () => {
  it('cerrado por defecto; el engranaje lo abre y muestra Mi estudio + Tema + Copiar enlace', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Ajustes' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: /Copiar enlace/ })).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Unidades')).toBeInTheDocument();
    expect(screen.getByText('Tema')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Copiar enlace/ })).toBeInTheDocument();
  });

  // F6: el perfil del despacho salió del grupo PROYECTO del sidebar y entró
  // aquí. Es el único elemento del menú que lleva a otra pantalla.
  it('«Mi estudio» lleva a /ajustes/estudio y cierra el menú', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    const estudio = screen.getByRole('menuitem', { name: /Mi estudio/ });
    expect(estudio).toHaveAttribute('href', '/ajustes/estudio');
    expect(estudio).not.toHaveAttribute('aria-current', 'page');

    await user.click(estudio);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('estando ya en Mi estudio, la entrada se marca como la página actual', async () => {
    const user = userEvent.setup();
    renderMenu(vi.fn(), '/ajustes/estudio');

    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(screen.getByRole('menuitem', { name: /Mi estudio/ })).toHaveAttribute('aria-current', 'page');
  });

  it('"Copiar enlace" llama al handler y cierra el menú', async () => {
    const user = userEvent.setup();
    const { onCopyLink } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    await user.click(screen.getByRole('menuitem', { name: /Copiar enlace/ }));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape cierra el menú', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('un clic fuera cierra el menú', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <UnitSystemProvider>
            <div>
              <AjustesMenu onCopyLink={vi.fn()} />
              <button>fuera</button>
            </div>
          </UnitSystemProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'fuera' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

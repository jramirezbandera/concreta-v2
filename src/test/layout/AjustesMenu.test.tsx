// Tests del menú "Ajustes" de la topbar (src/components/layout/AjustesMenu.tsx).
// Recoge Tema + Copiar enlace tras un desplegable. Cubre: cerrado por defecto,
// abrir/cerrar, contenido (Tema + Copiar enlace), acción de copiar + cierre,
// y a11y (Escape, clic fuera). ThemeProvider necesario por el <ThemeToggle>.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AjustesMenu } from '../../components/layout/AjustesMenu';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

function renderMenu(onCopyLink = vi.fn()) {
  render(
    <ThemeProvider>
      <UnitSystemProvider>
        <AjustesMenu onCopyLink={onCopyLink} />
      </UnitSystemProvider>
    </ThemeProvider>,
  );
  return { onCopyLink };
}

describe('AjustesMenu', () => {
  it('cerrado por defecto; el engranaje lo abre y muestra Tema + Copiar enlace', async () => {
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
      <ThemeProvider>
        <UnitSystemProvider>
          <div>
            <AjustesMenu onCopyLink={vi.fn()} />
            <button>fuera</button>
          </div>
        </UnitSystemProvider>
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'fuera' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

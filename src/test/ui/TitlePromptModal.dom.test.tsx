// DOM tests para TitlePromptModal — "preguntar al exportar".
//
// Cubre: preview WYSIWYG (= titledFilename), fallback en título vacío, autofocus +
// select-all, Enter=confirmar, Escape/backdrop=cancelar, estado "Generando" y
// devolución de foco al disparador. Estos flujos son justo donde se cuelan
// regresiones al propagar a los otros módulos (eng-review §Pass 6).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';

const FALLBACK = 'concreta-viga-2026-07-08.pdf';

function setup(props: Partial<React.ComponentProps<typeof TitlePromptModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <TitlePromptModal
      initialTitle={props.initialTitle ?? ''}
      fallbackFilename={props.fallbackFilename ?? FALLBACK}
      exporting={props.exporting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  const input = screen.getByLabelText('Título del elemento') as HTMLInputElement;
  return { ...utils, input, onConfirm, onCancel };
}

describe('TitlePromptModal', () => {
  it('autofocus + select-all al abrir (una tecla sobrescribe el pre-relleno)', () => {
    const { input } = setup({ initialTitle: 'Dintel de ventana' });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Dintel de ventana'.length);
  });

  it('preview del nombre = slug del título (WYSIWYG, misma titledFilename)', async () => {
    const { input } = setup();
    const user = userEvent.setup();
    await user.type(input, 'Dintel de ventana');
    expect(screen.getByText('dintel-de-ventana.pdf')).toBeInTheDocument();
  });

  it('título vacío → preview muestra el fallback con fecha', () => {
    setup({ initialTitle: '' });
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('solo símbolos → slug vacío → preview cae al fallback', async () => {
    const { input } = setup();
    const user = userEvent.setup();
    await user.type(input, '/// ???');
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('Enter confirma con el título actual', async () => {
    const { input, onConfirm } = setup({ initialTitle: 'Viga 1' });
    const user = userEvent.setup();
    await user.type(input, '{Enter}');
    expect(onConfirm).toHaveBeenCalledWith('Viga 1');
  });

  it('botón Exportar PDF confirma', async () => {
    const { onConfirm } = setup({ initialTitle: 'Zapata P3' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(onConfirm).toHaveBeenCalledWith('Zapata P3');
  });

  it('Escape cancela', () => {
    const { onCancel } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('botón Cancelar cierra', async () => {
    const { onCancel } = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('botón X (Cerrar) cierra', async () => {
    const { onCancel } = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clic en el backdrop NO cierra (solo X / Cancelar / Esc)', async () => {
    const { onCancel } = setup();
    const user = userEvent.setup();
    // Ni la tarjeta (role=dialog) ni el backdrop (padre presentacional) cierran.
    await user.click(screen.getByRole('dialog'));
    await user.click(screen.getByRole('presentation'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('exporting=true: muestra "Generando…" y deshabilita las acciones', () => {
    setup({ initialTitle: 'Viga 1', exporting: true });
    expect(screen.getByText(/Generando/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generando/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('devuelve el foco al disparador (botón Exportar) al cerrar', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = setup();
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

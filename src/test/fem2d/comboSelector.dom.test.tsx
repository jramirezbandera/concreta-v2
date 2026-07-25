// FEM 2D — desplegable de combinaciones (ComboSelect), pruebas DOM.
//
// El selector nunca tuvo un test (grep radiogroup/COMBO_TABS bajo fem2d/ no
// devolvía nada). Aquí se fija el contrato visible: arranca en la envolvente ELU,
// agrupa por optgroup, muestra los nombres COMPLETOS de las hipótesis (criterio
// 14: nunca una letra suelta) y emite el id elegido. La invariancia del panel y
// la deduplicación de vistas se prueban en comboViews.test.ts.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComboSelect } from '../../features/fem2d/ComboSelect';
import {
  beamColumn,
  fem2dModel,
  node2d,
  nodeLoad,
  support2d,
} from '../../features/fem2d/builder';
import { analyzeFem2D } from '../../features/fem2d/pipeline';

// Pórtico voladizo con G+Q+W ⇒ juego completo (envolventes NO colapsadas, elu:*,
// els_c:*, els_cp e hipótesis).
function views() {
  const model = fem2dModel({
    nodes: [node2d('n1', 0, 0), node2d('n2', 6, 0)],
    members: [beamColumn('m1', 'n1', 'n2')],
    supports: [support2d('n1', 'fixed')],
    loads: [
      nodeLoad('g', 'n2', { lc: 'G', Fy: -10 }),
      nodeLoad('q', 'n2', { lc: 'Q', useCategory: 'B', Fy: -8 }),
      nodeLoad('w', 'n2', { lc: 'W', Fx: 5 }),
    ],
  });
  const r = analyzeFem2D(model);
  expect(r.ok).toBe(true);
  return r.checks!.comboViews;
}

describe('ComboSelect', () => {
  it('arranca mostrando la vista activa (env:ELU) seleccionada', () => {
    render(<ComboSelect comboViews={views()} activeId="env:ELU" disabled={false} onChange={() => {}} />);
    const select = screen.getByLabelText('Combinación a dibujar') as HTMLSelectElement;
    expect(select.value).toBe('env:ELU');
  });

  it('agrupa por optgroup: Envolventes · Combinaciones ELU · Combinaciones ELS · Hipótesis simples', () => {
    const { container } = render(
      <ComboSelect comboViews={views()} activeId="env:ELU" disabled={false} onChange={() => {}} />,
    );
    const labels = Array.from(container.querySelectorAll('optgroup')).map((g) => g.label);
    expect(labels).toEqual(['Envolventes', 'Combinaciones ELU', 'Combinaciones ELS', 'Hipótesis simples']);
  });

  it('las hipótesis muestran el nombre COMPLETO, nunca la letra suelta (criterio 14)', () => {
    const { container } = render(
      <ComboSelect comboViews={views()} activeId="env:ELU" disabled={false} onChange={() => {}} />,
    );
    const hyp = Array.from(container.querySelectorAll('optgroup')).find((g) => g.label === 'Hipótesis simples')!;
    const texts = Array.from(hyp.querySelectorAll('option')).map((o) => o.textContent);
    expect(texts).toContain('G · Cargas permanentes');
    expect(texts).toContain('Q · Sobrecarga de uso');
    expect(texts).toContain('W · Viento');
    // Ninguna opción es una única letra.
    for (const t of texts) expect(t!.length).toBeGreaterThan(1);
  });

  it('elegir una combinación emite su id de vista', async () => {
    const onChange = vi.fn();
    render(<ComboSelect comboViews={views()} activeId="env:ELU" disabled={false} onChange={onChange} />);
    const select = screen.getByLabelText('Combinación a dibujar');
    await userEvent.selectOptions(select, 'elu:W');
    expect(onChange).toHaveBeenCalledWith('elu:W');
  });

  it('la hipótesis G se puede elegir por su etiqueta completa', async () => {
    const onChange = vi.fn();
    render(<ComboSelect comboViews={views()} activeId="env:ELU" disabled={false} onChange={onChange} />);
    const select = screen.getByLabelText('Combinación a dibujar');
    await userEvent.selectOptions(select, within(select as HTMLSelectElement).getByText('G · Cargas permanentes'));
    expect(onChange).toHaveBeenCalledWith('lc:G');
  });

  it('disabled ⇒ el <select> está deshabilitado (modelo sin nada que dibujar)', () => {
    render(<ComboSelect comboViews={views()} activeId="env:ELU" disabled={true} onChange={() => {}} />);
    expect((screen.getByLabelText('Combinación a dibujar') as HTMLSelectElement).disabled).toBe(true);
  });

  it('sin vistas ⇒ no renderiza nada', () => {
    const { container } = render(<ComboSelect comboViews={[]} activeId={undefined} disabled={false} onChange={() => {}} />);
    expect(container.querySelector('select')).toBeNull();
  });

  // Regresión móvil: con un ancho fijo (era max-w-[15rem]) el <select> CERRADO
  // cortaba "ELS característica · 1.00·G + 1.00·Q + 0.60·W" a media cifra —
  // ilegible justo donde vive el dato. jsdom no mide layout, así que el guarda
  // fija las tres clases que dan el ancho: fila propia bajo lg, capacidad de
  // encoger y puntos suspensivos al desbordar.
  it('el desplegable ocupa su propia fila en móvil y trunca con puntos suspensivos', () => {
    const { container } = render(<ComboSelect comboViews={views()} activeId="env:ELU" disabled={false} onChange={() => {}} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('max-lg:basis-full');
    const select = screen.getByLabelText('Combinación a dibujar');
    expect(select.className).toContain('min-w-0');
    expect(select.className).toContain('flex-1');
    expect(select.className).toContain('truncate');
  });
});

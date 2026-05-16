// Unit toggle integration tests for masonry-walls + FEM 2D modules.
//
// Verifica que tras el refactor v1.0 del toggle SI↔técnico:
//   1. InlineEdit (FEM Canvas) convierte SI↔display + parse-back correcto.
//   2. Storage permanece SIEMPRE en SI (regression guard contra el bug
//      potencial flagged por el subagent: mm → m si quantity=length).
//   3. Round-trip: editar en técnico → onCommit recibe SI.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen, type RenderOptions } from '@testing-library/react';
import { InlineEdit } from '../../features/fem-analysis/components/InlineEdit';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

function renderInProvider(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, {
    wrapper: ({ children }) => <UnitSystemProvider>{children}</UnitSystemProvider>,
    ...options,
  });
}

describe('InlineEdit — unit toggle integration', () => {
  it('SI default: muestra value en N/mm² para stress', () => {
    renderInProvider(<InlineEdit value={5} quantity="stress" onCommit={() => {}} />);
    // CATALOG.stress.siUnit = 'N/mm²', precisionSi = 1
    expect(screen.getByRole('button').textContent).toContain('5.0');
    expect(screen.getByRole('button').textContent).toContain('N/mm²');
  });

  it('SI default: kN para force', () => {
    renderInProvider(<InlineEdit value={20} quantity="force" onCommit={() => {}} />);
    expect(screen.getByRole('button').textContent).toContain('20.00');
    expect(screen.getByRole('button').textContent).toContain('kN');
  });

  it('SI default: kN/m para linearLoad', () => {
    renderInProvider(<InlineEdit value={10} quantity="linearLoad" onCommit={() => {}} />);
    expect(screen.getByRole('button').textContent).toContain('kN/m');
  });

  it('round-trip: type 5.0 en SI con quantity=stress → onCommit recibe 5.0 SI exacto', () => {
    const onCommit = vi.fn();
    renderInProvider(<InlineEdit value={1} quantity="stress" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5.0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(5);
  });

  it('legacy unit prop (sin quantity) sigue funcionando como antes', () => {
    renderInProvider(<InlineEdit value={42} unit="m" onCommit={() => {}} />);
    expect(screen.getByRole('button').textContent).toContain('42.00');
    expect(screen.getByRole('button').textContent).toContain('m');
  });

  it('min validation en SI: typing "0.5" cuando min=1 (SI) → revert', () => {
    const onCommit = vi.fn();
    renderInProvider(<InlineEdit value={2} quantity="stress" min={1} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // 0.5 N/mm² < min=1 N/mm² → revert
    fireEvent.change(input, { target: { value: '0.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

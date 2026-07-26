// FEM 1D — panel de resultados tras la homogeneización con el FEM 2D.
//
// Fija la DECISIÓN, no el pixel: el resumen del modelo es tarjeta de
// utilización + filas desplegables (piezas de components/checks), el badge es
// el compartido, y las filas desplegadas enseñan las comprobaciones REALES del
// motor —con unidades— y no el resumen aplanado de `BarResult.checks`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ResultsPanel } from '../../features/fem-analysis/ResultsPanel';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import type { CheckRow } from '../../lib/calculations/types';
import type { BarResult, DesignBar, DesignModel, Selected, SolveResult } from '../../features/fem-analysis/types';

const bar = (id: string, material: DesignBar['material']): DesignBar =>
  ({ id, i: 'n1', j: 'n2', material } as DesignBar);

const row = (id: string, util: number): CheckRow => ({
  id,
  description: `Comprobación ${id}`,
  valueNum: 120, // kNm — la unidad base SI del catálogo para 'moment'
  valueQty: 'moment',
  utilization: util,
  status: util >= 1 ? 'fail' : 'ok',
  article: 'CE Anejo 22 §6.2',
});

const barResult = (eta: number, status: BarResult['status'], checks: CheckRow[] = []): BarResult => ({
  xs: [0, 1], M: [0, 1], V: [0, 1], N: [0, 0], L: 5,
  Mmax: 1, Vmax: 1, Nmax: 0,
  eta, status,
  checks: [],
  steelResult: { valid: true, checks },
});

const model: DesignModel = {
  presetCode: 'custom',
  selfWeight: true,
  nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 5, y: 0 }],
  bars: [bar('b1', 'steel'), bar('b2', 'steel')],
  supports: [],
  loads: [],
};

const result = (over: Partial<SolveResult> = {}): SolveResult => ({
  reactions: [{ node: 'n1', x: 0, y: 0, Rx: 0, Ry: 42, Mr: 0 }],
  errors: [],
  perBar: {
    b1: barResult(0.42, 'ok', [row('flexion', 0.42)]),
    b2: barResult(1.19, 'fail', [row('cortante', 1.19)]),
  },
  maxEta: 1.19,
  status: 'fail',
  ...over,
});

const renderPanel = (res: SolveResult = result()) =>
  render(
    <UnitSystemProvider>
      <ResultsPanel
        model={model}
        result={res}
        selected={null}
        setSelected={() => {}}
        activeSection="vano"
        setActiveSection={() => {}}
        combo="ELU"
      />
    </UnitSystemProvider>,
  );

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe('FEM 1D — resumen del modelo', () => {
  it('encabeza con la tarjeta de utilización máxima y el recuento del modelo', () => {
    renderPanel();
    expect(screen.getByText('Utilización máxima')).toBeInTheDocument();
    // Dos veces: cabecera y tarjeta.
    expect(screen.getAllByText('119%').length).toBe(2);
    expect(screen.getByText('2 barras · 2 nudos')).toBeInTheDocument();
  });

  it('el veredicto es el <VerdictBadge> compartido (INCUMPLE, no «fail»)', () => {
    renderPanel();
    // Dos: el de la cabecera y el de la tarjeta. Antes la cabecera tenía badge
    // propio con otras palabras ('REVISIÓN' donde el compartido dice 'ADVERT.').
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBe(2);
    for (const b of badges) expect(b).toHaveTextContent('INCUMPLE');
  });

  it('lista las barras ordenadas por η y desplegables', () => {
    renderPanel();
    const rows = screen.getAllByRole('button', { expanded: false });
    // Peor primero: b2 (119%) antes que b1 (42%).
    expect(rows[0]).toHaveTextContent('b2');
    expect(rows[1]).toHaveTextContent('b1');
    // >100% se dice con la palabra; ≤100% con el número.
    expect(rows[0]).toHaveTextContent('INCUMPLE');
    expect(rows[1]).toHaveTextContent('42%');
  });

  it('desplegar una barra enseña sus comprobaciones CON unidad', () => {
    renderPanel();
    const b1 = screen.getAllByRole('button', { expanded: false })[1];
    expect(screen.queryByText('Comprobación flexion')).toBeNull();
    fireEvent.click(b1);
    expect(b1).toHaveAttribute('aria-expanded', 'true');
    // El valor sale formateado por el sistema de unidades: si la fila viniera
    // del resumen `BarResult.checks` saldría el número desnudo, sin unidad.
    expect(screen.getByText('Comprobación flexion')).toBeInTheDocument();
    expect(screen.getByText('120.00 kNm')).toBeInTheDocument();
  });

  it('la ficha de una barra se abre desde su icono, no desplegándola', () => {
    let picked: string | null = null;
    render(
      <UnitSystemProvider>
        <ResultsPanel
          model={model}
          result={result()}
          selected={null}
          setSelected={(s) => { picked = s?.kind === 'bar' ? s.id : null; }}
          activeSection="vano"
          setActiveSection={() => {}}
          combo="ELU"
        />
      </UnitSystemProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]);
    expect(picked).toBeNull(); // desplegar NO cambia la selección
    fireEvent.click(screen.getByRole('button', { name: 'Ficha de cálculo de b2' }));
    expect(picked).toBe('b2');
  });

  it('conserva REACCIONES (etiquetadas con la combinación) y NORMATIVA', () => {
    renderPanel();
    const reacciones = screen.getByText('Reacciones').closest('p')!;
    expect(within(reacciones).getByText('ELU')).toBeInTheDocument();
    expect(screen.getByText('Ry=42.00 kN')).toBeInTheDocument();
    expect(screen.getByText('Normativa')).toBeInTheDocument();
    expect(screen.getByText('CTE DB-SE-A · CE Anejo 22')).toBeInTheDocument();
  });
});

describe('FEM 1D — cabecera con una barra abierta', () => {
  const rcModel: DesignModel = { ...model, bars: [bar('b1', 'rc'), bar('b2', 'steel')] };

  it('no repite el veredicto y ofrece volver al modelo', () => {
    let sel: Selected = { kind: 'bar', id: 'b1' };
    render(
      <UnitSystemProvider>
        <ResultsPanel
          model={rcModel}
          result={result()}
          selected={sel}
          setSelected={(s) => { sel = s; }}
          activeSection="vano"
          setActiveSection={() => {}}
          combo="ELU"
        />
      </UnitSystemProvider>,
    );
    expect(screen.getByText('Barra b1 · HA')).toBeInTheDocument();
    // El badge del modelo se retira: el módulo embebido pinta el suyo justo
    // debajo y en 300 px los dos juntos dejaban el nombre en «B…».
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al modelo' }));
    expect(sel).toBeNull();
  });

  it('sin barra abierta no hay botón de volver, y sí veredicto', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Volver al modelo' })).toBeNull();
    expect(screen.getAllByRole('status').length).toBe(2);
  });
});

describe('FEM 1D — modelo irresoluble', () => {
  it('sustituye el resumen por el bloque de error compartido', () => {
    renderPanel(result({
      errors: [
        { severity: 'fail', code: 'NO_SUPPORTS', msg: 'El modelo no tiene apoyos.' },
        { severity: 'fail', code: 'FLOATING_BARS', msg: 'Hay barras sueltas.' },
      ],
    }));
    expect(screen.getByText('Modelo no resoluble')).toBeInTheDocument();
    expect(screen.getByText('El modelo no tiene apoyos.')).toBeInTheDocument();
    expect(screen.getByText('Hay barras sueltas.')).toBeInTheDocument();
    // El resumen desaparece por completo: sin apoyos no hay veredicto que dar.
    expect(screen.queryByText('Utilización máxima')).toBeNull();
    expect(screen.queryByText('Reacciones')).toBeNull();
  });
});

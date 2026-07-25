// FEM 2D — Desplazar / copiar (vector) en los TRES paneles de geometría.
//
// El bloque nació sólo en el panel de selección múltiple (ventana de marquee):
// un click suelto sobre una barra o un nudo abría su editor de propiedades y el
// vector desaparecía. Aquí se fija el contrato nuevo: barra y nudo lo llevan
// también (mismas ops sobre un id-set de un elemento), la carga suelta NO (no
// arrastra nudos), y Δx/Δy sobreviven al cambio de panel que provoca "Copiar"
// (barra → selección múltiple) para que repetir el gesto encadene.

import { describe, expect, it } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fem2DInspector } from '../../features/fem2d/Fem2DInspector';
import { buildTemplateWithDefaults } from '../../features/fem2d/templates';
import type { Fem2DModel } from '../../features/fem2d/types';
import type { Selected2D } from '../../features/fem2d/modelOps';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const base = buildTemplateWithDefaults('portal-frame');

/** Último modelo del harness — publicado en un efecto (no durante el render). */
let latest: Fem2DModel = base;

function Harness({ initialSelected }: { initialSelected: Selected2D }) {
  const [model, setModel] = useState<Fem2DModel>(base);
  const [selected, setSelected] = useState<Selected2D>(initialSelected);
  useEffect(() => {
    latest = model;
  }, [model]);
  return (
    <UnitSystemProvider>
      <Fem2DInspector
        model={model}
        setModel={(updater) => setModel((m) => updater(m))}
        selected={selected}
        setSelected={setSelected}
      />
    </UnitSystemProvider>
  );
}

function renderInspector(selected: Selected2D) {
  latest = base;
  render(<Harness initialSelected={selected} />);
}

/** Teclea el vector y lo comitea (DraftNumberField comitea al perder el foco). */
async function setVector(dx: string, dy: string) {
  const user = userEvent.setup();
  const fx = screen.getByLabelText('Δx (m)');
  await user.clear(fx);
  await user.type(fx, dx);
  const fy = screen.getByLabelText('Δy (m)');
  await user.clear(fy);
  await user.type(fy, dy);
  await user.tab();
}

const nodeAt = (m: Fem2DModel, id: string) => m.nodes.find((n) => n.id === id)!;

describe('Fem2DInspector — vector en la selección de un solo elemento', () => {
  it('una barra clicada ofrece Desplazar/Copiar y mueve sus DOS nudos', async () => {
    const member = base.members[0];
    renderInspector({ kind: 'member', id: member.id });

    expect(screen.getByText('Desplazar / copiar (vector)')).toBeTruthy();
    const i0 = nodeAt(base, member.i);
    const j0 = nodeAt(base, member.j);

    await setVector('2', '1');
    await userEvent.click(screen.getByRole('button', { name: /Desplazar/ }));

    expect(nodeAt(latest, member.i).x).toBeCloseTo(i0.x + 2, 6);
    expect(nodeAt(latest, member.i).y).toBeCloseTo(i0.y + 1, 6);
    expect(nodeAt(latest, member.j).x).toBeCloseTo(j0.x + 2, 6);
    expect(nodeAt(latest, member.j).y).toBeCloseTo(j0.y + 1, 6);
    // Sigue siendo la misma barra (desplazar no clona).
    expect(latest.members.length).toBe(base.members.length);
    expect(latest.nodes.length).toBe(base.nodes.length);
  });

  it('un nudo clicado ofrece el vector y desplaza sólo ese nudo', async () => {
    const node = base.nodes[0];
    renderInspector({ kind: 'node', id: node.id });

    await setVector('0', '0.5');
    await userEvent.click(screen.getByRole('button', { name: /Desplazar/ }));

    expect(nodeAt(latest, node.id).y).toBeCloseTo(node.y + 0.5, 6);
    for (const other of base.nodes.filter((n) => n.id !== node.id)) {
      expect(nodeAt(latest, other.id).y).toBeCloseTo(other.y, 6);
    }
  });

  it('una carga suelta NO ofrece el vector (no arrastra nudos)', () => {
    expect(base.loads.length).toBeGreaterThan(0);
    renderInspector({ kind: 'load', id: base.loads[0].id });
    expect(screen.queryByText('Desplazar / copiar (vector)')).toBeNull();
    expect(screen.queryByRole('button', { name: /Desplazar/ })).toBeNull();
  });

  it('Copiar una barra clona barra + nudos + cargas y el vector sobrevive al cambio de panel', async () => {
    const member = base.members[0];
    // Cuelgan de la copia: las cargas de la barra Y las de sus dos nudos.
    const clonedLoads = base.loads.filter((l) =>
      l.kind === 'node' ? l.node === member.i || l.node === member.j : l.member === member.id,
    ).length;
    renderInspector({ kind: 'member', id: member.id });

    await setVector('5', '0');
    await userEvent.click(screen.getByRole('button', { name: /Copiar/ }));

    // La selección salta a la copia (2 nudos + 1 barra) → panel de selección.
    expect(screen.getByText('Selección')).toBeTruthy();
    expect(latest.nodes.length).toBe(base.nodes.length + 2);
    expect(latest.members.length).toBe(base.members.length + 1);
    expect(clonedLoads).toBeGreaterThan(0);
    expect(latest.loads.length).toBe(base.loads.length + clonedLoads);

    // El vector NO se reinicia al cambiar de panel: repetir encadena.
    expect((screen.getByLabelText('Δx (m)') as HTMLInputElement).value).toBe('5');
    await userEvent.click(screen.getByRole('button', { name: /Copiar/ }));
    expect(latest.nodes.length).toBe(base.nodes.length + 4);
    expect(latest.members.length).toBe(base.members.length + 2);

    // La 2ª copia sale del ORIGINAL a x·2 (encadenado), no encima de la 1ª.
    const { x: ix, y: iy } = nodeAt(base, member.i);
    const hasNodeAt = (x: number, y: number) =>
      latest.nodes.some((n) => Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6);
    expect(hasNodeAt(ix + 5, iy)).toBe(true);
    expect(hasNodeAt(ix + 10, iy)).toBe(true);
  });
});

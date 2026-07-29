// FEM 2D — ficha de cálculo por barra (modal Fem2DMemberDetail) + icono de
// apertura en la fila de resultados.
//
// El modal consume el MISMO MemberVerdict2D/envelopes que el panel (no
// re-ejecuta motores): aquí se fija el contrato de UI — secciones presentes,
// combinación pésima visible por fila, cierre con Escape y apertura vía
// onOpenDetail. Nota jsdom: useContainerWidth mide 0 → las tiras SVG de
// diagrama no se montan (se prueba la cabecera de la sección, que solo
// aparece cuando hay datos de diagrama).

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fem2DMemberDetail } from '../../features/fem2d/Fem2DMemberDetail';
import { Fem2DResults } from '../../features/fem2d/Fem2DResults';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const portal = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
const result = analyzeFem2D(portal);

function renderDetail(memberId: string, onClose = vi.fn()) {
  const member = portal.members.find((m) => m.id === memberId)!;
  const checks = result.checks!;
  render(
    <UnitSystemProvider>
      <Fem2DMemberDetail
        member={member}
        verdict={checks.perMember[memberId]}
        envelopes={checks.envelopes[memberId]}
        twoForce={false /* el pórtico no tiene bielas derivadas */}
        amplified={checks.amplified}
        onClose={onClose}
      />
    </UnitSystemProvider>,
  );
  return onClose;
}

describe('Fem2DMemberDetail — ficha por barra', () => {
  it('muestra datos de partida, esfuerzos con combo, diagramas y desglose del motor', () => {
    renderDetail('v1');
    expect(screen.getByRole('dialog', { name: /ficha de cálculo de la barra v1/i })).toBeTruthy();
    expect(screen.getByText('Datos de partida')).toBeTruthy();
    expect(screen.getByText('Esfuerzos de cálculo pésimos (ELU)')).toBeTruthy();
    // Alguna fila de comprobación lleva su combinación pésima.
    expect(screen.getAllByText(/Combinación pésima:/).length).toBeGreaterThan(0);
    // Sección de diagramas presente (el dintel del pórtico siempre tiene M).
    expect(screen.getByText('Diagramas de la barra')).toBeTruthy();
    // Grupo de intermedios capturados del motor.
    expect(screen.getByText('Sección y resistencias (flexión)')).toBeTruthy();
    expect(screen.getByText('Comprobaciones')).toBeTruthy();
  });

  it('pilar de plantilla (η_N < 5%): ficha de la pasada de vigas con axil concomitante', () => {
    renderDetail('p1');
    expect(screen.getByText('Sección y resistencias (flexión)')).toBeTruthy();
    expect(screen.getByText('Axil concomitante (mecanismo separado)')).toBeTruthy();
  });

  it('Escape cierra la ficha', async () => {
    const onClose = renderDetail('v1');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Fem2DResults — icono de ficha en la fila', () => {
  it('el icono llama a onOpenDetail con el id de la barra', async () => {
    const onOpenDetail = vi.fn();
    render(
      <UnitSystemProvider>
        <Fem2DResults
          model={portal}
          result={result}
          validationErrors={[]}
          onOpenDetail={onOpenDetail}
        />
      </UnitSystemProvider>,
    );
    const btn = screen.getByRole('button', { name: 'Ficha de cálculo de v1' });
    await userEvent.click(btn);
    expect(onOpenDetail).toHaveBeenCalledWith('v1');
  });

  it('sin onOpenDetail no se renderiza el icono (compat con usos existentes)', () => {
    render(
      <UnitSystemProvider>
        <Fem2DResults model={portal} result={result} validationErrors={[]} />
      </UnitSystemProvider>,
    );
    expect(screen.queryByRole('button', { name: /Ficha de cálculo/ })).toBeNull();
  });
});

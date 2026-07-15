// Tests de la tarjeta de propuesta compartida (src/components/ai/ProposalCard.tsx).
// Componente puramente presentacional — sin providers ni red. Cubre: tabla de
// preview con before/after, bloque "No aplicados" colapsable, warnings, notes,
// botón Aplicar N cambio(s) (singular/plural) → onApply, estado `applied`
// ("Aplicado" deshabilitado), estado `superseded` (sin botón, nota "Recogida
// en la propuesta más reciente", bloques secundarios ocultos; `applied` manda)
// y plan sin changes (deshabilitado + mensaje).
//
// Guardarraíl de seguridad (plan.risks — ver src/lib/ai/safety.ts): bloque rojo
// con label/before→after/why e INTERLOCK — con riesgos el botón "Aplicar" nace
// DESHABILITADO y solo se habilita al marcar el checkbox de confirmación.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProposalCard } from '../../components/ai/ProposalCard';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import type { AiSafetyRisk } from '../../lib/ai/safety';

/** Plan vacío y SIN riesgos; se sobrescriben solo los campos del caso. */
function makePlan(over: Partial<AiApplyPlan<unknown>> = {}): AiApplyPlan<unknown> {
  return {
    fields: {},
    changes: [],
    skipped: [],
    notFound: [],
    warnings: [],
    risks: [],
    ...over,
  };
}

/** Plan de ejemplo: 2 changes, 1 skipped, 1 notFound, 1 warning, notes. */
function samplePlan(): AiApplyPlan<unknown> {
  return makePlan({
    fields: { L: 8000, size: 200 },
    changes: [
      { field: 'L', label: 'Luz', before: '6.00 m', after: '8.00 m' },
      { field: 'size', label: 'Canto', before: 'IPE 300', after: 'HEB 200' },
    ],
    skipped: [{ label: 'Acero', reason: 'Valor fuera de catálogo' }],
    notFound: ['Ancho tributario'],
    warnings: ['Se convirtió la luz de cm a m.'],
    notes: 'El enunciado no indica la sobrecarga de uso.',
  });
}

describe('ProposalCard — plan con cambios', () => {
  it('muestra la tabla Campo/Actual/Propuesto con before/after, warning y notes', () => {
    render(<ProposalCard plan={samplePlan()} applied={false} onApply={vi.fn()} />);

    // Cabeceras de la tabla de preview.
    expect(screen.getByText('Campo')).toBeInTheDocument();
    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(screen.getByText('Propuesto')).toBeInTheDocument();
    // Filas: label + before + after.
    expect(screen.getByText('Luz')).toBeInTheDocument();
    expect(screen.getByText('6.00 m')).toBeInTheDocument();
    expect(screen.getByText('8.00 m')).toBeInTheDocument();
    expect(screen.getByText('Canto')).toBeInTheDocument();
    expect(screen.getByText('IPE 300')).toBeInTheDocument();
    expect(screen.getByText('HEB 200')).toBeInTheDocument();
    // Warning visible (sin colapsar).
    expect(screen.getByText('Se convirtió la luz de cm a m.')).toBeInTheDocument();
    // Notes del plan.
    expect(screen.getByText('El enunciado no indica la sobrecarga de uso.')).toBeInTheDocument();
  });

  it('bloque "No aplicados" colapsable: cerrado por defecto, al abrir lista skipped + notFound', async () => {
    const user = userEvent.setup();
    render(<ProposalCard plan={samplePlan()} applied={false} onApply={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /No aplicados/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Acero')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // skipped con su motivo + notFound con el texto fijo.
    expect(screen.getByText('Acero')).toBeInTheDocument();
    expect(screen.getByText(/Valor fuera de catálogo/)).toBeInTheDocument();
    expect(screen.getByText('Ancho tributario')).toBeInTheDocument();
    expect(screen.getByText(/No encontrado en el enunciado/)).toBeInTheDocument();
  });

  it('botón "Aplicar 2 cambios" (plural) habilitado → click → onApply', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<ProposalCard plan={samplePlan()} applied={false} onApply={onApply} />);

    const applyBtn = screen.getByRole('button', { name: 'Aplicar 2 cambios' });
    expect(applyBtn).toBeEnabled();
    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('con un solo cambio el botón usa el singular "Aplicar 1 cambio"', () => {
    const plan = makePlan({
      changes: [{ field: 'L', label: 'Luz', before: '6.00 m', after: '8.00 m' }],
    });
    render(<ProposalCard plan={plan} applied={false} onApply={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Aplicar 1 cambio' })).toBeEnabled();
  });
});

describe('ProposalCard — estado aplicado', () => {
  it('applied → botón "Aplicado" deshabilitado (la tabla sigue visible)', async () => {
    const onApply = vi.fn();
    render(<ProposalCard plan={samplePlan()} applied={true} onApply={onApply} />);

    const appliedBtn = screen.getByRole('button', { name: 'Aplicado' });
    expect(appliedBtn).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Aplicar/ })).not.toBeInTheDocument();
    // La tarjeta conserva el preview de lo aplicado.
    expect(screen.getByText('8.00 m')).toBeInTheDocument();

    // Click en deshabilitado no dispara onApply.
    await userEvent.setup().click(appliedBtn);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('ProposalCard — estado superseded', () => {
  it('superseded → sin botón Aplicar, con la nota y la tabla compacta (sin warnings/notes)', () => {
    const onApply = vi.fn();
    render(<ProposalCard plan={samplePlan()} applied={false} superseded onApply={onApply} />);

    // Sin botón alguno de aplicar (ni "Aplicado"): en su lugar la nota.
    expect(screen.queryByRole('button', { name: /Aplicar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicado' })).not.toBeInTheDocument();
    expect(screen.getByText('Recogida en la propuesta más reciente')).toBeInTheDocument();

    // La tabla sigue documentando el turno…
    expect(screen.getByText('Luz')).toBeInTheDocument();
    expect(screen.getByText('8.00 m')).toBeInTheDocument();
    // …pero los bloques secundarios se ocultan (viajan fusionados a la tarjeta
    // más reciente): ni "No aplicados", ni warnings, ni notes.
    expect(screen.queryByRole('button', { name: /No aplicados/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Se convirtió la luz de cm a m.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('El enunciado no indica la sobrecarga de uso.'),
    ).not.toBeInTheDocument();
  });

  it('applied manda sobre superseded: botón "Aplicado" deshabilitado y sin nota', () => {
    render(<ProposalCard plan={samplePlan()} applied superseded onApply={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Aplicado' })).toBeDisabled();
    expect(screen.queryByText('Recogida en la propuesta más reciente')).not.toBeInTheDocument();
    // Los bloques secundarios se conservan (la tarjeta aplicada no se compacta).
    expect(screen.getByText('Se convirtió la luz de cm a m.')).toBeInTheDocument();
  });
});

describe('ProposalCard — plan sin cambios', () => {
  // El texto cubre dos casos: nada extraíble del enunciado Y una propuesta que
  // solo confirma valores iguales a los actuales (pendingSnapshot.ts).
  it('botón deshabilitado + mensaje "La propuesta no cambia ningún valor del formulario"', () => {
    render(<ProposalCard plan={makePlan()} applied={false} onApply={vi.fn()} />);

    expect(screen.getByText('La propuesta no cambia ningún valor del formulario.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar 0 cambios' })).toBeDisabled();
    // Sin tabla de preview.
    expect(screen.queryByText('Propuesto')).not.toBeInTheDocument();
  });
});

// ── Guardarraíl de seguridad: bloque rojo + interlock del botón Aplicar ──────

/** Riesgo tipo del incidente que motivó el guardarraíl (rebajar una carga). */
const RISK_QK: AiSafetyRisk = {
  field: 'qk',
  label: 'Sobrecarga de uso',
  before: '1.00 kN/m²',
  after: '0.20 kN/m²',
  why: 'Las cargas las fija el proyecto: no son una variable de diseño.',
};

/** Segundo riesgo, de otra familia: relajar un CRITERIO en vez de una demanda. */
const RISK_FLECHA: AiSafetyRisk = {
  field: 'deflectionLimit',
  label: 'Límite de flecha',
  before: 'L/400',
  after: 'L/250',
  why: 'El límite de flecha lo fija la normativa según el uso del elemento.',
};

/**
 * Plan con riesgos. Como en producción, cada riesgo procede de un `change`: el
 * campo aparece TAMBIÉN en la tabla de preview (de ahí que las aserciones del
 * bloque rojo se acoten con `within`).
 */
function riskyPlan(risks: AiSafetyRisk[] = [RISK_QK]): AiApplyPlan<unknown> {
  return makePlan({
    changes: risks.map((r) => ({ field: r.field, label: r.label, before: r.before, after: r.after })),
    risks,
  });
}

/** Contenedor del bloque rojo, localizado por su encabezado (singular o plural). */
function riskBlock(): HTMLElement {
  const heading = screen.getByText(/reduce la seguridad|reducen la seguridad/);
  const block = heading.closest('div');
  expect(block).not.toBeNull();
  return block as HTMLElement;
}

describe('ProposalCard — guardarraíl de seguridad (plan.risks)', () => {
  it('sin riesgos: nada de rojo, sin checkbox y el botón Aplicar sigue habilitado', () => {
    render(<ProposalCard plan={samplePlan()} applied={false} onApply={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Aplicar 2 cambios' })).toBeEnabled();
    expect(screen.queryByText(/reduce la seguridad|reducen la seguridad/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('con un riesgo: pinta label, before → after y el porqué; el botón Aplicar nace DESHABILITADO', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<ProposalCard plan={riskyPlan()} applied={false} onApply={onApply} />);

    const block = riskBlock();
    expect(within(block).getByText('Este cambio reduce la seguridad')).toBeInTheDocument();
    expect(within(block).getByText(RISK_QK.label)).toBeInTheDocument();
    expect(within(block).getByText(RISK_QK.before)).toBeInTheDocument();
    expect(within(block).getByText(RISK_QK.after)).toBeInTheDocument();
    expect(within(block).getByText(RISK_QK.why)).toBeInTheDocument();

    // INTERLOCK: el clic sobre el botón deshabilitado no aplica nada.
    const applyBtn = screen.getByRole('button', { name: 'Aplicar 1 cambio' });
    expect(applyBtn).toBeDisabled();
    await user.click(applyBtn);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('marcar el checkbox habilita Aplicar y el clic SÍ llama a onApply (desmarcar vuelve a bloquear)', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<ProposalCard plan={riskyPlan()} applied={false} onApply={onApply} />);

    const checkbox = screen.getByLabelText('He revisado este cambio y es correcto.');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Aplicar 1 cambio' })).toBeDisabled();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    const applyBtn = screen.getByRole('button', { name: 'Aplicar 1 cambio' });
    expect(applyBtn).toBeEnabled();
    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);

    // Retirar la confirmación vuelve a cerrar el interlock.
    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Aplicar 1 cambio' })).toBeDisabled();
  });

  it('applied: el bloque rojo queda como registro pero ya no se ofrece checkbox', () => {
    render(<ProposalCard plan={riskyPlan()} applied onApply={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Aplicado' })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    // El riesgo aplicado sigue documentado en la tarjeta.
    expect(within(riskBlock()).getByText(RISK_QK.why)).toBeInTheDocument();
  });

  it('superseded: el bloque de riesgos NO se pinta (los riesgos viajan a la tarjeta viva)', () => {
    render(<ProposalCard plan={riskyPlan()} applied={false} superseded onApply={vi.fn()} />);

    expect(screen.queryByText(/reduce la seguridad|reducen la seguridad/)).not.toBeInTheDocument();
    expect(screen.queryByText(RISK_QK.why)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Recogida en la propuesta más reciente')).toBeInTheDocument();
    // La tabla sigue documentando el turno.
    expect(screen.getByText(RISK_QK.label)).toBeInTheDocument();
  });

  it('con 2+ riesgos el texto va en plural y el interlock cubre a todos', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <ProposalCard
        plan={riskyPlan([RISK_QK, RISK_FLECHA])}
        applied={false}
        onApply={onApply}
      />,
    );

    const block = riskBlock();
    expect(within(block).getByText('Estos cambios reducen la seguridad')).toBeInTheDocument();
    // Los dos riesgos, cada uno con su porqué.
    expect(within(block).getByText(RISK_QK.why)).toBeInTheDocument();
    expect(within(block).getByText(RISK_FLECHA.label)).toBeInTheDocument();
    expect(within(block).getByText('L/250')).toBeInTheDocument();
    expect(within(block).getByText(RISK_FLECHA.why)).toBeInTheDocument();

    // Un solo checkbox (plural) desbloquea el plan entero.
    const applyBtn = screen.getByRole('button', { name: 'Aplicar 2 cambios' });
    expect(applyBtn).toBeDisabled();
    await user.click(screen.getByLabelText('He revisado estos cambios y son correctos.'));
    expect(applyBtn).toBeEnabled();
    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

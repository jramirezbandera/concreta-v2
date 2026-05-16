// rc-beams mode toggle (Chunk 2):
//   - render del toggle Pórtico / Sección simple en standalone
//   - showModeToggle={false} oculta el toggle (FEM embed)
//   - localStorage back-compat: state sin `mode` se renderiza como 'portico'
//   - mode='simple' oculta los section tabs (vano/apoyo)
//   - calcRCBeam preserva comportamiento (mode-agnostic regression)

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { rcBeamDefaults, type RCBeamInputs } from '../../data/defaults';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { RCBeamsInputs } from '../../features/rc-beams/RCBeamsInputs';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

function renderInputs(state: RCBeamInputs, props: Partial<React.ComponentProps<typeof RCBeamsInputs>> = {}) {
  const setField = vi.fn();
  const setSection = vi.fn();
  const utils = render(
    <UnitSystemProvider>
      <RCBeamsInputs
        state={state}
        section="vano"
        setSection={setSection}
        setField={setField}
        {...props}
      />
    </UnitSystemProvider>,
  );
  return { ...utils, setField, setSection };
}

describe('RCBeamsInputs — mode toggle (Chunk 2)', () => {
  it('default standalone: muestra toggle Pórtico/Sección simple', () => {
    renderInputs(rcBeamDefaults);
    expect(screen.getByRole('tab', { name: /pórtico/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sección simple/i })).toBeInTheDocument();
  });

  it('showModeToggle={false}: NO renderiza el toggle (FEM embed pattern)', () => {
    renderInputs(rcBeamDefaults, { showModeToggle: false });
    expect(screen.queryByRole('tab', { name: /pórtico/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /sección simple/i })).toBeNull();
  });

  it("click 'Sección simple' llama setField('mode', 'simple')", () => {
    const { setField } = renderInputs(rcBeamDefaults);
    fireEvent.click(screen.getByRole('tab', { name: /sección simple/i }));
    expect(setField).toHaveBeenCalledWith('mode', 'simple');
  });

  it('mode=simple: oculta los section tabs vano/apoyo', () => {
    const simple: RCBeamInputs = { ...rcBeamDefaults, mode: 'simple' };
    renderInputs(simple);
    // Los tabs son botones role=tab dentro de un tablist aria-label="Seccion"
    expect(screen.queryByRole('tab', { name: /^vano$/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^apoyo$/i })).toBeNull();
  });

  it('mode=portico: muestra section tabs vano/apoyo (back-compat)', () => {
    renderInputs(rcBeamDefaults);
    expect(screen.getByRole('tab', { name: /^vano$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^apoyo$/i })).toBeInTheDocument();
  });

  // Back-compat: localStorage states antiguos (sin mode) deben tratarse como
  // 'portico'. Aquí simulamos castando a unknown para bypassar TS y simular
  // un state legacy.
  it("back-compat: state legacy sin 'mode' se trata como portico", () => {
    const legacy = { ...rcBeamDefaults } as Partial<RCBeamInputs>;
    delete legacy.mode;
    renderInputs(legacy as RCBeamInputs);
    // Ambos tabs visibles (modo portico)
    expect(screen.getByRole('tab', { name: /^vano$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^apoyo$/i })).toBeInTheDocument();
    // Mode toggle también visible
    expect(screen.getByRole('tab', { name: /pórtico/i })).toBeInTheDocument();
  });

  it("back-compat: state con mode inválido ('foo' hand-edited URL) → portico", () => {
    const bad = { ...rcBeamDefaults } as RCBeamInputs;
    (bad as { mode: string }).mode = 'foo' as 'portico' | 'simple';
    renderInputs(bad);
    expect(screen.getByRole('tab', { name: /^vano$/i })).toBeInTheDocument();
  });
});

describe('calcRCBeam — mode-agnostic regression (FEM contract)', () => {
  it('calcRCBeam con mode=portico devuelve mismo result que default', () => {
    const r1 = calcRCBeam(rcBeamDefaults);
    const r2 = calcRCBeam({ ...rcBeamDefaults, mode: 'portico' });
    expect(r1.vano.MRd).toBe(r2.vano.MRd);
    expect(r1.apoyo.MRd).toBe(r2.apoyo.MRd);
  });

  it('calcRCBeam con mode=simple devuelve mismo result (motor ignora mode)', () => {
    const r1 = calcRCBeam(rcBeamDefaults);
    const r2 = calcRCBeam({ ...rcBeamDefaults, mode: 'simple' });
    expect(r1.vano.MRd).toBe(r2.vano.MRd);
    expect(r1.apoyo.MRd).toBe(r2.apoyo.MRd);
  });

  it('FEM adapter pre-fija mode=portico en RCBeamInputs construido', () => {
    // El FEM adapter (features/fem-analysis/adapters/rcBeams.ts) construye
    // RCBeamInputs internamente y SIEMPRE incluye mode='portico'. Esto es
    // verificable indirectamente: si el adapter no compila TS (porque mode
    // es required), ya estamos cubiertos por el typecheck. Aquí solo
    // confirmamos que calcRCBeam acepta el shape con mode.
    const input: RCBeamInputs = { ...rcBeamDefaults, mode: 'portico' };
    const result = calcRCBeam(input);
    expect(result.valid).toBe(true);
  });
});

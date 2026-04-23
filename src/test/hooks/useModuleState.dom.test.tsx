// Per-module schema version migration test (§4.7).
// Verifies that bumping MODULE_SCHEMA_VERSIONS for one module wipes ONLY that
// module's localStorage on next mount, leaving siblings untouched.

import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useModuleState } from '../../hooks/useModuleState';
import { MODULE_SCHEMA_VERSIONS } from '../../data/moduleRegistry';

const ifDefaults = {
  B: 1.8, L: 1.8, h: 0.6, sigma_adm: 200, N: 300, loadFactor: 1.35,
};

const beamDefaults = {
  L: 5.0, b: 300, h: 600,
};

function IfProbe() {
  const { state } = useModuleState('isolated-footing', ifDefaults);
  return <span data-testid="if-N">{state.N}</span>;
}

function BeamProbe() {
  const { state } = useModuleState('rc-beams', beamDefaults);
  return <span data-testid="beam-L">{state.L}</span>;
}

function setStored(moduleKey: string, state: Record<string, unknown>, version: string) {
  window.localStorage.setItem(moduleKey, JSON.stringify(state));
  window.localStorage.setItem(`${moduleKey}-version`, version);
}

describe('useModuleState — per-module schema version', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('loads stored state when version matches MODULE_SCHEMA_VERSIONS', () => {
    const v = MODULE_SCHEMA_VERSIONS['isolated-footing'];
    setStored('isolated-footing', { ...ifDefaults, N: 999 }, v);

    render(<MemoryRouter><IfProbe /></MemoryRouter>);
    expect(screen.getByTestId('if-N').textContent).toBe('999');
  });

  it('discards stored state when version is stale (uses defaults)', () => {
    setStored('isolated-footing', { ...ifDefaults, N: 999 }, '0');

    render(<MemoryRouter><IfProbe /></MemoryRouter>);
    expect(screen.getByTestId('if-N').textContent).toBe('300');
  });

  it('isolation: bumping isolated-footing version does NOT wipe rc-beams', () => {
    const beamV = MODULE_SCHEMA_VERSIONS['rc-beams'];
    // Pre-seed rc-beams at its current schema version
    setStored('rc-beams', { ...beamDefaults, L: 7.5 }, beamV);
    // Pre-seed isolated-footing at a stale version
    setStored('isolated-footing', { ...ifDefaults, N: 999 }, '0');

    render(
      <MemoryRouter>
        <IfProbe />
        <BeamProbe />
      </MemoryRouter>,
    );
    // isolated-footing reset to defaults (stale)
    expect(screen.getByTestId('if-N').textContent).toBe('300');
    // rc-beams preserved (current version)
    expect(screen.getByTestId('beam-L').textContent).toBe('7.5');
  });

  it('merges stored state with defaults so new fields survive a partial payload', () => {
    const v = MODULE_SCHEMA_VERSIONS['isolated-footing'];
    // Stored payload missing the new sigma_adm field — defaults must fill it
    setStored('isolated-footing', { B: 2.0, L: 2.0 } as Record<string, unknown>, v);

    function Probe() {
      const { state } = useModuleState('isolated-footing', ifDefaults);
      return (
        <>
          <span data-testid="B">{state.B}</span>
          <span data-testid="sigma">{state.sigma_adm}</span>
        </>
      );
    }
    render(<MemoryRouter><Probe /></MemoryRouter>);
    expect(screen.getByTestId('B').textContent).toBe('2');
    expect(screen.getByTestId('sigma').textContent).toBe('200');
  });

  it('writes the current schema version to localStorage on setField (debounced)', async () => {
    function Probe() {
      const { state, setField } = useModuleState('isolated-footing', ifDefaults);
      return (
        <>
          <span data-testid="N">{state.N}</span>
          <button onClick={() => setField('N', 555)}>set</button>
        </>
      );
    }
    render(<MemoryRouter><Probe /></MemoryRouter>);

    await act(async () => {
      screen.getByText('set').click();
      // Wait > 300 ms for debounced persist
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(window.localStorage.getItem('isolated-footing-version'))
      .toBe(MODULE_SCHEMA_VERSIONS['isolated-footing']);
    const stored = JSON.parse(window.localStorage.getItem('isolated-footing') || '{}');
    expect(stored.N).toBe(555);
  });
});

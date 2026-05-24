// Roundtrip URL → state para los campos escalares nuevos del módulo
// micropilotes (eng review 2026-05-24): customTubeDe, customTubeE, groutType.
//
// useModuleState ya serializa todos los primitivos del state vía
// toUrlParams/parseUrlParams. Este test confirma que los 3 campos nuevos
// se reconstruyen correctamente cuando alguien abre un link compartido.
//
// El test del soil array vive en serialize.test.ts (lz-string compress).
// Este es solo de scalars vía useModuleState.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useModuleState } from '../../../hooks/useModuleState';
import { micropilesDefaults, type MicropilesInputs } from '../../../data/defaults';

function Probe() {
  const { state } = useModuleState<MicropilesInputs>('micropiles', micropilesDefaults);
  return (
    <div>
      <span data-testid="customTubeDe">{state.customTubeDe}</span>
      <span data-testid="customTubeE">{state.customTubeE}</span>
      <span data-testid="groutType">{state.groutType}</span>
      <span data-testid="tube">{state.tube}</span>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('URL → state roundtrip de campos escalares (customTubeDe/E/groutType)', () => {
  it('?customTubeDe=120 carga 120 al montar', () => {
    render(
      <MemoryRouter initialEntries={['/ciment/micropilotes?customTubeDe=120']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('customTubeDe').textContent).toBe('120');
  });

  it('?customTubeE=10 carga 10 al montar', () => {
    render(
      <MemoryRouter initialEntries={['/ciment/micropilotes?customTubeE=10']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('customTubeE').textContent).toBe('10');
  });

  it('?groutType=mortero carga "mortero" al montar', () => {
    render(
      <MemoryRouter initialEntries={['/ciment/micropilotes?groutType=mortero']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('groutType').textContent).toBe('mortero');
  });

  it('share-URL completo con custom tube + mortero se reconstruye entero', () => {
    // Emisor configura: Personalizado Ø120×10, mortero. Comparte el enlace.
    // Receptor abre el enlace → debe ver EXACTAMENTE la misma config.
    render(
      <MemoryRouter initialEntries={[
        '/ciment/micropilotes?tube=custom&customTubeDe=120&customTubeE=10&groutType=mortero',
      ]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tube').textContent).toBe('custom');
    expect(screen.getByTestId('customTubeDe').textContent).toBe('120');
    expect(screen.getByTestId('customTubeE').textContent).toBe('10');
    expect(screen.getByTestId('groutType').textContent).toBe('mortero');
  });

  it('sin params relevantes en la URL, mantiene los defaults', () => {
    render(
      <MemoryRouter initialEntries={['/ciment/micropilotes']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tube').textContent).toBe(micropilesDefaults.tube);
    expect(screen.getByTestId('customTubeDe').textContent).toBe(String(micropilesDefaults.customTubeDe));
    expect(screen.getByTestId('groutType').textContent).toBe(micropilesDefaults.groutType);
  });

  it('valor NaN en URL (customTubeDe=foo) → conserva el default sin crash', () => {
    // parseUrlParams hace Number(raw); si es NaN, ignora el param y conserva
    // el default. Robustez contra URLs mal formadas / corruptas.
    render(
      <MemoryRouter initialEntries={['/ciment/micropilotes?customTubeDe=foo']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('customTubeDe').textContent).toBe(String(micropilesDefaults.customTubeDe));
  });
});

// MicropilesInputsPanel — DOM tests del comportamiento del tubo
// personalizado: aparece al seleccionar, guardrail dinámico del max,
// label "Tubo: personalizado" en el select sub.
//
// Estrategia: render del panel con setField espía. Verificamos atributos
// del DOM (max del input) y presencia condicional de los NumField custom.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MicropilesInputsPanel } from '../../../features/micropiles/MicropilesInputsPanel';
import { micropilesDefaults, micropilesSoilDefaults, type MicropilesInputs } from '../../../data/defaults';

interface RenderOpts {
  state?: Partial<MicropilesInputs>;
}

function renderPanel({ state = {} }: RenderOpts = {}) {
  const setField = vi.fn();
  const result = render(
    <MicropilesInputsPanel
      state={{ ...micropilesDefaults, ...state }}
      setField={setField}
      soil={micropilesSoilDefaults}
      addLayer={vi.fn()}
      removeLayer={vi.fn()}
      updateLayer={vi.fn()}
    />,
  );
  return { ...result, setField };
}

describe('MicropilesInputsPanel — tubo personalizado', () => {
  it('por defecto (catálogo) NO muestra los inputs customTubeDe/E', () => {
    const { container } = renderPanel();
    expect(container.querySelector('input#input-customTubeDe')).toBeNull();
    expect(container.querySelector('input#input-customTubeE')).toBeNull();
  });

  it('con tube="custom" muestra ambos inputs', () => {
    const { container } = renderPanel({ state: { tube: 'custom' } });
    expect(container.querySelector('input#input-customTubeDe')).not.toBeNull();
    expect(container.querySelector('input#input-customTubeE')).not.toBeNull();
  });

  it('cambiar el select a "custom" llama a setField con el sentinel', () => {
    const { container, setField } = renderPanel();
    const select = container.querySelector('select#select-tube') as HTMLSelectElement;
    expect(select).not.toBeNull();
    fireEvent.change(select, { target: { value: 'custom' } });
    expect(setField).toHaveBeenCalledWith('tube', 'custom');
  });

  it('el select tiene la opción "— Personalizado…" al final', () => {
    const { container } = renderPanel();
    const select = container.querySelector('select#select-tube') as HTMLSelectElement;
    const lastOption = select.options[select.options.length - 1];
    expect(lastOption.value).toBe('custom');
    expect(lastOption.textContent).toContain('Personalizado');
  });

  // ── T5: Guardrail dinámico del max de customTubeDe ──────────────────────
  // El max del Ø ext personalizado es Dn − 2·r_min, donde r_min sale de la
  // Tabla 2.3 según groutType + effort. Cambiar cualquiera de los 3 valores
  // (Dn, groutType, effort) debe ajustar el max sin recargar.
  describe('T5: guardrail dinámico de customTubeDe.max', () => {
    it('lechada + compresión + Dn=185 → max = 185 − 2·20 = 145', () => {
      const { container } = renderPanel({
        state: {
          tube: 'custom',
          drillDiameter: 185,
          groutType: 'lechada',
          effort: 'compression',
        },
      });
      const input = container.querySelector('input#input-customTubeDe') as HTMLInputElement;
      // NumField no expone max como attribute HTML; el clamp se aplica
      // en blur. Verificamos vía aria-invalid: si tecleamos 150, debe
      // marcarse out-of-range (150 > 145).
      fireEvent.change(input, { target: { value: '150' } });
      expect(input.getAttribute('aria-invalid')).toBe('true');

      // 145 justo NO está out-of-range.
      fireEvent.change(input, { target: { value: '145' } });
      expect(input.getAttribute('aria-invalid')).toBeNull();
    });

    it('mortero + tracción + Dn=185 → max = 185 − 2·35 = 115 (más restrictivo)', () => {
      const { container } = renderPanel({
        state: {
          tube: 'custom',
          drillDiameter: 185,
          groutType: 'mortero',
          effort: 'tension',
        },
      });
      const input = container.querySelector('input#input-customTubeDe') as HTMLInputElement;
      // 120 debería estar fuera de rango (>115).
      fireEvent.change(input, { target: { value: '120' } });
      expect(input.getAttribute('aria-invalid')).toBe('true');

      // 115 justo OK.
      fireEvent.change(input, { target: { value: '115' } });
      expect(input.getAttribute('aria-invalid')).toBeNull();
    });

    it('subir Dn relaja el max — Dn=300, lechada+comp → max = 260', () => {
      const { container } = renderPanel({
        state: {
          tube: 'custom',
          drillDiameter: 300,
          groutType: 'lechada',
          effort: 'compression',
        },
      });
      const input = container.querySelector('input#input-customTubeDe') as HTMLInputElement;
      // 250 ahora está EN rango (≤ 260).
      fireEvent.change(input, { target: { value: '250' } });
      expect(input.getAttribute('aria-invalid')).toBeNull();

      // 270 fuera de rango.
      fireEvent.change(input, { target: { value: '270' } });
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });
  });

  // ── Guardrail del structuralCover (Issue 2): min = r_min Tabla 2.3 ─────
  describe('structuralCover min dinámico (Issue 2 fix)', () => {
    it('lechada + compresión → r mínimo 20 mm', () => {
      const { container } = renderPanel();
      const input = container.querySelector('input#input-structuralCover') as HTMLInputElement;
      expect(input).not.toBeNull();
      // 15 mm < 20 → out of range.
      fireEvent.change(input, { target: { value: '15' } });
      expect(input.getAttribute('aria-invalid')).toBe('true');
      // 20 mm exacto → OK.
      fireEvent.change(input, { target: { value: '20' } });
      expect(input.getAttribute('aria-invalid')).toBeNull();
    });

    it('mortero + tracción → r mínimo sube a 35 mm', () => {
      const { container } = renderPanel({
        state: { groutType: 'mortero', effort: 'tension' },
      });
      const input = container.querySelector('input#input-structuralCover') as HTMLInputElement;
      // 30 mm que antes pasaba con mortero+comp, ahora fuera de rango.
      fireEvent.change(input, { target: { value: '30' } });
      expect(input.getAttribute('aria-invalid')).toBe('true');
      // 35 exacto OK.
      fireEvent.change(input, { target: { value: '35' } });
      expect(input.getAttribute('aria-invalid')).toBeNull();
    });
  });
});

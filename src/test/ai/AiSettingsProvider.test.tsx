// Tests de AiSettingsProvider/useAiSettings (BYOK) — patrón calcado de
// src/test/units/provider.dom.test.tsx y src/test/theme/provider.dom.test.tsx.
// Cubre: defaults, persistencia en localStorage['concreta-ai-settings'],
// setProvider/setKey/clearKey (trim; vacía = clear), sync cross-tab con el
// evento `storage` y throw del hook fuera del provider.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';
import { useAiSettings } from '../../lib/ai/useAiSettings';
import type { AiSettings } from '../../lib/ai/AiSettingsProvider';

const STORAGE_KEY = 'concreta-ai-settings';

function Probe() {
  const { settings, activeKey, setProvider, setKey, clearKey } = useAiSettings();
  return (
    <>
      <span data-testid="provider">{settings.provider}</span>
      <span data-testid="active-key">{activeKey === null ? '(null)' : activeKey}</span>
      <span data-testid="keys">{JSON.stringify(settings.keys)}</span>
      <button onClick={() => setKey('anthropic', 'sk-ant-1')}>set ant</button>
      <button onClick={() => setKey('openai', 'sk-oai-1')}>set oai</button>
      <button onClick={() => setKey('anthropic', '  sk-pad  ')}>set padded</button>
      <button onClick={() => setKey('anthropic', '   ')}>set blank</button>
      <button onClick={() => setProvider('openai')}>go openai</button>
      <button onClick={() => setProvider('gemini')}>go gemini</button>
      <button onClick={() => clearKey('anthropic')}>clear ant</button>
    </>
  );
}

function renderProbe() {
  return render(
    <AiSettingsProvider>
      <Probe />
    </AiSettingsProvider>,
  );
}

function storedSettings(): AiSettings {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as AiSettings;
}

const click = (label: string) => {
  act(() => {
    screen.getByText(label).click();
  });
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('AiSettingsProvider — defaults y persistencia', () => {
  it("sin nada almacenado: provider 'anthropic' y activeKey null", () => {
    renderProbe();
    expect(screen.getByTestId('provider').textContent).toBe('anthropic');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(screen.getByTestId('keys').textContent).toBe('{}');
  });

  it("setKey persiste en localStorage['concreta-ai-settings'] (JSON con keys) y activa la key", () => {
    renderProbe();
    click('set ant');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-ant-1');
    expect(storedSettings()).toEqual({
      provider: 'anthropic',
      keys: { anthropic: 'sk-ant-1' },
    });
  });

  it('setKey recorta espacios alrededor de la key', () => {
    renderProbe();
    click('set padded');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-pad');
    expect(storedSettings().keys.anthropic).toBe('sk-pad');
  });

  it('lee settings almacenados al montar', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider: 'openai', keys: { openai: 'sk-oai-guardada' } }),
    );
    renderProbe();
    expect(screen.getByTestId('provider').textContent).toBe('openai');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-oai-guardada');
  });
});

describe('AiSettingsProvider — setProvider / clearKey', () => {
  it('setProvider cambia settings.provider y activeKey pasa a la key de ese proveedor', () => {
    renderProbe();
    click('set ant');
    click('set oai');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-ant-1'); // aún anthropic

    click('go openai');
    expect(screen.getByTestId('provider').textContent).toBe('openai');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-oai-1');
    expect(storedSettings().provider).toBe('openai');
  });

  it('setProvider hacia un proveedor SIN key deja activeKey en null', () => {
    renderProbe();
    click('set ant');
    click('go gemini');
    expect(screen.getByTestId('provider').textContent).toBe('gemini');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
  });

  it('clearKey elimina la key del estado y de localStorage', () => {
    renderProbe();
    click('set ant');
    click('clear ant');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(screen.getByTestId('keys').textContent).toBe('{}');
    expect(storedSettings().keys).toEqual({});
  });

  it('setKey con solo espacios equivale a clearKey', () => {
    renderProbe();
    click('set ant');
    click('set blank');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(storedSettings().keys).toEqual({});
  });
});

describe('AiSettingsProvider — sync cross-tab (evento storage)', () => {
  it('un StorageEvent con la clave propia sincroniza provider y keys', () => {
    renderProbe();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify({ provider: 'gemini', keys: { gemini: 'g-key' } }),
        }),
      );
    });
    expect(screen.getByTestId('provider').textContent).toBe('gemini');
    expect(screen.getByTestId('active-key').textContent).toBe('g-key');
  });

  it('newValue=null (clear en otra pestaña) vuelve a los defaults', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider: 'openai', keys: { openai: 'sk-oai' } }),
    );
    renderProbe();
    expect(screen.getByTestId('provider').textContent).toBe('openai');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: null }));
    });
    expect(screen.getByTestId('provider').textContent).toBe('anthropic');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
  });

  it('ignora eventos storage de otras claves', () => {
    renderProbe();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'otra-clave',
          newValue: JSON.stringify({ provider: 'gemini', keys: { gemini: 'g-key' } }),
        }),
      );
    });
    expect(screen.getByTestId('provider').textContent).toBe('anthropic');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
  });
});

describe('useAiSettings — fuera del provider', () => {
  it('lanza un error que nombra al AiSettingsProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AiSettingsProvider/);
    spy.mockRestore();
  });
});

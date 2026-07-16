// Tests de AiSettingsProvider/useAiSettings (BYOK) — patrón calcado de
// src/test/units/provider.dom.test.tsx y src/test/theme/provider.dom.test.tsx.
// Cubre: defaults, persistencia en localStorage['concreta-ai-settings'],
// setProvider/setKey/clearKey (trim; vacía = clear), sync cross-tab con el
// evento `storage` y throw del hook fuera del provider.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';
import { useAiSettings } from '../../lib/ai/useAiSettings';
import { SHARED_GEMINI_KEY } from '../../lib/ai/sharedKey';
import type { AiSettings } from '../../lib/ai/AiSettingsProvider';

const STORAGE_KEY = 'concreta-ai-settings';

function Probe() {
  const { settings, activeKey, usingSharedKey, setProvider, setKey, clearKey } = useAiSettings();
  return (
    <>
      <span data-testid="provider">{settings.provider}</span>
      <span data-testid="active-key">{activeKey === null ? '(null)' : activeKey}</span>
      <span data-testid="shared">{usingSharedKey ? 'yes' : 'no'}</span>
      <span data-testid="keys">{JSON.stringify(settings.keys)}</span>
      <button onClick={() => setKey('anthropic', 'sk-ant-1')}>set ant</button>
      <button onClick={() => setKey('openai', 'sk-oai-1')}>set oai</button>
      <button onClick={() => setKey('gemini', 'g-own')}>set gemini</button>
      <button onClick={() => setKey('anthropic', '  sk-pad  ')}>set padded</button>
      <button onClick={() => setKey('anthropic', '   ')}>set blank</button>
      <button onClick={() => setProvider('anthropic')}>go anthropic</button>
      <button onClick={() => setProvider('openai')}>go openai</button>
      <button onClick={() => setProvider('gemini')}>go gemini</button>
      <button onClick={() => clearKey('anthropic')}>clear ant</button>
      <button onClick={() => clearKey('gemini')}>clear gemini</button>
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
  it("sin nada almacenado: provider 'gemini' con la clave compartida activa", () => {
    renderProbe();
    expect(screen.getByTestId('provider').textContent).toBe('gemini');
    // El default es Gemini, que trae clave compartida embebida → activeKey NO es null.
    expect(screen.getByTestId('active-key').textContent).toBe(SHARED_GEMINI_KEY);
    expect(screen.getByTestId('shared').textContent).toBe('yes');
    expect(screen.getByTestId('keys').textContent).toBe('{}');
  });

  it("setKey persiste en localStorage['concreta-ai-settings'] (JSON con keys) y activa la key", () => {
    renderProbe();
    click('go anthropic'); // el default es gemini: paso a un proveedor BYOK puro
    click('set ant');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-ant-1');
    expect(screen.getByTestId('shared').textContent).toBe('no');
    expect(storedSettings()).toEqual({
      provider: 'anthropic',
      keys: { anthropic: 'sk-ant-1' },
    });
  });

  it('setKey recorta espacios alrededor de la key', () => {
    renderProbe();
    click('go anthropic');
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
    click('go anthropic');
    click('set ant');
    click('set oai');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-ant-1'); // aún anthropic

    click('go openai');
    expect(screen.getByTestId('provider').textContent).toBe('openai');
    expect(screen.getByTestId('active-key').textContent).toBe('sk-oai-1');
    expect(storedSettings().provider).toBe('openai');
  });

  it('setProvider hacia un proveedor BYOK puro SIN key deja activeKey en null', () => {
    renderProbe();
    click('set ant');
    click('go openai'); // openai no tiene clave compartida
    expect(screen.getByTestId('provider').textContent).toBe('openai');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(screen.getByTestId('shared').textContent).toBe('no');
  });

  it('clearKey elimina la key del estado y de localStorage', () => {
    renderProbe();
    click('go anthropic');
    click('set ant');
    click('clear ant');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(screen.getByTestId('keys').textContent).toBe('{}');
    expect(storedSettings().keys).toEqual({});
  });

  it('setKey con solo espacios equivale a clearKey', () => {
    renderProbe();
    click('go anthropic');
    click('set ant');
    click('set blank');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(storedSettings().keys).toEqual({});
  });
});

describe('AiSettingsProvider — clave compartida (Gemini)', () => {
  it('Gemini sin key propia usa la clave compartida embebida', () => {
    renderProbe(); // default = gemini
    expect(screen.getByTestId('active-key').textContent).toBe(SHARED_GEMINI_KEY);
    expect(screen.getByTestId('shared').textContent).toBe('yes');
    expect(screen.getByTestId('keys').textContent).toBe('{}'); // NO se escribe en localStorage
  });

  it('la key propia de Gemini tiene prioridad sobre la compartida y al borrarla se recupera', () => {
    renderProbe();
    click('set gemini');
    expect(screen.getByTestId('active-key').textContent).toBe('g-own');
    expect(screen.getByTestId('shared').textContent).toBe('no');
    expect(storedSettings().keys.gemini).toBe('g-own');

    click('clear gemini');
    expect(screen.getByTestId('active-key').textContent).toBe(SHARED_GEMINI_KEY);
    expect(screen.getByTestId('shared').textContent).toBe('yes');
  });

  it('Anthropic y OpenAI no tienen clave compartida (siguen BYOK puro)', () => {
    renderProbe();
    click('go anthropic');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(screen.getByTestId('shared').textContent).toBe('no');
    click('go openai');
    expect(screen.getByTestId('active-key').textContent).toBe('(null)');
    expect(screen.getByTestId('shared').textContent).toBe('no');
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
    // Defaults = Gemini con la clave compartida.
    expect(screen.getByTestId('provider').textContent).toBe('gemini');
    expect(screen.getByTestId('active-key').textContent).toBe(SHARED_GEMINI_KEY);
  });

  it('ignora eventos storage de otras claves', () => {
    renderProbe();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'otra-clave',
          newValue: JSON.stringify({ provider: 'openai', keys: { openai: 'sk-oai' } }),
        }),
      );
    });
    // Sigue en los defaults (Gemini + clave compartida), el evento ajeno se ignora.
    expect(screen.getByTestId('provider').textContent).toBe('gemini');
    expect(screen.getByTestId('active-key').textContent).toBe(SHARED_GEMINI_KEY);
  });
});

describe('useAiSettings — fuera del provider', () => {
  it('lanza un error que nombra al AiSettingsProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AiSettingsProvider/);
    spy.mockRestore();
  });
});

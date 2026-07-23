// Tests del dictado por voz del composer (Web Speech API vía
// useSpeechDictation). jsdom NO implementa SpeechRecognition, así que:
//   · sin mock → el micro NO se pinta (degradación limpia; esto es lo que
//     protege a la suite existente de AiChatModal, que nunca ve el botón);
//   · con un reconocedor simulado en window → el micro aparece, alterna la
//     escucha y vuelca `base + final + interim` en el composer.
// runChatTurn va mockeado (el micro no lo usa, pero el módulo lo importa).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/ai/providers', () => ({ runChatTurn: chatMock }));

import { AiChatModal } from '../../components/ai/AiChatModal';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { steelBeamDefaults } from '../../data/defaults';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import type { AiResultsSummary } from '../../lib/ai/resultsSummary';

const SETTINGS_KEY = 'concreta-ai-settings';
const OK_RESULTS: AiResultsSummary = { verdict: 'ok', text: 'CUMPLE' };

// ── Reconocedor de voz simulado: captura la instancia para poder dispararle
//    eventos desde el test. Cada `new` registra la instancia. ──
interface SpeechEntry {
  transcript: string;
  isFinal: boolean;
}
class MockRecognition {
  static instances: MockRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();
  constructor() {
    MockRecognition.instances.push(this);
  }
  /** Simula un evento onresult con la lista de resultados dada. */
  emit(entries: SpeechEntry[], resultIndex = 0) {
    const results = entries.map((e) => {
      const r: Record<number, { transcript: string }> & { isFinal: boolean; length: number } = {
        0: { transcript: e.transcript },
        isFinal: e.isFinal,
        length: 1,
      };
      return r;
    });
    (results as unknown as { length: number }).length = entries.length;
    act(() => {
      this.onresult?.({ resultIndex, results });
    });
  }
}

function seedKey() {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ provider: 'anthropic', keys: { anthropic: 'sk-test' } }),
  );
}

function renderModal() {
  render(
    <ThemeProvider>
      <UnitSystemProvider>
        <AiSettingsProvider>
          <AiChatModal
            adapter={steelBeamsAdapter}
            current={steelBeamDefaults}
            results={OK_RESULTS}
            onApply={vi.fn()}
            onClose={vi.fn()}
          />
        </AiSettingsProvider>
      </UnitSystemProvider>
    </ThemeProvider>,
  );
}

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText('Mensaje para el asistente') as HTMLTextAreaElement;
}

beforeEach(() => {
  window.localStorage.clear();
  chatMock.mockReset();
  MockRecognition.instances = [];
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('AiChatModal — dictado por voz', () => {
  it('sin soporte del navegador (jsdom): el micro NO se renderiza', () => {
    seedKey();
    renderModal();
    expect(screen.queryByRole('button', { name: /Dictar por voz/ })).not.toBeInTheDocument();
  });

  it('con SpeechRecognition: aparece el micro y al pulsarlo arranca la escucha (es-ES, continuo)', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockRecognition;
    seedKey();
    renderModal();

    const mic = screen.getByRole('button', { name: 'Dictar por voz' });
    expect(mic).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(mic);

    expect(MockRecognition.instances).toHaveLength(1);
    const rec = MockRecognition.instances[0];
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(rec.lang).toBe('es-ES');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    // El botón pasa a estado "escuchando".
    expect(screen.getByRole('button', { name: 'Detener dictado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Escuchando…/)).toBeInTheDocument();
  });

  it('interino + final: el composer refleja `base + transcrito` en vivo', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockRecognition;
    seedKey();
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Dictar por voz' }));
    const rec = MockRecognition.instances[0];

    // Resultado interino → se ve mientras se dicta.
    rec.emit([{ transcript: 'viga de ocho', isFinal: false }]);
    expect(composer().value).toBe('viga de ocho');

    // El mismo segmento se cierra (isFinal) → queda fijado.
    rec.emit([{ transcript: 'viga de ocho metros', isFinal: true }]);
    expect(composer().value).toBe('viga de ocho metros');
  });

  it('lo dictado se AÑADE a lo ya escrito (con separador), no lo sustituye', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockRecognition;
    seedKey();
    renderModal();

    fireEvent.change(composer(), { target: { value: 'HEB 200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dictar por voz' }));
    const rec = MockRecognition.instances[0];

    rec.emit([{ transcript: 'de ocho metros', isFinal: true }]);
    expect(composer().value).toBe('HEB 200 de ocho metros');
  });

  it('pulsar de nuevo detiene la escucha (stop del reconocedor y botón en reposo)', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockRecognition;
    seedKey();
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Dictar por voz' }));
    const rec = MockRecognition.instances[0];

    fireEvent.click(screen.getByRole('button', { name: 'Detener dictado' }));
    expect(rec.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Dictar por voz' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

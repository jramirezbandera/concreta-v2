// Integración T4.2 — el módulo rc-columns COMPLETO gana el chat IA.
// Se monta RCColumnsModule real (useModuleState + panel + AiChatModal) dentro
// de MemoryRouter (useSearchParams), ThemeProvider (Topbar→ThemeToggle),
// UnitSystemProvider y AiSettingsProvider; ToastContainer va montado al lado
// para poder aseverar el toast (en la app vive en AppShell). runChatTurn
// (src/lib/ai/providers) va mockeado — nada sale a la red; el adapter
// rcColumnsAdapter y su mapper son REALES.
//
// Flujo cubierto: botón "Rellenar con IA" abre el modal → turno con el mock
// resolviendo {sectionType:'circular', D_mm:400, Nd_kN:1200} → "Aplicar 3
// cambios" → el estado del módulo conmuta el panel a circular (input-D=400,
// b/h desaparecen), Nd=1200 y aparece el toast "IA: 3 campos aplicados";
// el modal sigue abierto con la tarjeta en "Aplicado".
//
// Extensión Fase 3 (T3.3 — bucle de dimensionado): tras aplicar, un SEGUNDO
// mensaje debe llevar en su system prompt el bloque "RESULTADOS DEL CÁLCULO
// ACTUAL" con el texto EXACTO de summarizeRCColumnResults(calcRCColumn(estado
// aplicado)) — motor y serializador REALES computados en el propio test, sin
// números mágicos.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/ai/providers', () => ({ runChatTurn: chatMock }));

import { RCColumnsModule } from '../../features/rc-columns';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { summarizeRCColumnResults } from '../../lib/ai/modules/rcColumns';
import { rcColumnDefaults, type RCColumnInputs } from '../../data/defaults';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { ToastContainer } from '../../components/ui/Toast';
import type { ChatEnvelope, ChatRequest } from '../../lib/ai/types';

const SETTINGS_KEY = 'concreta-ai-settings';

// rc-columns tiene 22 parámetros de unión (>16): Anthropic NO lo admite y el
// modal lo deshabilita (ver AiChatModal + exceedsAnthropicUnionLimit). Este test
// de integración cubre el flujo de APLICAR, ajeno al proveedor (runChatTurn va
// mockeado), así que se siembra OpenAI, que sí sirve el módulo.
function seedKey() {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ provider: 'openai', keys: { openai: 'sk-test' } }),
  );
}

/** Payload rc-columns todo-null; se sobrescriben solo los campos del caso. */
function makePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sectionType: null, b_mm: null, h_mm: null, D_mm: null, cover_mm: null,
    L_m: null, beta: null, fck_MPa: null, fyk_MPa: null,
    cornerBarDiam_mm: null, nBarsX: null, barDiamX_mm: null,
    nBarsY: null, barDiamY_mm: null, nBarsCirc: null, circBarDiam_mm: null,
    stirrupDiam_mm: null, stirrupSpacing_mm: null,
    Nd_kN: null, MEdy_kNm: null, MEdz_kNm: null,
    warnings: [],
    ...over,
  };
}

function renderModule() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <UnitSystemProvider>
          <AiSettingsProvider>
            <RCColumnsModule />
            <ToastContainer />
          </AiSettingsProvider>
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Deferred: promesa controlada para resolver el turno dentro de act. */
function deferChatOnce() {
  let resolve!: (v: ChatEnvelope) => void;
  chatMock.mockImplementationOnce(
    () => new Promise<ChatEnvelope>((res) => { resolve = res; }),
  );
  return { resolve: (v: ChatEnvelope) => resolve(v) };
}

/** Escribe en el composer del modal y envía con Enter (sin Shift). */
function typeAndSend(message: string) {
  const box = screen.getByLabelText('Mensaje para el asistente');
  fireEvent.change(box, { target: { value: message } });
  fireEvent.keyDown(box, { key: 'Enter' });
}

beforeEach(() => {
  window.localStorage.clear();
  chatMock.mockReset();
});

describe('RCColumnsModule — Rellenar con IA (integración T4.2)', () => {
  it('propuesta {circular, D_mm:400, Nd_kN:1200} → Aplicar → panel circular con D=400 y Nd=1200 + toast; modal abierto', async () => {
    const deferred = deferChatOnce();
    seedKey();
    renderModule();
    const user = userEvent.setup();

    // Estado inicial: sección rectangular (b/h visibles, D ausente).
    expect(document.getElementById('input-b')).not.toBeNull();
    expect(document.getElementById('input-h')).not.toBeNull();
    expect(document.getElementById('input-D')).toBeNull();

    // El botón del panel izquierdo abre el modal genérico con el adapter del módulo.
    await user.click(screen.getByRole('button', { name: /Rellenar con IA/ }));
    expect(screen.getByText('Rellenar con IA · Pilares de hormigón')).toBeInTheDocument();

    typeAndSend('Hazlo circular de 40 cm con Nd = 1200 kN');

    // runChatTurn mockeado recibe el turno user y el system con el snapshot del módulo.
    expect(chatMock).toHaveBeenCalledTimes(1);
    const req = chatMock.mock.calls[0][2] as ChatRequest;
    expect(req.turns[req.turns.length - 1]).toMatchObject({
      role: 'user',
      text: 'Hazlo circular de 40 cm con Nd = 1200 kN',
    });
    expect(req.system.volatile).toContain('"b_mm":300'); // snapshot del estado vivo
    expect(req.cacheKey).toBe('concreta-rc-columns'); // prefijo cacheado del módulo

    await act(async () => {
      deferred.resolve({
        reply: 'Propongo pilar circular de 400 mm con Nd 1200 kN.',
        proposal: makePayload({ sectionType: 'circular', D_mm: 400, Nd_kN: 1200 }),
      });
    });

    // Tarjeta de propuesta con los 3 cambios (sectionType + D + Nd).
    expect(await screen.findByText('Propongo pilar circular de 400 mm con Nd 1200 kN.')).toBeInTheDocument();
    const applyBtn = await screen.findByRole('button', { name: 'Aplicar 3 cambios' });
    await user.click(applyBtn);

    // El estado del módulo aplicó sectionType → el panel conmuta a circular…
    const dInput = document.getElementById('input-D') as HTMLInputElement | null;
    expect(dInput).not.toBeNull();
    expect(dInput!.value).toBe('400'); // …con D = 400 mm
    expect(document.getElementById('input-b')).toBeNull();
    expect(document.getElementById('input-h')).toBeNull();

    // …y Nd = 1200 kN (UnitNumberInput en SI muestra el valor canónico).
    const ndInput = document.getElementById('input-Nd') as HTMLInputElement;
    expect(parseFloat(ndInput.value)).toBe(1200);

    // Toast del handler (plural, sin avisos).
    expect(await screen.findByText('IA: 3 campos aplicados')).toBeInTheDocument();

    // Aplicar NO cierra el modal: la tarjeta pasa a "Aplicado" (deshabilitado).
    expect(screen.getByRole('button', { name: 'Aplicado' })).toBeDisabled();
    expect(screen.getByText('Rellenar con IA · Pilares de hormigón')).toBeInTheDocument();

    // --- Fase 3 (T3.3): el 2º turno lleva los resultados RECALCULADOS ---
    // Estado tras aplicar la propuesta = defaults + los 3 campos aplicados.
    // Se computa aquí con el motor y el serializador REALES: el system del
    // 2º turno debe contener el bloque de resultados con su texto EXACTO.
    const estadoEsperado: RCColumnInputs = {
      ...rcColumnDefaults,
      sectionType: 'circular',
      D: 400,
      Nd: 1200,
    };
    const expectedSummary = summarizeRCColumnResults(calcRCColumn(estadoEsperado));

    const deferred2 = deferChatOnce();
    typeAndSend('¿Cumple ahora el pilar?');

    expect(chatMock).toHaveBeenCalledTimes(2);
    const req2 = chatMock.mock.calls[1][2] as ChatRequest;
    expect(req2.turns[req2.turns.length - 1]).toMatchObject({
      role: 'user',
      text: '¿Cumple ahora el pilar?',
    });
    expect(req2.system.volatile).toContain('RESULTADOS DEL CÁLCULO ACTUAL');
    expect(req2.system.volatile).toContain(expectedSummary.text);
    // El snapshot del estado también va fresco (D aplicado en el turno anterior).
    expect(req2.system.volatile).toContain('"D_mm":400');

    // Cierre limpio del turno (sin propuesta) para no dejar promesas colgadas.
    await act(async () => {
      deferred2.resolve({ reply: 'Sí, con los valores actuales cumple.', proposal: null });
    });
    expect(await screen.findByText('Sí, con los valores actuales cumple.')).toBeInTheDocument();
  });
});

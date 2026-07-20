// Tests del modal de chat conversacional (src/components/ai/AiChatModal.tsx).
// runChatTurn (src/lib/ai/providers) va mockeado — nada sale a la red; el resto
// (AiSettingsProvider, steelBeamsAdapter → parseExtraction/buildApplyPlan) es
// real. La key BYOK se siembra en localStorage['concreta-ai-settings'] ANTES de
// renderizar (el provider la lee en el initializer del useState).
//
// Cubre: gate sin key, envío con Enter (turns terminando en user + indicador
// de carga), camino guiado del estado vacío ("Guíame paso a paso" ENVÍA el
// mensaje constante como primer turno user; deshabilitado sin key), propuesta →
// ProposalCard → Aplicar (SI interno, modal abierto), proposal null (solo
// reply), error inline + Reintentar sin duplicar el turno user, segundo turno
// (historial con rawEnvelope verbatim + snapshot en el system), acumulación de
// propuestas no aplicadas (fusión en cliente: la tarjeta nueva acumula, las
// anteriores pasan a superseded; proposal null no toca nada; lo aplicado no se
// arrastra; el historial NUNCA se fusiona), Escape en reposo → onClose, bloque
// de resultados en el system (prop `results` viva → frescura tras rerender) y
// tarjeta "¿Por qué no cumple?" del estado vacío (solo con veredicto fail;
// 'invalid' no la muestra).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/ai/providers', () => ({ runChatTurn: chatMock }));

import { AiChatModal } from '../../components/ai/AiChatModal';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { steelBeamDefaults, isolatedFootingDefaults, type SteelBeamInputs } from '../../data/defaults';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import { isolatedFootingAdapter } from '../../lib/ai/modules/isolatedFooting';
import {
  AiError,
  AI_ERROR_MESSAGES,
  type ChatEnvelope,
  type ChatRequest,
  type ChatSystem,
} from '../../lib/ai/types';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import type { AiResultsSummary } from '../../lib/ai/resultsSummary';

const SETTINGS_KEY = 'concreta-ai-settings';
const LOADING_TEXT = 'Consultando a Anthropic (Claude)…';
// Copia literal de GUIDED_PROMPT (AiChatModal.tsx): el texto exacto que el botón
// guiado envía como primer turno user.
const GUIDED_TEXT =
  'No conozco todos los datos. Guíame paso a paso, preguntándome lo que haga falta, para rellenar este cálculo.';
const GUIDED_BTN = /Guíame paso a paso/;
// Copia literal de WHY_FAIL_PROMPT (AiChatModal.tsx): lo que envía la tarjeta
// de diagnóstico del estado vacío (solo visible con veredicto fail).
const WHY_FAIL_TEXT = '¿Por qué no cumple este cálculo y qué cambiarías para que cumpla?';
const WHY_FAIL_BTN = /¿Por qué no cumple\?/;

/** Resumen de resultados por defecto del helper (cálculo que cumple). */
const OK_RESULTS: AiResultsSummary = {
  verdict: 'ok',
  text: 'VEREDICTO GLOBAL: CUMPLE (todas las comprobaciones cumplen)',
};
const FAIL_RESULTS: AiResultsSummary = {
  verdict: 'fail',
  text: 'VEREDICTO GLOBAL: INCUMPLE (2 de 12 comprobaciones fallan)',
};

function seedKey() {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ provider: 'anthropic', keys: { anthropic: 'sk-test' } }),
  );
}

/**
 * Estado "sin API key": el default (Gemini) trae clave compartida embebida, así
 * que para reproducir el escenario sin clave hay que situarse en un proveedor
 * BYOK puro (Anthropic) sin key guardada → activeKey === null.
 */
function seedNoKey() {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ provider: 'anthropic', keys: {} }),
  );
}

/** Payload steel-beams todo-null; se sobrescriben solo los campos del caso. */
function makePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tipo: null, size: null,
    tubo_h_mm: null, tubo_b_mm: null, tubo_t_mm: null,
    steel: null, beamType: null,
    L_m: null, Lcr_m: null, deflLimit: null, elsCombo: null,
    useCategory: null, gk_kNm2: null, qk_kNm2: null, bTrib_m: null,
    warnings: [],
    ...over,
  };
}

function renderModal(results: AiResultsSummary = OK_RESULTS) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const ui = (r: AiResultsSummary) => (
    <ThemeProvider>
      <UnitSystemProvider>
        <AiSettingsProvider>
          <AiChatModal
            adapter={steelBeamsAdapter}
            current={steelBeamDefaults}
            results={r}
            onApply={onApply}
            onClose={onClose}
          />
        </AiSettingsProvider>
      </UnitSystemProvider>
    </ThemeProvider>
  );
  const utils = render(ui(results));
  return {
    ...utils,
    onApply,
    onClose,
    /** Rerender con OTRO resumen de resultados (prop viva → frescura por turno). */
    rerenderWithResults: (r: AiResultsSummary) => utils.rerender(ui(r)),
  };
}

/** Escribe en el composer y envía con Enter (sin Shift). */
function typeAndSend(message: string) {
  const box = screen.getByLabelText('Mensaje para el asistente');
  fireEvent.change(box, { target: { value: message } });
  fireEvent.keyDown(box, { key: 'Enter' });
}

/** Deferred: promesa controlada para resolver el turno dentro de act. */
function deferChatOnce() {
  let resolve!: (v: ChatEnvelope) => void;
  chatMock.mockImplementationOnce(
    () => new Promise<ChatEnvelope>((res) => { resolve = res; }),
  );
  return { resolve: (v: ChatEnvelope) => resolve(v) };
}

beforeEach(() => {
  window.localStorage.clear();
  chatMock.mockReset();
});

describe('AiChatModal — sin API key', () => {
  it('Enviar deshabilitado (incluso con texto) y ajustes BYOK abiertos con aviso', () => {
    seedNoKey();
    renderModal();

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    // Ajustes BYOK auto-abiertos (activeKey === null).
    expect(
      screen.getByRole('button', { name: /Proveedor y API key/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Falta la API key')).toBeInTheDocument();
    expect(screen.getByLabelText('API key de Anthropic (Claude)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mensaje para el asistente'), {
      target: { value: 'Viga de 8 m' },
    });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });
});

describe('AiChatModal — envío', () => {
  it('con key + texto + Enter: runChatTurn con provider/key y turns terminando en user; indicador visible', async () => {
    chatMock.mockImplementationOnce(() => new Promise(() => {})); // en vuelo
    seedKey();
    renderModal();

    typeAndSend('Viga biapoyada HEB 200 de 8 m de luz');

    expect(chatMock).toHaveBeenCalledTimes(1);
    const [provider, key, req] = chatMock.mock.calls[0] as [string, string, ChatRequest];
    expect(provider).toBe('anthropic');
    expect(key).toBe('sk-test');
    expect(req.turns).toHaveLength(1);
    expect(req.turns[req.turns.length - 1]).toMatchObject({
      role: 'user',
      text: 'Viga biapoyada HEB 200 de 8 m de luz',
    });
    // Envelope canónico {reply, proposal} construido con buildChatSchema.
    expect(req.schema).toMatchObject({ required: ['reply', 'proposal'] });

    expect(await screen.findByText(LOADING_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('propuesta {L_m:8, tipo:HEB, size:200} → reply + "Aplicar 3 cambios" → onApply SI + "Aplicado" + modal abierto', async () => {
    const deferred = deferChatOnce();
    seedKey();
    const { onApply, onClose } = renderModal();
    const user = userEvent.setup();

    typeAndSend('Viga biapoyada HEB 200 de 8 m de luz');
    expect(await screen.findByText(LOADING_TEXT)).toBeInTheDocument();

    await act(async () => {
      deferred.resolve({
        reply: 'Propongo estos datos',
        proposal: makePayload({ L_m: 8, tipo: 'HEB', size: 200 }),
      });
    });

    // Reply del assistant + tarjeta de propuesta (diff) debajo.
    expect(await screen.findByText('Propongo estos datos')).toBeInTheDocument();
    const applyBtn = await screen.findByRole('button', { name: 'Aplicar 3 cambios' });
    expect(screen.getByText('Propuesta')).toBeInTheDocument();

    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    const plan = onApply.mock.calls[0][0] as AiApplyPlan<SteelBeamInputs>;
    // SI interno: L en mm; solo los campos aplicables.
    expect(plan.fields).toEqual({ tipo: 'HEB', size: 200, L: 8000 });
    expect(plan.changes).toHaveLength(3);

    // La tarjeta pasa a "Aplicado" (deshabilitado) y la ventana NO se cierra
    // (el composer sigue montado: el asistente permanece abierto).
    expect(await screen.findByRole('button', { name: 'Aplicado' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mensaje para el asistente')).toBeInTheDocument();
  });

  it('envelope con proposal null → solo reply, sin tarjeta', async () => {
    const deferred = deferChatOnce();
    seedKey();
    renderModal();

    typeAndSend('¿Qué límite de flecha me recomiendas para tabiques frágiles?');
    await act(async () => {
      deferred.resolve({ reply: 'Para tabiques frágiles usa L/500.', proposal: null });
    });

    expect(await screen.findByText('Para tabiques frágiles usa L/500.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aplicar/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Propuesta')).not.toBeInTheDocument();
  });
});

describe('AiChatModal — camino guiado (estado vacío)', () => {
  it('con key: "Guíame paso a paso" ENVÍA el mensaje guiado (turns 1 · user · texto exacto) y pinta la burbuja', async () => {
    chatMock.mockImplementationOnce(() => new Promise(() => {})); // en vuelo
    seedKey();
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: GUIDED_BTN }));

    expect(chatMock).toHaveBeenCalledTimes(1);
    const req = chatMock.mock.calls[0][2] as ChatRequest;
    expect(req.turns).toHaveLength(1);
    expect(req.turns[0]).toMatchObject({ role: 'user', text: GUIDED_TEXT });

    // Burbuja user en el hilo (como si lo hubiera escrito) + petición en vuelo.
    expect(await screen.findByText(GUIDED_TEXT)).toBeInTheDocument();
    expect(screen.getByText(LOADING_TEXT)).toBeInTheDocument();
  });

  it('sin key: el botón guiado está deshabilitado y no llama a runChatTurn', async () => {
    seedNoKey();
    renderModal();
    const user = userEvent.setup();

    const guided = screen.getByRole('button', { name: GUIDED_BTN });
    expect(guided).toBeDisabled();

    await user.click(guided);

    expect(chatMock).not.toHaveBeenCalled();
    expect(screen.queryByText(GUIDED_TEXT)).not.toBeInTheDocument();
  });
});

describe('AiChatModal — errores', () => {
  it("rechazo AiError('invalid-key') → error inline; Reintentar relanza SIN duplicar el turno user", async () => {
    chatMock.mockRejectedValueOnce(new AiError('invalid-key', 'HTTP 401'));
    seedKey();
    renderModal();
    const user = userEvent.setup();

    typeAndSend('Viga de 8 m');

    // Ítem error inline: mensaje de catálogo + detalle técnico (nunca la key).
    expect(await screen.findByText(AI_ERROR_MESSAGES['invalid-key'])).toBeInTheDocument();
    expect(screen.getByText('HTTP 401')).toBeInTheDocument();

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2ª llamada en vuelo
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(chatMock).toHaveBeenCalledTimes(2);
    const req2 = chatMock.mock.calls[1][2] as ChatRequest;
    // Reutiliza el último turno user existente — NO se añade otro.
    expect(req2.turns).toHaveLength(1);
    expect(req2.turns[0]).toMatchObject({ role: 'user', text: 'Viga de 8 m' });

    // El ítem error se retiró del hilo y la burbuja user sigue una sola vez.
    expect(screen.queryByText(AI_ERROR_MESSAGES['invalid-key'])).not.toBeInTheDocument();
    expect(screen.getAllByText('Viga de 8 m')).toHaveLength(1);
  });
});

describe('AiChatModal — segundo turno', () => {
  it('turns.length 3, turno assistant = rawEnvelope verbatim y system con el snapshot', async () => {
    const deferred = deferChatOnce();
    seedKey();
    renderModal();

    typeAndSend('Viga biapoyada HEB 200 de 8 m de luz');
    const envelope: ChatEnvelope = {
      reply: 'Propongo estos datos',
      proposal: makePayload({ L_m: 8, tipo: 'HEB', size: 200 }),
    };
    await act(async () => {
      deferred.resolve(envelope);
    });
    await screen.findByText('Propongo estos datos');

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2º turno en vuelo
    typeAndSend('Sube la luz a 9 m');

    expect(chatMock).toHaveBeenCalledTimes(2);
    const req2 = chatMock.mock.calls[1][2] as ChatRequest;
    expect(req2.turns).toHaveLength(3);
    expect(req2.turns[0]).toMatchObject({
      role: 'user',
      text: 'Viga biapoyada HEB 200 de 8 m de luz',
    });
    // El turno assistant reenvía el envelope JSON crudo VERBATIM.
    expect(req2.turns[1].role).toBe('assistant');
    expect(req2.turns[1].text).toBe(JSON.stringify(envelope));
    expect(req2.turns[2]).toMatchObject({ role: 'user', text: 'Sube la luz a 9 m' });
    // El system prompt de cada turno incluye el snapshot del estado vivo —
    // DECORADO: con una propuesta sin aplicar ya no es el crudo del adapter
    // (gana pendientes_de_aplicar y pierde esas claves de sin_confirmar).
    expect(req2.system.volatile).toContain('ESTADO ACTUAL DEL MÓDULO');
    expect(req2.system.volatile).not.toContain(steelBeamsAdapter.snapshot(steelBeamDefaults));
    // Con ":" — la clave del JSON decorado, no la mención del prompt base.
    expect(req2.system.volatile).toContain('"pendientes_de_aplicar":');
  });
});

describe('AiChatModal — acumulación de propuestas no aplicadas', () => {
  // Copia literal de la nota de ProposalCard para tarjetas reemplazadas.
  const SUPERSEDED_NOTE = 'Recogida en la propuesta más reciente';

  /** Turno completo: envía `message`, resuelve con `envelope` y espera el reply. */
  async function turn(message: string, envelope: ChatEnvelope) {
    const deferred = deferChatOnce();
    typeAndSend(message);
    await act(async () => {
      deferred.resolve(envelope);
    });
    await screen.findByText(envelope.reply);
  }

  it('(a) dos propuestas sin aplicar → la tarjeta nueva acumula lo pendiente y la anterior queda reemplazada', async () => {
    seedKey();
    const { onApply } = renderModal();
    const user = userEvent.setup();

    await turn('Viga de 8 m de luz', {
      reply: 'Anoto la luz',
      proposal: makePayload({ L_m: 8 }),
    });
    expect(screen.getByRole('button', { name: 'Aplicar 1 cambio' })).toBeEnabled();

    await turn('Que sea un HEB 200', {
      reply: 'Anoto el perfil',
      proposal: makePayload({ tipo: 'HEB', size: 200 }),
    });

    // UNA sola tarjeta viva: la nueva, con lo acumulado (L 8 m + tipo + size).
    const applyButtons = screen.getAllByRole('button', { name: /^Aplicar / });
    expect(applyButtons).toHaveLength(1);
    expect(applyButtons[0]).toHaveTextContent('Aplicar 3 cambios');
    // La tarjeta del turno 1 quedó reemplazada: nota en lugar de botón.
    expect(screen.getByText(SUPERSEDED_NOTE)).toBeInTheDocument();

    await user.click(applyButtons[0]);

    expect(onApply).toHaveBeenCalledTimes(1);
    const plan = onApply.mock.calls[0][0] as AiApplyPlan<SteelBeamInputs>;
    // El plan aplicado es el FUSIONADO: lo pendiente (L en SI) + lo nuevo.
    expect(plan.fields).toEqual({ tipo: 'HEB', size: 200, L: 8000 });
    expect(plan.changes).toHaveLength(3);
  });

  it('(b) turno con proposal null NO toca nada: la tarjeta pendiente sigue viva', async () => {
    seedKey();
    renderModal();

    await turn('Viga de 8 m de luz', {
      reply: 'Anoto la luz',
      proposal: makePayload({ L_m: 8 }),
    });
    await turn('¿Qué acero me recomiendas?', {
      reply: 'S275 suele bastar.',
      proposal: null,
    });

    // Sin fusión ni marcado: el botón del turno 1 sigue vivo y no hay nota.
    expect(screen.getByRole('button', { name: 'Aplicar 1 cambio' })).toBeEnabled();
    expect(screen.queryByText(SUPERSEDED_NOTE)).not.toBeInTheDocument();
  });

  it('(c) tras aplicar la tarjeta pendiente, la siguiente propuesta NO arrastra lo ya aplicado', async () => {
    seedKey();
    const { onApply } = renderModal();
    const user = userEvent.setup();

    await turn('Viga de 8 m de luz', {
      reply: 'Anoto la luz',
      proposal: makePayload({ L_m: 8 }),
    });
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 cambio' }));
    expect(await screen.findByRole('button', { name: 'Aplicado' })).toBeDisabled();

    await turn('Que sea un perfil HEB', {
      reply: 'Anoto el tipo de perfil',
      proposal: makePayload({ tipo: 'HEB' }),
    });

    // Payload pendiente null (lo aplicado no cuenta): la tarjeta nueva SOLO
    // trae lo nuevo, y la aplicada NO se marca como reemplazada.
    const applyBtn = screen.getByRole('button', { name: 'Aplicar 1 cambio' });
    expect(screen.getByRole('button', { name: 'Aplicado' })).toBeInTheDocument();
    expect(screen.queryByText(SUPERSEDED_NOTE)).not.toBeInTheDocument();

    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(2);
    const plan2 = onApply.mock.calls[1][0] as AiApplyPlan<SteelBeamInputs>;
    expect(plan2.fields).toEqual({ tipo: 'HEB' });
  });

  it('(d) el historial hacia el modelo lleva cada rawEnvelope VERBATIM (la fusión es solo de UI)', async () => {
    seedKey();
    renderModal();

    const env1: ChatEnvelope = { reply: 'Anoto la luz', proposal: makePayload({ L_m: 8 }) };
    const env2: ChatEnvelope = {
      reply: 'Anoto el perfil',
      proposal: makePayload({ tipo: 'HEB', size: 200 }),
    };
    await turn('Viga de 8 m de luz', env1);
    await turn('Que sea un HEB 200', env2);
    // La tarjeta del 2º turno es la fusionada…
    expect(screen.getByRole('button', { name: 'Aplicar 3 cambios' })).toBeInTheDocument();

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 3er turno en vuelo
    typeAndSend('¿Cumple así?');

    expect(chatMock).toHaveBeenCalledTimes(3);
    const req3 = chatMock.mock.calls[2][2] as ChatRequest;
    expect(req3.turns).toHaveLength(5);
    // …pero el historial reenvía los envelopes crudos tal cual llegaron
    // (env2 SIN el L_m fusionado).
    expect(req3.turns[1]).toMatchObject({ role: 'assistant', text: JSON.stringify(env1) });
    expect(req3.turns[3]).toMatchObject({ role: 'assistant', text: JSON.stringify(env2) });
  });
});

describe('AiChatModal — resultados en el system prompt', () => {
  it('el system del turno contiene la cabecera "RESULTADOS DEL CÁLCULO ACTUAL" y results.text', () => {
    chatMock.mockImplementationOnce(() => new Promise(() => {})); // en vuelo
    seedKey();
    renderModal();

    typeAndSend('Viga de 8 m');

    expect(chatMock).toHaveBeenCalledTimes(1);
    const req = chatMock.mock.calls[0][2] as ChatRequest;
    expect(req.system.volatile).toContain('RESULTADOS DEL CÁLCULO ACTUAL');
    expect(req.system.volatile).toContain(OK_RESULTS.text);
    // Los resultados NUNCA en el bloque estable: lo invalidarían en cada turno
    // y la caché de prompt dejaría de acertar (ver ChatSystem en lib/ai/types).
    expect(req.system.stable).not.toContain(OK_RESULTS.text);
  });

  it('frescura: rerender con results B entre turnos → el system del 2º turno contiene B y NO A', async () => {
    const RESULTS_A: AiResultsSummary = {
      verdict: 'fail',
      text: 'VEREDICTO GLOBAL: INCUMPLE (1 de 9 comprobaciones fallan) [marcador-A]',
    };
    const RESULTS_B: AiResultsSummary = {
      verdict: 'ok',
      text: 'VEREDICTO GLOBAL: CUMPLE (todas las comprobaciones cumplen) [marcador-B]',
    };
    const deferred = deferChatOnce();
    seedKey();
    const { rerenderWithResults } = renderModal(RESULTS_A);

    typeAndSend('Viga de 8 m');
    const req1 = chatMock.mock.calls[0][2] as ChatRequest;
    expect(req1.system.volatile).toContain(RESULTS_A.text);

    await act(async () => {
      deferred.resolve({ reply: 'Sube a IPE 360 y cumplirá.', proposal: null });
    });
    await screen.findByText('Sube a IPE 360 y cumplirá.');

    // El padre recalcula y pasa el resumen nuevo por la prop viva.
    rerenderWithResults(RESULTS_B);

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2º turno en vuelo
    typeAndSend('¿Ya cumple?');

    expect(chatMock).toHaveBeenCalledTimes(2);
    const req2 = chatMock.mock.calls[1][2] as ChatRequest;
    expect(req2.system.volatile).toContain(RESULTS_B.text);
    expect(req2.system.volatile).not.toContain(RESULTS_A.text);
    expect(req2.system.volatile).not.toContain('[marcador-A]');

    // INVARIANTE DE LA CACHÉ: cambiar los resultados NO toca el bloque estable.
    // Es lo único que hace que la caché de prompt acierte turno a turno; si un
    // día algo variable se colara en `stable`, este assert lo caza.
    expect(req2.system.stable).toBe(req1.system.stable);
    // Y la clave de caché es la del módulo (OpenAI la exige en GPT-5.6+).
    expect(req2.cacheKey).toBe('concreta-steel-beams');
  });
});

describe('AiChatModal — memoria del hilo (snapshot decorado)', () => {
  /** Snapshot JSON embebido en el bloque VOLÁTIL del system (tras su cabecera). */
  function snapshotIn(system: ChatSystem): Record<string, unknown> {
    const marker = 'ESTADO ACTUAL DEL MÓDULO (unidades del schema):\n';
    const text = system.volatile;
    const start = text.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const from = start + marker.length;
    const end = text.indexOf('\n\n', from);
    return JSON.parse(text.slice(from, end === -1 ? undefined : end)) as Record<string, unknown>;
  }

  /** Turno completo: envía `message`, resuelve con `envelope` y espera el reply. */
  async function turn(message: string, envelope: ChatEnvelope) {
    const deferred = deferChatOnce();
    typeAndSend(message);
    await act(async () => {
      deferred.resolve(envelope);
    });
    await screen.findByText(envelope.reply);
  }

  it('primer turno: snapshot byte-idéntico al del adapter (sin decorar)', () => {
    chatMock.mockImplementationOnce(() => new Promise(() => {})); // en vuelo
    seedKey();
    renderModal();

    typeAndSend('Viga de 8 m');

    const req = chatMock.mock.calls[0][2] as ChatRequest;
    expect(req.system.volatile).toContain(steelBeamsAdapter.snapshot(steelBeamDefaults));
    // El estado vive SOLO en el bloque volátil (el estable es el cacheable).
    expect(req.system.stable).not.toContain(steelBeamsAdapter.snapshot(steelBeamDefaults));
    // Con ":" — el prompt base menciona la clave entre comillas al explicarla;
    // solo el snapshot decorado la lleva como clave JSON.
    expect(req.system.volatile).not.toContain('"pendientes_de_aplicar":');
  });

  it('propuesta sin aplicar → pendientes_de_aplicar en el snapshot y fuera de sin_confirmar', async () => {
    seedKey();
    renderModal();

    // bTrib_m 3 COINCIDE con el default (3.0): antes era inconfirmable — el
    // caso del bug. L_m 8 sí difiere.
    await turn('Viga de 8 m con vigas cada 3 m', {
      reply: 'Anotado.',
      proposal: makePayload({ L_m: 8, bTrib_m: 3 }),
    });

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2º turno en vuelo
    typeAndSend('¿Qué falta?');

    const snap = snapshotIn((chatMock.mock.calls[1][2] as ChatRequest).system);
    expect(snap.pendientes_de_aplicar).toEqual({ L_m: 8, bTrib_m: 3 });
    const sinConfirmar = snap.sin_confirmar as string[];
    expect(sinConfirmar).not.toContain('L_m');
    expect(sinConfirmar).not.toContain('bTrib_m');
    expect(sinConfirmar).toContain('tipo'); // el resto sigue sin confirmar
  });

  it('clave RECHAZADA por el plan → errores_propuesta_anterior en el snapshot y fuera de pendientes', async () => {
    seedKey();
    renderModal();

    // L_m 99 está fuera del rango del adapter (0.5–40): el plan la descarta
    // con motivo. Antes ese motivo solo se pintaba en la tarjeta y el modelo
    // veía la clave como "pendiente de aplicar" — reenviaba lo mismo en bucle.
    await turn('Viga de 99 m con vigas cada 3 m', {
      reply: 'Anotado.',
      proposal: makePayload({ L_m: 99, bTrib_m: 3 }),
    });

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2º turno en vuelo
    typeAndSend('¿Qué falta?');

    const snap = snapshotIn((chatMock.mock.calls[1][2] as ChatRequest).system);
    expect(snap.pendientes_de_aplicar).toEqual({ bTrib_m: 3 });
    expect(snap.errores_propuesta_anterior).toEqual([
      'L_m: Valor 99 m fuera del rango admisible 0.5–40 m',
    ]);
  });

  it('tras Aplicar: sin pendientes, pero las claves tratadas siguen fuera de sin_confirmar', async () => {
    seedKey();
    renderModal();

    await turn('Viga de 8 m con vigas cada 3 m', {
      reply: 'Anotado.',
      proposal: makePayload({ L_m: 8, bTrib_m: 3 }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar 1 cambio' }));

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2º turno en vuelo
    typeAndSend('¿Qué falta?');

    // El harness NO actualiza `current` al aplicar (steelBeamDefaults fijo):
    // el snapshot del adapter aún listaría L_m/bTrib_m como sin confirmar. El
    // registro de confirmados del hilo debe retirarlas igualmente.
    const snap = snapshotIn((chatMock.mock.calls[1][2] as ChatRequest).system);
    expect('pendientes_de_aplicar' in snap).toBe(false);
    const sinConfirmar = snap.sin_confirmar as string[];
    expect(sinConfirmar).not.toContain('L_m');
    expect(sinConfirmar).not.toContain('bTrib_m');
    expect(sinConfirmar).toContain('tipo');
  });

  it('propuesta todo-null no registra nada: el snapshot del turno siguiente queda crudo', async () => {
    seedKey();
    renderModal();

    await turn('¿Qué es el ancho tributario?', {
      reply: 'Es la franja de forjado que descarga en la viga.',
      proposal: makePayload(), // todo null
    });

    chatMock.mockImplementationOnce(() => new Promise(() => {})); // 2º turno en vuelo
    typeAndSend('Gracias');

    const req2 = chatMock.mock.calls[1][2] as ChatRequest;
    expect(req2.system.volatile).toContain(steelBeamsAdapter.snapshot(steelBeamDefaults));
    expect(req2.system.volatile).not.toContain('"pendientes_de_aplicar":');
  });
});

describe('AiChatModal — tarjeta "¿Por qué no cumple?" (estado vacío)', () => {
  it("ausente con verdict 'ok'", () => {
    seedKey();
    renderModal(); // default OK_RESULTS
    expect(screen.queryByRole('button', { name: WHY_FAIL_BTN })).not.toBeInTheDocument();
  });

  it("ausente con verdict 'invalid' (ese error ya se ve en el panel de resultados)", () => {
    seedKey();
    renderModal({ verdict: 'invalid', text: 'CÁLCULO NO VÁLIDO: perfil inexistente' });
    expect(screen.queryByRole('button', { name: WHY_FAIL_BTN })).not.toBeInTheDocument();
  });

  it("presente con 'fail' (primera tarjeta) y click → envía WHY_FAIL_PROMPT como turno user", async () => {
    chatMock.mockImplementationOnce(() => new Promise(() => {})); // en vuelo
    seedKey();
    renderModal(FAIL_RESULTS);
    const user = userEvent.setup();

    const card = screen.getByRole('button', { name: WHY_FAIL_BTN });
    // Primera en orden visual: precede a la tarjeta de ejemplo en el DOM.
    const example = screen.getByRole('button', { name: /Pegar un enunciado de ejemplo/ });
    expect(card.compareDocumentPosition(example) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(card);

    expect(chatMock).toHaveBeenCalledTimes(1);
    const req = chatMock.mock.calls[0][2] as ChatRequest;
    expect(req.turns).toHaveLength(1);
    expect(req.turns[0]).toMatchObject({ role: 'user', text: WHY_FAIL_TEXT });

    // Burbuja user en el hilo (como si lo hubiera escrito) + petición en vuelo.
    expect(await screen.findByText(WHY_FAIL_TEXT)).toBeInTheDocument();
    expect(screen.getByText(LOADING_TEXT)).toBeInTheDocument();
  });

  it('sin key: la tarjeta está deshabilitada y no llama a runChatTurn', async () => {
    seedNoKey();
    renderModal(FAIL_RESULTS);
    const user = userEvent.setup();

    const card = screen.getByRole('button', { name: WHY_FAIL_BTN });
    expect(card).toBeDisabled();

    await user.click(card);

    expect(chatMock).not.toHaveBeenCalled();
    expect(screen.queryByText(WHY_FAIL_TEXT)).not.toBeInTheDocument();
  });
});

describe('AiChatModal — cierre', () => {
  it('Escape en reposo llama a onClose', () => {
    seedKey();
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AiChatModal — límite de Anthropic (módulos grandes)', () => {
  const NOTICE = /no admite este módulo/i;

  function seedProvider(provider: 'anthropic' | 'openai') {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ provider, keys: { anthropic: 'sk-test', openai: 'sk-test' } }),
    );
  }

  /** Modal montado sobre un módulo GRANDE (zapatas: 23 uniones > 16). */
  function renderFooting() {
    render(
      <ThemeProvider>
        <UnitSystemProvider>
          <AiSettingsProvider>
            <AiChatModal
              adapter={isolatedFootingAdapter}
              current={isolatedFootingDefaults}
              results={OK_RESULTS}
              onApply={vi.fn()}
              onClose={vi.fn()}
            />
          </AiSettingsProvider>
        </UnitSystemProvider>
      </ThemeProvider>,
    );
  }

  it('Anthropic + módulo grande: avisa y bloquea envío, composer y guiado', () => {
    seedProvider('anthropic');
    renderFooting();

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByLabelText('Mensaje para el asistente')).toBeDisabled();
    expect(screen.getByRole('button', { name: GUIDED_BTN })).toBeDisabled();
  });

  it('Anthropic + módulo grande: forzar Enter no llama a runChatTurn', () => {
    seedProvider('anthropic');
    renderFooting();

    const box = screen.getByLabelText('Mensaje para el asistente');
    fireEvent.change(box, { target: { value: 'Zapata 40x40 N=600' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(chatMock).not.toHaveBeenCalled();
  });

  it('OpenAI (sin ese tope): sin aviso y envío habilitado en el mismo módulo', () => {
    seedProvider('openai');
    renderFooting();

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensaje para el asistente'), {
      target: { value: 'Zapata 40x40 N=600' },
    });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });

  it('Anthropic + módulo en el límite (steel-beams, 16 uniones): sin aviso', () => {
    seedProvider('anthropic');
    renderModal(); // steel-beams

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});

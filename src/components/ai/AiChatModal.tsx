// Modal de chat conversacional del asistente IA (T3.1 — Fase 3). Genérico por
// módulo vía AiModuleAdapter<TInputs>: el hilo vive SOLO en memoria del modal;
// cada turno reconstruye el system prompt con un snapshot FRESCO del estado
// vivo y el bloque de resultados (`current` y `results` son props vivas —
// nunca se memoizan), envía el envelope schema (memoizado) y la ventana de
// turnos de buildChatTurns, y las propuestas se muestran como <ProposalCard>
// inline. Aplicar NO cierra el modal (la tarjeta pasa a "Aplicado" y la
// conversación sigue).
//
// ACUMULACIÓN: las propuestas no aplicadas se fusionan en cliente — cada
// propuesta nueva se combina con la pendiente (lo nuevo gana,
// mergeProposalPayloads), las tarjetas anteriores pasan a `superseded` y
// siempre queda UNA tarjeta viva con todo lo acumulado. La fusión es SOLO de
// UI/plan: el historial hacia el modelo reenvía cada envelope verbatim.
//
// Chrome del modal portado de AiFillModal (backdrop, panel, header, Escape,
// bloqueo de scroll del body y devolución de foco al disparador) y cancelación
// con el patrón reqId + AbortController; las refs de cancelación se mutan SOLO
// en handlers/effects (React Compiler). SEGURIDAD: la API key nunca se loguea
// ni se interpola en textos/errores.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, SendHorizontal, Sparkles, TriangleAlert, X } from 'lucide-react';
import {
  AiError,
  AI_ERROR_MESSAGES,
  type AiErrorKind,
  type AiImageAttachment,
} from '../../lib/ai/types';
import { AI_PROVIDER_LABELS } from '../../lib/ai/models';
import { buildChatSchema, buildChatSystemBlocks } from '../../lib/ai/chatSchema';
import { exceedsAnthropicUnionLimit } from '../../lib/ai/providers/schemaConvert';
import { buildChatTurns } from '../../lib/ai/chatHistory';
import {
  IMAGE_ACCEPT_ATTR,
  MAX_IMAGES,
  MAX_IMAGES_OVERFLOW_TOAST,
  MAX_IMAGES_TOAST,
  prepareImage,
} from '../../lib/ai/imagePrep';
import { mergeProposalPayloads } from '../../lib/ai/mergeProposal';
import { collectConfirmedKeys, decorateSnapshot } from '../../lib/ai/pendingSnapshot';
import type { AiApplyPlan, AiModuleAdapter } from '../../lib/ai/modules/types';
import { runChatTurn } from '../../lib/ai/providers';
import type { AiResultsSummary } from '../../lib/ai/resultsSummary';
import { useAiSettings } from '../../lib/ai/useAiSettings';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { showToast } from '../ui/Toast';
import { ByokSettings } from './ByokSettings';
import { ProposalCard } from './ProposalCard';

export interface AiChatModalProps<TInputs> {
  adapter: AiModuleAdapter<TInputs>;
  current: TInputs; // estado VIVO del módulo — snapshot por turno
  results: AiResultsSummary; // serializado por el padre; prop viva → frescura por turno
  onApply: (plan: AiApplyPlan<TInputs>) => void; // el padre aplica; el modal NO se cierra
  onClose: () => void;
}

type ChatItem<TInputs> =
  | { id: string; kind: 'user'; text: string; images: AiImageAttachment[] }
  | {
      id: string;
      kind: 'assistant';
      reply: string;
      rawEnvelope: string;
      plan: AiApplyPlan<TInputs> | null;
      applied: boolean;
      /** Payload (ya fusionado con lo pendiente) con el que se construyó `plan`;
       *  null si el turno no trajo propuesta o buildPlan falló. */
      payload: unknown;
      /** true si una propuesta posterior fusionó estos cambios (tarjeta atenuada, sin Aplicar). */
      superseded: boolean;
      /** true si adapter.buildPlan lanzó (propuesta ininterpretable) — solo presentación. */
      proposalError?: boolean;
    }
  | { id: string; kind: 'error'; errorKind: AiErrorKind; detail: string | null };

/** Imagen del composer con id local para poder quitarla de la fila de miniaturas. */
interface LocalImage {
  id: string;
  attachment: AiImageAttachment;
}

// Contadores a nivel de módulo (ids estables sin mutar refs en render).
let chatItemSeq = 0;
function nextItemId(): string {
  chatItemSeq += 1;
  return `ai-chat-item-${chatItemSeq}`;
}

let imageSeq = 0;
function nextImageId(): string {
  imageSeq += 1;
  return `ai-chat-img-${imageSeq}`;
}

/**
 * Payload de la última propuesta PENDIENTE del hilo: el ítem assistant más
 * reciente con plan construido, ni aplicado ni reemplazado. null si no hay
 * nada pendiente (la siguiente propuesta no arrastra nada).
 */
function findPendingPayload<TInputs>(items: ReadonlyArray<ChatItem<TInputs>>): unknown {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === 'assistant' && item.plan !== null && !item.applied && !item.superseded) {
      return item.payload;
    }
  }
  return null;
}

/** Warning sintético cuando buildPlan rechaza la propuesta del modelo. */
const PROPOSAL_UNREADABLE_WARNING = 'La propuesta del modelo no se pudo interpretar.';

/** Primer mensaje user del camino guiado: el asistente conduce la entrevista. */
const GUIDED_PROMPT =
  'No conozco todos los datos. Guíame paso a paso, preguntándome lo que haga falta, para rellenar este cálculo.';

/** Primer mensaje user de la tarjeta de diagnóstico (solo con veredicto fail). */
const WHY_FAIL_PROMPT = '¿Por qué no cumple este cálculo y qué cambiarías para que cumpla?';

// Botones — mismo lenguaje visual que TitlePromptModal/AiFillModal.
const PRIMARY_STYLE = {
  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
  background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
};
const INLINE_BTN =
  'px-2.5 py-1 rounded border border-border-main text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40';

export function AiChatModal<TInputs>({
  adapter,
  current,
  results,
  onApply,
  onClose,
}: AiChatModalProps<TInputs>) {
  const { settings, activeKey, usingSharedKey } = useAiSettings();
  const { system: unitSystem } = useUnitSystem();

  const [items, setItems] = useState<ChatItem<TInputs>[]>([]);
  const [text, setText] = useState('');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [loading, setLoading] = useState(false);

  // Cancelación (molde AiFillModal/useSlopeSolver): el request-id invalida
  // promesas obsoletas y el AbortController corta la petición HTTP en vuelo.
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Ítem user recién añadido por send(): Cancelar lo retira del hilo y
  // restaura su texto/imágenes al composer. null en peticiones de Reintentar
  // (el ítem user ya existía de antes y debe conservarse).
  const pendingUserRef = useRef<{ id: string; text: string; images: LocalImage[] } | null>(null);
  // Claves de campo tratadas por el modelo en ESTE hilo (toda clave no-null de
  // cada proposal, aplicada o no). Alimenta la decoración del snapshot: sin
  // este registro, un valor confirmado que COINCIDE con el default de fábrica
  // jamás saldría de `sin_confirmar` y el asistente lo re-preguntaría en bucle
  // (ver pendingSnapshot.ts). Vive lo que el modal, como el historial.
  const confirmedKeysRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Envelope schema: solo depende del payload del adapter (memoizado). El
  // system prompt NO se memoiza: se reconstruye por turno con snapshot fresco.
  const schema = useMemo(() => buildChatSchema(adapter.payloadSchema), [adapter.payloadSchema]);

  // Anthropic tope los esquemas con >16 parámetros de unión (los módulos
  // grandes: zapatas, pilares HA, punzonamiento, forjados…). Con Anthropic
  // activo en uno de esos módulos, el asistente se DESHABILITA con un aviso que
  // remite a OpenAI/Gemini, en vez de dejar que la petición dé 400 o cuelgue.
  const anthropicUnsupported = useMemo(
    () => settings.provider === 'anthropic' && exceedsAnthropicUnionLimit(schema),
    [settings.provider, schema],
  );

  // Bloquear scroll del body + devolver el foco al disparador al cerrar
  // (patrón TitlePromptModal: el activeElement al montar es el botón que abrió
  // el modal — se captura antes de que el autofocus mueva el foco al textarea).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const trigger = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
  }, []);

  // Abort en unmount: invalida la corrida y corta la petición en vuelo.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refs mutables de cancelación (no nodos DOM): el cleanup debe leer el valor vigente
      reqIdRef.current++;
      abortRef.current?.abort();
    };
  }, []);

  // Autofocus del composer al montar y al terminar cada petición.
  useEffect(() => {
    if (!loading) textareaRef.current?.focus();
  }, [loading]);

  // Autoscroll al fondo del hilo con cada ítem nuevo (o pseudo-ítem de carga).
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, loading]);

  /**
   * Lanza un turno de chat con los ítems dados (deben terminar en user).
   * El system prompt se reconstruye AQUÍ con snapshot fresco de `current` y
   * el bloque de resultados fresco de `results` (nunca se memoiza).
   */
  const runRequest = (itemsForTurn: ReadonlyArray<ChatItem<TInputs>>) => {
    if (activeKey === null) return;
    const reqId = ++reqIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    // Snapshot decorado con la memoria del hilo: la propuesta acumulada viva
    // (pendientes_de_aplicar) y las claves ya confirmadas salen de
    // sin_confirmar — sin esto el modelo re-pregunta lo ya acordado.
    // Partido en bloque estable (cacheable) + volátil: el estado y los resultados
    // van SIEMPRE detrás de las reglas, que son idénticas turno a turno y es lo
    // que la caché de prompt reutiliza (ver ChatSystem en lib/ai/types).
    const system = buildChatSystemBlocks(
      adapter.label,
      adapter.promptRules,
      decorateSnapshot(
        adapter.snapshot(current),
        findPendingPayload(itemsForTurn),
        confirmedKeysRef.current,
      ),
      results.text,
      adapter.resultsRecalc, // undefined ⇒ 'auto' (reglas de siempre)
    );
    runChatTurn(settings.provider, activeKey, {
      system,
      schema,
      turns: buildChatTurns(itemsForTurn),
      cacheKey: `concreta-${adapter.id}`, // prefijo cacheado = el del módulo
      signal: controller.signal,
    })
      .then((envelope) => {
        if (reqId !== reqIdRef.current) return; // corrida obsoleta
        pendingUserRef.current = null;
        // Memoria del hilo ANTES de este turno: es la que ve buildPlan para
        // decidir si un valor está establecido (gate anti-ruido de safety.ts).
        // Tiene que ser la de ANTES: si se recogieran primero las claves de
        // ESTA propuesta, todo campo propuesto quedaría "confirmado" por sí
        // mismo, el gate no se cerraría nunca y la primera extracción saldría
        // sembrada de rojos.
        const confirmedBefore: ReadonlySet<string> = new Set(confirmedKeysRef.current);
        // Registro de claves tratadas — FUERA del updater (muta un ref).
        if (envelope.proposal !== null) {
          collectConfirmedKeys(envelope.proposal, confirmedKeysRef.current);
        }
        const itemId = nextItemId(); // fuera del updater (mutación de contador)
        // Lectura del pendiente + fusión + marcado de reemplazadas DENTRO del
        // MISMO updater funcional: si el usuario aplicó una tarjeta con la
        // petición en vuelo, `prev` ya lo refleja (sin carreras contra
        // itemsForTurn). Todo lo que corre aquí dentro es puro.
        setItems((prev) => {
          let plan: AiApplyPlan<TInputs> | null = null;
          let proposalError = false;
          let payload: unknown = null;
          let supersede = false;
          if (envelope.proposal !== null) {
            // Acumulación: la propuesta pendiente no aplicada se fusiona con la
            // nueva (lo nuevo gana). SOLO afecta a la tarjeta/plan — el
            // rawEnvelope de abajo conserva el envelope verbatim.
            const pending = findPendingPayload(prev);
            const effectivePayload =
              pending != null ? mergeProposalPayloads(pending, envelope.proposal) : envelope.proposal;
            try {
              plan = adapter.buildPlan(effectivePayload, current, unitSystem, confirmedBefore);
              payload = effectivePayload;
              supersede = pending != null;
            } catch {
              // buildPlan lanza (AiError 'bad-response' u otro fallo): el reply
              // sigue siendo útil → ítem assistant con warning sintético, sin
              // tarjeta; la tarjeta pendiente (si la había) sigue viva.
              plan = null;
              proposalError = true;
            }
          }
          const assistantItem: ChatItem<TInputs> = {
            id: itemId,
            kind: 'assistant',
            reply: envelope.reply,
            rawEnvelope: JSON.stringify(envelope), // verbatim para el historial
            plan,
            applied: false,
            payload,
            superseded: false,
            ...(proposalError ? { proposalError: true } : {}),
          };
          // Con pendiente arrastrado y plan bien construido, las tarjetas
          // anteriores con plan no aplicado quedan marcadas como reemplazadas:
          // solo la nueva (acumulada) permanece viva.
          const base = supersede
            ? prev.map((i) =>
                i.kind === 'assistant' && i.plan !== null && !i.applied
                  ? { ...i, superseded: true }
                  : i,
              )
            : prev;
          return [...base, assistantItem];
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (reqId !== reqIdRef.current) return; // cancelada/superada — no tocar estado
        pendingUserRef.current = null;
        if (err instanceof AiError && err.kind === 'aborted') {
          // La cancelación ya limpió (Cancelar restaura el composer) — sin ítem error.
          setLoading(false);
          return;
        }
        const errorItem: ChatItem<TInputs> = {
          id: nextItemId(),
          kind: 'error',
          errorKind: err instanceof AiError ? err.kind : 'unknown',
          detail: err instanceof Error && err.message !== '' ? err.message : null,
        };
        setItems((prev) => [...prev, errorItem]);
        setLoading(false);
      });
  };

  const canSend =
    activeKey !== null && !loading && !anthropicUnsupported && (text.trim() !== '' || images.length > 0);
  // El camino guiado no exige texto en el composer: solo key y ninguna petición
  // en vuelo (su mensaje user es la constante GUIDED_PROMPT).
  const canStartGuided = activeKey !== null && !loading && !anthropicUnsupported;

  /**
   * Añade un turno user con el texto/imágenes dados, limpia el composer y lanza
   * la petición. Es el único camino de envío: send() (composer) y el botón
   * guiado (GUIDED_PROMPT) pasan por aquí, de modo que el mensaje guiado se
   * comporta exactamente como si el usuario lo hubiera escrito y enviado.
   */
  const submit = (rawText: string, imgs: LocalImage[]) => {
    const trimmed = rawText.trim();
    const userItem: ChatItem<TInputs> = {
      id: nextItemId(),
      kind: 'user',
      text: trimmed,
      images: imgs.map((i) => i.attachment),
    };
    const nextItems = [...items, userItem];
    pendingUserRef.current = { id: userItem.id, text: trimmed, images: imgs };
    setItems(nextItems);
    setText('');
    setImages([]);
    runRequest(nextItems);
  };

  /** Envía el contenido del composer como nuevo turno user. */
  const send = () => {
    if (!canSend) return;
    submit(text, images);
  };

  /** Camino guiado del estado vacío: envía GUIDED_PROMPT como primer turno user. */
  const startGuided = () => {
    if (!canStartGuided) return;
    submit(GUIDED_PROMPT, []);
  };

  /** Tarjeta "¿Por qué no cumple?" del estado vacío (solo con veredicto fail):
   *  envía WHY_FAIL_PROMPT como primer turno user — mismo gate que el guiado. */
  const startWhyFail = () => {
    if (!canStartGuided) return;
    submit(WHY_FAIL_PROMPT, []);
  };

  /**
   * Cancela la petición en vuelo. Si la lanzó send(), retira el ítem user
   * recién añadido y restaura su texto/imágenes al composer (fusionando con lo
   * que el usuario haya escrito mientras tanto, sin superar MAX_IMAGES).
   * useCallback (deps vacías: solo refs y setters estables) para que el
   * listener de Escape no se reinstale en cada render.
   */
  const cancelInFlight = useCallback(() => {
    reqIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    const pending = pendingUserRef.current;
    pendingUserRef.current = null;
    if (pending !== null) {
      setItems((prev) => prev.filter((i) => i.id !== pending.id));
      setText((cur) => (cur.trim() === '' ? pending.text : `${pending.text}\n${cur}`));
      setImages((cur) => [...pending.images, ...cur].slice(0, MAX_IMAGES));
    }
    setLoading(false);
  }, []);

  /** Reintentar de un ítem error: lo elimina y relanza REUTILIZANDO el último
   *  ítem user existente (buildChatTurns garantiza la alternancia — nunca se
   *  añade otro turno user). */
  const retry = (errorId: string) => {
    if (activeKey === null || loading) return;
    const remaining = items.filter((i) => i.id !== errorId);
    pendingUserRef.current = null;
    setItems(remaining);
    runRequest(remaining);
  };

  /** Aplicar de una ProposalCard: el padre aplica y la tarjeta pasa a "Aplicado". */
  const handleApply = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.kind !== 'assistant' || item.plan === null || item.applied) return;
    onApply(item.plan);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId && i.kind === 'assistant' ? { ...i, applied: true } : i)),
    );
  };

  // Escape: con petición en vuelo cancela (no cierra); en reposo cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (loading) cancelInFlight();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose, cancelInFlight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Enter envía; Shift+Enter inserta salto de línea
      send();
    }
  };

  const addFiles = async (incoming: File[]) => {
    const slots = MAX_IMAGES - images.length;
    if (slots <= 0) {
      showToast(MAX_IMAGES_TOAST, { autoDismiss: 4000 });
      return;
    }
    if (incoming.length > slots) {
      showToast(MAX_IMAGES_OVERFLOW_TOAST, { autoDismiss: 4000 });
    }
    for (const file of incoming.slice(0, slots)) {
      try {
        const attachment = await prepareImage(file);
        setImages((prev) =>
          prev.length >= MAX_IMAGES ? prev : [...prev, { id: nextImageId(), attachment }],
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'No se pudo procesar la imagen.', {
          autoDismiss: 5000,
        });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite volver a seleccionar el mismo fichero
    if (files.length > 0) void addFiles(files);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null && f.type.startsWith('image/'));
    if (files.length > 0) {
      e.preventDefault(); // no pegar el nombre del fichero como texto
      void addFiles(files);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const providerLabel = AI_PROVIDER_LABELS[settings.provider];
  // Auto-crecimiento moderado del textarea: 2–5 filas según saltos de línea.
  const composerRows = Math.min(5, Math.max(2, text.split('\n').length));
  // El placeholder del adapter es un enunciado de ejemplo largo: se muestra
  // entero en el estado vacío del hilo (sin el prefijo "Ej.:"), no dentro del
  // textarea, donde se recortaba.
  const exampleText = adapter.placeholder.replace(/^Ej\.:\s*/i, '');

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center px-4"
      role="presentation"
    >
      {/* El clic en el backdrop NO cierra (patrón TitlePromptModal): evita
          perder la conversación por un clic accidental fuera. */}
      <div
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[640px] max-w-full h-[min(660px,85vh)] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-heading"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border-main shrink-0">
          <Sparkles size={16} className="text-accent" aria-hidden="true" />
          <span id="ai-chat-heading" className="text-sm font-medium text-text-primary">
            Rellenar con IA · {adapter.label}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Ajustes BYOK — arriba del hilo, fuera del scroll (auto-abierta sin key) */}
        <div className="px-5 pt-3 shrink-0">
          <ByokSettings />
        </div>

        {/* Aviso de módulo no soportado por Anthropic (>16 campos): el asistente
            queda bloqueado hasta cambiar de proveedor, justo arriba en BYOK. */}
        {anthropicUnsupported && (
          <div className="px-5 pt-3 shrink-0">
            <div className="flex items-start gap-2 rounded border border-state-warn/40 bg-state-warn/[0.06] px-3 py-2">
              <TriangleAlert
                size={14}
                className="text-state-warn shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-[12px] text-text-secondary leading-relaxed">
                <span className="text-text-primary font-medium">
                  {providerLabel} no admite este módulo.
                </span>{' '}
                Tiene demasiados campos para el motor de esquemas de Anthropic. Cambia el proveedor
                arriba a <span className="text-text-primary">OpenAI (GPT)</span> o{' '}
                <span className="text-text-primary">Google (Gemini)</span> para usar el asistente
                aquí.
              </p>
            </div>
          </div>
        )}

        {/* Hilo (scrollable, autoscroll al fondo) */}
        <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* Estado vacío: hasta tres caminos. (0) SOLO con veredicto fail, la
              tarjeta de diagnóstico ENVÍA WHY_FAIL_PROMPT como primer turno user
              ('invalid' NO la muestra: ese error ya se ve en el panel); (1) el
              ejemplo del módulo vive aquí (no en el placeholder, donde se
              recortaba) y rellena el composer al pulsarlo; (2) el guiado ENVÍA
              directamente GUIDED_PROMPT como primer turno user. */}
          {items.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-2">
              <Sparkles size={22} className="text-accent opacity-80" aria-hidden="true" />
              <p className="text-sm text-text-secondary max-w-[46ch] leading-relaxed">
                Pega el enunciado del problema (o una captura) y la IA propondrá los datos. Si no
                los tienes todos, pide que te guíe. Tú revisas y decides qué aplicar.
              </p>
              <div className="w-full max-w-[46ch] flex flex-col gap-2">
                {results.verdict === 'fail' && (
                  <button
                    type="button"
                    onClick={startWhyFail}
                    disabled={!canStartGuided}
                    className="w-full text-left rounded border border-state-fail/40 px-3 py-2 text-[12px] text-text-secondary leading-relaxed hover:border-state-fail/70 hover:text-text-primary transition-colors disabled:opacity-40 disabled:hover:border-state-fail/40 disabled:hover:text-text-secondary"
                  >
                    <span className="block text-[10px] uppercase tracking-wide text-text-disabled mb-1">
                      ¿Por qué no cumple?
                    </span>
                    El cálculo actual incumple alguna comprobación: pídeme el diagnóstico y qué
                    cambiar.
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setText(exampleText);
                    textareaRef.current?.focus();
                  }}
                  className="w-full text-left rounded border border-border-main px-3 py-2 text-[12px] text-text-secondary leading-relaxed hover:border-accent/40 hover:text-text-primary transition-colors"
                >
                  <span className="block text-[10px] uppercase tracking-wide text-text-disabled mb-1">
                    Pegar un enunciado de ejemplo
                  </span>
                  {exampleText}
                </button>
                <button
                  type="button"
                  onClick={startGuided}
                  disabled={!canStartGuided}
                  className="w-full text-left rounded border border-border-main px-3 py-2 text-[12px] text-text-secondary leading-relaxed hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40 disabled:hover:border-border-main disabled:hover:text-text-secondary"
                >
                  <span className="block text-[10px] uppercase tracking-wide text-text-disabled mb-1">
                    Guíame paso a paso
                  </span>
                  No sé todos los datos: te pregunto los datos uno a uno y te recomiendo los que
                  falten.
                </button>
              </div>
            </div>
          )}

          {items.map((item) => {
            if (item.kind === 'user') {
              return (
                <div key={item.id} className="flex flex-col items-end gap-1.5">
                  {item.images.length > 0 && (
                    <div className="flex gap-2">
                      {item.images.map((img, i) => (
                        <img
                          key={i}
                          src={`data:${img.mediaType};base64,${img.data}`}
                          alt="Imagen adjunta"
                          className="h-16 w-16 object-cover rounded border border-border-main"
                        />
                      ))}
                    </div>
                  )}
                  {item.text !== '' && (
                    <div className="max-w-[85%] rounded px-3 py-2 bg-bg-elevated border border-border-main text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                      {item.text}
                    </div>
                  )}
                </div>
              );
            }
            if (item.kind === 'assistant') {
              return (
                <div key={item.id} className="space-y-2">
                  <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    {item.reply}
                  </p>
                  {item.proposalError && (
                    <p className="flex items-start gap-1.5 text-[11px] text-state-warn leading-snug">
                      <TriangleAlert size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{PROPOSAL_UNREADABLE_WARNING}</span>
                    </p>
                  )}
                  {item.plan !== null && (
                    <ProposalCard
                      plan={item.plan}
                      applied={item.applied}
                      superseded={item.superseded}
                      onApply={() => handleApply(item.id)}
                    />
                  )}
                </div>
              );
            }
            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <TriangleAlert
                    size={16}
                    className="text-state-fail shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-text-primary flex-1">
                    {AI_ERROR_MESSAGES[item.errorKind]}
                  </p>
                  <button type="button" onClick={() => retry(item.id)} className={INLINE_BTN}>
                    Reintentar
                  </button>
                </div>
                {item.detail !== null && (
                  <p className="text-[11px] font-mono text-text-secondary leading-snug break-words pl-6">
                    {item.detail}
                  </p>
                )}
              </div>
            );
          })}

          {/* Pseudo-ítem de carga (petición en vuelo) */}
          {loading && (
            <div className="flex items-center gap-2.5">
              <span
                className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0"
                aria-hidden="true"
              />
              <span className="text-sm text-text-secondary flex-1">
                Consultando a {providerLabel}…
              </span>
              <button type="button" onClick={cancelInFlight} className={INLINE_BTN}>
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-5 py-3 border-t border-border-main shrink-0 space-y-2">
          {images.length > 0 && (
            <div className="flex gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative">
                  {/* Para la miniatura se monta el data URL; el attachment
                      guarda el base64 puro (contrato AiImageAttachment). */}
                  <img
                    src={`data:${img.attachment.mediaType};base64,${img.attachment.data}`}
                    alt="Imagen adjunta"
                    className="h-16 w-16 object-cover rounded border border-border-main"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    aria-label="Quitar imagen"
                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded bg-bg-surface border border-border-main text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES || anthropicUnsupported}
              aria-label="Adjuntar imagen"
              className="p-2 rounded border border-border-main text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40 shrink-0"
            >
              <ImagePlus size={16} aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTR}
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <textarea
              ref={textareaRef}
              rows={composerRows}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={anthropicUnsupported}
              placeholder={
                anthropicUnsupported
                  ? 'No disponible con Anthropic en este módulo'
                  : items.length === 0
                    ? 'Pega aquí el enunciado…'
                    : 'Escribe un mensaje…'
              }
              aria-label="Mensaje para el asistente"
              className="flex-1 min-w-0 bg-bg-primary border border-border-main rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent resize-none transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Enviar"
              className="p-2 rounded text-accent disabled:opacity-40 transition-all shrink-0"
              style={PRIMARY_STYLE}
            >
              <SendHorizontal size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="text-[11px] text-text-disabled leading-snug">
            Enter envía · Shift+Enter salto de línea · Ctrl+V pega capturas. Los mensajes se
            envían a {providerLabel} {usingSharedKey ? 'con la clave compartida de Concreta' : 'con tu API key'}.
          </p>
        </div>
      </div>
    </div>
  );
}

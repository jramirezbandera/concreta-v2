// Ventana conversacional del asistente IA. Genérica por módulo vía
// AiModuleAdapter<TInputs>: el hilo vive SOLO en memoria del modal; cada turno
// reconstruye el system prompt con un snapshot FRESCO del estado vivo y el
// bloque de resultados (`current` y `results` son props vivas — nunca se
// memoizan), envía el envelope schema (memoizado) y la ventana de turnos de
// buildChatTurns, y las propuestas se muestran como <ProposalCard> inline.
// Aplicar NO cierra la ventana (la tarjeta pasa a "Aplicado" y la conversación
// sigue).
//
// CONTENEDOR (rediseño 4a): un mismo componente con tres modos —slide-over
// acoplado al borde derecho (por defecto), ventana flotante arrastrable anclada
// abajo a la derecha (mismo patrón de arrastre que Calculator.tsx) y píldora
// minimizada en la esquina—. El modo y la posición de la ventana flotante
// persisten en localStorage (clave propia). En móvil cae como hoja inferior
// (bottom sheet) con arrastre para cerrar. Toda la lógica de chat (hilo,
// envío/cancelación, acumulación/fusión de propuestas, autoscroll, foco,
// Escape, adjuntos) se CONSERVA; lo que cambia es el chrome y la presentación.
//
// ACUMULACIÓN: las propuestas no aplicadas se fusionan en cliente — cada
// propuesta nueva se combina con la pendiente (lo nuevo gana,
// mergeProposalPayloads), las tarjetas anteriores pasan a `superseded` y
// siempre queda UNA tarjeta viva con todo lo acumulado. La fusión es SOLO de
// UI/plan: el historial hacia el modelo reenvía cada envelope verbatim.
//
// Cancelación con el patrón reqId + AbortController; las refs de cancelación se
// mutan SOLO en handlers/effects (React Compiler). SEGURIDAD: la API key nunca
// se loguea ni se interpola en textos/errores.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImagePlus,
  Mic,
  Minus,
  PanelRight,
  PictureInPicture2,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';
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
import {
  collectThreadValues,
  decorateSnapshot,
  establishedKeys,
} from '../../lib/ai/pendingSnapshot';
import type { AiApplyPlan, AiModuleAdapter } from '../../lib/ai/modules/types';
import { runChatTurn } from '../../lib/ai/providers';
import type { AiResultsSummary, AiVerdict } from '../../lib/ai/resultsSummary';
import { useAiSettings } from '../../lib/ai/useAiSettings';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSpeechDictation } from '../../hooks/useSpeechDictation';
import { useTheme } from '../../lib/theme/useTheme';
import { showToast } from '../ui/Toast';
import { ByokSettings } from './ByokSettings';
import { ProposalCard } from './ProposalCard';
import { ProviderStrip } from './ProviderStrip';

export interface AiChatModalProps<TInputs> {
  adapter: AiModuleAdapter<TInputs>;
  current: TInputs; // estado VIVO del módulo — snapshot por turno
  results: AiResultsSummary; // serializado por el padre; prop viva → frescura por turno
  onApply: (plan: AiApplyPlan<TInputs>) => void; // el padre aplica; la ventana NO se cierra
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

/** Modo del contenedor que persiste (la píldora es un sub-estado transitorio). */
type WindowMode = 'panel' | 'floating';

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
 * Última propuesta PENDIENTE del hilo: el ítem assistant más reciente con plan
 * construido, ni aplicado ni reemplazado. null si no hay nada pendiente (la
 * siguiente propuesta no arrastra nada y no hay rechazos que realimentar).
 */
function findPendingItem<TInputs>(
  items: ReadonlyArray<ChatItem<TInputs>>,
): Extract<ChatItem<TInputs>, { kind: 'assistant' }> | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === 'assistant' && item.plan !== null && !item.applied && !item.superseded) {
      return item;
    }
  }
  return null;
}

/** Payload de la última propuesta pendiente (el que se fusiona con la siguiente). */
function findPendingPayload<TInputs>(items: ReadonlyArray<ChatItem<TInputs>>): unknown {
  return findPendingItem(items)?.payload ?? null;
}

/** Warning sintético cuando buildPlan rechaza la propuesta del modelo. */
const PROPOSAL_UNREADABLE_WARNING = 'La propuesta del modelo no se pudo interpretar.';

/** Primer mensaje user del camino guiado: el asistente conduce la entrevista. */
const GUIDED_PROMPT =
  'No conozco todos los datos. Guíame paso a paso, preguntándome lo que haga falta, para rellenar este cálculo.';

/** Primer mensaje user de la tarjeta de diagnóstico (solo con veredicto fail). */
const WHY_FAIL_PROMPT = '¿Por qué no cumple este cálculo y qué cambiarías para que cumpla?';

/** Primer mensaje user de la sugerencia de predimensionado. */
const PREDIM_PROMPT =
  'Predimensiona este cálculo: propón unos valores que cumplan todas las comprobaciones con la geometría y las cargas actuales, y explícame brevemente el porqué.';

/** Altura de la topbar del shell (h-12): tope superior del slide-over/flotante. */
const TOPBAR_H = 48;

/** Persistencia del modo + posición de la ventana flotante. Clave propia. */
const UI_KEY = 'concreta-ai-assistant-ui';
interface UiState {
  mode: WindowMode;
  pos: { x: number; y: number } | null;
}
function readUi(): UiState {
  if (typeof window === 'undefined') return { mode: 'panel', pos: null };
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (raw === null) return { mode: 'panel', pos: null };
    const p = JSON.parse(raw) as { mode?: unknown; pos?: unknown };
    const mode: WindowMode = p.mode === 'floating' ? 'floating' : 'panel';
    const rawPos = p.pos as { x?: unknown; y?: unknown } | null | undefined;
    const pos =
      rawPos != null && typeof rawPos.x === 'number' && typeof rawPos.y === 'number'
        ? { x: rawPos.x, y: rawPos.y }
        : null;
    return { mode, pos };
  } catch {
    return { mode: 'panel', pos: null };
  }
}
function persistUi(v: UiState): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(UI_KEY, JSON.stringify(v));
  } catch {
    // persistencia opcional — el estado de la sesión sigue vivo
  }
}

const VERDICT_LABEL: Record<AiVerdict, string | null> = {
  ok: 'CUMPLE',
  warn: 'ADVERT.',
  fail: 'INCUMPLE',
  invalid: null,
};

// Botón secundario inline (Cancelar, Reintentar…) — lenguaje del sistema.
const INLINE_BTN =
  'px-2.5 py-1 rounded border border-border-main text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40';
// Botón de control de la cabecera (reducir/expandir/minimizar/cerrar).
const HEADER_BTN =
  'w-6 h-6 rounded grid place-items-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0';

export function AiChatModal<TInputs>({
  adapter,
  current,
  results,
  onApply,
  onClose,
}: AiChatModalProps<TInputs>) {
  const { settings, activeKey } = useAiSettings();
  const { system: unitSystem } = useUnitSystem();
  const isMobile = useIsMobile();
  const isDark = useTheme().theme === 'dark';

  const [items, setItems] = useState<ChatItem<TInputs>[]>([]);
  const [text, setText] = useState('');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);

  // Cancelación (molde AiFillModal/useSlopeSolver): el request-id invalida
  // promesas obsoletas y el AbortController corta la petición HTTP en vuelo.
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Ítem user recién añadido por send(): Cancelar lo retira del hilo y
  // restaura su texto/imágenes al composer. null en peticiones de Reintentar
  // (el ítem user ya existía de antes y debe conservarse).
  const pendingUserRef = useRef<{ id: string; text: string; images: LocalImage[] } | null>(null);
  // Campos tratados por el modelo en ESTE hilo: clave → PRIMER valor propuesto
  // (aplicado o no). Sus claves alimentan la decoración del snapshot —sin este
  // registro, un valor confirmado que COINCIDE con el default de fábrica jamás
  // saldría de `sin_confirmar` y el asistente lo re-preguntaría en bucle— y sus
  // valores, el gate anti-ruido de los riesgos vía establishedKeys (ver
  // pendingSnapshot.ts). Vive lo que el modal, como el historial.
  const threadValuesRef = useRef<Map<string, unknown>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  // Texto del composer en el instante en que arrancó el dictado: cada evento de
  // voz reescribe `base + transcrito`, de modo que el interino se ve en vivo sin
  // pisar lo ya escrito ni duplicarse.
  const dictationBaseRef = useRef('');

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

  // ── Estado del contenedor (modo, posición flotante, minimizado) ──
  const [mode, setMode] = useState<WindowMode>(() => readUi().mode);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => readUi().pos);
  const [minimized, setMinimized] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [sheetDrag, setSheetDrag] = useState<{ startY: number; dy: number } | null>(null);
  const [vp, setVp] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  // Ajustes BYOK: arrancan desplegados cuando no hay clave activa (no se puede
  // enviar sin ella) o cuando el módulo no lo admite con Anthropic (guiar al
  // usuario a cambiar de proveedor).
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(
    () => activeKey === null || anthropicUnsupported,
  );

  // Dictado por voz (Web Speech API, es-ES): cada evento reescribe el composer
  // con `base + transcrito`. Si el navegador no lo implementa, dictation.supported
  // es false y el micro no se pinta (degradación limpia; jsdom cae aquí, así que
  // los tests existentes no ven el botón).
  const dictation = useSpeechDictation({
    onTranscript: ({ final, interim }) => {
      setText(dictationBaseRef.current + final + interim);
    },
    onError: (error) => {
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        showToast('Permiso de micrófono denegado. Actívalo en el navegador para dictar.', {
          autoDismiss: 5000,
        });
      } else if (error === 'audio-capture') {
        showToast('No se detecta ningún micrófono.', { autoDismiss: 4000 });
      } else if (error === 'network') {
        showToast('Sin conexión para el reconocimiento de voz.', { autoDismiss: 4000 });
      }
    },
  });

  // Persistir modo + posición flotante entre sesiones.
  useEffect(() => {
    persistUi({ mode, pos });
  }, [mode, pos]);

  // Seguir el tamaño del viewport (dock de la ventana flotante + móvil).
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Bloqueo de scroll del body SOLO en modos "modales" (slide-over o hoja
  // inferior). En flotante/píldora el usuario sigue trabajando con la app.
  const scrollLocked = isMobile ? !minimized : mode === 'panel' && !minimized;
  useEffect(() => {
    if (!scrollLocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scrollLocked]);

  // Devolver el foco al disparador al cerrar (el activeElement al montar es el
  // botón que abrió la ventana — se captura antes del autofocus del textarea).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
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
    if (!loading && !minimized) textareaRef.current?.focus();
  }, [loading, minimized]);

  // Auto-ajuste de altura del composer a su contenido (1 línea vacío → ~5 máx):
  // sin esto el textarea forzaba un mínimo de 2 filas y, con la caja alineada
  // abajo, los botones quedaban descentrados respecto al placeholder. Depende
  // también de mode/minimized/isMobile: al recrearse el nodo entre modos hay
  // que recalcular su altura.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [text, mode, minimized, isMobile]);

  // Autoscroll al fondo del hilo con cada ítem nuevo (o pseudo-ítem de carga).
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, loading, minimized, mode]);

  // Arrastre de la ventana flotante (mecánica portada de Calculator.tsx).
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const t = 'touches' in e ? e.touches[0] : e;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 80, t.clientX - drag.dx)),
        y: Math.max(TOPBAR_H, Math.min(window.innerHeight - 60, t.clientY - drag.dy)),
      });
    };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [drag]);

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
    // (pendientes_de_aplicar), las claves ya confirmadas fuera de
    // sin_confirmar — sin esto el modelo re-pregunta lo ya acordado — y los
    // RECHAZOS del plan pendiente (errores_propuesta_anterior): sin ellos el
    // modelo no sabe que su propuesta se descartó ni por qué, y la reenvía
    // igual en bucle (el caso del veto estructural del FEM 2D).
    // Partido en bloque estable (cacheable) + volátil: el estado y los resultados
    // van SIEMPRE detrás de las reglas, que son idénticas turno a turno y es lo
    // que la caché de prompt reutiliza (ver ChatSystem en lib/ai/types).
    const pendingItem = findPendingItem(itemsForTurn);
    const system = buildChatSystemBlocks(
      adapter.label,
      adapter.promptRules,
      decorateSnapshot(
        adapter.snapshot(current),
        pendingItem?.payload ?? null,
        new Set(threadValuesRef.current.keys()),
        pendingItem?.plan?.skipped ?? [],
      ),
      results.text,
      adapter.resultsRecalc, // undefined ⇒ 'auto' (reglas de siempre)
    );
    runChatTurn(settings.provider, activeKey, {
      system,
      schema,
      turns: buildChatTurns(itemsForTurn, adapter.historyTurns),
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
        const threadBefore: ReadonlyMap<string, unknown> = new Map(threadValuesRef.current);
        // Registro de campos tratados — FUERA del updater (muta un ref).
        if (envelope.proposal !== null) {
          collectThreadValues(envelope.proposal, threadValuesRef.current);
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
              // `established`: de la memoria del hilo, todo SALVO lo que la
              // tarjeta VIVA arrastra sin cambio. Esa exención es la que evita
              // que una primera introducción salga en rojo a partir del 2º turno
              // (la tarjeta se fusiona y el plan se rehace entero cada turno);
              // `pending` es lo que la delimita, porque sin tarjeta viva una
              // propuesta repetida es nueva sobre un formulario que el usuario ha
              // podido corregir a mano, y sí hay que juzgarla.
              plan = adapter.buildPlan(
                effectivePayload,
                current,
                unitSystem,
                establishedKeys(threadBefore, effectivePayload, pending),
              );
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
  // Los caminos de sugerencia no exigen texto en el composer: solo key y
  // ninguna petición en vuelo (su mensaje user es una constante).
  const canStartGuided = activeKey !== null && !loading && !anthropicUnsupported;

  /**
   * Añade un turno user con el texto/imágenes dados, limpia el composer y lanza
   * la petición. Es el único camino de envío: send() (composer) y las
   * sugerencias (GUIDED/WHY_FAIL/PREDIM) pasan por aquí, de modo que un mensaje
   * de sugerencia se comporta exactamente como si el usuario lo hubiera escrito.
   */
  const submit = (rawText: string, imgs: LocalImage[]) => {
    if (dictation.listening) dictation.stop(); // el turno se va: cierra la escucha
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

  /** Micro del composer: alterna la escucha. Al arrancar fija como base el texto
   *  ya escrito (con separador para no pegar palabras), de modo que lo dictado se
   *  añade a lo que hubiera y no lo sustituye. */
  const toggleDictation = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    const needsSep = text !== '' && !/\s$/.test(text);
    dictationBaseRef.current = needsSep ? `${text} ` : text;
    dictation.start();
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

  /** Sugerencia de predimensionado: envía PREDIM_PROMPT — mismo gate. */
  const startPredim = () => {
    if (!canStartGuided) return;
    submit(PREDIM_PROMPT, []);
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

  // Atajo "A" para restaurar desde la píldora (solo minimizado y sin foco en
  // un campo de texto, para no secuestrar la escritura en la app).
  useEffect(() => {
    if (!minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      setMinimized(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [minimized]);

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
  // El placeholder del adapter es un enunciado de ejemplo largo: se muestra
  // entero en el estado vacío del hilo (sin el prefijo "Ej.:"), no dentro del
  // textarea, donde se recortaba.
  const exampleText = adapter.placeholder.replace(/^Ej\.:\s*/i, '');
  const verdictLabel = VERDICT_LABEL[results.verdict];
  const subtitle = verdictLabel ? `${adapter.label} · ${verdictLabel}` : adapter.label;
  const hasPending = findPendingPayload(items) != null;

  // Geometría de la ventana flotante (dock abajo-derecha si no hay posición
  // guardada; clamp al viewport para que un resize no la deje fuera).
  const floatW = Math.max(320, Math.min(400, vp.w - 32));
  const floatH = Math.max(360, Math.min(600, vp.h - 96));
  const rawPos = pos ?? {
    x: Math.max(8, vp.w - floatW - 16),
    y: Math.max(TOPBAR_H + 8, vp.h - floatH - 16),
  };
  const fx = Math.min(Math.max(8, rawPos.x), Math.max(8, vp.w - 80));
  const fy = Math.min(Math.max(TOPBAR_H, rawPos.y), Math.max(TOPBAR_H, vp.h - 60));

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const t = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    setDrag({ dx: t.clientX - fx, dy: t.clientY - fy });
  };
  const onSheetTouchStart = (e: React.TouchEvent) =>
    setSheetDrag({ startY: e.touches[0].clientY, dy: 0 });
  const onSheetTouchMove = (e: React.TouchEvent) => {
    if (!sheetDrag) return;
    setSheetDrag({ ...sheetDrag, dy: Math.max(0, e.touches[0].clientY - sheetDrag.startY) });
  };
  const onSheetTouchEnd = () => {
    if (!sheetDrag) return;
    if (sheetDrag.dy > 90) onClose();
    setSheetDrag(null);
  };

  // Elevación de las superficies flotantes. En el tema oscuro "Ónice" (negro casi
  // puro) la sombra slate del modo claro es INVISIBLE y `bg-surface` apenas se
  // despega del lienzo: en oscuro se levanta la superficie (degradado
  // elevated→surface), se define el filo con una hairline clara (luz desde
  // arriba) + realce interior, y la sombra pasa a negra real para dar profundidad.
  // Patrón alineado con la skin premium de Calculator.tsx.
  const floatBg = isDark
    ? 'linear-gradient(180deg, var(--color-bg-elevated), var(--color-bg-surface))'
    : undefined;
  const floatBorder = isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid var(--color-border-main)';
  const floatShadow = isDark
    ? '0 24px 64px -16px rgba(0,0,0,0.9), 0 8px 20px -10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)'
    : '0 30px 80px -16px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.05)';

  // ── Fragmentos compartidos por todos los modos ──

  const headerBrand = (
    <>
      <span
        className="w-[22px] h-[22px] rounded-[5px] text-accent grid place-items-center shrink-0"
        style={{ background: 'var(--color-tint-accent)' }}
      >
        <Sparkles size={13} aria-hidden="true" />
      </span>
      <div className="flex flex-col leading-tight min-w-0">
        <span id="ai-chat-heading" className="text-[13px] font-semibold text-text-primary">
          Asistente
        </span>
        <span className="text-[11px] font-mono text-text-disabled truncate">{subtitle}</span>
      </div>
    </>
  );

  const providerArea = (
    <div className="px-4 pt-3 shrink-0 space-y-2">
      <ProviderStrip
        open={providerSettingsOpen}
        onToggle={() => setProviderSettingsOpen((o) => !o)}
      />
      {providerSettingsOpen && <ByokSettings defaultOpen />}
    </div>
  );

  const anthropicWarning = anthropicUnsupported && (
    <div className="px-4 pt-2 shrink-0">
      <div
        className="flex items-start gap-2 rounded border border-state-warn/40 px-3 py-2"
        style={{ background: 'var(--color-tint-warn)' }}
      >
        <TriangleAlert size={14} className="text-state-warn shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[12px] text-text-secondary leading-relaxed">
          <span className="text-text-primary font-medium">{providerLabel} no admite este módulo.</span>{' '}
          Tiene demasiados campos para el motor de esquemas de Anthropic. Cambia el proveedor a{' '}
          <span className="text-text-primary">OpenAI (GPT)</span> o{' '}
          <span className="text-text-primary">Google (Gemini)</span> para usar el asistente aquí.
        </p>
      </div>
    </div>
  );

  const thread = (
    <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3.5">
      {/* Estado vacío: cabecera + sugerencias contextuales según el cálculo.
          Cada botón conserva su comportamiento (WHY_FAIL / ejemplo / GUIDED) y
          se añade Predimensionar. */}
      {items.length === 0 && !loading && (
        <div className="h-full flex flex-col justify-center gap-3">
          <div className="flex flex-col items-center text-center gap-2 pb-1">
            <span
              className="w-10 h-10 rounded-[11px] text-accent grid place-items-center"
              style={{ background: 'var(--color-tint-accent)' }}
            >
              <Sparkles size={19} aria-hidden="true" />
            </span>
            <span className="text-[14px] font-semibold text-text-primary">¿En qué te ayudo?</span>
            <span className="text-[11.5px] leading-relaxed text-text-secondary max-w-[34ch]">
              Puedo rellenar datos desde un enunciado, explicar por qué falla el cálculo o
              predimensionar. Tú revisas y decides qué aplicar.
            </span>
          </div>

          {results.verdict === 'fail' && (
            <button
              type="button"
              onClick={startWhyFail}
              disabled={!canStartGuided}
              className="w-full text-left rounded border border-state-fail/40 px-3 py-2.5 transition-colors disabled:opacity-40 hover:border-state-fail/70 disabled:hover:border-state-fail/40"
              style={{ background: 'var(--color-tint-fail)' }}
            >
              <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-state-fail mb-0.5">
                Diagnosticar · el cálculo incumple
              </span>
              <span className="block text-[11.5px] leading-snug text-text-secondary">
                ¿Por qué no cumple? Pídeme el diagnóstico y qué cambiar.
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={startPredim}
            disabled={!canStartGuided}
            className="w-full text-left rounded border border-border-main px-3 py-2.5 transition-colors disabled:opacity-40 hover:border-accent/40 disabled:hover:border-border-main"
          >
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-accent mb-0.5">
              Predimensionar
            </span>
            <span className="block text-[11.5px] leading-snug text-text-secondary">
              Propón unos valores que cumplan con estas cargas y geometría.
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setText(exampleText);
              textareaRef.current?.focus();
            }}
            className="w-full text-left rounded border border-border-main px-3 py-2.5 transition-colors hover:border-accent/40"
          >
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-disabled mb-0.5">
              Pegar un enunciado de ejemplo
            </span>
            <span className="block text-[11.5px] leading-snug text-text-secondary">{exampleText}</span>
          </button>
          <button
            type="button"
            onClick={startGuided}
            disabled={!canStartGuided}
            className="w-full text-left rounded border border-border-main px-3 py-2.5 transition-colors disabled:opacity-40 hover:border-accent/40 disabled:hover:border-border-main"
          >
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-disabled mb-0.5">
              Guíame paso a paso
            </span>
            <span className="block text-[11.5px] leading-snug text-text-secondary">
              No sé todos los datos: te pregunto uno a uno y recomiendo los que falten.
            </span>
          </button>
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
                <div className="max-w-[85%] rounded px-2.5 py-1.5 bg-bg-elevated border border-border-main text-[12.5px] text-text-primary whitespace-pre-wrap leading-relaxed">
                  {item.text}
                </div>
              )}
            </div>
          );
        }
        if (item.kind === 'assistant') {
          return (
            <div key={item.id} className="flex gap-2 items-start">
              <span
                className="w-[22px] h-[22px] rounded-[5px] text-accent grid place-items-center shrink-0 mt-0.5"
                style={{ background: 'var(--color-tint-accent)' }}
                aria-hidden="true"
              >
                <Sparkles size={12} />
              </span>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[12.5px] text-text-primary whitespace-pre-wrap leading-[1.55]">
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
            </div>
          );
        }
        return (
          <div key={item.id} className="flex gap-2 items-start">
            <span
              className="w-[22px] h-[22px] rounded-[5px] grid place-items-center shrink-0 mt-0.5 text-state-fail"
              style={{ background: 'var(--color-tint-fail)' }}
              aria-hidden="true"
            >
              <TriangleAlert size={12} />
            </span>
            <div
              className="flex-1 min-w-0 rounded-md border border-state-fail/40 px-3 py-2.5 space-y-2"
              style={{ background: 'var(--color-tint-fail)' }}
            >
              <p className="text-[12px] font-semibold text-state-fail">
                {AI_ERROR_MESSAGES[item.errorKind]}
              </p>
              {item.detail !== null && (
                <p className="text-[11px] font-mono text-text-secondary leading-snug break-words">
                  {item.detail}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => retry(item.id)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-state-fail/40 text-[12px] text-state-fail hover:bg-state-fail/10 transition-colors"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => setProviderSettingsOpen(true)}
                  className={INLINE_BTN}
                >
                  Cambiar proveedor
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Pseudo-ítem de carga (petición en vuelo): avatar + spinner + esqueleto. */}
      {loading && (
        <div className="flex gap-2 items-start">
          <span
            className="w-[22px] h-[22px] rounded-[5px] text-accent grid place-items-center shrink-0 mt-0.5"
            style={{ background: 'var(--color-tint-accent)' }}
            aria-hidden="true"
          >
            <Sparkles size={12} />
          </span>
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span
                className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0"
                aria-hidden="true"
              />
              <span className="text-[12.5px] text-text-secondary flex-1">
                Consultando a {providerLabel}…
              </span>
              <button type="button" onClick={cancelInFlight} className={INLINE_BTN}>
                Cancelar
              </button>
            </div>
            <div className="space-y-1.5" aria-hidden="true">
              <span className="block h-[9px] rounded-[3px] bg-bg-elevated w-full" />
              <span className="block h-[9px] rounded-[3px] bg-bg-elevated w-[88%]" />
              <span className="block h-[9px] rounded-[3px] bg-bg-elevated w-[64%]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const composer = (
    <div className="px-4 py-3 border-t border-border-main shrink-0 space-y-2">
      {images.length > 0 && (
        <div className="flex gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative">
              {/* Para la miniatura se monta el data URL; el attachment guarda el
                  base64 puro (contrato AiImageAttachment). */}
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
      {/* Composer unificado: adjuntar + textarea + enviar en una sola caja. */}
      <div
        className={`flex items-end gap-1.5 rounded-md border bg-bg-primary pl-2 pr-1.5 py-1.5 transition-colors ${
          composerFocused ? 'border-accent' : 'border-border-main'
        }`}
        style={composerFocused ? { boxShadow: '0 0 0 3px var(--color-tint-accent)' } : undefined}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={images.length >= MAX_IMAGES || anthropicUnsupported}
          aria-label="Adjuntar imagen"
          className="w-7 h-7 rounded-[5px] grid place-items-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40 shrink-0"
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
        {dictation.supported && !anthropicUnsupported && (
          <button
            type="button"
            onClick={toggleDictation}
            aria-label={dictation.listening ? 'Detener dictado' : 'Dictar por voz'}
            aria-pressed={dictation.listening}
            title={dictation.listening ? 'Detener dictado' : 'Dictar por voz (es-ES)'}
            className={`w-7 h-7 rounded-[5px] grid place-items-center shrink-0 transition-colors ${
              dictation.listening
                ? 'text-state-fail'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            }`}
            style={dictation.listening ? { background: 'var(--color-tint-fail)' } : undefined}
          >
            {dictation.listening ? (
              <span className="relative grid place-items-center">
                <span
                  className="absolute w-5 h-5 rounded-full animate-ping"
                  style={{
                    background: 'color-mix(in srgb, var(--color-state-fail) 35%, transparent)',
                  }}
                  aria-hidden="true"
                />
                <Mic size={16} className="relative" aria-hidden="true" />
              </span>
            ) : (
              <Mic size={16} aria-hidden="true" />
            )}
          </button>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          disabled={anthropicUnsupported}
          placeholder={
            anthropicUnsupported
              ? 'No disponible con Anthropic en este módulo'
              : items.length === 0
                ? 'Pega aquí el enunciado…'
                : 'Escribe un mensaje…'
          }
          aria-label="Mensaje para el asistente"
          className="flex-1 min-w-0 self-center bg-transparent text-[12.5px] text-text-primary placeholder:text-text-disabled outline-none resize-none py-1 leading-[1.4] max-h-[120px] overflow-y-auto disabled:opacity-50"
        />
        {loading ? (
          <button
            type="button"
            onClick={cancelInFlight}
            aria-label="Detener"
            className="w-7 h-7 rounded-[5px] grid place-items-center shrink-0 bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <Square size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Enviar"
            className="w-7 h-7 rounded-[5px] grid place-items-center shrink-0 text-white disabled:opacity-40 transition-all"
            style={{ background: 'var(--color-accent)' }}
          >
            <SendHorizontal size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="text-[10.5px] text-text-disabled leading-snug">
        {dictation.listening
          ? 'Escuchando… pulsa el micrófono para parar.'
          : 'Enter envía · Shift+Enter salto de línea · Ctrl+V pega capturas.'}
      </p>
    </div>
  );

  // ── Píldora minimizada (escritorio) ──
  if (minimized && !isMobile) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Restaurar asistente"
        className="fixed z-50 inline-flex items-center gap-2.5 h-[38px] px-3.5 rounded-md bg-bg-surface border border-border-main text-[12px] text-text-primary hover:border-accent/40 transition-colors"
        style={{
          right: 16,
          bottom: 16,
          background: floatBg,
          boxShadow: isDark
            ? '0 14px 30px -8px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 12px 24px -8px rgba(15,23,42,0.28)',
        }}
      >
        <span
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{
            background: 'var(--color-accent)',
            boxShadow: hasPending
              ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 30%, transparent)'
              : '0 0 6px color-mix(in srgb, var(--color-accent) 60%, transparent)',
          }}
        />
        <Sparkles size={14} className="text-accent" aria-hidden="true" />
        <span className="font-medium">Asistente</span>
        <span className="font-mono text-[10px] text-text-disabled border border-border-sub rounded px-1">
          A
        </span>
      </button>
    );
  }

  // ── Móvil: hoja inferior (bottom sheet) ──
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(15,23,42,0.28)' }}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-chat-heading"
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-bg-surface"
          style={{
            maxHeight: '86%',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            background: floatBg,
            borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : 'none',
            boxShadow: isDark
              ? '0 -18px 44px -18px rgba(0,0,0,0.75)'
              : '0 -18px 40px -20px rgba(15,23,42,0.4)',
            transform: sheetDrag ? `translateY(${sheetDrag.dy}px)` : 'translateY(0)',
            transition: sheetDrag ? 'none' : 'transform 0.22s cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          <div
            className="flex justify-center pt-2 pb-1 touch-none shrink-0"
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
          >
            <span className="block w-9 h-1 rounded-full bg-border-main" />
          </div>
          <div className="flex items-center gap-2.5 px-4 pb-2.5 border-b border-border-sub shrink-0">
            {headerBrand}
            <div className="flex-1" />
            <button type="button" onClick={onClose} aria-label="Cerrar" className={HEADER_BTN}>
              <X size={16} />
            </button>
          </div>
          {providerArea}
          {anthropicWarning}
          {thread}
          {composer}
        </div>
      </>
    );
  }

  // ── Ventana flotante arrastrable (modo B) ──
  if (mode === 'floating') {
    return (
      <div
        role="dialog"
        aria-labelledby="ai-chat-heading"
        className="fixed z-50 flex flex-col bg-bg-surface overflow-hidden"
        style={{
          left: fx,
          top: fy,
          width: floatW,
          height: floatH,
          borderRadius: 8,
          border: floatBorder,
          background: floatBg,
          boxShadow: floatShadow,
        }}
      >
        {/* Filo de acento superior (4a). */}
        <span
          className="h-0.5 shrink-0"
          style={{
            background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))',
          }}
          aria-hidden="true"
        />
        <div
          className="relative flex items-center gap-2 h-11 pl-3 pr-1.5 border-b border-border-sub shrink-0 cursor-move select-none"
          style={{ background: 'var(--color-bg-elevated)' }}
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
        >
          {headerBrand}
          <div className="flex-1" />
          <span className="font-mono text-[10px] text-text-disabled border border-border-main rounded px-1 py-px">
            Esc
          </span>
          <button
            type="button"
            title="Expandir a panel"
            aria-label="Expandir a panel"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMode('panel')}
            className={HEADER_BTN}
          >
            <PanelRight size={14} />
          </button>
          <button
            type="button"
            title="Minimizar"
            aria-label="Minimizar"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMinimized(true)}
            className={HEADER_BTN}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className={HEADER_BTN}
          >
            <X size={14} />
          </button>
        </div>
        {providerArea}
        {anthropicWarning}
        {thread}
        {composer}
      </div>
    );
  }

  // ── Slide-over acoplado al borde derecho (modo A, por defecto) ──
  return (
    <>
      {/* Velo tenue sobre el área de trabajo (sin blur). El clic NO cierra. */}
      <div
        className="fixed z-40"
        style={{ top: TOPBAR_H, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.18)' }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-heading"
        className="fixed z-50 flex flex-col bg-bg-surface"
        style={{
          top: TOPBAR_H,
          right: 0,
          bottom: 0,
          width: Math.min(440, vp.w),
          borderLeft: floatBorder,
          background: floatBg,
          boxShadow: isDark
            ? '-18px 0 44px -18px rgba(0,0,0,0.6)'
            : '-16px 0 40px -20px rgba(15,23,42,0.35)',
        }}
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-border-main shrink-0">
          {headerBrand}
          <div className="flex-1" />
          <button
            type="button"
            title="Reducir a esquina"
            aria-label="Reducir a esquina"
            onClick={() => setMode('floating')}
            className={HEADER_BTN}
          >
            <PictureInPicture2 size={15} />
          </button>
          <button type="button" title="Cerrar" aria-label="Cerrar" onClick={onClose} className={HEADER_BTN}>
            <X size={15} />
          </button>
        </div>
        {providerArea}
        {anthropicWarning}
        {thread}
        {composer}
      </div>
    </>
  );
}

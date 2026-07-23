// Dictado por voz nativo del navegador (Web Speech API) para el composer del
// asistente. Sin coste ni clave: la transcripción la hace el propio navegador
// (Chrome/Edge/Safari; Firefox NO la implementa → `supported === false` y el
// consumidor oculta el micro, degradación limpia). Idioma fijo es-ES.
//
// El hook NO toca ningún estado de texto: en cada evento emite el transcrito
// ACUMULADO desde que empezó la escucha, partido en `final` (segmentos ya
// cerrados) e `interim` (lo que aún se está reconociendo). El consumidor decide
// cómo insertarlo (aquí: texto_base + final + interim), de modo que el interino
// se ve en vivo en el input y se reescribe en cada evento sin duplicar.
//
// Modo continuo (toggle): Chrome corta la sesión por inactividad y dispara
// `onend`; mientras no sea una parada manual, se reanuda para que el dictado no
// se detenga solo. El acumulado `final` vive en un ref y persiste entre
// reinicios; el índice de resultados del evento se reinicia, por eso se recorre
// desde `resultIndex` acumulando solo los `isFinal` nuevos.
//
// REACT COMPILER: la instancia y los acumuladores viven en refs, mutados solo
// en handlers/effects. Los callbacks se leen desde refs frescas para no
// reinstalar los manejadores del reconocedor en cada render.
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Tipado mínimo de la Web Speech API (no está en la lib DOM estándar) ──
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechDictationOptions {
  /** Idioma BCP-47 del reconocimiento. Por defecto es-ES. */
  lang?: string;
  /** Transcrito acumulado desde el inicio de la escucha, en cada evento. */
  onTranscript: (update: { final: string; interim: string }) => void;
  /** Código de error del reconocedor (p. ej. 'not-allowed'). Los benignos
   *  ('no-speech'/'aborted') NO se reportan. */
  onError?: (error: string) => void;
}

export interface SpeechDictation {
  /** El navegador implementa la Web Speech API. */
  supported: boolean;
  /** Sesión de escucha activa. */
  listening: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useSpeechDictation(opts: SpeechDictationOptions): SpeechDictation {
  const { lang = 'es-ES' } = opts;
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef(''); // acumulado de segmentos cerrados (persiste entre reinicios)
  const manualStopRef = useRef(false); // parada del usuario → no reanudar en onend
  const listeningRef = useRef(false); // espejo síncrono de `listening` para handlers

  // Callbacks siempre frescos sin reinstalar los manejadores del reconocedor.
  // Sincronizados en un effect (no en render): los refs se mutan solo en
  // handlers/effects (convención React Compiler del proyecto).
  const onTranscriptRef = useRef(opts.onTranscript);
  const onErrorRef = useRef(opts.onError);
  useEffect(() => {
    onTranscriptRef.current = opts.onTranscript;
    onErrorRef.current = opts.onError;
  });

  const stop = useCallback(() => {
    manualStopRef.current = true;
    listeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (Ctor === null || listeningRef.current) return;
    // Instancia nueva por sesión: evita reconocedores zombie tras un error en
    // móvil (iOS reutiliza mal la misma instancia).
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    finalRef.current = '';
    manualStopRef.current = false;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) finalRef.current += transcript;
        else interim += transcript;
      }
      onTranscriptRef.current({ final: finalRef.current, interim });
    };
    rec.onerror = (event) => {
      // 'no-speech' (silencio) y 'aborted' (reinicio/stop) son benignos.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current?.(event.error);
      }
      // Sin permiso o sin micro no tiene sentido reanudar.
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture'
      ) {
        manualStopRef.current = true;
      }
    };
    rec.onend = () => {
      // Modo continuo: Chrome corta por inactividad. Reanuda salvo parada manual.
      if (!manualStopRef.current && listeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // start() lanza si aún no ha terminado de soltar el dispositivo.
        }
      }
      listeningRef.current = false;
      setListening(false);
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() lanza si ya había una sesión activa: el estado ya es el correcto.
      listeningRef.current = false;
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else start();
  }, [start, stop]);

  // Cortar el reconocedor al desmontar (cierre del modal, cambio de módulo…).
  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      listeningRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  return { supported, listening, start, stop, toggle };
}

// Botón del asistente IA en la topbar (rediseño 2026-07). Es el disparador
// GLOBAL del asistente: sustituye al botón "Rellenar con IA" que vivía en la
// columna de inputs de cada módulo. Cada módulo renderiza su propia Topbar y le
// pasa `onOpenAssistant`.
//
// Estilo (dir. B "outline fuerte"): NO usa relleno plano; lidera con el lenguaje
// de controles de la propia barra —tinte accent + borde accent + texto accent—
// pero en su versión MÁS marcada (tinte/borde más fuertes que "Exportar PDF"),
// de modo que sigue siendo el botón más destacado sin leer como CTA de SaaS.
// Encaja con la tesis "instrumento de precisión, no dashboard".
import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface AiButtonProps {
  onClick: () => void;
}

export function AiButton({ onClick }: AiButtonProps) {
  // Atajo "A": abre el asistente (espeja la "C" de la calculadora). Guardado
  // contra foco en campos de texto para no secuestrar la escritura; es no-op si
  // el asistente ya está abierto (el módulo gatea aiOpen) y convive con el atajo
  // "A" de la píldora (restaurar). Una sola Topbar montada ⇒ un solo listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      onClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClick]);

  return (
    <>
      {/* Móvil: icono, mismo tratamiento outline fuerte */}
      <button
        type="button"
        onClick={onClick}
        title="Asistente IA (A)"
        aria-label="Abrir asistente IA"
        className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded text-accent bg-accent/12 border border-accent/45 hover:bg-accent/20 transition-colors"
      >
        <Sparkles size={16} aria-hidden="true" />
      </button>

      {/* Escritorio: etiqueta + Sparkles */}
      <button
        type="button"
        onClick={onClick}
        title="Asistente IA (A)"
        aria-label="Abrir asistente IA"
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-accent bg-accent/12 border border-accent/45 hover:bg-accent/20 hover:border-accent/60 transition-colors"
      >
        <Sparkles size={14} aria-hidden="true" />
        Asistente IA
      </button>
    </>
  );
}

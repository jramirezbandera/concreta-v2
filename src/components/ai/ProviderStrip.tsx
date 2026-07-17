// Tira de proveedor del asistente IA (rediseño 4a): sustituye al bloque BYOK
// expandido por una línea compacta con el estado de la conexión (punto de
// color), el proveedor activo y el origen de la clave (compartida / propia), y
// una acción "Cambiar" que despliega los ajustes (<ByokSettings>) en el panel.
//
// SEGURIDAD: nunca muestra el VALOR de la key — solo su procedencia.
import { AI_PROVIDER_LABELS } from '../../lib/ai/models';
import { useAiSettings } from '../../lib/ai/useAiSettings';

interface ProviderStripProps {
  /** true si el panel de ajustes (<ByokSettings>) está desplegado. */
  open: boolean;
  onToggle: () => void;
}

const DOT_OK: React.CSSProperties = {
  background: 'var(--color-state-ok)',
  boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-state-ok) 15%, transparent)',
};
const DOT_FAIL: React.CSSProperties = { background: 'var(--color-state-fail)' };

export function ProviderStrip({ open, onToggle }: ProviderStripProps) {
  const { settings, activeKey, usingSharedKey } = useAiSettings();
  const hasKey = activeKey !== null;
  const keyLabel = usingSharedKey ? 'clave compartida' : hasKey ? 'tu API key' : 'sin clave';

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border-sub bg-bg-primary text-[11px] text-text-secondary">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={hasKey ? DOT_OK : DOT_FAIL}
        aria-hidden="true"
      />
      <span className="truncate">
        {AI_PROVIDER_LABELS[settings.provider]} ·{' '}
        <span className={`font-mono ${hasKey ? 'text-text-primary' : 'text-state-fail'}`}>
          {keyLabel}
        </span>
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="ml-auto shrink-0 text-[10.5px] text-accent hover:text-accent-hover transition-colors"
      >
        {open ? 'Ocultar' : 'Cambiar'}
      </button>
    </div>
  );
}

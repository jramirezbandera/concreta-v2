import type { ViewLayer, ViewState } from './types';

interface Props {
  onBackToLanding: () => void;
  view: ViewState;
  setView: (v: ViewState) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function FloatingControls({ onBackToLanding, view, setView, onUndo, onRedo, canUndo, canRedo }: Props) {
  const combos: { id: ViewState['combo']; label: string }[] = [
    { id: 'ELU', label: 'ELU' },
    { id: 'ELS_frec', label: 'ELS-frec' },
    { id: 'ELS_cp', label: 'ELS-cp' },
  ];
  const layers: { id: Exclude<ViewLayer, 'none'>; label: string; title: string }[] = [
    { id: 'M',         label: 'M',  title: 'Diagrama de momentos' },
    { id: 'V',         label: 'V',  title: 'Diagrama de cortantes' },
    { id: 'reactions', label: 'R',  title: 'Reacciones en apoyos' },
    { id: 'deformed',  label: 'δ',  title: 'Deformada' },
    { id: 'eta',       label: 'η%', title: 'Utilización η%' },
  ];
  const toggleLayer = (id: Exclude<ViewLayer, 'none'>) => {
    setView({ ...view, layer: view.layer === id ? 'none' : id });
  };
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          className="fem-ctrl-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px 6px',
            opacity: canUndo ? 1 : 0.35,
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5 L4 3 L4 7 Z" fill="currentColor" />
            <path d="M4 5 L8 5 a2 2 0 0 1 0 4 L6 9" />
          </svg>
        </button>
        <button
          className="fem-ctrl-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Shift+Z)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px 6px',
            opacity: canRedo ? 1 : 0.35,
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 5 L8 3 L8 7 Z" fill="currentColor" />
            <path d="M8 5 L4 5 a2 2 0 0 0 0 4 L6 9" />
          </svg>
        </button>
        <button
          className="fem-ctrl-btn"
          onClick={onBackToLanding}
          title="Cerrar cálculo y volver a plantillas"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2 L1 5 L4 8" />
            <path d="M1 5 L9 5" />
          </svg>
          <span className="font-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Plantillas
          </span>
        </button>
      </div>

      {/* Combinación envolvente */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-main)',
          borderRadius: 4,
          padding: 4,
        }}
        role="radiogroup"
        aria-label="Combinación visual"
      >
        <span
          className="font-mono"
          style={{ fontSize: 9, color: 'var(--color-text-disabled)', textTransform: 'uppercase', padding: '0 4px' }}
        >
          Comb
        </span>
        <div className="fem-seg" style={{ border: 'none' }}>
          {combos.map((c) => (
            <button
              key={c.id}
              className="fem-seg-btn"
              data-active={view.combo === c.id}
              role="radio"
              aria-checked={view.combo === c.id}
              onClick={() => setView({ ...view, combo: c.id })}
              style={{
                padding: '4px 8px',
                borderRight: '1px solid var(--color-border-sub)',
                transition: 'background-color 150ms ease-in-out, color 150ms ease-in-out',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fórmula de la combinación activa — feedback visual de coeficientes */}
      <ComboFormulaLabel combo={view.combo} />

      {/* Selector de capa única — toggle a 'none' al volver a pulsar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-main)',
          borderRadius: 4,
          padding: 4,
        }}
        role="radiogroup"
        aria-label="Capa visual"
      >
        <span
          className="font-mono"
          style={{ fontSize: 9, color: 'var(--color-text-disabled)', textTransform: 'uppercase', padding: '0 4px' }}
        >
          Capa
        </span>
        <div className="fem-seg" style={{ border: 'none' }}>
          {layers.map((l) => {
            const active = view.layer === l.id;
            return (
              <button
                key={l.id}
                className="fem-seg-btn"
                data-active={active}
                role="radio"
                aria-checked={active}
                title={l.title}
                onClick={() => toggleLayer(l.id)}
                style={{
                  padding: '4px 8px',
                  borderRight: '1px solid var(--color-border-sub)',
                  transition: 'background-color 150ms ease-in-out, color 150ms ease-in-out',
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ComboFormulaLabel({ combo }: { combo: ViewState['combo'] }) {
  // Per CTE Tabla 4.2 — formula skeleton (ψ values depend on per-load category).
  const meta: Record<ViewState['combo'], { name: string; formula: string; tooltip: string }> = {
    ELU: {
      name: 'ELU fundamental',
      formula: '1.35·G + 1.5·Q + 1.5·ψ₀·Qi',
      tooltip: 'Estado Límite Último (CTE Tabla 4.1): γG=1.35 sobre permanente; γQ=1.5 sobre la variable principal y γQ·ψ₀ sobre las concomitantes. Se evalúa la envolvente multiprincipal.',
    },
    ELS_frec: {
      name: 'ELS frecuente',
      formula: 'G + ψ₁·Q + ψ₂·Qi',
      tooltip: 'Estado Límite de Servicio frecuente (CTE Tabla 4.2): combinación para fisuración y deformaciones reversibles.',
    },
    ELS_cp: {
      name: 'ELS cuasi-permanente',
      formula: 'G + ψ₂·Q',
      tooltip: 'Estado Límite de Servicio cuasi-permanente: usado para deformaciones a largo plazo y fisuración por carga sostenida.',
    },
  };
  const m = meta[combo];
  return (
    <div
      style={{
        marginTop: -2,
        padding: '3px 6px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-sub)',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: 230,
      }}
      title={m.tooltip}
    >
      <span
        className="font-mono"
        style={{ fontSize: 9, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {m.name}
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 10, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}
      >
        {m.formula}
      </span>
    </div>
  );
}

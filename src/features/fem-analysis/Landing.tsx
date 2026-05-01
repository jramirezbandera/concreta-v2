// FEM 2D — Landing
//
// First screen the user sees when they enter /analisis/fem with no model in
// localStorage. Per design review Pass 1: 2 plantilla cards centered (Viga
// continua + Ménsula + Viga simple as V1) plus a Recientes list (max 5)
// when localStorage has prior models.

import { DESIGN_PRESETS, type DesignPresetId } from './presets';

interface RecentEntry {
  id: string;
  preset: DesignPresetId;
  ts: number;
  eta: number;
}

interface Props {
  onPick: (id: DesignPresetId) => void;
  recientes: RecentEntry[];
}

export function Landing({ onPick, recientes }: Props) {
  const v1Plantillas: DesignPresetId[] = ['continuous', 'cantilever', 'beam'];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div className="canvas-dot-grid" style={{ flex: 1, overflowY: 'auto', padding: '48px 56px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ marginBottom: 32 }}>
            <div className="font-mono" style={{
              fontSize: 11, color: 'var(--color-text-disabled)',
              letterSpacing: '0.15em', textTransform: 'uppercase',
            }}>
              Análisis · FEM 2D
            </div>
            <h1 style={{
              fontSize: 28, fontWeight: 600,
              color: 'var(--color-text-primary)',
              margin: '8px 0 6px', letterSpacing: '-0.01em',
            }}>
              Empieza con una plantilla
            </h1>
            <p style={{
              fontSize: 14, color: 'var(--color-text-secondary)',
              maxWidth: 640, lineHeight: 1.5, margin: 0,
            }}>
              Comienza desde una geometría tipo, ajusta luces y cargas, y obtén
              M·V·δ + comprobación HA / Acero según normativa española.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}>
            {v1Plantillas.map((id) => {
              const p = DESIGN_PRESETS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPick(id)}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 6,
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-main)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.background = 'var(--color-bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-main)';
                    e.currentTarget.style.background = 'var(--color-bg-surface)';
                  }}
                >
                  <div style={{
                    background: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border-sub)',
                    borderRadius: 4,
                    padding: '10px 8px',
                    height: 80,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PlantillaIcon id={id} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 3 }}>
                      {p.name}
                    </div>
                    <div className="font-mono" style={{
                      fontSize: 11, color: 'var(--color-text-disabled)',
                      lineHeight: 1.45,
                    }}>
                      {p.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {recientes.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="font-mono" style={{
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.07em', textTransform: 'uppercase',
                color: 'var(--color-text-disabled)',
                paddingBottom: 6,
                borderBottom: '1px solid var(--color-border-sub)',
                marginBottom: 8,
              }}>
                Recientes
              </div>
              {recientes.map((r) => {
                const p = DESIGN_PRESETS[r.preset];
                if (!p) return null;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onPick(r.preset)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%',
                      padding: '8px 12px', marginBottom: 4,
                      background: 'transparent',
                      border: '1px solid var(--color-border-sub)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-sub)')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{p.name}</span>
                      <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-text-disabled)' }}>
                        {new Date(r.ts).toLocaleString('es-ES')}
                      </span>
                    </div>
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-accent)' }}>
                      Abrir →
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlantillaIcon({ id }: { id: DesignPresetId }) {
  if (id === 'continuous') {
    return (
      <svg viewBox="0 0 240 60" width="100%" height="60">
        <line x1="20" y1="32" x2="220" y2="32" stroke="currentColor" strokeWidth="2.5" />
        {[20, 86, 154, 220].map((x) => (
          <polygon key={x} points={`${x},32 ${x - 5},44 ${x + 5},44`} fill="currentColor" />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            key={i}
            x1={26 + i * 22} y1="14" x2={26 + i * 22} y2="30"
            stroke="var(--color-state-warn)" strokeWidth="1"
          />
        ))}
        <line x1="20" y1="14" x2="220" y2="14" stroke="var(--color-state-warn)" strokeWidth="1" />
      </svg>
    );
  }
  if (id === 'cantilever') {
    return (
      <svg viewBox="0 0 240 60" width="100%" height="60">
        <line x1="40" y1="32" x2="220" y2="32" stroke="currentColor" strokeWidth="2.5" />
        <rect x="34" y="14" width="6" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="34" y1={16 + i * 9} x2="28" y2={20 + i * 9} stroke="currentColor" strokeWidth="0.7" />
        ))}
        <line x1="216" y1="12" x2="216" y2="28" stroke="var(--color-state-warn)" strokeWidth="1.5" />
      </svg>
    );
  }
  // beam
  return (
    <svg viewBox="0 0 240 60" width="100%" height="60">
      <line x1="20" y1="32" x2="220" y2="32" stroke="currentColor" strokeWidth="2.5" />
      <polygon points="20,32 14,44 26,44" fill="currentColor" />
      <circle cx="220" cy="44" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: 8 }).map((_, i) => (
        <line key={i} x1={32 + i * 25} y1="14" x2={32 + i * 25} y2="30" stroke="var(--color-state-warn)" strokeWidth="1" />
      ))}
      <line x1="26" y1="14" x2="216" y2="14" stroke="var(--color-state-warn)" strokeWidth="1" />
    </svg>
  );
}

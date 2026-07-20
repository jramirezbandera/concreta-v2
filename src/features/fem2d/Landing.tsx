// FEM 2D — Landing (template start screen)
//
// First screen the user sees when they enter /analisis/fem2d with no model in
// the URL nor localStorage (useFem2DState → startedEmpty). Mirrors the FEM 1D
// landing: a header, one card per parametric template (built with its
// FTUX-green defaults on pick), plus a "Descríbela con IA" card that opens the
// assistant over the seed model. Cards are purely presentational — all wiring
// (build-with-defaults / open-AI) lives in index.tsx.

import { Sparkles } from 'lucide-react';
import { FEM2D_TEMPLATES } from './templates';
import type { Fem2DRecentEntry } from './recents';
import type { Fem2DTemplateId } from './types';

interface Props {
  onPick: (id: Fem2DTemplateId) => void;
  /** Plantillas usadas recientemente (máx. 5), reabren de un clic. */
  recientes: Fem2DRecentEntry[];
  /** Abre el asistente IA sobre la semilla (sin haber elegido plantilla). */
  onStartAi?: () => void;
}

// Orden de presentación: de lo más común (pórtico) a lo más específico.
const TEMPLATE_ORDER: Fem2DTemplateId[] = ['portal-frame', 'gable', 'multistory', 'pratt-truss'];

export function Landing({ onPick, recientes, onStartAi }: Props) {
  return (
    <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
      <div className="canvas-dot-grid flex flex-col flex-1 overflow-y-auto px-14 py-12 max-md:px-5 max-md:py-8">
        <div style={{ maxWidth: 880, width: '100%', margin: 'auto' }}>
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
              Comienza desde un pórtico o cercha tipo, ajusta geometría y cargas,
              y obtén N·V·M·δ + comprobación de acero según normativa española.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}>
            {TEMPLATE_ORDER.map((id) => {
              const t = FEM2D_TEMPLATES[id];
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
                      {t.name}
                    </div>
                    <div className="font-mono" style={{
                      fontSize: 11, color: 'var(--color-text-disabled)',
                      lineHeight: 1.45,
                    }}>
                      {t.description}
                    </div>
                  </div>
                </button>
              );
            })}

            {onStartAi && (
              <button
                type="button"
                onClick={onStartAi}
                style={{
                  textAlign: 'left',
                  padding: 16,
                  borderRadius: 6,
                  background: 'var(--color-bg-surface)',
                  border: '1px dashed var(--color-border-main)',
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
                  color: 'var(--color-accent)',
                }}>
                  <Sparkles size={28} aria-hidden="true" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 3 }}>
                    Descríbela con IA
                  </div>
                  <div className="font-mono" style={{
                    fontSize: 11, color: 'var(--color-text-disabled)',
                    lineHeight: 1.45,
                  }}>
                    Cuéntale la estructura al asistente y la dibuja: nudos, barras, apoyos y cargas.
                  </div>
                </div>
              </button>
            )}
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
                const t = FEM2D_TEMPLATES[r.templateId];
                if (!t) return null;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onPick(r.templateId)}
                    className="max-md:min-h-11"
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
                      <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{t.name}</span>
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

// Miniaturas esquemáticas por plantilla (misma estética que el FEM 1D:
// estructura en currentColor, cargas en state-warn fino). viewBox 240×60.
function PlantillaIcon({ id }: { id: Fem2DTemplateId }) {
  if (id === 'portal-frame') {
    return (
      <svg viewBox="0 0 240 60" width="100%" height="60">
        {/* dintel */}
        <line x1="60" y1="16" x2="180" y2="16" stroke="currentColor" strokeWidth="2.5" />
        {/* pilares */}
        <line x1="60" y1="16" x2="60" y2="50" stroke="currentColor" strokeWidth="2.5" />
        <line x1="180" y1="16" x2="180" y2="50" stroke="currentColor" strokeWidth="2.5" />
        {/* empotramientos en base */}
        <line x1="48" y1="50" x2="72" y2="50" stroke="currentColor" strokeWidth="1.5" />
        <line x1="168" y1="50" x2="192" y2="50" stroke="currentColor" strokeWidth="1.5" />
        {/* carga repartida en el dintel */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={68 + i * 21} y1="4" x2={68 + i * 21} y2="14" stroke="var(--color-state-warn)" strokeWidth="1" />
        ))}
        <line x1="60" y1="4" x2="180" y2="4" stroke="var(--color-state-warn)" strokeWidth="1" />
      </svg>
    );
  }
  if (id === 'gable') {
    return (
      <svg viewBox="0 0 240 60" width="100%" height="60">
        {/* faldones a dos aguas */}
        <line x1="55" y1="26" x2="120" y2="10" stroke="currentColor" strokeWidth="2.5" />
        <line x1="120" y1="10" x2="185" y2="26" stroke="currentColor" strokeWidth="2.5" />
        {/* pilares */}
        <line x1="55" y1="26" x2="55" y2="50" stroke="currentColor" strokeWidth="2.5" />
        <line x1="185" y1="26" x2="185" y2="50" stroke="currentColor" strokeWidth="2.5" />
        {/* apoyos articulados */}
        <polygon points="55,50 49,58 61,58" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <polygon points="185,50 179,58 191,58" fill="none" stroke="currentColor" strokeWidth="1.3" />
        {/* nieve/carga sobre faldones */}
        {[70, 90, 110, 150, 170].map((x, i) => {
          const y = x <= 120 ? 26 - ((x - 55) / 65) * 16 : 10 + ((x - 120) / 65) * 16;
          return <line key={i} x1={x} y1={y - 10} x2={x} y2={y - 1} stroke="var(--color-state-warn)" strokeWidth="1" />;
        })}
      </svg>
    );
  }
  if (id === 'multistory') {
    return (
      <svg viewBox="0 0 240 60" width="100%" height="60">
        {/* dos plantas, un vano */}
        {[14, 32, 50].map((y) => (
          <line key={y} x1="80" y1={y} x2="160" y2={y} stroke="currentColor" strokeWidth="2.3" />
        ))}
        <line x1="80" y1="14" x2="80" y2="50" stroke="currentColor" strokeWidth="2.3" />
        <line x1="160" y1="14" x2="160" y2="50" stroke="currentColor" strokeWidth="2.3" />
        {/* empotramientos */}
        <line x1="70" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1.4" />
        <line x1="150" y1="50" x2="170" y2="50" stroke="currentColor" strokeWidth="1.4" />
        {/* viento por planta (horizontal) */}
        <line x1="60" y1="14" x2="78" y2="14" stroke="var(--color-state-warn)" strokeWidth="1" />
        <polygon points="78,14 72,11 72,17" fill="var(--color-state-warn)" />
        <line x1="64" y1="32" x2="78" y2="32" stroke="var(--color-state-warn)" strokeWidth="1" />
        <polygon points="78,32 72,29 72,35" fill="var(--color-state-warn)" />
      </svg>
    );
  }
  // pratt-truss
  return (
    <svg viewBox="0 0 240 60" width="100%" height="60">
      {/* cordones */}
      <line x1="40" y1="44" x2="200" y2="44" stroke="currentColor" strokeWidth="2.3" />
      <line x1="80" y1="20" x2="160" y2="20" stroke="currentColor" strokeWidth="2.3" />
      {/* montantes + diagonales */}
      <line x1="80" y1="44" x2="80" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="120" y1="44" x2="120" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="160" y1="44" x2="160" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="40" y1="44" x2="80" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="80" y1="20" x2="120" y2="44" stroke="currentColor" strokeWidth="1.5" />
      <line x1="160" y1="20" x2="120" y2="44" stroke="currentColor" strokeWidth="1.5" />
      <line x1="200" y1="44" x2="160" y2="20" stroke="currentColor" strokeWidth="1.5" />
      {/* apoyos */}
      <polygon points="40,44 34,52 46,52" fill="currentColor" />
      <circle cx="200" cy="50" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* carga de cubierta */}
      {[92, 120, 148].map((x, i) => (
        <line key={i} x1={x} y1="6" x2={x} y2="18" stroke="var(--color-state-warn)" strokeWidth="1" />
      ))}
      <line x1="80" y1="6" x2="160" y2="6" stroke="var(--color-state-warn)" strokeWidth="1" />
    </svg>
  );
}

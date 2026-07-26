// FEM 1D — pantalla de arranque.
//
// Primera pantalla al entrar en /analisis/fem sin modelo en localStorage: tres
// plantillas (viga continua, ménsula, viga simple), la tarjeta del asistente y
// la lista de recientes.
//
// El armazón es <TemplateLanding>, compartido con el FEM 2D: aquí solo quedan
// los croquis de las plantillas y los textos propios del módulo.

import type { JSX } from 'react';
import { TemplateLanding, type TemplateLandingItem } from '../../components/ui/TemplateLanding';
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
  /** Abre el asistente IA sin modelo previo (arranca sobre una semilla-plantilla). */
  onStartAi?: () => void;
}

const V1_PLANTILLAS: DesignPresetId[] = ['continuous', 'cantilever', 'beam'];

export function Landing({ onPick, recientes, onStartAi }: Props): JSX.Element {
  const items: TemplateLandingItem[] = V1_PLANTILLAS.map((id) => ({
    id,
    name: DESIGN_PRESETS[id].name,
    description: DESIGN_PRESETS[id].description,
    sketch: <PlantillaIcon id={id} />,
  }));

  return (
    <TemplateLanding
      eyebrow="Análisis · FEM 1D"
      subtitle="Comienza desde una geometría tipo, ajusta luces y cargas, y obtén M·V·δ + comprobación HA / Acero según normativa española."
      items={items}
      onPick={(id) => onPick(id as DesignPresetId)}
      ai={onStartAi ? {
        description: 'Cuéntale la viga al asistente y la dibuja: vanos, apoyos, cargas y secciones.',
        onStart: onStartAi,
      } : undefined}
      recientes={recientes
        .filter((r) => DESIGN_PRESETS[r.preset])
        .map((r) => ({ key: r.id, id: r.preset, name: DESIGN_PRESETS[r.preset].name, ts: r.ts }))}
    />
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

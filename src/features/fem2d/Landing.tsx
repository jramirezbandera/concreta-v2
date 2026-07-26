// FEM 2D — pantalla de arranque.
//
// Primera pantalla al entrar en /analisis/fem2d sin modelo en la URL ni en
// localStorage (useFem2DState → startedEmpty): una tarjeta por plantilla
// paramétrica (que al elegirla se construye con sus defaults FTUX-verde), la
// tarjeta del asistente y la lista de recientes. El cableado (construir con
// defaults / abrir la IA) vive en index.tsx.
//
// El armazón es <TemplateLanding>, compartido con el FEM 1D: aquí solo quedan
// los croquis de las plantillas y los textos propios del módulo.

import type { JSX } from 'react';
import { TemplateLanding, type TemplateLandingItem } from '../../components/ui/TemplateLanding';
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

export function Landing({ onPick, recientes, onStartAi }: Props): JSX.Element {
  const items: TemplateLandingItem[] = TEMPLATE_ORDER.map((id) => ({
    id,
    name: FEM2D_TEMPLATES[id].name,
    description: FEM2D_TEMPLATES[id].description,
    sketch: <PlantillaIcon id={id} />,
  }));

  return (
    <TemplateLanding
      eyebrow="Análisis · FEM 2D"
      subtitle="Comienza desde un pórtico o cercha tipo, ajusta geometría y cargas, y obtén N·V·M·δ + comprobación de acero según normativa española."
      items={items}
      onPick={(id) => onPick(id as Fem2DTemplateId)}
      ai={onStartAi ? {
        description: 'Cuéntale la estructura al asistente y la dibuja: nudos, barras, apoyos y cargas.',
        onStart: onStartAi,
      } : undefined}
      recientes={recientes
        .filter((r) => FEM2D_TEMPLATES[r.templateId])
        .map((r) => ({ key: r.id, id: r.templateId, name: FEM2D_TEMPLATES[r.templateId].name, ts: r.ts }))}
    />
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

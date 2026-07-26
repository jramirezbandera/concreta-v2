// FEM 2D — juego de herramientas del editor sobre la paleta COMPARTIDA
// (components/ui/ToolPalette). Aquí solo queda lo que es del pórtico: qué
// herramientas hay, sus iconos y qué significa cada tipo de carga.
//
// La paleta en sí (cromo, panel de cargas, cierre por clic fuera, borrador
// armado antes de colocar) la comparte con el FEM 1D.

import { useState, type JSX } from 'react';
import { ToolPalette, type PaletteTool } from '../../components/ui/ToolPalette';
import { ToolIcons } from '../../components/ui/toolIcons';
import {
  isLoadTool,
  isUdlTool,
  type LoadDraft2D,
  type LoadDrafts2D,
  type LoadToolId,
  type Tool2DId,
} from './modelOps';

const TOP_TOOLS: ReadonlyArray<PaletteTool<Tool2DId>> = [
  { id: 'select',  icon: <ToolIcons.Cursor />,  label: 'Seleccionar' },
  { id: 'node',    icon: <ToolIcons.Node />,    label: 'Añadir nudo' },
  { id: 'bar',     icon: <ToolIcons.Bar />,     label: 'Añadir barra' },
  { id: 'support', icon: <ToolIcons.Support />, label: 'Apoyo' },
];

const TAIL_TOOLS: ReadonlyArray<PaletteTool<Tool2DId>> = [
  { id: 'copy-props', icon: <ToolIcons.CopyProps />, label: 'Copiar propiedades entre barras' },
  { id: 'delete',     icon: <ToolIcons.Trash />,     label: 'Eliminar' },
];

const LOAD_TOOLS: ReadonlyArray<PaletteTool<Tool2DId>> = [
  { id: 'load-udl',   icon: <ToolIcons.LoadDist />,  label: 'Distribuida vertical (gravedad ↓)' },
  { id: 'load-udl-h', icon: <ToolIcons.LoadDistH />, label: 'Distribuida horizontal (viento →)' },
  { id: 'load-point', icon: <ToolIcons.Load />,      label: 'Puntual vertical (gravedad ↓)' },
  { id: 'load-h',     icon: <ToolIcons.LoadH />,     label: 'Puntual horizontal (viento →)' },
];

interface Props {
  tool: Tool2DId;
  setTool: (t: Tool2DId) => void;
  /** Valor + hipótesis armados de cada herramienta de carga (los guarda el shell). */
  loadDrafts: LoadDrafts2D;
  setLoadDraft: (tool: LoadToolId, draft: LoadDraft2D) => void;
}

export function ToolPalette2D({ tool, setTool, loadDrafts, setLoadDraft }: Props): JSX.Element {
  // Se recuerda el último tipo de carga elegido para que el botón siga
  // mostrándolo aunque la herramienta activa sea otra (ajuste durante el
  // render: sin effect y sin pasada obsoleta).
  const [lastLoad, setLastLoad] = useState<LoadToolId>('load-udl');
  const loadActive = isLoadTool(tool);
  if (loadActive && tool !== lastLoad) setLastLoad(tool);
  const armed: LoadToolId = loadActive ? tool : lastLoad;
  return (
    <ToolPalette
      tools={TOP_TOOLS}
      tailTools={TAIL_TOOLS}
      tool={tool}
      setTool={setTool}
      loadFamily={{
        tools: LOAD_TOOLS,
        armed,
        draft: loadDrafts[armed],
        onDraftChange: (d) => setLoadDraft(armed, d as LoadDraft2D),
        isUdl: (id) => isUdlTool(id as LoadToolId),
        target: (id) => (isUdlTool(id as LoadToolId) ? 'una barra' : 'un nudo o una barra'),
      }}
    />
  );
}

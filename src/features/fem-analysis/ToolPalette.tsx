// FEM 1D — juego de herramientas del editor sobre la paleta COMPARTIDA
// (components/ui/ToolPalette). Aquí solo queda lo propio de la tira: qué
// herramientas hay y qué tipos de carga admite.
//
// Sin cargas horizontales: el modelo es una banda con todos los nudos en y=0 y
// las acciones que se dibujan son verticales. El menú tiene por tanto dos
// entradas, no las cuatro del pórtico.

import { useState, type JSX } from 'react';
import { ToolPalette as SharedToolPalette, type LoadDraft, type PaletteTool } from '../../components/ui/ToolPalette';
import { ToolIcons } from '../../components/ui/toolIcons';
import { isLoadTool, type LoadDrafts, type LoadToolId } from './loadDrafts';
import type { ToolId } from './types';

const TOP_TOOLS: ReadonlyArray<PaletteTool<ToolId>> = [
  { id: 'select',  icon: <ToolIcons.Cursor />,  label: 'Seleccionar' },
  { id: 'node',    icon: <ToolIcons.Node />,    label: 'Añadir nodo' },
  { id: 'bar',     icon: <ToolIcons.Bar />,     label: 'Añadir barra' },
  { id: 'support', icon: <ToolIcons.Support />, label: 'Apoyo' },
];

const TAIL_TOOLS: ReadonlyArray<PaletteTool<ToolId>> = [
  { id: 'delete', icon: <ToolIcons.Trash />, label: 'Eliminar' },
];

const LOAD_TOOLS: ReadonlyArray<PaletteTool<ToolId>> = [
  { id: 'load-dist',  icon: <ToolIcons.LoadDist />, label: 'Distribuida (gravedad ↓)' },
  { id: 'load-point', icon: <ToolIcons.Load />,     label: 'Puntual (gravedad ↓)' },
];

interface Props {
  tool: ToolId;
  setTool: (t: ToolId) => void;
  loadDrafts: LoadDrafts;
  setLoadDraft: (tool: LoadToolId, draft: LoadDraft) => void;
}

export function ToolPalette({ tool, setTool, loadDrafts, setLoadDraft }: Props): JSX.Element {
  const [lastLoad, setLastLoad] = useState<LoadToolId>('load-dist');
  const loadActive = isLoadTool(tool);
  if (loadActive && tool !== lastLoad) setLastLoad(tool);
  const armed: LoadToolId = loadActive ? tool : lastLoad;

  return (
    <SharedToolPalette
      tools={TOP_TOOLS}
      tailTools={TAIL_TOOLS}
      tool={tool}
      setTool={setTool}
      loadFamily={{
        tools: LOAD_TOOLS,
        armed,
        draft: loadDrafts[armed],
        onDraftChange: (d) => setLoadDraft(armed, d),
        isUdl: (id) => id === 'load-dist',
        target: (id) => (id === 'load-dist' ? 'una barra' : 'un nudo o una barra'),
      }}
    />
  );
}

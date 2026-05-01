import { FemIcons } from './icons';
import type { ToolId } from './types';

interface ToolDef { id: ToolId; icon: React.ReactNode; label: string }

export function ToolPalette({ tool, setTool }: { tool: ToolId; setTool: (t: ToolId) => void }) {
  const tools: ToolDef[] = [
    { id: 'select',  icon: <FemIcons.Cursor />,  label: 'Seleccionar' },
    { id: 'node',    icon: <FemIcons.Node />,    label: 'Añadir nodo' },
    { id: 'support', icon: <FemIcons.Support />, label: 'Apoyo' },
    { id: 'load',    icon: <FemIcons.Load />,    label: 'Carga' },
    { id: 'delete',  icon: <FemIcons.Trash />,   label: 'Eliminar' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-main)',
        borderRadius: 4,
      }}
    >
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={t.label}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          className="fem-tool-btn"
          data-active={tool === t.id ? 'true' : 'false'}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

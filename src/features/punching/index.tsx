import { useMemo, useState } from 'react';
import { punchingDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDrawer } from '../../components/layout/AppShell';
import { calcPunching } from '../../lib/calculations/punching';
import { Topbar } from '../../components/layout/Topbar';
import { PunchingInputsPanel } from './PunchingInputs';
import { PunchingResults } from './PunchingResults';
import { PunchingSVG } from './PunchingSVG';

export function PunchingModule() {
  const { state, setField } = useModuleState('punching', punchingDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<'inputs' | 'results' | 'esquema'>('inputs');

  const result = useMemo(() => calcPunching(state), [state]);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Punzonamiento"
        moduleGroup="Hormigón"
        onMenuOpen={openDrawer}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs panel */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden',
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4 pb-20 md:pb-4">
            <PunchingInputsPanel state={state} setField={setField} />
          </div>
        </div>

        {/* Right: SVG canvas + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'md:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          {/* SVG canvas — desktop only (mobile has 'Esquema' tab) */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <PunchingSVG inp={state} result={result} width={Math.min(svgW, 440)} mode="screen" />
          </div>

          {/* Results */}
          <div className="px-6 py-5 pb-20 md:pb-5">
            <PunchingResults result={result} />
          </div>
        </div>

        {/* Mobile: Esquema tab — SVG only */}
        {tab === 'esquema' && (
          <div className="flex-1 overflow-y-auto scroll-hide canvas-dot-grid pb-20 md:hidden flex flex-col items-center py-4 px-4 gap-4">
            <PunchingSVG inp={state} result={result} width={Math.min(340, 340)} mode="screen" />
          </div>
        )}

      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 md:hidden flex border-t border-border-main bg-bg-surface z-10"
        aria-label="Secciones"
      >
        <button
          onClick={() => setTab('inputs')}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'inputs' ? 'text-accent' : 'text-text-secondary'}`}
        >
          Datos
        </button>
        <button
          onClick={() => setTab('esquema')}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'esquema' ? 'text-accent' : 'text-text-secondary'}`}
        >
          Esquema
        </button>
        <button
          onClick={() => setTab('results')}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'results' ? 'text-accent' : 'text-text-secondary'}`}
        >
          Resultados
        </button>
      </nav>
    </div>
  );
}

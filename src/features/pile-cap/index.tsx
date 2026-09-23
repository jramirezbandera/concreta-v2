import { useMemo, useState } from 'react';
import { pileCapDefaults, type PileCapInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcPileCap } from '../../lib/calculations/pileCap';
import { exportPileCapPDF, pileCapFallbackFilename } from '../../lib/pdf/pileCap';
import { encepadoFallbackDxf } from '../../lib/export/filename';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { pileCapAdapter, summarizePileCapResults, PILE_CAP_APPLY_ORDER } from '../../lib/ai/modules/pileCap';
import { Topbar } from '../../components/layout/Topbar';
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { GRUPO_ANEJO_CALCULO, type IdAnejo } from '../../components/layout/opcionAnejo';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { useAsistenteDeModulo } from '../../components/ai/useAsistenteDeModulo';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { PileCapInputsPanel } from './PileCapInputsPanel';
import { PileCapResults } from './PileCapResults';
import { PileCapSVG } from './PileCapSVG';
import { PileCapRebarSVG } from './PileCapRebarSVG';

// Dos vistas del lienzo, como en el módulo de muros: el modelo de bielas y
// tirantes y el armado (planta y secciones con la armadura dispuesta).
type PileCapView = 'model' | 'rebar';
const VIEW_TABS: { id: PileCapView; num: string; label: string; color: string }[] = [
  { id: 'model', num: '1', label: 'Modelo',  color: '#38bdf8' },
  { id: 'rebar', num: '2', label: 'Armado',  color: '#64748b' },
];

/**
 * Dos salidas, y son dos documentos distintos: el PDF es la memoria del cálculo
 * —datos, modelo de bielas y tirantes y comprobaciones— y el DXF es el plano
 * tipo del estudio con la tabla rellena, para insertarlo en el de cimentación.
 * El detalle no comprueba nada ni lleva las utilizaciones: dice qué hay que
 * poner en obra.
 */
type FormatoId = 'pdf' | 'dxf' | IdAnejo;

const GRUPOS_EXPORTAR: GrupoExportar<FormatoId>[] = [
  {
    titulo: 'Cálculo',
    opciones: [{ id: 'pdf', etiqueta: 'PDF', detalle: 'la memoria con las comprobaciones' }],
  },
  {
    titulo: 'Detalle de plano',
    opciones: [{ id: 'dxf', etiqueta: 'DXF', detalle: 'el plano tipo acotado, para insertar en el CAD' }],
  },
  GRUPO_ANEJO_CALCULO,
];

function ViewTabButton({
  active, num, label, color, onClick,
}: { active: boolean; num: string; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex items-center gap-2 px-3 py-2 border-r border-border-main transition-colors text-left',
        active ? 'bg-bg-primary' : 'bg-bg-surface hover:bg-bg-elevated/70',
      ].join(' ')}
    >
      <span
        className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono font-semibold transition-colors"
        style={{
          background: active ? `${color}22` : 'var(--color-bg-elevated)',
          color:      active ? color : 'var(--color-text-secondary)',
          border:     `1px solid ${active ? `${color}66` : 'var(--color-border-main)'}`,
        }}
      >
        {num}
      </span>
      <span
        className={[
          'text-[11.5px] font-medium tracking-tight whitespace-nowrap transition-colors',
          active ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary',
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  );
}

export function PileCapModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('pile-cap', pileCapDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<PileCapView>('model');

  // "Rellenar con IA" (ola 1)
  const asistente = useAsistenteDeModulo();

  // Aplica el plan confirmado en AiChatModal. ORDER del contrato con `n`
  // PRIMERO: decide las posiciones de los pilotes y qué tirantes existen. El
  // modal NO se cierra al aplicar (la conversación sigue).
  //
  // El orden —que es además LISTA BLANCA— lo trae el adaptador: un campo que
  // el mapper sepa proponer y que no esté en ella se caería en silencio, así
  // que las dos cosas viven juntas y hay un test que lo vigila.
  const handleAiApply = (plan: AiApplyPlan<PileCapInputs>) => {
    for (const k of PILE_CAP_APPLY_ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as PileCapInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const result = useMemo(() => calcPileCap(state), [state]);
  // Resumen de resultados para el prompt del chat IA (bucle de dimensionado)
  const aiResults = useMemo(() => summarizePileCapResults(result), [result]);

  const {
    pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview,
    titleOpen, openExport, confirmTitle, closeTitle, propsTitulo, anejoDialogo,
  } =
    useTitledPdfExport({
      exportFn: (title) => exportPileCapPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  /**
   * El DXF no se previsualiza —no hay visor de CAD en el navegador—, así que
   * confirmar el título genera y descarga en el mismo gesto. De ahí el segundo
   * hook: el del PDF abre la previsualización y este no.
   */
  // El detalle NO sale con comprobaciones en rojo. El PDF las enseña y el
  // lector ve el INCUMPLE; el DXF sólo dice qué poner en obra, y un plano de
  // un encepado que no verifica no debería poder salir de aquí sin que nadie
  // lo note. Los avisos (warn) no bloquean: son recomendaciones.
  const fallos = result.checks.filter((c) => c.status === 'fail');
  const motivoBloqueo = !result.valid
    ? (result.error ?? 'Los datos de entrada no son válidos')
    : `No se exporta el detalle: no cumple ${fallos
        .slice(0, 2)
        .map((c) => c.description)
        .join('; ')}${fallos.length > 2 ? ` y ${fallos.length - 2} más` : ''}`;
  const dxf = useTitledFileExport({
    // El `import()` va DENTRO del manejador: la plantilla y el relleno no
    // pintan nada hasta que alguien pulsa DXF.
    exportFn: async (titulo) => {
      const { exportarEncepadoDxf } = await import('../../lib/dxf/encepado');
      return exportarEncepadoDxf(state, result, titulo);
    },
    valid: result.valid && fallos.length === 0,
    onTitleChange: (t) => setField('title', t),
    formatoLabel: 'DXF',
    invalidMessage: motivoBloqueo,
  });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;
  // Mobile "Diagramas" tab measures its own container so the SVG scales to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(440, Math.max(200, mobileCanvasWidth - 32)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Encepados"
        moduleGroup="Cimentación"
        exportMenu={
          <ExportarMenu
            grupos={GRUPOS_EXPORTAR}
            onElegir={(f) => (f === 'dxf' ? dxf.openExport() : openExport(f))}
            exportando={pdfExporting || dxf.exportando}
          />
        }
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs panel */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
            'lg:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
            <PileCapInputsPanel
              state={state}
              setField={setField}
              nBarMin={{ x: result.n_bars_min_x, y: result.n_bars_min_y }}
            />
          </div>
          <div className="hidden lg:block px-5 py-3 border-t border-border-main shrink-0">
            <button
              onClick={reset}
              className="text-[11px] text-text-disabled hover:text-text-secondary transition-colors"
              type="button"
            >
              Restablecer valores
            </button>
          </div>
        </div>

        {/* Right: SVG + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          {/* View tabs (desktop) */}
          <div className="hidden lg:flex items-center bg-bg-surface border-b border-border-main">
            {VIEW_TABS.map((t) => (
              <ViewTabButton
                key={t.id}
                active={view === t.id}
                num={t.num}
                label={t.label}
                color={t.color}
                onClick={() => setView(t.id)}
              />
            ))}
          </div>

          {/* SVG canvas — desktop */}
          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-90 items-start"
          >
            {/* El tope de 440 px deja más de la mitad del lienzo en puntos
              * vacíos, y el SVG es lo que este módulo enseña. Subirlo a secas
              * NO es la solución: las dos vistas se apilan, así que a 720 px la
              * sección se va por debajo del pliegue y deja de verse junto a la
              * planta (medido: 895 px de dibujo en 618 de lienzo). Lo que pide
              * un lienzo apaisado es poner planta y sección UNA AL LADO DE LA
              * OTRA a partir de ~900 px, como ya hace la vista de armado con
              * sus dos plantas. Ver el informe de /design-review. */}
            {view === 'model'
              ? <PileCapSVG inp={state} result={result} width={Math.min(svgW, 440)} mode="screen" />
              : <PileCapRebarSVG inp={state} result={result} width={Math.min(svgW, 440)} mode="screen" />}
          </div>

          {/* Results */}
          <div className="px-2 py-3">
            <PileCapResults inp={state} result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col py-3 gap-3">
            <div className="flex items-stretch bg-bg-surface border-y border-border-main">
              {VIEW_TABS.map((t) => (
                <ViewTabButton
                  key={t.id}
                  active={view === t.id}
                  num={t.num}
                  label={t.label}
                  color={t.color}
                  onClick={() => setView(t.id)}
                />
              ))}
            </div>
            <div ref={mobileCanvasRef} className="flex flex-col items-center px-4 gap-4 canvas-dot-grid">
              {view === 'model'
                ? <PileCapSVG inp={state} result={result} width={mobileW} mode="screen" />
                : <PileCapRebarSVG inp={state} result={result} width={mobileW} mode="screen" />}
            </div>
          </div>
        )}

      </div>

      {/* Hidden PDF clone — off-screen, for svg2pdf */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="pile-cap-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <PileCapSVG inp={state} result={result} mode="pdf" width={320} />
        </div>
        <div
          id="pile-cap-rebar-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <PileCapRebarSVG inp={state} result={result} mode="pdf" width={560} />
        </div>
      </div>

      {asistente.sesion && (
        <AiChatModal
          key={asistente.claveSesion}
          adapter={pileCapAdapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={pileCapFallbackFilename(state)}
          exporting={pdfExporting}
          {...propsTitulo}
          onConfirm={confirmTitle}
          onCancel={closeTitle}
        />
      )}

      {/* El nombre de la obra, si guardar en el anejo tiene que crearla. */}
      {anejoDialogo}

      {dxf.titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={encepadoFallbackDxf(state.n)}
          exporting={dxf.exportando}
          formatLabel="DXF"
          extension="dxf"
          onConfirm={dxf.confirmTitle}
          onCancel={dxf.closeTitle}
        />
      )}

      {pdfPreview && (
        <PdfPreviewModal
          blobUrl={pdfPreview.blobUrl}
          filename={pdfPreview.filename}
          pageCount={pdfPreview.pageCount}
          onDownload={handleDownloadPdf}
          onClose={closePdfPreview}
        />
      )}
    </div>
  );
}

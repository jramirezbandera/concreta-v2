/**
 * Cargas por planta — orquestador del módulo.
 *
 * Tercer módulo del capítulo Acciones y el primero que CONSUME una
 * publicación: la nieve de las cubiertas se toma del sobre de Viento y nieve,
 * y el cuadro de acciones del plano ensambla el bloque de viento con lo que
 * publica aquel módulo. Cada cambio se guarda en su clave de localStorage y,
 * si el resultado está listo, se publica en `concreta-pub-cargas-planta`.
 *
 * Una sola pantalla: la barra de la obra, la tabla de plantas y zonas con la
 * sección del edificio al lado, las cargas lineales y las notas de la norma.
 * No hay previsualización de documentos —el cuadro (Excel) y la memoria (Word)
 * se exportan desde la barra superior, cada uno con su botón—, porque las
 * pestañas duplicaban lo que ya entrega la exportación.
 */

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import {
  cuadroAccionesPlanoCargas,
  cuadroCargasMemoria,
  cuadroPredimensionado,
  seccionesCargasXlsx,
  type ResumenVientoPlano,
} from '../../lib/acciones/cuadrosCargas';
import { CARGAS_PLANTA_FALLBACK_DOCX, CARGAS_PLANTA_FALLBACK_XLSX } from '../../lib/export/filename';
import type { Block } from '../../lib/materiales/cuadros';
import { guardarObra, leerObra } from '../../lib/obra';
import { leerPublicacion } from '../../lib/pub';
import { MODULO_PUB as MODULO_VIENTO_NIEVE, PUB_VERSION as PUB_VERSION_VIENTO_NIEVE, type PubVientoNieve } from '../viento-nieve/state';
import { BarraObra } from './BarraObra';
import { anadirColumna, quitarColumna, renombrarColumna } from './columnas';
import { Lineales } from './Lineales';
import { leerNievePublicada, nieveDesdePublicacion } from './nievePub';
import { SeccionSVG } from './SeccionSVG';
import { Tabla } from './Tabla';
import { useCotasFilas } from './useCotasFilas';
import {
  cargarEstado,
  duplicarPlanta,
  evaluar,
  guardarEstado,
  nuevaZona,
  nuevoLineal,
  publicarResultado,
  siguientePlanta,
  type CargasState,
  type PlantaUI,
  type ZonaUI,
} from './state';

type FormatoId = 'docx' | 'xlsx';

/** Lo que cambia de un formato a otro: rótulo, extensión y nombre por defecto. */
const FORMATOS: Record<FormatoId, { etiqueta: string; fallback: string; extension: string; enError: string }> = {
  docx: { etiqueta: 'Word', fallback: CARGAS_PLANTA_FALLBACK_DOCX, extension: 'docx', enError: 'documento de Word' },
  xlsx: { etiqueta: 'Excel', fallback: CARGAS_PLANTA_FALLBACK_XLSX, extension: 'xlsx', enError: 'Excel' },
};

/** El bloque de viento del cuadro del plano, del sobre de Viento y nieve. */
function resumenVientoPublicado(): ResumenVientoPlano | null {
  const sobre = leerPublicacion<PubVientoNieve>(MODULO_VIENTO_NIEVE, PUB_VERSION_VIENTO_NIEVE);
  const v = sobre?.datos?.viento;
  if (!v) return null;
  return { zonaEolica: v.zonaEolica, vb: v.vb, aspereza: v.aspereza };
}

export function CargasPlantaModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<CargasState>(cargarEstado);
  const [obra, setObra] = useState(leerObra);
  // Las publicaciones ajenas se releen con cada cambio del estado: son
  // baratas y así un «Usar la nieve publicada» ve siempre el sobre actual.
  const [nievePub, setNievePub] = useState(leerNievePublicada);
  const [viento, setViento] = useState(resumenVientoPublicado);

  // Estado de interfaz: no se guarda, no entra en el cálculo.
  const [zonaSel, setZonaSel] = useState<string | null>(null);
  // La sección dibuja cada forjado a la altura de su fila; las cotas se miden
  // SOBRE LA TABLA, no sobre la mesa entera: si el dibujo estuviera dentro de
  // lo medido, crecer lo haría crecer otra vez.
  const { ref: refTabla, cotas, alto: altoTabla } = useCotasFilas<HTMLDivElement>([state.plantas, zonaSel, state.ayuda]);
  // Por debajo de `lg` la sección se coloca debajo de la tabla, y entonces ya
  // no hay filas con las que alinearse: reparte las plantas por igual.
  const estrecho = useIsMobile();

  /** Todo cambio pasa por aquí: actualiza y persiste con la misma llamada. */
  const actualizar = (cambio: (prev: CargasState) => CargasState) => {
    setState((prev) => {
      const siguiente = cambio(prev);
      guardarEstado(siguiente);
      return siguiente;
    });
    setNievePub(leerNievePublicada());
    setViento(resumenVientoPublicado());
  };

  const evaluacion = useMemo(() => evaluar(state, nievePub), [state, nievePub]);

  // Publicar es un efecto del resultado, no del tecleo.
  useEffect(() => {
    publicarResultado(state, evaluacion);
  }, [state, evaluacion]);

  const bloquesPlano = useMemo<Block[]>(() => cuadroAccionesPlanoCargas(evaluacion.resultado, viento, null), [evaluacion, viento]);
  const bloquesMemoria = useMemo<Block[]>(() => cuadroCargasMemoria(evaluacion.resultado), [evaluacion]);

  // ── Acciones de la tabla ──────────────────────────────────────────────────

  const cambiarPlantas = (f: (plantas: PlantaUI[]) => PlantaUI[]) => actualizar((p) => ({ ...p, plantas: f(p.plantas) }));

  const cambiarPlanta = (id: string, cambio: Partial<PlantaUI>) => cambiarPlantas((plantas) => plantas.map((x) => (x.id === id ? { ...x, ...cambio } : x)));

  const cambiarZona = (plantaId: string, zonaId: string, cambio: Partial<ZonaUI>) =>
    cambiarPlantas((plantas) => plantas.map((x) => (x.id === plantaId ? { ...x, zonas: x.zonas.map((z) => (z.id === zonaId ? { ...z, ...cambio } : z)) } : x)));

  const usarNieve = (plantaId: string, faldon: string | null) => {
    const pub = leerNievePublicada();
    if (!pub) return;
    cambiarPlanta(plantaId, { nieve: nieveDesdePublicacion(pub, faldon) });
  };

  const usarObra = () => {
    const o = leerObra();
    if (!o) return;
    setObra(o);
    actualizar((p) => ({ ...p, emplazamiento: { provincia: o.provincia, municipio: o.municipio, altitud: o.altitud } }));
  };

  const guardarComoObra = () => {
    const e = state.emplazamiento;
    setObra(guardarObra({ provincia: e.provincia, municipio: e.municipio, altitud: e.altitud }));
  };

  // ── Exportación: dos salidas, cada una con su botón ───────────────────────

  // El título vive FUERA del estado del módulo: metido ahí, cada tecla
  // reejecutaría `evaluar()` y obligaría a versionar el esquema por un dato
  // que no es de cálculo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-cargas-planta-title');
  // Qué se exporta lo decide el botón pulsado. El formato se guarda aparte
  // porque el modal del título lo necesita antes de que exista el fichero.
  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el
    // render: así cada exportador sigue en su chunk perezoso.
    exportFn: async (titulo) => {
      if (formatoElegido === 'xlsx') {
        const { exportarCargasPlantaXlsx } = await import('../../lib/xlsx/cargasPlanta');
        return exportarCargasPlantaXlsx(seccionesCargasXlsx(bloquesPlano, cuadroPredimensionado(evaluacion.resultado)), titulo);
      }
      const { exportarCargasPlantaDocx } = await import('../../lib/docx/cargasPlanta');
      return exportarCargasPlantaDocx(bloquesMemoria, titulo);
    },
    valid: evaluacion.listo,
    onTitleChange: setDocTitle,
    formatoLabel: formato.enError,
    invalidMessage: evaluacion.errores > 0 ? 'Corrija los errores antes de exportar' : 'Añada al menos una planta antes de exportar',
  });

  /** Fija el formato ANTES de abrir el modal: la preview del nombre lo usa. */
  const exportarComo = (id: FormatoId) => {
    setFormatoElegido(id);
    openExport();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const nZonas = evaluacion.resultado.plantas.reduce((n, p) => n + p.zonas.length, 0);
  const notas = evaluacion.resultado.notas;

  const seccion = (
    <SeccionSVG
      resultado={evaluacion.resultado}
      cotas={estrecho ? [] : cotas}
      lineales={evaluacion.resultado.lineales}
      zonaSel={zonaSel}
      onSeleccionar={setZonaSel}
      width={estrecho ? 300 : 232}
      height={estrecho ? 420 : Math.max(320, altoTabla)}
    />
  );

  const estado = (
    <>
      <span className="font-mono text-[11px] text-text-disabled">
        {state.plantas.length} {state.plantas.length === 1 ? 'planta' : 'plantas'} · {nZonas} {nZonas === 1 ? 'zona' : 'zonas'}
        {evaluacion.errores > 0 && (
          <span className="text-state-fail">
            {' · '}
            {evaluacion.errores} {evaluacion.errores === 1 ? 'error' : 'errores'}
          </span>
        )}
        {evaluacion.avisos > 0 && (
          <span className="text-state-warn">
            {' · '}
            {evaluacion.avisos} {evaluacion.avisos === 1 ? 'aviso' : 'avisos'}
          </span>
        )}
        {evaluacion.listo ? <span className="text-accent">{' · '}publicado</span> : <span className="text-state-fail">{' · '}sin publicar</span>}
      </span>
      <button
        type="button"
        onClick={() => actualizar((p) => ({ ...p, ayuda: !p.ayuda }))}
        aria-pressed={state.ayuda}
        title="Muestra u oculta las explicaciones de cada campo"
        className={[
          'rounded px-2.5 py-1 text-[11.5px] transition-colors',
          state.ayuda ? 'border border-accent/40 bg-accent/15 text-accent' : 'border border-border-main bg-bg-elevated text-text-disabled hover:text-text-secondary',
        ].join(' ')}
      >
        Ayuda {state.ayuda ? '✓' : ''}
      </button>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        moduleLabel="Cargas por planta"
        moduleGroup="Acciones"
        onMenuOpen={openDrawer}
        onExportPdf={() => exportarComo('docx')}
        exportLabel="Memoria en Word"
        onExportSecondary={() => exportarComo('xlsx')}
        exportSecondaryLabel="Cuadro en Excel"
        pdfExporting={exportando}
      />

      <BarraObra
        e={state.emplazamiento}
        ayuda={state.ayuda}
        obra={obra}
        onCambiar={(cambio) => actualizar((p) => ({ ...p, emplazamiento: { ...p.emplazamiento, ...cambio } }))}
        onUsarObra={usarObra}
        onGuardarObra={guardarComoObra}
        derecha={estado}
      />

      <div className="scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
          {/* La mesa: la tabla y, a su derecha, la sección alineada con sus filas. */}
          <div className={estrecho ? 'flex min-w-0 flex-col gap-3' : 'flex min-w-0 items-start'}>
            <div ref={refTabla} className="min-w-0 flex-1">
              <Tabla
                plantas={state.plantas}
                resultado={evaluacion.resultado}
                nievePub={nievePub}
                avisosNieve={evaluacion.avisosNieve}
                ayuda={state.ayuda}
                zonaSel={zonaSel}
                onSeleccionar={setZonaSel}
                onPlanta={cambiarPlanta}
                onZona={cambiarZona}
                onAnadirPlanta={() => cambiarPlantas((plantas) => [...plantas, siguientePlanta(plantas)])}
                onDuplicarPlanta={(id) =>
                  cambiarPlantas((plantas) => {
                    const i = plantas.findIndex((x) => x.id === id);
                    if (i < 0) return plantas;
                    return [...plantas.slice(0, i + 1), duplicarPlanta(plantas[i]), ...plantas.slice(i + 1)];
                  })
                }
                onBorrarPlanta={(id) => cambiarPlantas((plantas) => plantas.filter((x) => x.id !== id))}
                onAnadirZona={(plantaId) =>
                  cambiarPlantas((plantas) => plantas.map((x) => (x.id === plantaId ? { ...x, zonas: [...x.zonas, nuevaZona(x.esCubierta, `Zona ${x.zonas.length + 1}`)] } : x)))
                }
                onBorrarZona={(plantaId, zonaId) => {
                  if (zonaSel === zonaId) setZonaSel(null);
                  cambiarPlantas((plantas) => plantas.map((x) => (x.id === plantaId && x.zonas.length > 1 ? { ...x, zonas: x.zonas.filter((z) => z.id !== zonaId) } : x)));
                }}
                onUsarNieve={usarNieve}
                onQuitarColumna={(clave) => cambiarPlantas((plantas) => quitarColumna(plantas, clave))}
                onAnadirColumna={(catalogoId) => cambiarPlantas((plantas) => anadirColumna(plantas, catalogoId))}
                onRenombrarColumna={(clave, concepto) => cambiarPlantas((plantas) => renombrarColumna(plantas, clave, concepto))}
              />
            </div>

            <div
              className={[
                'canvas-dot-grid shrink-0 self-start',
                estrecho ? 'w-full overflow-x-auto rounded border border-border-main' : 'border-l border-border-main',
              ].join(' ')}
              style={estrecho ? undefined : { width: 232 }}
            >
              {seccion}
            </div>
          </div>

          <Lineales
            lineales={state.lineales}
            resultado={evaluacion.resultado.lineales}
            ayuda={state.ayuda}
            onLineal={(id, cambio) => actualizar((p) => ({ ...p, lineales: p.lineales.map((l) => (l.id === id ? { ...l, ...cambio } : l)) }))}
            onAnadir={(catalogoId) => actualizar((p) => ({ ...p, lineales: [...p.lineales, nuevoLineal(catalogoId)] }))}
            onBorrar={(id) => actualizar((p) => ({ ...p, lineales: p.lineales.filter((l) => l.id !== id) }))}
          />

          {notas.length > 0 && (
            <CollapsibleSection
              label={`Notas de la norma para la memoria · ${notas.length}`}
              defaultOpen={false}
              refNorma="DB SE-AE · DB SE"
              summary="Van tal cual en el documento de Word; aquí sólo para consultarlas."
            >
              <ul className="flex list-disc flex-col gap-1.5 pb-2 pl-4">
                {notas.map((n) => (
                  <li key={n} className="text-[11.5px] leading-snug text-text-secondary">
                    {n}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 text-[11px] text-text-disabled">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
              derivado, no se teclea
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--color-state-warn)' }} aria-hidden="true" />
              aviso: revise el valor o la publicación
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--color-state-fail)' }} aria-hidden="true" />
              error, bloquea publicar y exportar
            </span>
          </p>
        </div>
      </div>

      {titleOpen && (
        <TitlePromptModal
          initialTitle={docTitle}
          fallbackFilename={formato.fallback}
          exporting={exportando}
          formatLabel={formato.etiqueta}
          extension={formato.extension}
          onConfirm={confirmTitle}
          onCancel={closeTitle}
        />
      )}
    </div>
  );
}

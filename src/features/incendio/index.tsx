/**
 * Incendio — orquestador del módulo (CTE DB SI 6).
 *
 * Tercer módulo del capítulo Acciones. Nace sacando del cuadro de materiales
 * las exigencias de resistencia al fuego, que vivían allí de prestado: eran una
 * tabla de «ámbito → R» tecleada a mano en un módulo que va de clases de
 * exposición y recubrimientos.
 *
 * Publica en `concreta-pub-incendio`, y de ahí lo leen el cuadro de materiales
 * —que sigue imprimiendo su nota— y la ficha del DB SE, sin tocar este estado
 * (ver `lib/pub`).
 *
 * Mesa de trabajo del resto de módulos: datos a la izquierda, el documento tal
 * como se va a entregar a la derecha. Sin pestañas de previsualización: lo que
 * se ve ES lo que se exporta.
 */

import { useEffect, useMemo, useState } from 'react';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { useAsistenteDeModulo } from '../../components/ai/useAsistenteDeModulo';
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { FORMATO_ANEJO, GRUPO_ANEJO, propsTituloAnejo, type IdAnejo } from '../../components/layout/opcionAnejo';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { Documento } from '../../components/ui/Documento';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useGuardarEnAnejo } from '../../hooks/useGuardarEnAnejo';
import { useReconstruirCapitulo } from '../../hooks/useReconstruirCapitulo';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { incendioAdapter, summarizeIncendioResults } from '../../lib/ai/modules/incendio';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { adaptadorDe } from '../../lib/anejo/modules';
import type { ResultadoExport } from '../../lib/export/descargar';
import {
  INCENDIO_FALLBACK_DOCX,
  INCENDIO_FALLBACK_DXF,
  INCENDIO_FALLBACK_PDF,
  INCENDIO_FALLBACK_XLSX,
} from '../../lib/export/filename';
import type { ModoAltura } from '../../lib/incendio/altura';
import { cuadroIncendioMemoria } from '../../lib/incendio/cuadros';
import { exigenciasResueltas } from '../../lib/incendio/exigencias';
import { materialesPublicados } from './materialesPub';
import { bloquesDePlano } from './plano';
import { useVersionDePubs } from '../../lib/pub/usePubs';
import type { ElementoEntrada } from '../../lib/incendio/elementos';
import { Edificio } from './Edificio';
import { Elementos } from './Elementos';
import { Exigencias } from './Exigencias';
import { Sectores } from './Sectores';
import {
  cargarEstado,
  evaluar,
  guardarEstado,
  nuevoElemento,
  nuevoId,
  nuevoSector,
  publicarResultado,
  type AnotacionPlanta,
  type FilaExigencia,
  type IncendioState,
  type SectorUI,
} from './state';

const ANEJO = adaptadorDe('concreta-incendio');

type FormatoId = 'docx' | 'pdf' | 'xlsx' | 'dxf' | IdAnejo;

const FORMATOS: Record<FormatoId, { etiqueta: string; fallback: string; extension: string; enError: string }> = {
  docx: { etiqueta: 'Word', fallback: INCENDIO_FALLBACK_DOCX, extension: 'docx', enError: 'documento de Word' },
  pdf: { etiqueta: 'PDF', fallback: INCENDIO_FALLBACK_PDF, extension: 'pdf', enError: 'PDF' },
  xlsx: { etiqueta: 'Excel', fallback: INCENDIO_FALLBACK_XLSX, extension: 'xlsx', enError: 'Excel' },
  dxf: { etiqueta: 'DXF', fallback: INCENDIO_FALLBACK_DXF, extension: 'dxf', enError: 'DXF' },
  anejo: { ...FORMATO_ANEJO, fallback: INCENDIO_FALLBACK_PDF },
};

const opcion = (id: FormatoId, detalle: string) => ({ id, etiqueta: FORMATOS[id].etiqueta, detalle });

/**
 * Dos grupos porque son dos documentos distintos, no dos formatos del mismo:
 * la memoria comprueba las secciones elemento a elemento y el cuadro del plano
 * no certifica ninguna —dice qué R se exige y qué hay que poner en obra—. Ver
 * la cabecera de `cuadroIncendioPlano`.
 */
const GRUPOS_EXPORTAR: GrupoExportar<FormatoId>[] = [
  {
    titulo: 'Memoria',
    opciones: [
      opcion('docx', 'para pegar en la memoria del proyecto'),
      opcion('pdf', 'maquetado y cerrado, para enviar o imprimir'),
    ],
  },
  {
    titulo: 'Cuadro de plano',
    opciones: [
      opcion('xlsx', 'para capturar y pegar en el plano'),
      opcion('dxf', 'dibujado, para insertar en el CAD'),
    ],
  },
  GRUPO_ANEJO,
];

export function IncendioModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<IncendioState>(cargarEstado);
  const [tab, setTab] = useState<MobileTab>('inputs');

  /** Todo cambio pasa por aquí: actualiza y persiste con la misma llamada. */
  const actualizar = (cambio: (prev: IncendioState) => IncendioState) => {
    setState((prev) => {
      const siguiente = cambio(prev);
      guardarEstado(siguiente);
      return siguiente;
    });
  };

  // Las plantas del edificio son de OTRO módulo y se leen del sobre en cada
  // evaluación, así que `versionPubs` es una dependencia real: sin ella, con el
  // sobre de «Cargas por planta» cambiado desde otra pestaña, la tabla y la R
  // seguían enseñando lo viejo hasta que se tecleara algo aquí.
  const versionPubs = useVersionDePubs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const evaluacion = useMemo(() => evaluar(state), [state, versionPubs]);

  // Publicar es un efecto del resultado, no del tecleo: se hace después del
  // render, cuando la evaluación ya está hecha, y sólo si está lista.
  useEffect(() => {
    publicarResultado(state, evaluacion);
  }, [state, evaluacion]);

  // De qué está hecha la obra, para citar los anejos del DB SI que le tocan.
  // Se relee en cada cambio de sobre: es un rótulo, no un sumando, así que no
  // se copia ni se congela (mismo criterio que el sismo en cargas por planta).
  // `versionPubs` no se usa DENTRO a propósito: es la marca que dice «vuelve a
  // leer», no un dato. Por eso el lint cree que sobra.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const presentes = useMemo(() => materialesPublicados(), [versionPubs]);

  const bloques = useMemo(
    () =>
      cuadroIncendioMemoria(presentes, evaluacion.exigencias, {
        alturaEvacuacion: evaluacion.alturaEvacuacion,
        alturaAMano: evaluacion.alturaAMano,
        sectores: evaluacion.sectores,
        sueltas: exigenciasResueltas(state.exigencias),
        elementos: evaluacion.elementos,
      }),
    [presentes, evaluacion, state.exigencias],
  );

  // El cuadro del plano sale de los MISMOS datos y dice menos: no certifica
  // secciones. Se calcula siempre —no sólo al exportar— porque es barato y así
  // no hay una rama que nadie haya mirado el día que se pulsa el botón.
  const bloquesPlano = useMemo(
    () => bloquesDePlano(state, evaluacion, presentes),
    [presentes, evaluacion, state],
  );

  // ── Asistente ─────────────────────────────────────────────────────────────
  // Las tres listas REEMPLAZAN a las vigentes (ver `lib/ai/modules/incendio`),
  // así que el plan las lleva reconstruidas sobre el estado que había al
  // proponerlas: lo que se teclee entre proponer y aplicar se pisa.
  const asistente = useAsistenteDeModulo();
  const aiResults = useMemo(() => summarizeIncendioResults(evaluacion), [evaluacion]);

  const aplicarPlanIa = (plan: AiApplyPlan<IncendioState>) => {
    actualizar((p) => ({ ...p, ...plan.fields }));
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} cambio${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}`
        + (w > 0 ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''),
      { autoDismiss: 4000 },
    );
  };

  // ── Acciones del formulario ───────────────────────────────────────────────

  const onCambiar = (id: string, cambio: Partial<FilaExigencia>) =>
    actualizar((p) => ({
      ...p,
      exigencias: p.exigencias.map((f) => (f.id === id ? { ...f, ...cambio } : f)),
    }));

  const onBorrar = (id: string) =>
    actualizar((p) => ({ ...p, exigencias: p.exigencias.filter((f) => f.id !== id) }));

  const onAnadir = (ambito: string) =>
    actualizar((p) => ({
      ...p,
      exigencias: [...p.exigencias, { id: nuevoId(), ambito, minutos: null }],
    }));

  /** La anotación de una planta se crea al tocarla por primera vez. */
  const onPlanta = (nombre: string, cambio: Partial<AnotacionPlanta>) =>
    actualizar((p) => {
      const previa = p.plantas.find((x) => x.nombre === nombre);
      const base: AnotacionPlanta = previa ?? {
        nombre,
        altura: null,
        cantoManual: null,
        bajoRasante: false,
        cuenta: null,
      };
      const siguiente = { ...base, ...cambio };
      return {
        ...p,
        plantas: previa
          ? p.plantas.map((x) => (x.nombre === nombre ? siguiente : x))
          : [...p.plantas, siguiente],
      };
    });

  const onAlturaManual = (v: number | null) =>
    actualizar((p) => ({ ...p, alturaEvacuacionManual: v }));

  const onModoAltura = (modo: ModoAltura) => actualizar((p) => ({ ...p, modoAltura: modo }));

  const onSector = (id: string, cambio: Partial<SectorUI>) =>
    actualizar((p) => ({
      ...p,
      sectores: p.sectores.map((x) => (x.id === id ? { ...x, ...cambio } : x)),
    }));

  const onBorrarSector = (id: string) =>
    actualizar((p) => ({ ...p, sectores: p.sectores.filter((x) => x.id !== id) }));

  const onAnadirSector = (nombre: string) =>
    actualizar((p) => ({ ...p, sectores: [...p.sectores, nuevoSector(nombre)] }));

  const onElemento = (id: string, cambio: Partial<ElementoEntrada>) =>
    actualizar((p) => ({
      ...p,
      elementos: p.elementos.map((x) => (x.id === id ? { ...x, ...cambio } : x)),
    }));

  const onBorrarElemento = (id: string) =>
    actualizar((p) => ({ ...p, elementos: p.elementos.filter((x) => x.id !== id) }));

  const onAnadirElemento = (nombre: string) =>
    actualizar((p) => ({ ...p, elementos: [...p.elementos, nuevoElemento(nombre)] }));

  // ── Exportación ───────────────────────────────────────────────────────────

  const [docTitle, setDocTitle] = useDocTitle('concreta-incendio-title');
  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];

  const anejo = useGuardarEnAnejo();
  /**
   * «Reconstruir el PDF» desde el anejo: su capítulo perdió el papel (obra
   * traída de otra máquina) y se rehace sin preguntar nada. Un capítulo de
   * memoria es uno por obra, así que esto SUSTITUYE el suyo, como cualquier
   * otra exportación al anejo desde aquí.
   */
  useReconstruirCapitulo({
    modulo: ANEJO.modulo,
    listo: evaluacion.listo,
    rehacer: async (encargo) => {
      const { exportarIncendioPdf } = await import('../../lib/pdf/incendio');
      const pdf = await exportarIncendioPdf(bloques, encargo.titulo);
      const r = await anejo.guardar({ modulo: ANEJO.modulo, titulo: encargo.titulo, blob: pdf.blob, fecha: encargo.fecha }, { callado: true });
      return r.ok;
    },
  });

  const entregarAlAnejo = async (r: ResultadoExport, titulo: string) => {
    await anejo.guardar({ modulo: ANEJO.modulo, titulo, blob: r.blob });
  };

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render:
    // así cada exportador sigue en su chunk perezoso.
    exportFn: async (titulo) => {
      if (formatoElegido === 'xlsx') {
        const { exportarIncendioXlsx } = await import('../../lib/xlsx/incendio');
        return exportarIncendioXlsx(bloquesPlano, titulo);
      }
      if (formatoElegido === 'dxf') {
        const { exportarIncendioDxf } = await import('../../lib/dxf/incendio');
        return exportarIncendioDxf(bloquesPlano, titulo);
      }
      if (formatoElegido === 'pdf' || formatoElegido === 'anejo') {
        const { exportarIncendioPdf } = await import('../../lib/pdf/incendio');
        return exportarIncendioPdf(bloques, titulo);
      }
      const { exportarIncendioDocx } = await import('../../lib/docx/incendio');
      return exportarIncendioDocx(bloques, titulo);
    },
    valid: evaluacion.listo,
    onTitleChange: setDocTitle,
    entregar: formatoElegido === 'anejo' ? entregarAlAnejo : undefined,
    formatoLabel: formato.enError,
    invalidMessage:
      evaluacion.huecos.length > 0
        ? `Complete ${evaluacion.huecos.map((h) => h.que).join(', ')} antes de exportar`
        : 'Indique al menos una resistencia al fuego exigida antes de exportar',
  });

  /** Fija el formato ANTES de abrir el modal: la preview del nombre lo usa. */
  const exportarComo = (id: FormatoId) => {
    setFormatoElegido(id);
    openExport();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const nHuecos = evaluacion.huecos.length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Topbar
        moduleLabel="Incendio"
        moduleGroup="Acciones"
        onMenuOpen={openDrawer}
        exportMenu={
          <ExportarMenu grupos={GRUPOS_EXPORTAR} onElegir={exportarComo} exportando={exportando} />
        }
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Datos (izquierda) — patrón estándar del repo: lg:w-72 + shrink-0. */}
        <div
          className={[
            'flex min-h-0 flex-col overflow-hidden bg-bg-surface',
            'lg:flex lg:w-[24rem] lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
          ].join(' ')}
        >
          <div className="scroll-hide flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3.5">
            {/* El modo Ayuda: los cinco paneles llevan sus rótulos largos
                escritos desde F2 y hasta ahora no había forma de encenderlos.
                Mismo botón que en viento y nieve. */}
            <div className="flex justify-end pb-2">
              <button
                type="button"
                onClick={() => actualizar((p) => ({ ...p, ayuda: !p.ayuda }))}
                aria-pressed={state.ayuda}
                title="Muestra u oculta las explicaciones de cada campo"
                className={[
                  'rounded px-2.5 py-1 text-[11.5px] transition-colors',
                  state.ayuda
                    ? 'border border-accent/40 bg-accent/15 text-accent'
                    : 'border border-border-main bg-bg-elevated text-text-disabled hover:text-text-secondary',
                ].join(' ')}
              >
                Ayuda {state.ayuda ? '✓' : ''}
              </button>
            </div>
            <Edificio
              evaluacion={evaluacion}
              ayuda={state.ayuda}
              modoAltura={state.modoAltura}
              alturaManual={state.alturaEvacuacionManual}
              onPlanta={onPlanta}
              onAlturaManual={onAlturaManual}
              onModoAltura={onModoAltura}
            />
            <Sectores
              sectores={state.sectores}
              resueltos={evaluacion.sectores}
              ayuda={state.ayuda}
              onCambiar={onSector}
              onBorrar={onBorrarSector}
              onAnadir={onAnadirSector}
            />
            <Elementos
              elementos={state.elementos}
              resueltos={evaluacion.elementos}
              sectores={evaluacion.sectores}
              ayuda={state.ayuda}
              onCambiar={onElemento}
              onBorrar={onBorrarElemento}
              onAnadir={onAnadirElemento}
            />
            <Exigencias
              filas={state.exigencias}
              ayuda={state.ayuda}
              onCambiar={onCambiar}
              onBorrar={onBorrar}
              onAnadir={onAnadir}
            />
            {nHuecos > 0 && (
              <p className="px-1 pt-3 text-[11px] text-state-fail">
                {nHuecos} sin resolver
              </p>
            )}
          </div>
        </div>

        {/* El documento (derecha), tal como se va a entregar. */}
        <div
          className={[
            'min-h-0 flex-1 overflow-y-auto bg-bg-primary px-5 py-5',
            tab === 'inputs' ? 'max-lg:hidden' : '',
          ].join(' ')}
        >
          {/* Lo que hay que saber antes de creerse la R: cadenas de cotas
              cortadas, plantas que no cuentan, R pisadas a mano. Se calculan en
              `evaluar` y se pintan aquí, encima del documento, porque no son
              parte de él: son lo que el proyectista tiene que revisar. */}
          {evaluacion.avisos.length > 0 && (
            <ul className="mb-4 space-y-1 rounded border border-border-sub bg-bg-surface px-3 py-2">
              {evaluacion.avisos.map((a, i) => (
                <li key={i} className="text-[11px] leading-snug text-text-secondary">
                  {a}
                </li>
              ))}
            </ul>
          )}

          {bloques.length === 0 ? (
            <p className="text-[12px] text-text-disabled">
              Añada una exigencia para ver el texto que entra en la memoria.
            </p>
          ) : (
            <Documento blocks={bloques} />
          )}
        </div>
      </div>

      {asistente.sesion && (
        <AiChatModal
          key={asistente.claveSesion}
          adapter={incendioAdapter}
          current={state}
          results={aiResults}
          onApply={aplicarPlanIa}
        />
      )}
      {titleOpen && (
        <TitlePromptModal
          initialTitle={docTitle}
          fallbackFilename={formato.fallback}
          exporting={exportando}
          formatLabel={formato.etiqueta}
          extension={formato.extension}
          {...(formatoElegido === 'anejo' ? propsTituloAnejo(ANEJO) : {})}
          onConfirm={confirmTitle}
          onCancel={closeTitle}
        />
      )}
      {anejo.dialogo}
    </div>
  );
}

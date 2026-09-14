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
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { FORMATO_ANEJO, GRUPO_ANEJO, propsTituloAnejo, type IdAnejo } from '../../components/layout/opcionAnejo';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { Documento } from '../../components/ui/Documento';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useGuardarEnAnejo } from '../../hooks/useGuardarEnAnejo';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { adaptadorDe } from '../../lib/anejo/modules';
import type { ResultadoExport } from '../../lib/export/descargar';
import { INCENDIO_FALLBACK_DOCX, INCENDIO_FALLBACK_PDF } from '../../lib/export/filename';
import type { ModoAltura } from '../../lib/incendio/altura';
import { cuadroIncendioMemoria } from '../../lib/incendio/cuadros';
import { exigenciasResueltas } from '../../lib/incendio/exigencias';
import { materialesPublicados } from './materialesPub';
import { useVersionDePubs } from '../../lib/pub/usePubs';
import { Edificio } from './Edificio';
import { Exigencias } from './Exigencias';
import { Sectores } from './Sectores';
import {
  cargarEstado,
  evaluar,
  guardarEstado,
  nuevoId,
  nuevoSector,
  publicarResultado,
  type AnotacionPlanta,
  type FilaExigencia,
  type IncendioState,
  type SectorUI,
} from './state';

const ANEJO = adaptadorDe('concreta-incendio');

type FormatoId = 'docx' | 'pdf' | IdAnejo;

const FORMATOS: Record<FormatoId, { etiqueta: string; fallback: string; extension: string; enError: string }> = {
  docx: { etiqueta: 'Word', fallback: INCENDIO_FALLBACK_DOCX, extension: 'docx', enError: 'documento de Word' },
  pdf: { etiqueta: 'PDF', fallback: INCENDIO_FALLBACK_PDF, extension: 'pdf', enError: 'PDF' },
  anejo: { ...FORMATO_ANEJO, fallback: INCENDIO_FALLBACK_PDF },
};

const opcion = (id: FormatoId, detalle: string) => ({ id, etiqueta: FORMATOS[id].etiqueta, detalle });

const GRUPOS_EXPORTAR: GrupoExportar<FormatoId>[] = [
  {
    titulo: 'Memoria',
    opciones: [
      opcion('docx', 'para pegar en la memoria del proyecto'),
      opcion('pdf', 'maquetado y cerrado, para enviar o imprimir'),
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

  const evaluacion = useMemo(() => evaluar(state), [state]);

  // Publicar es un efecto del resultado, no del tecleo: se hace después del
  // render, cuando la evaluación ya está hecha, y sólo si está lista.
  useEffect(() => {
    publicarResultado(state, evaluacion);
  }, [state, evaluacion]);

  // De qué está hecha la obra, para citar los anejos del DB SI que le tocan.
  // Se relee en cada cambio de sobre: es un rótulo, no un sumando, así que no
  // se copia ni se congela (mismo criterio que el sismo en cargas por planta).
  const versionPubs = useVersionDePubs();
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
      }),
    [presentes, evaluacion, state.exigencias],
  );

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

  // ── Exportación ───────────────────────────────────────────────────────────

  const [docTitle, setDocTitle] = useDocTitle('concreta-incendio-title');
  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];

  const anejo = useGuardarEnAnejo();
  const entregarAlAnejo = async (r: ResultadoExport, titulo: string) => {
    await anejo.guardar({ modulo: ANEJO.modulo, titulo, blob: r.blob });
  };

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render:
    // así cada exportador sigue en su chunk perezoso.
    exportFn: async (titulo) => {
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

      {titleOpen && (
        <TitlePromptModal
          initialTitle={docTitle}
          fallbackFilename={formato.fallback}
          exporting={exportando}
          formatLabel={formato.etiqueta}
          extension={formato.extension}
          {...(formatoElegido === 'anejo' ? propsTituloAnejo(ANEJO.capitulo) : {})}
          onConfirm={confirmTitle}
          onCancel={closeTitle}
        />
      )}
      {anejo.dialogo}
    </div>
  );
}

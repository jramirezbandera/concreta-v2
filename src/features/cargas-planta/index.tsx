/**
 * Cargas por planta — orquestador del módulo.
 *
 * Tercer módulo del capítulo Acciones y el primero que CONSUME una
 * publicación: la nieve de las cubiertas se toma del sobre de Viento y nieve,
 * y el cuadro de acciones del plano ensambla el bloque de viento con lo que
 * publica aquel módulo. Cada cambio se guarda en su clave de localStorage y,
 * si el resultado está listo, se publica en `concreta-pub-cargas-planta`.
 *
 * Tres pestañas como en viento y nieve: Datos (el formulario, con las
 * columnas derivadas dentro), Plano (el cuadro de acciones) y Memoria (la
 * tabla de cargas por planta con las tablas de γ y ψ).
 */

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
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
import { Documento } from '../materiales/Documento';
import { MODULO_PUB as MODULO_VIENTO_NIEVE, PUB_VERSION as PUB_VERSION_VIENTO_NIEVE, type PubVientoNieve } from '../viento-nieve/state';
import { Cabecera } from './Cabecera';
import { Lineales } from './Lineales';
import { leerNievePublicada, nieveDesdePublicacion } from './nievePub';
import { Plantas } from './Plantas';
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

type Vista = 'datos' | 'plano' | 'memoria';

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'plano', etiqueta: 'Plano' },
  { id: 'memoria', etiqueta: 'Memoria' },
];

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
  const [vista, setVista] = useState<Vista>('datos');
  const [obra, setObra] = useState(leerObra);
  // Las publicaciones ajenas se releen con cada cambio del estado: son
  // baratas y así un «Usar la nieve publicada» ve siempre el sobre actual.
  const [nievePub, setNievePub] = useState(leerNievePublicada);
  const [viento, setViento] = useState(resumenVientoPublicado);

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

  // ── Acciones del formulario ───────────────────────────────────────────────

  const cambiarPlanta = (id: string, cambio: Partial<PlantaUI>) =>
    actualizar((p) => ({ ...p, plantas: p.plantas.map((x) => (x.id === id ? { ...x, ...cambio } : x)) }));

  const cambiarZona = (plantaId: string, zonaId: string, cambio: Partial<ZonaUI>) =>
    actualizar((p) => ({
      ...p,
      plantas: p.plantas.map((x) => (x.id === plantaId ? { ...x, zonas: x.zonas.map((z) => (z.id === zonaId ? { ...z, ...cambio } : z)) } : x)),
    }));

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

  // ── Exportación: cada vista tiene su formato porque tiene su destino ──────

  const [docTitle, setDocTitle] = useDocTitle('concreta-cargas-planta-title');

  const aExcel = vista === 'plano';
  const formato = aExcel
    ? { etiqueta: 'Excel', fallback: CARGAS_PLANTA_FALLBACK_XLSX, extension: 'xlsx' }
    : { etiqueta: 'Word', fallback: CARGAS_PLANTA_FALLBACK_DOCX, extension: 'docx' };

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render.
    exportFn: async (titulo) => {
      if (aExcel) {
        const { exportarCargasPlantaXlsx } = await import('../../lib/xlsx/cargasPlanta');
        return exportarCargasPlantaXlsx(seccionesCargasXlsx(bloquesPlano, cuadroPredimensionado(evaluacion.resultado)), titulo);
      }
      const { exportarCargasPlantaDocx } = await import('../../lib/docx/cargasPlanta');
      return exportarCargasPlantaDocx(bloquesMemoria, titulo);
    },
    valid: evaluacion.listo,
    onTitleChange: setDocTitle,
    formatoLabel: aExcel ? 'Excel' : 'documento de Word',
    invalidMessage: evaluacion.errores > 0 ? 'Corrija los errores antes de exportar' : 'Añada al menos una planta antes de exportar',
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const nZonas = evaluacion.resultado.plantas.reduce((n, p) => n + p.zonas.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar moduleLabel="Cargas por planta" moduleGroup="Acciones" onMenuOpen={openDrawer} onExportPdf={openExport} pdfExporting={exportando} exportLabel={`Exportar ${formato.etiqueta}`} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-main bg-bg-surface px-4 py-1.5">
        <div className="flex" role="tablist" aria-label="Vistas del módulo">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={vista === v.id}
              onClick={() => setVista(v.id)}
              className={['px-3 py-1.5 text-[12px] font-medium transition-colors', vista === v.id ? 'text-accent' : 'text-text-secondary hover:text-text-primary'].join(' ')}
              style={vista === v.id ? { borderBottom: '2px solid var(--color-accent)' } : { borderBottom: '2px solid transparent' }}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>

        <span className="ml-auto font-mono text-[11px] text-text-disabled">
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
          {evaluacion.listo && <span className="text-accent">{' · '}publicado</span>}
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-hide px-4 py-4">
        {vista === 'datos' ? (
          <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
            <Cabecera
              e={state.emplazamiento}
              ayuda={state.ayuda}
              obra={obra}
              onCambiar={(cambio) => actualizar((p) => ({ ...p, emplazamiento: { ...p.emplazamiento, ...cambio } }))}
              onUsarObra={usarObra}
              onGuardarObra={guardarComoObra}
            />

            <Plantas
              plantas={state.plantas}
              resultado={evaluacion.resultado}
              nievePub={nievePub}
              avisosNieve={evaluacion.avisosNieve}
              ayuda={state.ayuda}
              onPlanta={cambiarPlanta}
              onZona={cambiarZona}
              onAnadirPlanta={() => actualizar((p) => ({ ...p, plantas: [...p.plantas, siguientePlanta(p.plantas)] }))}
              onDuplicarPlanta={(id) =>
                actualizar((p) => {
                  const i = p.plantas.findIndex((x) => x.id === id);
                  if (i < 0) return p;
                  const copia = duplicarPlanta(p.plantas[i]);
                  return { ...p, plantas: [...p.plantas.slice(0, i + 1), copia, ...p.plantas.slice(i + 1)] };
                })
              }
              onBorrarPlanta={(id) => actualizar((p) => ({ ...p, plantas: p.plantas.filter((x) => x.id !== id) }))}
              onAnadirZona={(plantaId) =>
                actualizar((p) => ({
                  ...p,
                  plantas: p.plantas.map((x) => (x.id === plantaId ? { ...x, zonas: [...x.zonas, nuevaZona(x.esCubierta, `Zona ${x.zonas.length + 1}`)] } : x)),
                }))
              }
              onBorrarZona={(plantaId, zonaId) =>
                actualizar((p) => ({
                  ...p,
                  plantas: p.plantas.map((x) => (x.id === plantaId && x.zonas.length > 1 ? { ...x, zonas: x.zonas.filter((z) => z.id !== zonaId) } : x)),
                }))
              }
              onUsarNieve={usarNieve}
            />

            <Lineales
              lineales={state.lineales}
              resultado={evaluacion.resultado.lineales}
              ayuda={state.ayuda}
              onLineal={(id, cambio) => actualizar((p) => ({ ...p, lineales: p.lineales.map((l) => (l.id === id ? { ...l, ...cambio } : l)) }))}
              onAnadir={(catalogoId) => actualizar((p) => ({ ...p, lineales: [...p.lineales, nuevoLineal(catalogoId)] }))}
              onBorrar={(id) => actualizar((p) => ({ ...p, lineales: p.lineales.filter((l) => l.id !== id) }))}
            />

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-disabled">
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
        ) : (
          <>
            {state.ayuda && vista === 'plano' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                El cuadro de acciones del plano: un bloque por planta con peso propio, carga muerta, sobrecarga de
                uso y total, las cargas lineales, y las acciones horizontales tomadas de lo que publica Viento y
                nieve, con los coeficientes de ejecución. «Exportar Excel» lo entrega en pestañas sin cuadrícula
                (cargas por planta, cargas lineales, predimensionado con Gd / Qd / qd, acciones horizontales): se
                selecciona, se captura y se pega en el plano.
              </p>
            )}
            {state.ayuda && vista === 'memoria' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                La tabla de cargas por planta como va en la memoria, con las cargas lineales, los coeficientes
                parciales y de simultaneidad del DB SE y las notas de la norma. «Exportar Word» la entrega con los
                estilos de Título de Word, para pegarla en la memoria del proyecto y que herede su numeración.
              </p>
            )}
            <Documento blocks={vista === 'plano' ? bloquesPlano : bloquesMemoria} />
          </>
        )}
      </div>

      {titleOpen && (
        <TitlePromptModal initialTitle={docTitle} fallbackFilename={formato.fallback} exporting={exportando} formatLabel={formato.etiqueta} extension={formato.extension} onConfirm={confirmTitle} onCancel={closeTitle} />
      )}
    </div>
  );
}

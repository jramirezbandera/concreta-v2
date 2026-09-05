/**
 * Viento y nieve — orquestador del módulo.
 *
 * Segundo módulo del capítulo Acciones y el primero que PUBLICA: cada cambio
 * se guarda en su clave de localStorage y, si el resultado está listo, se
 * escribe en `concreta-pub-viento-nieve` para que la ficha DB SE y el cuadro
 * de acciones del plano lo ensamblen sin leer este estado (ver `lib/pub`).
 *
 * Tres pestañas como en materiales: Datos (el formulario, con las columnas
 * derivadas dentro), Plano (el bloque de acciones del cuadro) y Memoria (la
 * derivación entera). La exportación a Word y Excel llega en la fase 3.
 */

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import {
  cuadroAccionesPlano,
  cuadroNieveMemoria,
  cuadroVientoMemoria,
  seccionesPlanoXlsx,
  type EmplazamientoCuadro,
} from '../../lib/acciones/cuadros';
import { VIENTO_NIEVE_FALLBACK_DOCX, VIENTO_NIEVE_FALLBACK_XLSX } from '../../lib/export/filename';
import type { Block } from '../../lib/materiales/cuadros';
import { guardarObra, leerObra } from '../../lib/obra';
import { Documento } from '../materiales/Documento';
import { Emplazamiento } from './Emplazamiento';
import { Nieve } from './Nieve';
import { Viento } from './Viento';
import {
  cargarEstado,
  evaluar,
  guardarEstado,
  nuevoFaldon,
  publicarResultado,
  siguientePlanta,
  type FaldonUI,
  type PlantaUI,
  type VientoNieveState,
} from './state';

type Vista = 'datos' | 'plano' | 'memoria';

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'plano', etiqueta: 'Plano' },
  { id: 'memoria', etiqueta: 'Memoria' },
];

function frase(huecos: string[]): string {
  if (huecos.length === 0) return '';
  if (huecos.length === 1) return huecos[0];
  return `${huecos.slice(0, -1).join(', ')} y ${huecos[huecos.length - 1]}`;
}

/** Lo que enseñan Plano y Memoria cuando no hay nada que componer. */
function bloqueVacio(huecos: string[]): Block[] {
  return [
    {
      kind: 'paragraph',
      text: huecos.length
        ? `Falta ${frase(huecos)}: el cuadro aparecerá aquí en cuanto se rellene.`
        : 'Sin acciones incluidas: active el viento o la nieve en la pestaña Datos.',
    },
  ];
}

export function VientoNieveModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<VientoNieveState>(cargarEstado);
  const [vista, setVista] = useState<Vista>('datos');
  const [obra, setObra] = useState(leerObra);

  /** Todo cambio pasa por aquí: actualiza y persiste con la misma llamada. */
  const actualizar = (cambio: (prev: VientoNieveState) => VientoNieveState) => {
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

  const emplazamientoCuadro = useMemo<EmplazamientoCuadro>(
    () => ({
      provincia: evaluacion.zonas.provincia?.nombre ?? '—',
      municipio: state.emplazamiento.municipio,
      altitud: state.emplazamiento.altitud,
      zonaEolica: evaluacion.zonas.zonaEolica,
      zonaInvernal: evaluacion.zonas.zonaInvernal,
    }),
    [evaluacion.zonas, state.emplazamiento.municipio, state.emplazamiento.altitud],
  );

  const bloquesPlano = useMemo<Block[]>(() => {
    const b = cuadroAccionesPlano(evaluacion.viento, evaluacion.nieve, emplazamientoCuadro);
    return b.length ? b : bloqueVacio(evaluacion.huecos);
  }, [evaluacion, emplazamientoCuadro]);

  const bloquesMemoria = useMemo<Block[]>(() => {
    const b: Block[] = [];
    if (evaluacion.viento) b.push(...cuadroVientoMemoria(evaluacion.viento, emplazamientoCuadro));
    if (evaluacion.nieve) b.push(...cuadroNieveMemoria(evaluacion.nieve, emplazamientoCuadro));
    return b.length ? b : bloqueVacio(evaluacion.huecos);
  }, [evaluacion, emplazamientoCuadro]);

  // ── Acciones del formulario ───────────────────────────────────────────────

  const cambiarPlanta = (id: string, cambio: Partial<PlantaUI>) =>
    actualizar((p) => ({
      ...p,
      viento: { ...p.viento, plantas: p.viento.plantas.map((f) => (f.id === id ? { ...f, ...cambio } : f)) },
    }));

  const cambiarFaldon = (id: string, cambio: Partial<FaldonUI>) =>
    actualizar((p) => ({
      ...p,
      nieve: { ...p.nieve, faldones: p.nieve.faldones.map((f) => (f.id === id ? { ...f, ...cambio } : f)) },
    }));

  const usarObra = () => {
    const o = leerObra();
    if (!o) return;
    setObra(o);
    actualizar((p) => ({
      ...p,
      emplazamiento: {
        ...p.emplazamiento,
        provincia: o.provincia,
        municipio: o.municipio,
        altitud: o.altitud,
        zonaEolica: null,
        zonaInvernal: null,
      },
    }));
  };

  const guardarComoObra = () => {
    const e = state.emplazamiento;
    setObra(guardarObra({ provincia: e.provincia, municipio: e.municipio, altitud: e.altitud }));
  };

  // ── Exportación: cada vista tiene su formato porque tiene su destino ──────

  // El título vive FUERA del estado del módulo, como en materiales: metido
  // ahí, cada tecla reejecutaría `evaluar()` y obligaría a versionar el
  // esquema por un dato que no es de cálculo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-viento-nieve-title');

  const aExcel = vista === 'plano';
  const formato = aExcel
    ? { etiqueta: 'Excel', fallback: VIENTO_NIEVE_FALLBACK_XLSX, extension: 'xlsx' }
    : { etiqueta: 'Word', fallback: VIENTO_NIEVE_FALLBACK_DOCX, extension: 'docx' };

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render:
    // así cada exportador sigue en su chunk perezoso y sólo lo descarga quien
    // exporta de verdad.
    exportFn: async (titulo) => {
      if (aExcel) {
        const { exportarVientoNieveXlsx } = await import('../../lib/xlsx/vientoNieve');
        return exportarVientoNieveXlsx(seccionesPlanoXlsx(bloquesPlano), titulo);
      }
      const { exportarVientoNieveDocx } = await import('../../lib/docx/vientoNieve');
      return exportarVientoNieveDocx(bloquesMemoria, titulo);
    },
    valid: evaluacion.listo,
    onTitleChange: setDocTitle,
    formatoLabel: aExcel ? 'Excel' : 'documento de Word',
    invalidMessage:
      evaluacion.huecos.length > 0
        ? `Rellene ${frase(evaluacion.huecos)} antes de exportar`
        : evaluacion.errores > 0
          ? 'Corrija los errores antes de exportar'
          : 'Incluya el viento o la nieve antes de exportar',
  });

  // ── Motivos de «sin resultado», en lenguaje de obra ───────────────────────

  const motivoViento = state.viento.activo && !evaluacion.viento ? 'Elija la provincia (o fuerce la zona eólica) para calcular el viento.' : null;
  const motivoNieve =
    state.nieve.activo && !evaluacion.nieve
      ? evaluacion.zonas.zonaInvernal === null
        ? 'Elija la provincia (o fuerce la zona de clima invernal) para calcular la nieve.'
        : 'Indique la altitud de la obra para calcular la nieve.'
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  const nHuecos = evaluacion.huecos.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        moduleLabel="Viento y nieve"
        moduleGroup="Acciones"
        onMenuOpen={openDrawer}
        onExportPdf={openExport}
        pdfExporting={exportando}
        exportLabel={`Exportar ${formato.etiqueta}`}
      />

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
          {evaluacion.viento && evaluacion.nieve ? 'viento y nieve' : evaluacion.viento ? 'viento' : evaluacion.nieve ? 'nieve' : 'sin resultado'}
          {nHuecos > 0 && (
            <span className="text-state-fail">
              {' · '}
              falta {frase(evaluacion.huecos)}
            </span>
          )}
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
            <Emplazamiento
              e={state.emplazamiento}
              zonas={evaluacion.zonas}
              ayuda={state.ayuda}
              obra={obra}
              onCambiar={(cambio) => actualizar((p) => ({ ...p, emplazamiento: { ...p.emplazamiento, ...cambio } }))}
              onUsarObra={usarObra}
              onGuardarObra={guardarComoObra}
            />

            <Viento
              v={state.viento}
              resultado={evaluacion.viento}
              motivoSinResultado={motivoViento}
              ayuda={state.ayuda}
              onCambiar={(cambio) => actualizar((p) => ({ ...p, viento: { ...p.viento, ...cambio } }))}
              onPlanta={cambiarPlanta}
              onAnadirPlanta={() => actualizar((p) => ({ ...p, viento: { ...p.viento, plantas: [...p.viento.plantas, siguientePlanta(p.viento.plantas)] } }))}
              onBorrarPlanta={(id) => actualizar((p) => ({ ...p, viento: { ...p.viento, plantas: p.viento.plantas.filter((f) => f.id !== id) } }))}
            />

            <Nieve
              n={state.nieve}
              resultado={evaluacion.nieve}
              motivoSinResultado={motivoNieve}
              ayuda={state.ayuda}
              onCambiar={(cambio) => actualizar((p) => ({ ...p, nieve: { ...p.nieve, ...cambio } }))}
              onFaldon={cambiarFaldon}
              onAnadirFaldon={() => actualizar((p) => ({ ...p, nieve: { ...p.nieve, faldones: [...p.nieve.faldones, nuevoFaldon(`Faldón ${p.nieve.faldones.length + 1}`, 30)] } }))}
              onBorrarFaldon={(id) => actualizar((p) => ({ ...p, nieve: { ...p.nieve, faldones: p.nieve.faldones.filter((f) => f.id !== id) } }))}
            />

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-disabled">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
                derivado, no se teclea
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--color-state-warn)' }} aria-hidden="true" />
                aviso: mire el mapa o la nota
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--color-state-fail)' }} aria-hidden="true" />
                hueco sin resolver, bloquea publicar y exportar
              </span>
            </p>
          </div>
        ) : (
          <>
            {state.ayuda && vista === 'plano' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                El bloque de acciones horizontales del cuadro del plano —zona eólica, velocidad básica, grado de
                aspereza— y la fuerza por planta que se lleva al programa de cálculo. «Exportar Excel» entrega{' '}
                <b className="text-text-secondary">esto</b> en pestañas sin cuadrícula (viento, fuerzas por
                planta, cubierta y paramentos si los hay, nieve): se selecciona, se captura y se pega en el plano.
              </p>
            )}
            {state.ayuda && vista === 'memoria' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                La derivación completa para la memoria: de dónde sale cada número, con su artículo del DB SE-AE.
                «Exportar Word» la entrega con los estilos de Título de Word, para pegarla en la memoria del
                proyecto y que herede su numeración.
              </p>
            )}
            <Documento blocks={vista === 'plano' ? bloquesPlano : bloquesMemoria} />
          </>
        )}
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

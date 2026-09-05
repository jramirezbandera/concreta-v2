/**
 * Viento y nieve — orquestador del módulo.
 *
 * Segundo módulo del capítulo Acciones y el primero que PUBLICA: cada cambio
 * se guarda en su clave de localStorage y, si el resultado está listo, se
 * escribe en `concreta-pub-viento-nieve` para que la ficha DB SE y el cuadro
 * de acciones del plano lo ensamblen sin leer este estado (ver `lib/pub`).
 *
 * Mesa de trabajo como el resto de módulos: datos a la izquierda, el dibujo
 * en el centro con cuatro vistas (Edificio · Cubierta · Fachadas · Nieve) y
 * lo que pone la norma a la derecha. No hay previsualización de documentos:
 * el cuadro del plano (Excel) y la memoria (Word) se exportan desde la barra
 * superior, cada uno con su botón.
 */

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { ViewTabs } from '../../components/ui/ViewTabs';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { cuadroAccionesPlano, cuadroNieveMemoria, cuadroVientoMemoria, seccionesPlanoXlsx, type EmplazamientoCuadro } from '../../lib/acciones/cuadros';
import { VIENTO_NIEVE_FALLBACK_DOCX, VIENTO_NIEVE_FALLBACK_XLSX } from '../../lib/export/filename';
import type { Block } from '../../lib/materiales/cuadros';
import { guardarObra, leerObra } from '../../lib/obra';
import { VISTAS_LIENZO, type VistaLienzo } from './catalogos';
import { Datos } from './Datos';
import { EdificioSVG } from './lienzo/EdificioSVG';
import { LienzoPendiente } from './lienzo/LienzoPendiente';
import { Resultados } from './Resultados';
import {
  cargarEstado,
  ejemploVientoNieveState,
  esEstadoInicial,
  evaluar,
  guardarEstado,
  nuevoFaldon,
  publicarResultado,
  siguientePlanta,
  type FaldonUI,
  type PlantaUI,
  type VientoNieveState,
} from './state';

// Persistencia del aviso «¿Quiere ver un caso de ejemplo?»: una vez aceptado o
// descartado, la banda no vuelve a aparecer (patrón de Muros de fábrica).
const EJEMPLO_DESCARTADO_KEY = 'concreta-viento-nieve-example-dismissed';

type FormatoId = 'docx' | 'xlsx';

/** Lo que cambia de un formato a otro: rótulo, extensión y nombre por defecto. */
const FORMATOS: Record<FormatoId, { etiqueta: string; fallback: string; extension: string; enError: string }> = {
  docx: { etiqueta: 'Word', fallback: VIENTO_NIEVE_FALLBACK_DOCX, extension: 'docx', enError: 'documento de Word' },
  xlsx: { etiqueta: 'Excel', fallback: VIENTO_NIEVE_FALLBACK_XLSX, extension: 'xlsx', enError: 'Excel' },
};

function frase(huecos: string[]): string {
  if (huecos.length === 0) return '';
  if (huecos.length === 1) return huecos[0];
  return `${huecos.slice(0, -1).join(', ')} y ${huecos[huecos.length - 1]}`;
}

function leerDescartado(): boolean {
  try {
    return localStorage.getItem(EJEMPLO_DESCARTADO_KEY) === '1';
  } catch {
    return false;
  }
}

function Leyenda({ color, children, rayado = false, discontinua = false }: { color: string; children: string; rayado?: boolean; discontinua?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-[2px]"
        style={
          discontinua
            ? { border: '1px dashed var(--color-text-disabled)' }
            : { background: rayado ? `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)` : color }
        }
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function VientoNieveModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<VientoNieveState>(cargarEstado);
  const [obra, setObra] = useState(leerObra);
  const [descartado, setDescartado] = useState(leerDescartado);

  // Estado de interfaz: no se guarda, no entra en el cálculo.
  const [vista, setVista] = useState<VistaLienzo>('edificio');
  const [direccionElegida, setDireccionElegida] = useState<'x' | 'y' | null>(null);
  const [plantaSel, setPlantaSel] = useState<string | null>(null);
  const [faldonSel, setFaldonSel] = useState<string | null>(null);
  const mostrarEjemplo = !descartado && esEstadoInicial(state);
  const [tab, setTab] = useState<MobileTab>(mostrarEjemplo ? 'diagramas' : 'inputs');

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

  // Sin elección, la dirección que más empuja; según Y si aún no hay resultado.
  const direccion: 'x' | 'y' = direccionElegida ?? (evaluacion.viento && evaluacion.viento.x.Ftotal > evaluacion.viento.y.Ftotal ? 'x' : 'y');

  const emplazamientoCuadro = useMemo<EmplazamientoCuadro>(
    () => ({
      provincia: evaluacion.zonas.provincia?.nombre ?? '—',
      municipio: state.emplazamiento.municipio,
      altitud: state.emplazamiento.altitud,
      zonaEolica: evaluacion.zonas.zonaEolica,
      zonaInvernal: evaluacion.zonas.zonaInvernal,
      zonaEolicaProvincia: evaluacion.zonas.provincia?.zonaEolica ?? null,
      zonaInvernalProvincia: evaluacion.zonas.provincia?.zonaInvernal ?? null,
    }),
    [evaluacion.zonas, state.emplazamiento.municipio, state.emplazamiento.altitud],
  );

  // ── Acciones del formulario ───────────────────────────────────────────────

  const acciones = {
    onEmplazamiento: (cambio: Partial<VientoNieveState['emplazamiento']>) => actualizar((p) => ({ ...p, emplazamiento: { ...p.emplazamiento, ...cambio } })),
    onUsarObra: () => {
      const o = leerObra();
      if (!o) return;
      setObra(o);
      actualizar((p) => ({ ...p, emplazamiento: { ...p.emplazamiento, provincia: o.provincia, municipio: o.municipio, altitud: o.altitud, zonaEolica: null, zonaInvernal: null } }));
    },
    onGuardarObra: () => {
      const e = state.emplazamiento;
      setObra(guardarObra({ provincia: e.provincia, municipio: e.municipio, altitud: e.altitud }));
    },
    onViento: (cambio: Partial<VientoNieveState['viento']>) => actualizar((p) => ({ ...p, viento: { ...p.viento, ...cambio } })),
    onPlanta: (id: string, cambio: Partial<PlantaUI>) =>
      actualizar((p) => ({ ...p, viento: { ...p.viento, plantas: p.viento.plantas.map((f) => (f.id === id ? { ...f, ...cambio } : f)) } })),
    onAnadirPlanta: () => actualizar((p) => ({ ...p, viento: { ...p.viento, plantas: [...p.viento.plantas, siguientePlanta(p.viento.plantas)] } })),
    onBorrarPlanta: (id: string) => {
      if (plantaSel === id) setPlantaSel(null);
      actualizar((p) => ({ ...p, viento: { ...p.viento, plantas: p.viento.plantas.filter((f) => f.id !== id) } }));
    },
    onCubierta: (cambio: Partial<VientoNieveState['viento']['cubierta']>) => actualizar((p) => ({ ...p, viento: { ...p.viento, cubierta: { ...p.viento.cubierta, ...cambio } } })),
    onParamentos: (cambio: Partial<VientoNieveState['viento']['paramentos']>) => actualizar((p) => ({ ...p, viento: { ...p.viento, paramentos: { ...p.viento.paramentos, ...cambio } } })),
    onNieve: (cambio: Partial<VientoNieveState['nieve']>) => actualizar((p) => ({ ...p, nieve: { ...p.nieve, ...cambio } })),
    onFaldon: (id: string, cambio: Partial<FaldonUI>) =>
      actualizar((p) => ({ ...p, nieve: { ...p.nieve, faldones: p.nieve.faldones.map((f) => (f.id === id ? { ...f, ...cambio } : f)) } })),
    onAnadirFaldon: () => actualizar((p) => ({ ...p, nieve: { ...p.nieve, faldones: [...p.nieve.faldones, nuevoFaldon(`Faldón ${p.nieve.faldones.length + 1}`, 30)] } })),
    onBorrarFaldon: (id: string) => {
      if (faldonSel === id) setFaldonSel(null);
      actualizar((p) => ({ ...p, nieve: { ...p.nieve, faldones: p.nieve.faldones.filter((f) => f.id !== id) } }));
    },
  };

  const descartarEjemplo = () => {
    setDescartado(true);
    try {
      localStorage.setItem(EJEMPLO_DESCARTADO_KEY, '1');
    } catch {
      /* modo privado: la banda vuelve la próxima vez, sin más */
    }
  };
  const verEjemplo = () => {
    descartarEjemplo();
    actualizar(() => ejemploVientoNieveState());
  };

  // ── Exportación: dos salidas, cada una con su botón ───────────────────────

  // El título vive FUERA del estado del módulo, como en materiales: metido
  // ahí, cada tecla reejecutaría `evaluar()` y obligaría a versionar el
  // esquema por un dato que no es de cálculo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-viento-nieve-title');
  // Qué se exporta lo decide el botón pulsado, no la vista abierta. El formato
  // se guarda aparte porque el modal del título lo necesita antes de que
  // exista el fichero: la preview del nombre y el rótulo de confirmar salen de él.
  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render:
    // así cada exportador sigue en su chunk perezoso y sólo lo descarga quien
    // exporta de verdad. Los bloques se componen aquí, al exportar: ya no hay
    // pestaña que los pinte.
    exportFn: async (titulo) => {
      if (formatoElegido === 'xlsx') {
        const bloquesPlano = cuadroAccionesPlano(evaluacion.viento, evaluacion.nieve, emplazamientoCuadro);
        const { exportarVientoNieveXlsx } = await import('../../lib/xlsx/vientoNieve');
        return exportarVientoNieveXlsx(seccionesPlanoXlsx(bloquesPlano), titulo);
      }
      const bloquesMemoria: Block[] = [];
      if (evaluacion.viento) bloquesMemoria.push(...cuadroVientoMemoria(evaluacion.viento, emplazamientoCuadro));
      if (evaluacion.nieve) bloquesMemoria.push(...cuadroNieveMemoria(evaluacion.nieve, emplazamientoCuadro));
      const { exportarVientoNieveDocx } = await import('../../lib/docx/vientoNieve');
      return exportarVientoNieveDocx(bloquesMemoria, titulo);
    },
    valid: evaluacion.listo,
    onTitleChange: setDocTitle,
    formatoLabel: formato.enError,
    invalidMessage:
      evaluacion.huecos.length > 0
        ? `Rellene ${frase(evaluacion.huecos)} antes de exportar`
        : evaluacion.errores > 0
          ? 'Corrija los errores antes de exportar'
          : 'Incluya el viento o la nieve antes de exportar',
  });

  /** Fija el formato ANTES de abrir el modal: la preview del nombre lo usa. */
  const exportarComo = (id: FormatoId) => {
    setFormatoElegido(id);
    openExport();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const nHuecos = evaluacion.huecos.length;
  const tituloVista = VISTAS_LIENZO.find((v) => v.id === vista)?.titulo ?? '';
  const cumbrera = state.viento.cubierta.activa ? state.viento.cubierta.cumbrera : null;
  const botonDireccion = (d: 'x' | 'y', etiqueta: string) => (
    <button
      key={d}
      type="button"
      onClick={() => setDireccionElegida(d)}
      aria-pressed={direccion === d}
      className="cursor-pointer rounded border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors"
      style={{
        background: direccion === d ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
        borderColor: direccion === d ? 'var(--color-accent)' : 'var(--color-text-disabled)',
        color: direccion === d ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        letterSpacing: '0.04em',
      }}
    >
      {direccion === d ? '●' : '○'} {etiqueta}
    </button>
  );
  // Con cubierta, la dirección se rotula también con el ángulo θ de la tabla D.6.
  const etiquetaTheta = (d: 'x' | 'y') => (cumbrera ? `θ = ${(cumbrera === 'x') === (d === 'y') ? '0º' : '90º'} · según ${d.toUpperCase()}` : `según ${d.toUpperCase()}`);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Topbar
        moduleLabel="Viento y nieve"
        moduleGroup="Acciones"
        onMenuOpen={openDrawer}
        onExportPdf={() => exportarComo('docx')}
        exportLabel="Memoria en Word"
        onExportSecondary={() => exportarComo('xlsx')}
        exportSecondaryLabel="Cuadro en Excel"
        pdfExporting={exportando}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Datos (izquierda) — patrón estándar del repo: lg:w-72 + shrink-0. */}
        <div className={['flex min-h-0 flex-col overflow-hidden bg-bg-surface', 'lg:flex lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main', tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden'].join(' ')}>
          <div className="scroll-hide flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3.5">
            <Datos state={state} evaluacion={evaluacion} obra={obra} plantaSel={plantaSel} faldonSel={faldonSel} onSelectPlanta={setPlantaSel} onSelectFaldon={setFaldonSel} {...acciones} />
          </div>
        </div>

        {/* Lienzo (centro) */}
        <div className={['flex min-w-0 flex-col overflow-hidden', 'lg:flex lg:flex-1', tab === 'diagramas' ? 'flex flex-1' : 'hidden lg:flex'].join(' ')}>
          <div className="flex shrink-0 flex-wrap items-center border-b border-border-main bg-bg-surface">
            <div role="group" aria-label="Vistas del lienzo" className="flex">
              <ViewTabs tabs={VISTAS_LIENZO.map((v) => ({ id: v.id, label: v.etiqueta, title: v.titulo }))} active={vista} onSelect={setVista} />
            </div>
            <div className="flex-1" />
            <span className="px-3 font-mono text-[11px] text-text-disabled">
              {evaluacion.viento && evaluacion.nieve ? 'viento y nieve' : evaluacion.viento ? 'viento' : evaluacion.nieve ? 'nieve' : 'sin resultado'}
              {nHuecos > 0 && <span className="text-state-fail">{' · '}falta {frase(evaluacion.huecos)}</span>}
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
            <span className="mx-0.5 h-4 w-px bg-border-main" aria-hidden="true" />
            <button
              type="button"
              onClick={() => actualizar((p) => ({ ...p, ayuda: !p.ayuda }))}
              aria-pressed={state.ayuda}
              title="Muestra u oculta las explicaciones de cada campo"
              className={['mx-2 rounded px-2.5 py-1 text-[11.5px] transition-colors', state.ayuda ? 'border border-accent/40 bg-accent/15 text-accent' : 'border border-border-main bg-bg-elevated text-text-disabled hover:text-text-secondary'].join(' ')}
            >
              Ayuda {state.ayuda ? '✓' : ''}
            </button>
          </div>

          <div className="canvas-dot-grid relative min-h-0 flex-1 p-4">
            {vista === 'edificio' && (
              <EdificioSVG viento={state.viento} resultado={evaluacion.viento} direccion={direccion} plantaSel={plantaSel} onSelectPlanta={setPlantaSel} onDireccion={setDireccionElegida} />
            )}
            {vista !== 'edificio' && <LienzoPendiente titulo={tituloVista} />}

            {mostrarEjemplo && (
              // Banda de bienvenida sobre el lienzo (patrón de Muros de fábrica):
              // no modal, sin sombras; se retira al aceptar o descartar.
              <div role="region" aria-label="Aviso de caso de ejemplo" className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-2 rounded border border-accent/40 bg-bg-surface/95 px-3 py-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2">
                <span className="shrink-0 font-mono text-[10px] uppercase text-accent" style={{ letterSpacing: '0.07em' }}>
                  Empiece por el emplazamiento
                </span>
                <p className="text-[12px] leading-snug text-text-secondary md:min-w-0 md:flex-1">
                  Elija la provincia y la altitud a la izquierda: la norma pone la zona, la presión y las fuerzas. El edificio ya se dibuja con lo que teclee. ¿Prefiere ver un caso completo? Sustituye el emplazamiento por Aranda de Duero.
                </p>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={verEjemplo} className="flex-1 cursor-pointer rounded border border-accent bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent transition-colors hover:bg-accent/15 md:flex-none">
                    Ver ejemplo
                  </button>
                  <button type="button" onClick={descartarEjemplo} className="flex-1 cursor-pointer rounded border border-border-main px-2.5 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary md:flex-none">
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-border-main bg-bg-surface px-6 py-2 font-mono text-[11px] text-text-disabled">
            {vista === 'edificio' && (
              <>
                <Leyenda color="color-mix(in srgb, var(--color-accent) 12%, transparent)">banda tributaria</Leyenda>
                <Leyenda color="var(--color-accent)">fuerza por planta ∝ kN</Leyenda>
              </>
            )}
            {(vista === 'cubierta' || vista === 'fachadas') && (
              <>
                <Leyenda color="color-mix(in srgb, var(--color-chart-presion) 45%, transparent)">presión</Leyenda>
                <Leyenda color="color-mix(in srgb, var(--color-accent) 45%, transparent)">succión</Leyenda>
              </>
            )}
            {vista === 'nieve' && (
              <>
                <Leyenda color="color-mix(in srgb, var(--color-accent) 55%, transparent)" rayado>
                  nieve: el espesor es la carga
                </Leyenda>
                <Leyenda color="color-mix(in srgb, var(--color-accent) 35%, transparent)">acumulación en 2 m</Leyenda>
                <Leyenda color="" discontinua>
                  hipótesis asimétrica μ/2
                </Leyenda>
              </>
            )}
            {vista !== 'nieve' && (
              <span className="ml-auto flex items-center gap-1.5">
                {botonDireccion('x', etiquetaTheta('x'))}
                {botonDireccion('y', etiquetaTheta('y'))}
              </span>
            )}
          </div>
        </div>

        {/* Resultados (derecha) — fija 300 px en escritorio, como Muros de fábrica. */}
        <div className={['scroll-hide shrink-0 overflow-y-auto border-l border-border-main bg-bg-surface', 'lg:block lg:w-75', tab === 'results' ? 'flex-1' : 'hidden'].join(' ')}>
          <Resultados vista={vista} state={state} evaluacion={evaluacion} direccion={direccion} plantaSel={plantaSel} faldonSel={faldonSel} />
        </div>
      </div>

      {titleOpen && (
        <TitlePromptModal initialTitle={docTitle} fallbackFilename={formato.fallback} exporting={exportando} formatLabel={formato.etiqueta} extension={formato.extension} onConfirm={confirmTitle} onCancel={closeTitle} />
      )}
    </div>
  );
}

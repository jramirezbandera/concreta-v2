/**
 * Cuadro de materiales — orquestador del módulo.
 *
 * Primer módulo del capítulo Memorias. Tres pestañas: Datos (el formulario) y
 * dos vistas del documento (Plano, Memoria) a todo el ancho. No hay
 * previsualización lateral permanente: en un módulo cuyo resultado ES una
 * tabla, lo «vivo» son las columnas derivadas dentro del propio editor.
 *
 * El estado es anidado, así que no usa `useModuleState` (que sólo maneja
 * primitivos planos): clave propia en localStorage, como el módulo de sismo.
 * Ver `state.ts`.
 *
 * Cada vista tiene su formato porque tiene su destino, y por eso el botón de
 * exportar entrega LO QUE SE ESTÁ MIRANDO: la vista de memoria sale a Word, para
 * pegarla en la memoria del proyecto; la de plano sale a Excel, para capturarla
 * y meterla en el plano (y más adelante a DXF, para el CAD). Un solo botón que
 * cambia de rótulo, en vez de tres fijos en una barra ya cargada.
 */

import { useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { MATERIALES_FALLBACK_DOCX, MATERIALES_FALLBACK_XLSX } from '../../lib/export/filename';
import {
  cuadroAceroEstructural,
  cuadroAceros,
  cuadroAnclajes,
  cuadroCoeficientesMinoracion,
  cuadroDurabilidadMadera,
  cuadroHormigonMemoria,
  cuadroHormigonPlano,
  cuadroMadera,
  type Block,
} from '../../lib/materiales/cuadros';
import { FYK_ACERO_PASIVO } from '../../lib/materiales/tablasCE';
import { AceroEstructural } from './AceroEstructural';
import { Documento } from './Documento';
import { PerfilEstudio } from './PerfilEstudio';
import { TablaHormigon } from './TablaHormigon';
import { TablaMadera } from './TablaMadera';
import {
  cargarEstado,
  evaluar,
  filaDesdePreset,
  filaMaderaDesdePreset,
  guardarEstado,
  nuevoId,
  tipificacionLimpieza,
  type FilaAcero,
  type FilaHormigon,
  type FilaMadera,
  type MaterialesState,
  type PerfilEstudio as Perfil,
} from './state';

type Vista = 'datos' | 'plano' | 'memoria';

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'plano', etiqueta: 'Plano' },
  { id: 'memoria', etiqueta: 'Memoria' },
];

export function MaterialesModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<MaterialesState>(cargarEstado);
  const [vista, setVista] = useState<Vista>('datos');

  /** Todo cambio pasa por aquí: actualiza y persiste con la misma llamada. */
  const actualizar = (cambio: (prev: MaterialesState) => MaterialesState) => {
    setState((prev) => {
      const siguiente = cambio(prev);
      guardarEstado(siguiente);
      return siguiente;
    });
  };

  const evaluacion = useMemo(() => evaluar(state), [state]);

  const derivacionesHormigon = useMemo(
    () => new Map(evaluacion.hormigon.map((h) => [h.fila.id, h.derivacion])),
    [evaluacion],
  );
  const derivacionesMadera = useMemo(
    () => new Map(evaluacion.madera.map((m) => [m.fila.id, m.derivacion])),
    [evaluacion],
  );

  // ── Documento ─────────────────────────────────────────────────────────────

  /**
   * Lo que llevan las DOS vistas del documento: aceros, madera y coeficientes.
   * Plano y memoria sólo se diferencian en la tabla de hormigón —una fila por
   * elemento frente a una columna—, así que el resto se construye una vez. Que
   * estuviera escrito sólo dentro del plano era el motivo de que la memoria
   * saliera con el hormigón y nada más.
   */
  /**
   * Los anclajes no son un apartado que se pida: salen solos del acero corrugado
   * elegido —un B 400 tiene otras longitudes que un B 500— y de los hormigones
   * que la obra usa de verdad. En pantalla y en el Word van pegados al cuadro de
   * acero, que es de donde sale el fyk que los gobierna; en el Excel se van a su
   * propia pestaña, porque sus celdas son números de dos cifras y compartir
   * columna con «Mín. contenido de cemento» los dejaba estirados. Por eso viven
   * en su propio memo en vez de dentro de `bloquesComunes`.
   *
   * Los hormigones que se tabulan son los de los elementos; el par por defecto
   * sólo cubre el arranque, cuando aún no hay ninguno resuelto: una tabla de
   * anclajes de un HA que no aparece en ningún elemento es ruido en el plano.
   */
  const bloquesAnclajes = useMemo<Block[]>(() => {
    if (!state.usaHormigon) return [];
    const enObra = [...new Set(evaluacion.hormigon.map((h) => h.derivacion.fckAdoptada))].sort(
      (a, b) => a - b,
    );
    return cuadroAnclajes(
      enObra.length > 0 ? enObra : state.hormigonesAnclaje,
      FYK_ACERO_PASIVO[state.estudio.aceroPasivo],
      state.diametrosAnclaje,
      state.estudio.aceroPasivo,
    );
  }, [state, evaluacion]);

  const bloquesComunes = useMemo<Block[]>(() => {
    const bloques: Block[] = [];
    bloques.push(
      ...cuadroAceros({
        aceroPasivo: state.estudio.aceroPasivo,
        malla: state.estudio.malla,
        aceroEstructural: state.usaAceroEstructural ? state.estudio.aceroEstructural : null,
        nivelControl: state.estudio.nivelControlAcero,
      }),
    );
    bloques.push(...bloquesAnclajes);
    if (state.usaAceroEstructural && evaluacion.acero) {
      bloques.push(...cuadroAceroEstructural(evaluacion.acero, state.estudio.vidaUtilAnios));
    }
    if (state.usaMadera && evaluacion.madera.length > 0) {
      const derivaciones = evaluacion.madera.map((m) => m.derivacion);
      bloques.push(...cuadroMadera(derivaciones), ...cuadroDurabilidadMadera(derivaciones));
    }
    bloques.push(
      ...cuadroCoeficientesMinoracion({
        maderaLaminada: state.usaMadera && evaluacion.madera.some((m) => m.fila.tipo === 'laminada'),
        maderaMaciza: state.usaMadera && evaluacion.madera.some((m) => m.fila.tipo === 'maciza'),
        aceroLaminado: state.usaAceroEstructural,
        aceroDeArmar: state.usaHormigon,
        hormigon: state.usaHormigon,
      }, state.resistenciaFuego),
    );
    return bloques;
  }, [state, evaluacion, bloquesAnclajes]);

  const bloquesPlano = useMemo<Block[]>(() => {
    const bloques: Block[] = [];
    if (state.usaHormigon) {
      bloques.push(
        ...cuadroHormigonPlano(
          evaluacion.hormigon.map((h) => h.derivacion),
          evaluacion.limpieza.map((f) => ({
            nombre: f.nombre.trim() || 'Hormigón de limpieza',
            tipificacion: tipificacionLimpieza(f.consistencia, state.estudio.tamMaxArido),
            nivelControl: 'Según capítulos 13 y 14',
          })),
        ),
      );
    }
    return [...bloques, ...bloquesComunes];
  }, [state, evaluacion, bloquesComunes]);

  /**
   * El cuadro de plano sin los anclajes, para la primera pestaña del Excel. Se
   * quita por SUSTRACCIÓN y no recomponiendo la lista: así lo que se exporta y
   * lo que se ve en pantalla no pueden divergir el día que se añada un cuadro.
   */
  const bloquesPlanoSinAnclajes = useMemo<Block[]>(
    () => bloquesPlano.filter((b) => !bloquesAnclajes.includes(b)),
    [bloquesPlano, bloquesAnclajes],
  );

  const bloquesMemoria = useMemo<Block[]>(() => {
    const bloques: Block[] = [];
    if (state.usaHormigon && evaluacion.hormigon.length > 0) {
      bloques.push(...cuadroHormigonMemoria(evaluacion.hormigon.map((h) => h.derivacion)));
    }
    const todos = [...bloques, ...bloquesComunes];
    return todos.length > 0
      ? todos
      : [
          {
            kind: 'paragraph',
            text: 'Sin materiales resueltos: los cuadros de memoria aparecerán aquí en cuanto haya alguno.',
          },
        ];
  }, [state.usaHormigon, evaluacion, bloquesComunes]);

  // ── Acciones del formulario ───────────────────────────────────────────────

  const cambiarFila = (id: string, cambio: Partial<FilaHormigon>) =>
    actualizar((p) => ({
      ...p,
      elementos: p.elementos.map((f) => (f.id === id ? { ...f, ...cambio } : f)),
    }));

  const cambiarFilaMadera = (id: string, cambio: Partial<FilaMadera>) =>
    actualizar((p) => ({
      ...p,
      maderaGrupos: p.maderaGrupos.map((f) => (f.id === id ? { ...f, ...cambio } : f)),
    }));

  const cambiarFilaAcero = (id: string, cambio: Partial<FilaAcero>) =>
    actualizar((p) => ({
      ...p,
      aceroEstr: {
        ...p.aceroEstr,
        elementos: p.aceroEstr.elementos.map((f) => (f.id === id ? { ...f, ...cambio } : f)),
      },
    }));

  // ── Exportación a Word ───────────────────────────────────────

  // El título vive FUERA de `MaterialesState`: metido ahí, cada tecla del nombre
  // del documento reejecutaría `evaluar()` sobre toda la obra y obligaría a
  // versionar el esquema persistido por un dato que no es de cálculo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-materiales-title');

  // Un cuadro sin un solo material resuelto sí está «listo» —no hay huecos que
  // resolver— pero su documento es la frase «Sin materiales resueltos…». Eso no
  // es un Word que entregar, así que la puerta pide además que haya algo dentro.
  const hayContenido =
    evaluacion.hormigon.length + evaluacion.madera.length > 0 || evaluacion.acero !== null;
  const exportarBloqueado = !evaluacion.listo || !hayContenido;

  // El formato lo decide la pestaña. En «Datos» no hay documento a la vista, así
  // que se ofrece el Word de la memoria, que es el entregable principal.
  const aExcel = vista === 'plano';
  const formato = aExcel
    ? { etiqueta: 'Excel', fallback: MATERIALES_FALLBACK_XLSX, extension: 'xlsx' }
    : { etiqueta: 'Word', fallback: MATERIALES_FALLBACK_DOCX, extension: 'docx' };

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render:
    // así cada exportador sigue en su chunk perezoso y sólo lo descarga quien
    // exporta de verdad.
    exportFn: async (titulo) => {
      if (aExcel) {
        const { exportarMaterialesXlsx } = await import('../../lib/xlsx/materiales');
        // Dos pestañas: una columna de Excel tiene UN ancho, y los anclajes
        // compartiendo columna con el cuadro de hormigón salían estirados.
        return exportarMaterialesXlsx(
          [
            { nombre: 'Cuadro de materiales', blocks: bloquesPlanoSinAnclajes },
            { nombre: 'Anclajes', blocks: bloquesAnclajes },
          ],
          titulo,
        );
      }
      const { exportarMaterialesDocx } = await import('../../lib/docx/materiales');
      return exportarMaterialesDocx(bloquesMemoria, titulo);
    },
    valid: !exportarBloqueado,
    onTitleChange: setDocTitle,
    formatoLabel: aExcel ? 'Excel' : 'documento de Word',
    invalidMessage: evaluacion.listo
      ? 'Añada algún material antes de exportar'
      : 'Resuelva los huecos rojos antes de exportar',
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const nElementos =
    evaluacion.hormigon.length + evaluacion.limpieza.length + evaluacion.madera.length;
  const nHuecos = evaluacion.huecos.length + evaluacion.huecosMadera.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        moduleLabel="Cuadro de materiales"
        moduleGroup="Memorias"
        onMenuOpen={openDrawer}
        onExportPdf={openExport}
        pdfExporting={exportando}
        exportLabel={`Exportar ${formato.etiqueta}`}
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-main bg-bg-surface px-4 py-1.5">
        <div className="flex" role="tablist" aria-label="Vistas del cuadro">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={vista === v.id}
              onClick={() => setVista(v.id)}
              className={[
                'px-3 py-1.5 text-[12px] font-medium transition-colors',
                vista === v.id
                  ? 'text-accent'
                  : 'text-text-secondary hover:text-text-primary',
              ].join(' ')}
              style={
                vista === v.id
                  ? { borderBottom: '2px solid var(--color-accent)' }
                  : { borderBottom: '2px solid transparent' }
              }
            >
              {v.etiqueta}
            </button>
          ))}
        </div>

        <span className="ml-auto font-mono text-[11px] text-text-disabled">
          {nElementos} {nElementos === 1 ? 'elemento' : 'elementos'}
          {nHuecos > 0 && (
            <span className="text-state-fail">
              {' · '}
              {nHuecos} sin resolver
            </span>
          )}
          {evaluacion.avisos > 0 && (
            <span className="text-state-warn">
              {' · '}
              {evaluacion.avisos} {evaluacion.avisos === 1 ? 'aviso' : 'avisos'}
            </span>
          )}
        </span>

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

      <div className="min-h-0 flex-1 overflow-y-auto scroll-hide px-4 py-4">
        {vista === 'datos' ? (
          <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
            <PerfilEstudio
              state={state}
              ayuda={state.ayuda}
              onMaterial={(cambio) => actualizar((p) => ({ ...p, ...cambio }))}
              onEstudio={(cambio: Partial<Perfil>) =>
                actualizar((p) => ({ ...p, estudio: { ...p.estudio, ...cambio } }))
              }
            />

            {state.usaHormigon && (
              <TablaHormigon
                filas={state.elementos}
                tamMaxArido={state.estudio.tamMaxArido}
                derivaciones={derivacionesHormigon}
                costa={state.costa}
                heladas={state.heladas}
                terrenoAgresivo={state.terrenoAgresivo}
                ayuda={state.ayuda}
                onCambiar={cambiarFila}
                onBorrar={(id) =>
                  actualizar((p) => ({ ...p, elementos: p.elementos.filter((f) => f.id !== id) }))
                }
                onAnadir={(nombre) =>
                  actualizar((p) => ({ ...p, elementos: [...p.elementos, filaDesdePreset(nombre)] }))
                }
                onCosta={(costa) => actualizar((p) => ({ ...p, costa }))}
                onHeladas={(heladas) => actualizar((p) => ({ ...p, heladas }))}
                onTerreno={(terrenoAgresivo) => actualizar((p) => ({ ...p, terrenoAgresivo }))}
              />
            )}

            {state.usaAceroEstructural && (
              <AceroEstructural
                datos={state.aceroEstr}
                derivacion={evaluacion.acero}
                ayuda={state.ayuda}
                onCambiarClasificacion={(cambio) =>
                  actualizar((p) => ({ ...p, aceroEstr: { ...p.aceroEstr, ...cambio } }))
                }
                onCambiarFila={cambiarFilaAcero}
                onBorrar={(id) =>
                  actualizar((p) => ({
                    ...p,
                    aceroEstr: {
                      ...p.aceroEstr,
                      elementos: p.aceroEstr.elementos.filter((f) => f.id !== id),
                    },
                  }))
                }
                onAnadir={() =>
                  actualizar((p) => ({
                    ...p,
                    aceroEstr: {
                      ...p.aceroEstr,
                      elementos: [
                        ...p.aceroEstr.elementos,
                        {
                          id: nuevoId('a'),
                          nombre: '',
                          union: 'soldadura',
                          caracteristicasUnion: 'En ángulo',
                          corrosividad: 'C1',
                        },
                      ],
                    },
                  }))
                }
              />
            )}

            {state.usaMadera && (
              <TablaMadera
                filas={state.maderaGrupos}
                derivaciones={derivacionesMadera}
                ayuda={state.ayuda}
                onCambiar={cambiarFilaMadera}
                onBorrar={(id) =>
                  actualizar((p) => ({
                    ...p,
                    maderaGrupos: p.maderaGrupos.filter((f) => f.id !== id),
                  }))
                }
                onAnadir={(nombre) =>
                  actualizar((p) => ({
                    ...p,
                    maderaGrupos: [...p.maderaGrupos, filaMaderaDesdePreset(nombre)],
                  }))
                }
              />
            )}

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-text-disabled">
              <span className="flex items-center gap-1.5">
                <i
                  className="inline-block h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: 'var(--color-accent)' }}
                  aria-hidden="true"
                />
                derivado, no se teclea
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  className="inline-block h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: 'var(--color-state-warn)' }}
                  aria-hidden="true"
                />
                aviso: la norma corrige lo introducido
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  className="inline-block h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: 'var(--color-state-fail)' }}
                  aria-hidden="true"
                />
                hueco sin resolver, bloquea exportar
              </span>
            </p>
          </div>
        ) : (
          <>
            {state.ayuda && vista === 'plano' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                Cómo se lee una tipificación:{' '}
                <b className="font-mono text-text-secondary">HA-30/B/20/XC2</b> = hormigón armado de
                resistencia 30 N/mm² · consistencia Blanda · árido máximo 20 mm · clase de exposición
                XC2 (enterrado).
              </p>
            )}
            {state.ayuda && vista === 'memoria' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                «Exportar Word» entrega <b className="text-text-secondary">este</b> cuadro, el de
                memoria, con los estilos de Título de Word para que se pegue en la memoria del
                proyecto y herede su numeración.
              </p>
            )}
            {state.ayuda && vista === 'plano' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                «Exportar Excel» entrega <b className="text-text-secondary">este</b> cuadro, el de
                plano, en una hoja sin cuadrícula y con los anchos ya ajustados: se selecciona, se
                captura y se pega en el plano.
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

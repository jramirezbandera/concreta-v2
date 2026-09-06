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
 * Además de los tres ficheros, el cuadro sale por una cuarta puerta que no se
 * descarga: en cuanto está resuelto se PUBLICA en `concreta-pub-materiales`
 * (ver `lib/pub`), de donde lo tomará la ficha DB SE sin leer este estado.
 *
 * Cada cuadro tiene sus formatos porque tiene su destino: el de memoria sale a
 * Word, para pegarlo en la memoria del proyecto, y a PDF, para enviarlo o
 * imprimirlo; el de plano sale a Excel, para capturarlo, y a DXF, para el CAD.
 * Las cuatro salidas cuelgan de UN botón «Exportar», el mismo en las tres
 * pestañas, que las despliega agrupadas por cuadro. Antes la barra enseñaba el
 * par de la vista abierta y cambiaba de rótulo con la pestaña: para bajar el
 * Excel había que ir a Plano, y en Datos no se sabía qué se bajaba hasta pulsar.
 */

import { useEffect, useMemo, useState } from 'react';
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import {
  MATERIALES_FALLBACK_DOCX,
  MATERIALES_FALLBACK_DXF,
  MATERIALES_FALLBACK_PDF,
  MATERIALES_FALLBACK_XLSX,
} from '../../lib/export/filename';
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
  hayMaterialesResueltos,
  limpiezaPrescrita,
  nuevoId,
  publicarResultado,
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

type FormatoId = 'docx' | 'pdf' | 'xlsx' | 'dxf';

/** Lo que cambia de un formato a otro: rótulo, extensión y nombre por defecto. */
const FORMATOS: Record<
  FormatoId,
  { etiqueta: string; fallback: string; extension: string; enError: string }
> = {
  docx: {
    etiqueta: 'Word',
    fallback: MATERIALES_FALLBACK_DOCX,
    extension: 'docx',
    enError: 'documento de Word',
  },
  xlsx: {
    etiqueta: 'Excel',
    fallback: MATERIALES_FALLBACK_XLSX,
    extension: 'xlsx',
    enError: 'Excel',
  },
  dxf: { etiqueta: 'DXF', fallback: MATERIALES_FALLBACK_DXF, extension: 'dxf', enError: 'DXF' },
  pdf: { etiqueta: 'PDF', fallback: MATERIALES_FALLBACK_PDF, extension: 'pdf', enError: 'PDF' },
};

const opcion = (id: FormatoId, detalle: string) => ({
  id,
  etiqueta: FORMATOS[id].etiqueta,
  detalle,
});

/**
 * Lo que despliega «Exportar»: las cuatro salidas, agrupadas por el cuadro que
 * entregan y con su destino en lenguaje de obra. El orden es el del uso: la
 * memoria es el entregable principal, y dentro de cada cuadro va primero el
 * formato editable.
 */
const GRUPOS_EXPORTAR: GrupoExportar<FormatoId>[] = [
  {
    titulo: 'Cuadro de memoria',
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

  // Publicar es un efecto del RESULTADO, no del tecleo: se hace después del
  // render, con la evaluación ya hecha, y sólo si hay cuadro que publicar.
  // Lo escrito en `concreta-pub-materiales` lo consumirá la ficha DB SE sin
  // leer este estado (ver `lib/pub`).
  useEffect(() => {
    publicarResultado(state, evaluacion);
  }, [state, evaluacion]);

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
            ...limpiezaPrescrita(f, state.estudio.tamMaxArido),
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

  // ── Exportación ───────────────────────────────────────────────

  // El título vive FUERA de `MaterialesState`: metido ahí, cada tecla del nombre
  // del documento reejecutaría `evaluar()` sobre toda la obra y obligaría a
  // versionar el esquema persistido por un dato que no es de cálculo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-materiales-title');

  // Un cuadro sin un solo material resuelto sí está «listo» —no hay huecos que
  // resolver— pero su documento es la frase «Sin materiales resueltos…». Eso no
  // es un Word que entregar, así que la puerta pide además que haya algo dentro.
  const hayContenido = hayMaterialesResueltos(evaluacion);
  const exportarBloqueado = !evaluacion.listo || !hayContenido;

  /**
   * Qué se exporta lo decide la opción elegida en «Exportar», no la pestaña
   * abierta: el mismo desplegable en las tres, con las cuatro salidas
   * agrupadas por cuadro (`GRUPOS_EXPORTAR`). Desde Datos se baja el DXF sin
   * pasar por Plano. El formato elegido se guarda aparte porque el modal del
   * título lo necesita antes de que exista el fichero: la preview del nombre y
   * el rótulo de confirmar salen de él.
   */
  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador, nunca memoizado durante el render:
    // así cada exportador sigue en su chunk perezoso y sólo lo descarga quien
    // exporta de verdad.
    exportFn: async (titulo) => {
      if (formatoElegido === 'xlsx') {
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
      if (formatoElegido === 'dxf') {
        const { exportarMaterialesDxf } = await import('../../lib/dxf/materiales');
        return exportarMaterialesDxf(bloquesPlano, titulo);
      }
      if (formatoElegido === 'pdf') {
        const { exportarMaterialesPdf } = await import('../../lib/pdf/materiales');
        return exportarMaterialesPdf(bloquesMemoria, titulo);
      }
      const { exportarMaterialesDocx } = await import('../../lib/docx/materiales');
      return exportarMaterialesDocx(bloquesMemoria, titulo);
    },
    valid: !exportarBloqueado,
    onTitleChange: setDocTitle,
    formatoLabel: formato.enError,
    invalidMessage: evaluacion.listo
      ? 'Añada algún material antes de exportar'
      : 'Resuelva los huecos rojos antes de exportar',
  });

  /** Fija el formato ANTES de abrir el modal: la preview del nombre lo usa. */
  const exportarComo = (id: FormatoId) => {
    setFormatoElegido(id);
    openExport();
  };

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
        exportMenu={
          <ExportarMenu grupos={GRUPOS_EXPORTAR} onElegir={exportarComo} exportando={exportando} />
        }
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
          {!exportarBloqueado && (
            <span className="text-accent" title="El cuadro queda disponible para la ficha DB SE">
              {' · '}publicado
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

            {state.ayuda && (
              <p className="px-1 text-[11.5px] leading-snug text-text-disabled">
                Mientras no queden huecos, el cuadro queda{' '}
                <b className="text-accent">publicado</b>: los materiales de esta obra quedan
                disponibles para los demás módulos y para la ficha de cumplimiento del DB SE, sin
                volver a teclearlos. Se guarda en este navegador, con el resto de la obra.
              </p>
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
                hueco sin resolver, bloquea exportar y publicar
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
                Este cuadro, el de memoria, tiene dos salidas en «Exportar».{' '}
                <b className="text-text-secondary">Word</b> lo entrega con los estilos de Título,
                para pegarlo en la memoria del proyecto y que herede su numeración y su tipografía.{' '}
                <b className="text-text-secondary">PDF</b> lo entrega ya maquetado y cerrado, para
                enviarlo, archivarlo o imprimirlo.
              </p>
            )}
            {state.ayuda && vista === 'plano' && (
              <p className="mx-auto mb-3 max-w-[1100px] text-[11.5px] leading-snug text-text-disabled">
                Este cuadro, el de plano, tiene dos salidas en «Exportar».{' '}
                <b className="text-text-secondary">Excel</b> lo entrega en una hoja sin cuadrícula y
                con los anchos ajustados, para seleccionar, capturar y pegar la imagen.{' '}
                <b className="text-text-secondary">DXF</b> lo entrega dibujado —líneas y textos en
                tres capas— para insertarlo en el CAD: va en metros y con el rótulo a 2,5 mm, así
                que se escala por la escala del plano.
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

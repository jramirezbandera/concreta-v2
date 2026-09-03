/**
 * Cuadro de materiales — orquestador del módulo.
 *
 * Primer módulo del capítulo Memorias. Cuatro pestañas: Datos (el formulario) y
 * tres vistas del documento (Plano, Memoria, Anclajes) a todo el ancho. No hay
 * previsualización lateral permanente: en un módulo cuyo resultado ES una
 * tabla, lo «vivo» son las columnas derivadas dentro del propio editor.
 *
 * El estado es anidado, así que no usa `useModuleState` (que sólo maneja
 * primitivos planos): clave propia en localStorage, como el módulo de sismo.
 * Ver `state.ts`.
 */

import { useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { showToast } from '../../components/ui/Toast';
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

type Vista = 'datos' | 'plano' | 'memoria' | 'anclajes';

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'plano', etiqueta: 'Plano' },
  { id: 'memoria', etiqueta: 'Memoria' },
  { id: 'anclajes', etiqueta: 'Anclajes' },
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
    bloques.push(
      ...cuadroAceros({
        aceroPasivo: state.estudio.aceroPasivo,
        malla: state.estudio.malla,
        aceroEstructural: state.usaAceroEstructural ? state.estudio.aceroEstructural : null,
        nivelControl: state.estudio.nivelControlAcero,
      }),
    );
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
      }),
    );
    return bloques;
  }, [state, evaluacion]);

  const bloquesMemoria = useMemo<Block[]>(() => {
    if (!state.usaHormigon || evaluacion.hormigon.length === 0) {
      return [
        {
          kind: 'paragraph',
          text: 'Sin elementos de hormigón resueltos: el cuadro de memoria aparecerá aquí en cuanto haya alguno.',
        },
      ];
    }
    return cuadroHormigonMemoria(evaluacion.hormigon.map((h) => h.derivacion));
  }, [state.usaHormigon, evaluacion]);

  const bloquesAnclajes = useMemo<Block[]>(() => {
    // Los hormigones que se tabulan son los que la obra usa de verdad, más los
    // del perfil por defecto: una tabla de anclajes de un HA que no aparece en
    // ningún elemento es ruido en el plano.
    const enObra = [...new Set(evaluacion.hormigon.map((h) => h.derivacion.fckAdoptada))].sort(
      (a, b) => a - b,
    );
    const hormigones = enObra.length > 0 ? enObra : state.hormigonesAnclaje;
    return cuadroAnclajes(
      hormigones,
      FYK_ACERO_PASIVO[state.estudio.aceroPasivo],
      state.diametrosAnclaje,
      state.estudio.aceroPasivo,
    );
  }, [evaluacion, state.diametrosAnclaje, state.estudio.aceroPasivo, state.hormigonesAnclaje]);

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

  const exportarBloqueado = !evaluacion.listo;

  const avisarExportacion = () => {
    if (exportarBloqueado) {
      showToast('Resuelva los huecos rojos antes de exportar', { autoDismiss: 3000 });
      return;
    }
    showToast('La exportación a .docx y .pdf llega en la próxima entrega', { autoDismiss: 3000 });
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
        onExportPdf={avisarExportacion}
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
                ayuda={state.ayuda}
                onCambiar={cambiarFila}
                onBorrar={(id) =>
                  actualizar((p) => ({ ...p, elementos: p.elementos.filter((f) => f.id !== id) }))
                }
                onAnadir={() =>
                  actualizar((p) => ({ ...p, elementos: [...p.elementos, filaDesdePreset('')] }))
                }
                onCosta={(costa) => actualizar((p) => ({ ...p, costa }))}
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
                onAnadir={() =>
                  actualizar((p) => ({
                    ...p,
                    maderaGrupos: [...p.maderaGrupos, filaMaderaDesdePreset('')],
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
            <Documento
              blocks={
                vista === 'plano'
                  ? bloquesPlano
                  : vista === 'memoria'
                    ? bloquesMemoria
                    : bloquesAnclajes
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Cumplimiento del DB SE — orquestador del módulo.
 *
 * La ficha de justificación del CTE DB SE (apartado 3.1 de la memoria),
 * ensamblada desde lo que publican los otros cuatro módulos —materiales,
 * viento y nieve, cargas por planta, sismo— más un formulario residual: la
 * obra, la geotecnia, la descripción de la estructura, las juntas, los
 * forjados y, si la hay, la fábrica. Sin previsualización: el formulario
 * sigue los apartados del documento y enseña en azul lo que se imprimirá;
 * Word y PDF cuelgan del desplegable «Exportar».
 *
 * Cuatro piezas de este módulo que no tienen los otros:
 *
 *  - «Nueva obra»: el perfil de estudio pasa limpio y cada dato de la obra
 *    queda en ámbar hasta confirmarlo o cambiarlo (ver `lib/memoria/estado`);
 *  - «Siguiente hueco»: lleva el foco al primer rojo o ámbar en el orden del
 *    documento, abriendo la sección que lo contiene. Enter resuelve el hueco
 *    que tiene el foco y baja al siguiente, y es el ritmo del módulo: los
 *    catorce datos que deja el geotécnico se confirman con catorce Enter;
 *  - las publicaciones se releen al volver a la pestaña (`focus`, `storage`),
 *    porque lo normal es ir al módulo de sismo, publicar, y volver;
 *  - «Leer el PDF del geotécnico»: el estudio geotécnico, leído con el
 *    asistente IA, rellena el 3.1.3 en ámbar con la página de donde sale cada
 *    dato (`lib/memoria/geotecnico`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { showToast } from '../../components/ui/Toast';
import { DialogoObra } from '../../components/layout/DialogoObra';
import { LeyendaEstados } from '../../components/ui/LeyendaEstados';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { useGuardarEnAnejo } from '../../hooks/useGuardarEnAnejo';
import { FORMATO_ANEJO, GRUPO_ANEJO, propsTituloAnejo, type IdAnejo } from '../../components/layout/opcionAnejo';
import { adaptadorDe } from '../../lib/anejo/modules';
import type { ResultadoExport } from '../../lib/export/descargar';
import { MEMORIA_DBSE_FALLBACK_DOCX, MEMORIA_DBSE_FALLBACK_PDF } from '../../lib/export/filename';
import { evaluar, tipologiasDe } from '../../lib/memoria/ensamblar';
import { aceptar, asegurarForjados, confirmar, confirmarVarios, teclear, type MemoriaState, type ModuloPub } from '../../lib/memoria/estado';
import { apartados as apartadosDe, bloquesFicha } from '../../lib/memoria/ficha';
import { aplicarExtraccion, type ExtraccionGeotecnico, type ResultadoLectura } from '../../lib/memoria/geotecnico';
import { contarHuecos, siguienteHueco } from '../../lib/memoria/huecos';
import type { ApartadoId, Hueco } from '../../lib/memoria/model';
import { guardarObra, leerObra, mismaObra } from '../../lib/obra';
import { BarraObra } from './BarraObra';
import { idDom } from './ids';
import { Avisos } from './Avisos';
import { GeotecnicoModal } from './GeotecnicoModal';
import { Seccion } from './Seccion';
import { SeccionCE, SeccionForjados, SeccionNCSE, SeccionSE, SeccionSEA, SeccionSEAE, SeccionSEC, SeccionSEF, SeccionSEM, type Acciones } from './secciones';
import { leerSobres, type Sobres } from './sobres';
import { cargarEstado, guardarEstado } from './state';
import { BOTON_ACENTO } from './estilos';

const ANEJO = adaptadorDe('concreta-memoria-dbse');

type FormatoId = 'docx' | 'pdf' | IdAnejo;

const FORMATOS: Record<FormatoId, { etiqueta: string; fallback: string; extension: string; enError: string }> = {
  docx: { etiqueta: 'Word', fallback: MEMORIA_DBSE_FALLBACK_DOCX, extension: 'docx', enError: 'documento de Word' },
  pdf: { etiqueta: 'PDF', fallback: MEMORIA_DBSE_FALLBACK_PDF, extension: 'pdf', enError: 'PDF' },
  anejo: { ...FORMATO_ANEJO, fallback: MEMORIA_DBSE_FALLBACK_PDF },
};

const GRUPOS_EXPORTAR: GrupoExportar<FormatoId>[] = [
  {
    titulo: 'Ficha 3.1 — Cumplimiento del DB SE',
    opciones: [
      { id: 'docx', etiqueta: 'Word', detalle: 'para pegar en la memoria del proyecto' },
      { id: 'pdf', etiqueta: 'PDF', detalle: 'maquetado y cerrado, para enviar o imprimir' },
    ],
  },
  GRUPO_ANEJO,
];

/** Referencia normativa de cada sección, a la derecha de su cabecera. */
const REF: Record<ApartadoId, string> = {
  indice: 'CTE',
  se: 'DB SE',
  seae: 'DB SE-AE',
  sec: 'DB SE-C',
  ncse: 'NCSE-02',
  ce: 'Código Estructural',
  forjados: 'CE · Anejo 19',
  sea: 'DB SE-A',
  sef: 'DB SE-F',
  sem: 'DB SE-M',
};

/**
 * Qué secciones arrancan abiertas: las que PIDEN algo, y cerradas las que ya
 * están. Es la misma regla del panel de la obra —lo hecho se pliega, lo que
 * falta sale entero— y por las mismas razones.
 *
 * Arrancaban seis de nueve abiertas pasara lo que pasara, y eso era la pared:
 * al entrar en la ficha lo primero que se veía eran doscientas líneas de
 * formulario sin saber cuál de ellas pedía algo. Cerrar las nueve tampoco
 * valía —la ficha quedaba sin nada accionable—, así que decide el contenido.
 *
 * Se calcula UNA vez, al entrar. Si se recalculara, cada sección se cerraría
 * sola al terminarla y el sitio donde estabas se te iría de debajo.
 *
 * No hace falta un índice aparte, que es lo que se había llegado a diseñar:
 * cerradas, las nueve secciones caben en una pantalla con su chip de cuánto
 * les falta, así que la ficha ES su propio índice. Un índice al lado sería una
 * segunda navegación sobre exactamente la misma información.
 */
const aperturaAlArrancar = (apartados: readonly string[], huecos: readonly Hueco[]): Record<string, boolean> =>
  Object.fromEntries(apartados.map((id) => [id, huecos.some((h) => h.apartado === id)]));

export function MemoriaDBSEModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<MemoriaState>(cargarEstado);
  const [sobres, setSobres] = useState<Sobres>(leerSobres);
  const [obraGuardada, setObraGuardada] = useState(leerObra);
  const [obraAbierta, setObraAbierta] = useState(false);
  const [faltasAbierto, setFaltasAbierto] = useState(false);
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  const [geotecnicoAbierto, setGeotecnicoAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  /** Todo cambio pasa por aquí: actualiza, persiste y relee lo ajeno. */
  const actualizar = useCallback((cambio: (prev: MemoriaState) => MemoriaState) => {
    setState((prev) => {
      const siguiente = cambio(prev);
      if (siguiente !== prev) guardarEstado(siguiente);
      return siguiente;
    });
    setSobres(leerSobres());
    setObraGuardada(leerObra());
  }, []);

  // Lo normal es ir al módulo de sismo, publicar, y volver: al volver se relee.
  useEffect(() => {
    const releer = () => {
      setSobres(leerSobres());
      setObraGuardada(leerObra());
    };
    window.addEventListener('focus', releer);
    window.addEventListener('storage', releer);
    return () => {
      window.removeEventListener('focus', releer);
      window.removeEventListener('storage', releer);
    };
  }, []);

  // `datosObra` es el reflejo de `concreta-obra` dentro del estado. Si la obra
  // cambia —el diálogo de aquí, el del menú, otra pestaña— la ficha tiene que
  // verlo sin recargar. En la pantalla de la obra esto lo hará un store con
  // `useSyncExternalStore`, y este efecto sobrará.
  useEffect(() => {
    setState((prev) => (mismaObra(prev.datosObra, obraGuardada) ? prev : { ...prev, datosObra: obraGuardada }));
  }, [obraGuardada]);

  // Los forjados que publica Cargas por planta entran en la capa de obra con
  // sus defaults heredados, para que «Confirmar» tenga dónde escribir.
  useEffect(() => {
    const tipologias = tipologiasDe(sobres.cargasPlanta);
    if (tipologias.length === 0) return;
    setState((prev) => {
      const s = asegurarForjados(prev, tipologias);
      if (s !== prev) guardarEstado(s);
      return s;
    });
  }, [sobres.cargasPlanta]);

  const evaluacion = useMemo(() => evaluar(state, sobres), [state, sobres]);
  const { datos, huecos, listo, mensajeBloqueo, mensajeAviso } = evaluacion;
  const cuenta = contarHuecos(huecos);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>(() => aperturaAlArrancar(Object.keys(datos.procede), huecos));
  const ayuda = state.ayuda;

  const on: Acciones = useMemo(
    () => ({
      teclear: (id, valor) => actualizar((p) => teclear(p, id, valor)),
      confirmar: (id) => actualizar((p) => confirmar(p, id)),
      fabrica: (procede) => actualizar((p) => ({ ...p, obra: { ...p.obra, fabrica: { ...p.obra.fabrica, procede } } })),
      geotecnico: () => setGeotecnicoAbierto(true),
    }),
    [actualizar],
  );

  // El estado más reciente para el modal del geotécnico: su callback llega
  // segundos después de abrirse (la IA tarda) y no debe pisar lo tecleado
  // mientras tanto. Se escribe en un efecto, nunca en el render (React Compiler).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const aplicarGeotecnico = (ex: ExtraccionGeotecnico, nombre: string): ResultadoLectura => {
    const r = aplicarExtraccion(stateRef.current, ex, nombre);
    actualizar(() => r.state);
    return r;
  };

  /**
   * Dar por bueno lo publicado tal como está: el aviso de que se calculó en
   * otro sitio, o el de que el módulo sigue con sus valores de partida. Es la
   * única aceptación que queda; usar lo publicado ya no se pide.
   */
  const aceptarPub = (modulo: ModuloPub) => {
    const sobre = leerSobres()[modulo];
    if (!sobre) return;
    actualizar((p) => aceptar(p, modulo, sobre));
  };

  /**
   * Da por revisados de una vez los datos de un apartado que vienen de otra
   * obra. Sustituye a encadenar Enter catorce veces, que no era un control de
   * nada: quien las da acaba dándolas sin mirar. Lleva su deshacer, porque no
   * es obligatorio y no debe parecerlo.
   */
  const revisarApartado = (apartado: ApartadoId) => {
    const ids = huecos.filter((h) => h.apartado === apartado && h.estado === 'heredado').map((h) => h.id);
    if (ids.length === 0) return;
    const anterior = state;
    actualizar((p) => confirmarVarios(p, ids));
    showToast(`${ids.length} ${ids.length === 1 ? 'dato dado por revisado' : 'datos dados por revisados'}`, {
      autoDismiss: 6000,
      action: { label: 'Deshacer', onClick: () => actualizar(() => anterior) },
    });
  };

  // ── Siguiente hueco ───────────────────────────────────────────────────────

  const irAHueco = useCallback((h: Hueco | null) => {
    if (!h) return;
    setAbiertas((a) => ({ ...a, [h.apartado]: true }));
    // La sección puede estar cerrada: el control existe en el frame siguiente.
    requestAnimationFrame(() => {
      const el = document.getElementById(idDom(h.id));
      if (!el) return;
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      el.focus?.();
    });
  }, []);

  const huecoConFoco = (): Hueco | null => {
    const id = document.activeElement?.id;
    return id ? (huecos.find((h) => idDom(h.id) === id) ?? null) : null;
  };

  const siguiente = () => irAHueco(siguienteHueco(huecos, huecoConFoco()?.id ?? null));

  // ── Obra ──────────────────────────────────────────────────────────────────
  //
  // Ya no hay nada que sincronizar: los cinco datos son de `concreta-obra`, se
  // piden en el diálogo del menú de obra y la ficha sólo los enseña. Los dos
  // botones de copiarlos de un lado a otro se fueron con la duplicación.

  // ── Exportación: Word y PDF ───────────────────────────────────────────────

  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];
  const bloques = useMemo(() => bloquesFicha(datos), [datos]);
  const tituloInicial = `Memoria DB SE — ${obraGuardada?.denominacion || 'obra'}`;

  // «Guardar en el anejo» (design doc, F5): el mismo PDF de la memoria,
  // guardado como capítulo del anejo de la obra en vez de bajar al disco.
  const anejo = useGuardarEnAnejo();
  const entregarAlAnejo = async (r: ResultadoExport, titulo: string) => {
    await anejo.guardar({ modulo: ANEJO.modulo, titulo, blob: r.blob });
  };

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador: cada exportador sigue en su chunk perezoso.
    exportFn: async (titulo) => {
      if (formatoElegido === 'pdf' || formatoElegido === 'anejo') {
        const { exportarMemoriaDBSEPdf } = await import('../../lib/pdf/memoriaDBSE');
        return exportarMemoriaDBSEPdf(bloques, titulo);
      }
      const { exportarMemoriaDBSEDocx } = await import('../../lib/docx/memoriaDBSE');
      return exportarMemoriaDBSEDocx(bloques, titulo);
    },
    valid: listo,
    onTitleChange: () => {},
    entregar: formatoElegido === 'anejo' ? entregarAlAnejo : undefined,
    formatoLabel: formato.enError,
    invalidMessage: mensajeBloqueo ?? undefined,
  });

  /**
   * Exportar, con las dos paradas que hacían falta:
   *
   *  - con FALTAS no se puede, y hasta 2026-09-12 eso era un toast que decía
   *    cuántos huecos quedaban sin decir CUÁLES. Ahora los enumera y lleva al
   *    primero;
   *  - con ámbares sí se puede —es lo que cambió—, pero se dicen antes de
   *    generar el fichero, no después.
   *
   * Los dos avisos van ANTES del diálogo del título: preguntar cómo se llama
   * el documento y luego negarse a generarlo era el peor orden posible.
   */
  const exportarComo = (id: FormatoId) => {
    setFormatoElegido(id);
    if (!listo) return setFaltasAbierto(true);
    if (mensajeAviso !== null) return setAvisoAbierto(true);
    openExport();
  };

  const faltas = huecos.filter((h) => h.estado === 'falta');

  // ── Secciones ─────────────────────────────────────────────────────────────

  const lista = apartadosDe(datos);
  const huecosDe = (id: ApartadoId) => huecos.filter((h) => h.apartado === id);
  const abrir = (id: string) => (open: boolean) => setAbiertas((a) => ({ ...a, [id]: open }));
  const props = { datos, state, ayuda, on };
  const cuerpo: Partial<Record<ApartadoId, React.ReactNode>> = {
    se: <SeccionSE {...props} />,
    seae: <SeccionSEAE {...props} />,
    sec: <SeccionSEC {...props} />,
    ncse: <SeccionNCSE {...props} />,
    ce: <SeccionCE {...props} />,
    forjados: <SeccionForjados {...props} />,
    sea: <SeccionSEA {...props} />,
    sef: <SeccionSEF {...props} />,
    sem: <SeccionSEM {...props} />,
  };
  const noProcedePorque: Partial<Record<ApartadoId, string>> = {
    sea: 'No procede: sin acero estructural en el cuadro de materiales.',
    sem: 'No procede: sin madera en el cuadro de materiales.',
  };

  const derecha = (
    <>
      <span className="font-mono text-[11px] text-text-disabled" aria-live="polite">
        {cuenta.faltan > 0 ? (
          <>
            <span className="text-state-fail">
              {cuenta.faltan} {cuenta.faltan === 1 ? 'falta' : 'faltan'}
            </span>
            {cuenta.heredados > 0 && <span className="text-state-warn"> · {cuenta.heredados} por confirmar</span>}
            {cuenta.revisar > 0 && <span className="text-state-warn"> · {cuenta.revisar} de otro sitio</span>}
          </>
        ) : cuenta.total === 0 ? (
          <span className="text-accent">sin huecos · lista para exportar</span>
        ) : (
          <>
            <span className="text-accent">lista para exportar</span>
            {cuenta.heredados > 0 && <span className="text-state-warn"> · {cuenta.heredados} por confirmar</span>}
            {cuenta.revisar > 0 && <span className="text-state-warn"> · {cuenta.revisar} de otro sitio</span>}
          </>
        )}
      </span>
      <button type="button" onClick={siguiente} disabled={cuenta.total === 0} className={BOTON_ACENTO + ' disabled:cursor-default disabled:opacity-50'} title={cuenta.total === 0 ? 'No queda nada por resolver' : 'Salta al siguiente dato sin resolver'}>
        Siguiente hueco
      </button>
      <button
        type="button"
        onClick={() => actualizar((p) => ({ ...p, ayuda: !p.ayuda }))}
        aria-pressed={ayuda}
        title="Muestra u oculta las explicaciones de cada campo"
        className={['rounded px-2.5 py-1 text-[11.5px] transition-colors', ayuda ? 'border border-accent/40 bg-accent/15 text-accent' : 'border border-border-main bg-bg-elevated text-text-disabled hover:text-text-secondary'].join(' ')}
      >
        Ayuda {ayuda ? '✓' : ''}
      </button>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar moduleLabel="Cumplimiento del DB SE" moduleGroup="Memorias" onMenuOpen={openDrawer} exportMenu={<ExportarMenu grupos={GRUPOS_EXPORTAR} onElegir={exportarComo} exportando={exportando} />} />

      <BarraObra obra={datos.obra} ayuda={ayuda} onEditar={() => setObraAbierta(true)} derecha={derecha} />

      <div ref={contenedor} className="scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-3">
          <Avisos fuentes={datos.fuentes} onAceptar={aceptarPub} />

          {lista
            .filter((a) => a.id !== 'indice')
            .map((a) => (
              <Seccion
                key={a.id}
                id={a.id}
                numero={a.numero}
                titulo={a.titulo.replace(/^3\.1\.\d\.?\s*/, '')}
                refNorma={REF[a.id]}
                open={abiertas[a.id] ?? false}
                onOpenChange={abrir(a.id)}
                huecos={huecosDe(a.id)}
                procede={a.procede}
                onRevisar={() => revisarApartado(a.id)}
                summary={!a.procede ? (noProcedePorque[a.id] ?? 'No procede.') : undefined}
              >
                {cuerpo[a.id]}
              </Seccion>
            ))}

          <LeyendaEstados />
        </div>
      </div>

      {faltasAbierto && (
        <ConfirmDialog
          title={mensajeBloqueo ?? 'Faltan datos'}
          confirmLabel="Ir al primero"
          onConfirm={() => {
            setFaltasAbierto(false);
            irAHueco(faltas[0] ?? null);
          }}
          onCancel={() => setFaltasAbierto(false)}
        >
          <p>Sin estos datos la ficha no se puede cerrar:</p>
          <ul className="mt-1.5 ml-4 list-disc">
            {faltas.slice(0, 8).map((h) => (
              <li key={h.id}>{h.etiqueta}</li>
            ))}
          </ul>
          {faltas.length > 8 && <p className="mt-1.5">y {faltas.length - 8} más.</p>}
        </ConfirmDialog>
      )}

      {avisoAbierto && (
        <ConfirmDialog
          title="Hay cosas por mirar"
          confirmLabel="Exportar igualmente"
          onConfirm={() => {
            setAvisoAbierto(false);
            openExport();
          }}
          onCancel={() => setAvisoAbierto(false)}
        >
          <p>Queda {mensajeAviso}. Se imprime tal cual: no impide entregar el documento, pero conviene mirarlo antes de firmarlo.</p>
        </ConfirmDialog>
      )}

      {obraAbierta && (
        <DialogoObra
          titulo="Datos de la obra"
          texto="Los heredan todos los módulos y encabezan la memoria."
          confirmar="Guardar los datos"
          inicial={obraGuardada}
          onConfirm={(o) => {
            setObraGuardada(guardarObra(o));
            setObraAbierta(false);
          }}
          onCancel={() => setObraAbierta(false)}
        />
      )}

      {geotecnicoAbierto && <GeotecnicoModal onAplicar={aplicarGeotecnico} onClose={() => setGeotecnicoAbierto(false)} />}

      {anejo.dialogo}
      {titleOpen && (
        <TitlePromptModal initialTitle={tituloInicial} fallbackFilename={formato.fallback} exporting={exportando} formatLabel={formato.etiqueta} extension={formato.extension} {...(formatoElegido === 'anejo' ? propsTituloAnejo(ANEJO.capitulo) : {})} onConfirm={confirmTitle} onCancel={closeTitle} />
      )}
    </div>
  );
}

/**
 * El panel de la obra: qué falta para poder entregar, y un clic para
 * resolverlo.
 *
 * Es la pantalla de entrada de la app (ver `lib/obra/entrada.ts`). Nace de la
 * queja de que la ficha DB SE no decía qué había que hacer ni por qué seguía
 * bloqueado el exportar: aquello lo contaba con vocabulario de dentro —huecos,
 * publicaciones, sobres tomados— y repartido por cinco sitios distintos.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CABECERA   nombre + los cinco datos de obra + [Editar] ← concreta-obra    │
 * │ VEREDICTO  medidor + «faltan N datos» + UNA acción                       │
 * ├────────────────────────────────────────────┬─────────────────────────────┤
 * │ OTROS MÓDULOS   los cuatro que publican    │ LO QUE SE ENTREGA           │
 * │ LA FICHA        los apartados que proceden │  la justificación DB SE     │
 * │ EL ANEJO        lo calculado y sin guardar │  el anejo de cálculo        │
 * └────────────────────────────────────────────┴─────────────────────────────┘
 *
 * Las dos columnas son del rediseño del 2026-09-13. Antes esto era UNA columna
 * de 820 px en una ventana de 1900, y sobre todo: la pantalla existía para
 * producir dos documentos y no enseñaba ninguno. El raíl de la derecha los
 * dibuja, con su estado y su camino; en pantalla estrecha cae debajo.
 *
 * Sin estado propio: los tres almacenes se leen con `useSyncExternalStore`, de
 * modo que el panel y la ficha ven LA MISMA instantánea y no pueden discrepar.
 * Y el resumen de la ficha entra por `import()` perezoso, porque ensamblarla
 * arrastra la prosa del CTE y esto es la ruta de entrada de la app.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, FilePlus2, Pencil } from 'lucide-react';
import { useDrawer } from '../../components/layout/AppShell';
import { DialogoObra } from '../../components/layout/DialogoObra';
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { Topbar } from '../../components/layout/Topbar';
import { destinoDe, palabraDe } from '../../components/ui/estadoFila';
import { FilaEstado, Marca } from '../../components/ui/FilaEstado';
import { hayTrabajoSinGuardar, piezasSinPdf } from '../../lib/anejo';
import { ADAPTADORES_ANEJO } from '../../lib/anejo/modules';
import { getModuleByKey } from '../../data/moduleRegistry';
import { useAnejo } from '../../lib/anejo/useAnejo';
import { resumenDe } from '../../lib/anejo/maqueta';
import { provinciaDe } from '../../lib/acciones/provincias';
import { adoptarPerfilDeLaObra, dejarMiPerfilEnLaObra, perfilDeLaObraDifiere } from '../memoria-dbse/state';
import { AMBAR } from '../../components/ui/estados';
import { showToast } from '../../components/ui/Toast';
import { descargarBlob } from '../../lib/export/descargar';
import { guardarObra } from '../../lib/obra';
import { useObra } from '../../lib/obra/useObra';
import { useVersionDePubs } from '../../lib/pub/usePubs';
import { TOTAL_CUADROS, type CuadroDeObra } from '../../lib/plano/obra';
import type { FilaResumen, ResumenObra } from './resumen';

const RUTA_FICHA = '/memorias/db-se';
const RUTA_ANEJO = '/proyecto/anejo';
const RUTA_MATERIALES = '/memorias/materiales';
const RUTA_ESTUDIO = '/ajustes/estudio';

const BLOQUE = 'rounded border border-border-main bg-bg-surface';

/**
 * Lo que despliega «Exportar» aquí: los cuadros que van al PLANO, de todos los
 * módulos rellenados y en un solo fichero. Los otros dos documentos de la obra
 * no cuelgan de este menú porque cada uno tiene ya su pantalla —la ficha y el
 * anejo—, y duplicarlos aquí daría dos sitios para lo mismo.
 *
 * El grupo se nombra por el DESTINO y no por el formato: lo que distingue a
 * estas dos salidas de las demás de la app no es que sean DXF o Excel, es que
 * van al plano y no a la memoria.
 */
type FormatoPlano = 'dxf' | 'xlsx';

const GRUPOS_EXPORTAR: GrupoExportar<FormatoPlano>[] = [
  {
    titulo: 'Cuadros para el plano',
    opciones: [
      { id: 'dxf', etiqueta: 'DXF', detalle: 'todos los cuadros dibujados, para insertar en el CAD' },
      { id: 'xlsx', etiqueta: 'Excel', detalle: 'todos los cuadros en un libro, para capturar' },
    ],
  },
];

/**
 * LA acción primaria: la misma pinta sea enlace o botón.
 *
 * Outline fuerte —tinte acento 12 %, borde 45 %, texto acento—, que es la
 * receta del control más destacado de la app (`AiButton`). No un relleno
 * sólido: la decisión del 2026-07-17 (DESIGN.md) fija la jerarquía por
 * intensidad de acento justamente porque un sólido de SaaS chirría con la
 * tesis «instrumento, no dashboard», y esto está a 40 px de una topbar donde
 * ningún control va relleno.
 */
const ACCION =
  'flex shrink-0 items-center gap-1.5 rounded border border-accent/45 bg-accent/12 px-4 py-2 text-[13px] font-semibold text-accent transition-colors hover:border-accent/60 hover:bg-accent/20';
/** Los secundarios, con la misma caja que los de la ficha y Viento y nieve. */
const BOTON_MENOR =
  'flex items-center gap-1.5 rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11.5px] text-text-secondary transition-colors hover:text-text-primary';

/**
 * El icono de cada fila: el MISMO que su módulo lleva en la barra lateral, que
 * es donde el usuario ya lo tiene aprendido. Los apartados de la ficha piden
 * prestado el del módulo que habla de lo suyo.
 */
const ICONO: Record<string, string> = {
  'pub.materiales': 'concreta-materiales',
  'pub.vientoNieve': 'concreta-viento-nieve',
  'pub.cargasPlanta': 'concreta-cargas-planta',
  'pub.sismo': 'concreta-seismic',
  se: 'concreta-fem-2d',
  seae: 'concreta-viento-nieve',
  sec: 'concreta-footings',
  ncse: 'concreta-seismic',
  ce: 'concreta-materiales',
  forjados: 'concreta-forjados',
  sea: 'concreta-steel-beams',
  sef: 'concreta-masonry-walls',
  sem: 'concreta-timber-beams',
};

export function ObraModule() {
  const { openDrawer } = useDrawer();
  const obra = useObra();
  const anejo = useAnejo();
  const versionPubs = useVersionDePubs();
  const [editando, setEditando] = useState(false);
  const [resumen, setResumen] = useState<ResumenObra | null>(null);
  const [sinPdf, setSinPdf] = useState<Set<string> | null>(null);
  const [sinGuardar, setSinGuardar] = useState<{ id: string; etiqueta: string; ruta: string }[]>([]);
  const [fallo, setFallo] = useState(false);
  // El perfil del despacho NO viaja en el `.concreta` —es preferencia de esta
  // máquina—, así que la obra de un compañero trae el suyo dentro y el que se
  // imprime es el de aquí. Se dice; no se cambia nada a espaldas de nadie.
  const [perfilDistinto, setPerfilDistinto] = useState<string[]>(() => perfilDeLaObraDifiere());
  // Los cuadros que hoy irían al plano. `null` mientras no se ha mirado: la
  // tarjeta no puede decir «ninguno» por no haber podido comprobarlo.
  const [cuadros, setCuadros] = useState<CuadroDeObra[] | null>(null);
  const [exportando, setExportando] = useState(false);

  // El resumen de la ficha, un fotograma después: su chunk trae la plantilla
  // del CTE y la cabecera no puede esperarlo.
  useEffect(() => {
    let vivo = true;
    setFallo(false);
    void import('./resumen')
      .then((m) => {
        if (vivo) setResumen(m.resumenDeObra());
      })
      .catch((e: unknown) => {
        // Un chunk viejo tras un despliegue, o el almacén caído. El panel no
        // puede decir «no falta nada» por no haber podido mirar.
        console.error('No se ha podido leer el estado de la ficha:', e);
        if (vivo) setFallo(true);
      });
    return () => {
      vivo = false;
    };
  }, [obra, versionPubs, anejo]);

  // `piezasSinPdf()` abre IndexedDB: una sola vez por cambio del índice, no en
  // cada render. Hasta que resuelve, el anejo no puede decir «al día».
  useEffect(() => {
    let vivo = true;
    void piezasSinPdf(anejo)
      .then((s) => {
        if (vivo) setSinPdf(s);
      })
      // Sin IndexedDB —modo privado, alguna WebView— no se puede saber qué
      // PDF hay en esta máquina. Queda en `null`, que es «no lo sé», y el
      // anejo no dice «al día»: decirlo sin haberlo comprobado sería peor.
      .catch(() => {
        if (vivo) setSinPdf(null);
      });
    return () => {
      vivo = false;
    };
  }, [anejo]);

  // Los cuadros de plano, como `sinPdf` y `sinGuardar`: después del primer
  // pintado y en su propio chunk, que arrastra el estado y los cuadros de los
  // cuatro módulos y esto es la ruta de entrada de la app.
  useEffect(() => {
    let vivo = true;
    void import('../../lib/plano/obra')
      .then((m) => {
        if (vivo) setCuadros(m.cuadrosDeLaObra());
      })
      .catch((e: unknown) => {
        console.error('No se han podido leer los cuadros de plano:', e);
        if (vivo) setCuadros(null);
      });
    return () => {
      vivo = false;
    };
  }, [obra, versionPubs, anejo]);

  /**
   * Bajar los cuadros de los cuatro módulos en UN fichero.
   *
   * Los cuadros se vuelven a leer AQUÍ y no se toman de `cuadros`: ese es de
   * cuando se pintó la pantalla, y entre pintarla y pulsar el botón cabe un
   * cambio hecho en otra pestaña. Un cuadro viejo en un plano no se nota hasta
   * que está en obra.
   *
   * Sin modal de título: el fichero se llama como la obra, que es el nombre
   * que esta misma pantalla lleva escrito arriba. Preguntarlo sería pedir algo
   * que ya está a la vista, y aquí —a diferencia de un módulo— no hay un
   * elemento con nombre propio que nombrar.
   */
  const exportarCuadros = async (formato: FormatoPlano) => {
    setExportando(true);
    try {
      const { cuadrosDeLaObra } = await import('../../lib/plano/obra');
      const lista = cuadrosDeLaObra();
      setCuadros(lista);
      if (lista.length === 0) {
        showToast('Todavía no hay ningún cuadro que llevar al plano: rellene materiales, viento y nieve, cargas por planta o incendio.', { autoDismiss: 6000 });
        return;
      }
      const titulo = obra?.denominacion ?? '';
      const resultado =
        formato === 'dxf'
          ? await (await import('../../lib/dxf/obra')).exportarCuadrosObraDxf(lista, titulo)
          : await (await import('../../lib/xlsx/obra')).exportarCuadrosObraXlsx(lista, titulo);
      descargarBlob(resultado);
    } catch (e) {
      console.error('No se han podido exportar los cuadros de plano:', e);
      showToast(`Error al generar el ${formato === 'dxf' ? 'DXF' : 'Excel'} de los cuadros`, { autoDismiss: 4000 });
    } finally {
      setExportando(false);
    }
  };

  const resumenAnejo = useMemo(() => resumenDe(anejo.piezas), [anejo]);
  const faltanPdf = sinPdf !== null && sinPdf.size > 0;

  // D12: el bloque del anejo son sus piezas MÁS lo calculado y sin guardar. Un
  // módulo con trabajo vivo que no está en ninguna pieza no sale en el
  // documento que se entrega, y hasta el 13-09-2026 el panel no lo decía.
  //
  // Se calcula después del primer pintado, como `sinPdf`: son dos lecturas de
  // localStorage por cada uno de los veinticuatro adaptadores y esto es la ruta
  // de entrada de la app.
  //
  // Los de sección «memoria» quedan fuera, la misma regla que usa el panel del
  // anejo: son documentos que se regeneran, y su estado ya lo cuentan los dos
  // bloques de arriba. Contarlo aquí otra vez sería el doble recuento de R9.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSinGuardar(
        ADAPTADORES_ANEJO.filter((a) => a.seccion !== 'memoria' && hayTrabajoSinGuardar(a.modulo)).map((a) => ({
          id: a.modulo,
          etiqueta: a.capitulo,
          ruta: getModuleByKey(a.modulo)?.route ?? RUTA_ANEJO,
        })),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [anejo, versionPubs]);

  const vacia = obra === null || (!obra.denominacion && !obra.provincia);

  // `faltan` ya cuenta los datos de la obra: es el MISMO número que la ficha.
  // Sumarles `datosObra.length` otra vez —que es lo que hacía— daba «Faltan
  // 19» aquí y «18 faltan» allí, la contradicción que este panel existe para
  // matar.
  const faltan = resumen?.faltan ?? 0;
  const ambar = resumen?.ambar ?? 0;

  const anejoVacio = resumenAnejo.capitulos === 0;
  const estadoAnejo = anejoVacio ? 'sinEmpezar' : faltanPdf ? 'revisar' : 'hecho';

  /**
   * El medidor cuenta EXACTAMENTE lo que hay en las dos listas, más los datos
   * de la obra y el anejo: cuatro módulos, los apartados de la ficha que
   * proceden, la obra y el documento. Lo que no procede no entra —no es
   * trabajo pendiente— y por eso se dice aparte.
   *
   * Lo calculado y sin guardar se queda fuera a propósito: es un aviso, no una
   * casilla, y aparece y desaparece con lo que haya abierto en otro módulo. Un
   * total que baila no se puede leer de un vistazo.
   */
  const cuenta = useMemo(() => {
    if (resumen === null) return null;
    const filas = [...resumen.modulos, ...resumen.ficha];
    const noProceden = filas.filter((f) => f.estado === 'noProcede').length;
    const obraHecha = resumen.datosObra.length === 0;
    const anejoHecho = estadoAnejo === 'hecho';
    return {
      total: filas.length - noProceden + 2, // + los datos de la obra + el anejo
      hechas: filas.filter((f) => f.estado === 'hecho').length + (obraHecha ? 1 : 0) + (anejoHecho ? 1 : 0),
      noProceden,
    };
  }, [resumen, estadoAnejo]);

  const sinCalcular = resumen?.modulos.filter((f) => f.estado !== 'hecho').length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        moduleGroup="Proyecto"
        moduleLabel="La obra"
        onMenuOpen={openDrawer}
        // En la obra en blanco no hay nada que exportar y el botón sobra: es
        // la misma regla que la banda de «por dónde se empieza».
        exportMenu={vacia ? undefined : <ExportarMenu grupos={GRUPOS_EXPORTAR} onElegir={(f) => void exportarCuadros(f)} exportando={exportando} />}
      />

      <div className="scroll-hide flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1188px] px-4 pb-10 sm:px-6">
          {/* Quién es esta obra, y con qué datos. */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3 py-5">
            <div className="min-w-0 flex-1">
              <h1 className={`m-0 text-[21px] leading-tight font-semibold tracking-[-0.02em] ${vacia ? 'text-text-disabled' : 'text-text-primary'}`}>
                {obra?.denominacion || 'Obra sin nombre'}
              </h1>
              {/* En una obra en blanco no se enseña la ficha vacía: sería una
                  fila de cuatro «sin definir» en rojo a quien acaba de entrar. */}
              {!vacia && (
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2.5">
                  <Dato rotulo="Uso" valor={obra?.uso} />
                  <Dato rotulo="Provincia" valor={obra?.provincia ? provinciaDe(obra.provincia) : ''} />
                  <Dato rotulo="Municipio" valor={obra?.municipio} />
                  <Dato rotulo="Altitud" valor={obra?.altitud != null ? `${obra.altitud} m` : ''} mono />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className={BOTON_MENOR}
            >
              <Pencil size={11} aria-hidden="true" />
              Editar los datos
            </button>
          </div>

          {perfilDistinto.length > 0 && (
            <div className="mb-3 rounded border border-state-warn/35 px-3 py-2.5" style={AMBAR} role="status">
              <p className="m-0 text-[12.5px] font-medium text-text-primary">Esta obra se guardó con otro perfil de despacho</p>
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-text-secondary">
                Cambian {perfilDistinto.join(', ')}. Se imprime el perfil de esta máquina, no el que traía la obra.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* Las dos son DECISIONES: se persisten, y si el almacén no las
                    admite se dice (E8). Hasta el 13-09-2026 «Dejar el mío» sólo
                    cerraba la banda, y volvía en la visita siguiente. */}
                <button
                  type="button"
                  onClick={() => {
                    if (!dejarMiPerfilEnLaObra()) return showToast('No se ha podido guardar la decisión (¿almacenamiento lleno?)', { autoDismiss: 6000 });
                    setPerfilDistinto([]);
                  }}
                  className={BOTON_MENOR}
                >
                  Dejar el mío
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!adoptarPerfilDeLaObra()) return showToast('No se ha podido adoptar el perfil (¿almacenamiento lleno?)', { autoDismiss: 6000 });
                    setPerfilDistinto([]);
                  }}
                  className={BOTON_MENOR}
                >
                  Adoptar el de esta obra
                </button>
                <Link to={RUTA_ESTUDIO} className="self-center text-[11.5px] text-accent underline-offset-2 hover:underline">
                  Ver mi estudio
                </Link>
              </div>
            </div>
          )}

          {/* El veredicto y LA acción. */}
          {vacia ? (
            <EstadoVacio />
          ) : (
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4 border-t border-border-main py-4">
              <div className="min-w-0 flex-1">
                {/* El medidor y el recuento sólo se saben tras resolver el chunk
                    de la ficha. Sin reservarles el hueco, el bloque crecía 36 px
                    un fotograma después de abrir la app y empujaba las catorce
                    filas hacia abajo. Las listas ya tenían esqueleto; esto no. */}
                {cuenta !== null && cuenta.total > 0 ? (
                  <Medidor hechas={cuenta.hechas} total={cuenta.total} />
                ) : (
                  <div className="h-1.5 max-w-[420px] rounded-[1px] bg-bg-elevated" aria-hidden="true" />
                )}
                <p className="m-0 mt-2.5 text-[13px] leading-snug text-text-primary" aria-live="polite">
                  {fallo
                    ? 'No se ha podido comprobar qué falta. Recargue la página.'
                    : resumen === null
                      ? 'Comprobando qué falta…'
                      : faltan > 0
                        ? `${faltan === 1 ? 'Falta 1 dato' : `Faltan ${faltan} datos`} para poder exportar la justificación.`
                        : ambar > 0
                          ? `No falta nada. Quedan ${ambar} ${ambar === 1 ? 'dato' : 'datos'} por mirar, que no impiden entregar.`
                          : 'No falta nada: la justificación se puede exportar.'}
                </p>
                <p className="m-0 mt-1 text-[12px] text-text-secondary" aria-hidden={cuenta === null}>
                  {cuenta === null ? (
                    // Espacio duro: uno normal colapsa y la línea no reservaría su
                    // alto, que es justo para lo que está aquí.
                    ' '
                  ) : (
                    <>
                      {cuenta.hechas} de {cuenta.total} comprobaciones resueltas
                      {cuenta.noProceden > 0 && ` · ${cuenta.noProceden} no ${cuenta.noProceden === 1 ? 'procede' : 'proceden'} en esta obra`}
                    </>
                  )}
                </p>
              </div>
              {/* R2: UNA acción, y lleva a la PRIMERA falta esté donde esté —el
                  diálogo de la obra, el módulo sin calcular, o la ficha—. Hasta
                  el 13-09-2026 iba siempre a la ficha, que a su vez decía
                  «Abrir el módulo»: dos saltos para lo que la fila hace en uno. */}
              {/* Mientras carga no hay acción honesta que ofrecer. Lo que salía
                  era «Revisar y exportar» llevando a la ficha —porque `faltan`
                  vale 0 hasta que resuelve el chunk—, así que en la obra más
                  corriente el botón decía lo contrario de la verdad y quien lo
                  pulsara rápido aterrizaba en el sitio equivocado. Se le reserva
                  el hueco y no se enseña. */}
              {resumen === null ? (
                <span className={`${ACCION} invisible`} aria-hidden="true">
                  Resolver lo que falta
                </span>
              ) : resumen.datosObra.length > 0 ? (
                <button type="button" onClick={() => setEditando(true)} className={ACCION}>
                  Resolver lo que falta
                </button>
              ) : (
                <Link to={(faltan > 0 && resumen.modulos.find((f) => f.estado === 'falta')?.ruta) || RUTA_FICHA} className={ACCION}>
                  {faltan > 0 ? 'Resolver lo que falta' : 'Revisar y exportar'}
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-col gap-x-7 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <Rotulo contador={!vacia && sinCalcular > 0 ? `${sinCalcular} sin calcular` : null}>Lo que se calcula en otros módulos</Rotulo>
              {/* La misma frase colgaba de cada módulo sin calcular: tres veces
                  seguidas, palabra por palabra, parecía un registro de errores.
                  Se dice una vez, aquí, y la fila sólo dice en qué está. */}
              {!vacia && sinCalcular > 0 && (
                <p className="m-0 mb-2 text-[12px] leading-relaxed text-text-secondary">
                  Cada uno se resuelve en su módulo: ábralo, calcule, y lo publicado vuelve aquí solo.
                </p>
              )}
              <div className={BLOQUE}>{resumen === null ? <Esqueleto filas={4} /> : <Filas filas={resumen.modulos} vacia={vacia} />}</div>

              <Rotulo contador={!vacia && faltan > 0 ? `${faltan} ${faltan === 1 ? 'dato' : 'datos'}` : null}>Lo que se rellena en la ficha</Rotulo>
              <div className={BLOQUE}>
                {/* En una obra en blanco falta todo, y decirlo en rojo es reprochar
                    a quien acaba de empezar: ahí manda la banda de arriba. */}
                {!vacia && resumen !== null && resumen.datosObra.length > 0 && (
                  <FilaEstado
                    estado="falta"
                    etiqueta="Los datos de la obra"
                    detalle={resumen.datosObra.join(', ').toLowerCase()}
                    icono="concreta-obra"
                    onClick={() => setEditando(true)}
                  />
                )}
                {resumen === null ? <Esqueleto filas={6} /> : <Filas filas={resumen.ficha} vacia={vacia} />}
              </div>

              {/* Lo calculado que todavía no está en el anejo: no se entrega. El
                  anejo en sí vive en el raíl, con el otro documento. */}
              {sinGuardar.length > 0 && (
                <>
                  <Rotulo contador={`${sinGuardar.length} sin guardar`}>Lo calculado que aún no está en el anejo</Rotulo>
                  <div className={BLOQUE}>
                    {sinGuardar.map((m) => (
                      <FilaEstado key={m.id} estado="revisar" etiqueta={m.etiqueta} detalle="calculado y sin guardar en el anejo" icono={m.id} a={m.ruta} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Los dos documentos que salen de aquí, dibujados. */}
            <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-[304px]">
              <Rotulo>Lo que se entrega</Rotulo>
              <div className={BLOQUE}>
                <Documento
                  hoja="ficha"
                  titulo="Justificación del DB SE"
                  nota="La ficha ensamblada, en Word y PDF."
                  // En la obra en blanco no falta: está sin empezar. Un rojo aquí
                  // sería el reproche a quien acaba de entrar que el resto de la
                  // pantalla se cuida de no hacer.
                  estado={vacia ? 'sinEmpezar' : faltan > 0 ? 'falta' : ambar > 0 ? 'revisar' : 'hecho'}
                  pie={vacia ? undefined : faltan > 0 ? `${faltan} ${faltan === 1 ? 'dato' : 'datos'}` : 'lista para exportar'}
                  a={RUTA_FICHA}
                />
                <Documento
                  hoja="anejo"
                  titulo="Anejo de cálculo"
                  nota={
                    anejoVacio
                      ? 'Ninguna pieza guardada todavía.'
                      : sinPdf === null
                        ? `${resumenAnejo.capitulos} ${resumenAnejo.capitulos === 1 ? 'capítulo' : 'capítulos'}.`
                        : faltanPdf
                          ? `${sinPdf.size} ${sinPdf.size === 1 ? 'pieza' : 'piezas'} sin su PDF en esta máquina.`
                          : `${resumenAnejo.capitulos} ${resumenAnejo.capitulos === 1 ? 'capítulo' : 'capítulos'} · ${resumenAnejo.total} ${resumenAnejo.total === 1 ? 'página' : 'páginas'}.`
                  }
                  estado={estadoAnejo}
                  a={RUTA_ANEJO}
                />
                {/* El tercer documento, y el único que no tiene pantalla
                    propia: los cuadros se calculan en cuatro módulos y no hay
                    un sitio donde «verlos». Por eso la tarjeta no lleva a
                    ninguna parte: exporta, que es lo único que se hace con
                    ellos. Y por eso no entra en el medidor de arriba —un plano
                    no es obligatorio para entregar la justificación, y contarlo
                    dejaría toda obra sin CAD en «falta algo»—. */}
                <Documento
                  hoja="plano"
                  titulo="Cuadros para el plano"
                  nota={
                    cuadros === null
                      ? 'De los módulos rellenados, en un DXF o un Excel.'
                      : cuadros.length === 0
                        ? 'Ninguno todavía: salen de materiales, viento y nieve, cargas por planta e incendio.'
                        : `${cuadros.map((c) => c.etiqueta).join(', ')}. En un solo fichero.`
                  }
                  estado={vacia || cuadros === null || cuadros.length === 0 ? 'sinEmpezar' : 'hecho'}
                  pie={
                    !vacia && cuadros !== null && cuadros.length > 0
                      // El plural lo manda el TOTAL, no la cuenta: «1 de 4
                      // cuadro» no es castellano.
                      ? `${cuadros.length} de ${TOTAL_CUADROS} cuadros`
                      : undefined
                  }
                  onClick={() => void exportarCuadros('dxf')}
                  accion={exportando ? 'Generando…' : 'Descargar el DXF'}
                  ocupado={exportando}
                />
                {!vacia && faltan > 0 && (
                  <p className="m-0 border-t border-border-sub px-3.5 py-3 text-[11.5px] leading-relaxed text-text-disabled">
                    La justificación se desbloquea cuando no falte ningún dato. El anejo se puede exportar siempre.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {editando && (
        <DialogoObra
          titulo="Datos de la obra"
          texto="Los heredan todos los módulos y encabezan la memoria."
          confirmar="Guardar los datos"
          inicial={obra}
          onConfirm={(o) => {
            guardarObra(o);
            setEditando(false);
          }}
          onCancel={() => setEditando(false)}
        />
      )}
    </div>
  );
}

/** El rótulo de un bloque: nombre, filete hasta el borde, y su cuenta. */
function Rotulo({ children, contador }: { children: ReactNode; contador?: string | null }) {
  return (
    <div className="flex items-center gap-3 pt-6 pb-2">
      <h2 className="m-0 text-[10px] font-semibold tracking-[0.07em] text-text-disabled uppercase">{children}</h2>
      <span className="h-px flex-1 bg-border-sub" aria-hidden="true" />
      {contador && <span className="shrink-0 font-mono text-[10px] text-text-disabled">{contador}</span>}
    </div>
  );
}

/** Uno de los datos de la obra en la cabecera: rótulo arriba, valor debajo. */
function Dato({ rotulo, valor, mono }: { rotulo: string; valor?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9.5px] tracking-[0.09em] text-text-disabled uppercase">{rotulo}</span>
      {valor ? (
        <span className={`text-[13px] text-text-primary ${mono ? 'font-mono' : ''}`}>{valor}</span>
      ) : (
        <span className="text-[13px] text-state-fail">sin definir</span>
      )}
    </div>
  );
}

/**
 * El medidor: un segmento por comprobación que aplica en esta obra. No es un
 * porcentaje —una obra no se entrega «al 60 %»—, es la lista de abajo contada,
 * y por eso los segmentos son discretos y del mismo ancho.
 */
function Medidor({ hechas, total }: { hechas: number; total: number }) {
  return (
    <div className="flex h-1.5 max-w-[420px] gap-0.5" role="img" aria-label={`${hechas} de ${total} comprobaciones resueltas`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`flex-1 rounded-[1px] ${i < hechas ? 'bg-state-ok' : 'bg-border-main'}`} />
      ))}
    </div>
  );
}

/**
 * Una de las salidas de la obra: su hoja dibujada, qué es, y en qué está.
 *
 * Lleva a su pantalla (`a`) o hace algo (`onClick`), nunca las dos. Las dos
 * primeras navegan —la ficha y el anejo tienen dónde mirarse—; los cuadros del
 * plano no tienen pantalla y lo único que se hace con ellos es bajarlos, así
 * que su tarjeta es un botón. Se dice en voz alta con `accion`, porque una
 * tarjeta que descarga con la misma pinta que una que navega sería una
 * descarga sorpresa.
 */
function Documento({
  hoja,
  titulo,
  nota,
  estado,
  pie,
  a,
  onClick,
  accion,
  ocupado,
}: {
  hoja: 'ficha' | 'anejo' | 'plano';
  titulo: string;
  nota: string;
  estado: 'hecho' | 'falta' | 'revisar' | 'sinEmpezar';
  pie?: string;
  a?: string;
  onClick?: () => void;
  accion?: string;
  /** Mientras se genera el fichero: ni un segundo clic ni dos descargas. */
  ocupado?: boolean;
}) {
  const caja = 'flex w-full gap-3.5 border-b border-border-sub p-3.5 text-left transition-colors last:border-b-0 hover:bg-bg-elevated';
  const etiqueta = `${titulo}: ${palabraDe(estado)}${pie ? `, ${pie}` : ''}. ${nota} ${a ? destinoDe(estado) : (accion ?? '')}`;
  const dentro = (
    <>
      <Hoja tipo={hoja} apagada={estado === 'falta' || estado === 'sinEmpezar'} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] font-medium text-text-primary">{titulo}</span>
        <span className="text-[11.5px] leading-relaxed text-text-secondary">{nota}</span>
        <span className="flex items-center gap-1.5">
          <Marca estado={estado} />
          {pie && <span className="min-w-0 truncate text-[11px] text-text-secondary">{pie}</span>}
          {accion && <span className="min-w-0 truncate text-[11px] text-accent">{accion}</span>}
        </span>
      </span>
    </>
  );
  return a !== undefined ? (
    <Link to={a} className={caja} aria-label={etiqueta}>
      {dentro}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={ocupado} className={`${caja} disabled:opacity-60`} aria-label={etiqueta}>
      {dentro}
    </button>
  );
}

/**
 * La hoja de un documento. Es lo único de esta pantalla que no es texto, y va
 * a propósito: sin ella el panel no enseña en ningún sitio LO QUE SE ENTREGA,
 * que es para lo que se abre la app.
 */
function Hoja({ tipo, apagada }: { tipo: 'ficha' | 'anejo' | 'plano'; apagada: boolean }) {
  const borde = apagada ? 'var(--color-border-main)' : 'var(--color-text-disabled)';
  const linea = 'var(--color-border-main)';
  /** Lo que la hoja destaca. Apagada, se funde con el resto del dibujo. */
  const acento = apagada ? linea : 'var(--color-accent)';
  return (
    <svg width="56" height="74" viewBox="0 0 64 85" className="shrink-0" aria-hidden="true">
      <rect x="7" y="5" width="52" height="76" rx="1" fill="var(--color-bg-primary)" stroke={linea} />
      <rect x="1" y="0.5" width="52" height="76" rx="1" fill="var(--color-bg-primary)" stroke={borde} />
      <g transform="translate(-7,-9)">
        {tipo === 'ficha' ? (
          <>
            <rect x="12" y="14" width="22" height="3" rx="1" fill={linea} />
            <rect x="12" y="23" width="32" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="28" width="28" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="36" width="32" height="20" fill="none" stroke={linea} strokeWidth="1" />
            <path d="M12 43h32M12 50h32M23 36v20M34 36v20" stroke={linea} strokeWidth="0.8" />
            <rect x="12" y="62" width="20" height="1.6" rx="0.8" fill={linea} />
          </>
        ) : tipo === 'plano' ? (
          // Un plano, no un documento: sin un solo renglón —un plano no se lee,
          // se mira— y con su cajetín en el pie. Lo que lleva encima son los
          // cuadros, que es exactamente lo que se entrega aquí: tres, del
          // tamaño que salen, no una planta dibujada. Se probó con la planta a
          // un lado y a este tamaño no se distinguía de otra tabla.
          //
          // El contorno va en acento y la rejilla de dentro en gris: con los
          // tres cuadros enteros en acento, la hoja pesaba el triple que la del
          // anejo, que es su vecina en el raíl.
          <>
            <path d="M12 15h34v12H12z" fill="none" stroke={acento} strokeWidth="1" />
            <path d="M12 19h34M24 15v12M35 15v12" stroke={linea} strokeWidth="0.6" />
            <path d="M12 31h34v10H12z" fill="none" stroke={acento} strokeWidth="1" />
            <path d="M12 35h34M24 31v10M35 31v10" stroke={linea} strokeWidth="0.6" />
            <path d="M12 45h22v8H12z" fill="none" stroke={acento} strokeWidth="1" />
            <path d="M12 49h22M24 45v8" stroke={linea} strokeWidth="0.6" />
            <path d="M30 58h16v8H30z" fill="none" stroke={linea} strokeWidth="1" />
            <path d="M30 62h16" stroke={linea} strokeWidth="0.7" />
          </>
        ) : (
          <>
            <rect x="12" y="14" width="18" height="3" rx="1" fill={linea} />
            <rect x="12" y="23" width="32" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="28" width="30" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="33" width="32" height="1.6" rx="0.8" fill={linea} />
            <path d="M12 40v20h33" stroke={linea} strokeWidth="0.9" fill="none" />
            <path d="M13 57l7-9 6 5 5-8 5 6 6-11" fill="none" stroke={acento} strokeWidth="1.2" strokeLinejoin="round" />
            <rect x="12" y="66" width="22" height="1.6" rx="0.8" fill={linea} />
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * Las filas de un bloque, con lo HECHO plegado (R1): el primer pantallazo
 * resume lo hecho y enseña entero lo que falta o queda por mirar. Con una
 * sola fila hecha no hay nada que resumir y se deja a la vista: plegar una
 * fila en otra fila no ahorra nada y esconde el nombre.
 */
function Filas({ filas, vacia }: { filas: FilaResumen[]; vacia: boolean }) {
  const [verHechas, setVerHechas] = useState(false);
  const hechas = vacia ? [] : filas.filter((f) => f.estado === 'hecho');
  const plegar = hechas.length >= 2;
  const visibles = plegar ? filas.filter((f) => f.estado !== 'hecho') : filas;
  const fila = (f: FilaResumen) => (
    <FilaEstado key={f.id} estado={vacia ? 'sinEmpezar' : f.estado} etiqueta={f.etiqueta} detalle={vacia ? null : f.detalle} icono={ICONO[f.id]} a={f.ruta} />
  );
  return (
    <>
      {visibles.map(fila)}
      {plegar && (
        <button
          type="button"
          onClick={() => setVerHechas((v) => !v)}
          aria-expanded={verHechas}
          className="flex min-h-11 w-full items-center gap-2.5 border-b border-border-sub px-3 text-left last:border-b-0 hover:bg-bg-elevated"
        >
          <Marca estado="hecho" />
          {/* El hueco del icono que estas filas no tienen: sin él la etiqueta
              empieza 24 px antes que las de arriba y la lista deja de alinear. */}
          <span className="w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">{hechas.length} comprobaciones hechas</span>
          <ChevronDown size={13} aria-hidden="true" className={`shrink-0 text-text-disabled transition-transform ${verHechas ? 'rotate-180' : ''}`} />
        </button>
      )}
      {plegar && verHechas && hechas.map(fila)}
    </>
  );
}

/** Mientras carga el chunk de la ficha: la forma de las filas, sin decir nada. */
function Esqueleto({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex min-h-11 items-center border-b border-border-sub px-3 last:border-b-0">
          <span className="h-2.5 w-40 rounded bg-bg-elevated" aria-hidden="true" />
        </div>
      ))}
    </>
  );
}

/**
 * La obra en blanco. Ni un rojo: no se le puede reprochar nada a quien acaba
 * de empezar. Enseña el mecanismo, que es lo que hace falta saber.
 */
function EstadoVacio() {
  return (
    <div className="my-3 rounded border border-accent/35 bg-accent/8 px-3 py-2.5">
      <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-medium text-text-primary">
        <FilePlus2 size={13} aria-hidden="true" className="text-accent" />
        Por dónde se empieza
      </p>
      <p className="m-0 mt-1 text-[12px] leading-relaxed text-text-secondary">
        Cada módulo calcula lo suyo y lo deja publicado; la justificación del DB SE lo recoge y añade lo que sólo se teclea una vez. Esta
        pantalla dice en todo momento qué queda. Lo primero suele ser el cuadro de materiales.
      </p>
      <Link to={RUTA_MATERIALES} className="mt-2 inline-block text-[12px] text-accent underline-offset-2 hover:underline">
        Empezar por el cuadro de materiales →
      </Link>
    </div>
  );
}

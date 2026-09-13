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
import { Check, ChevronDown, FilePlus2, Pencil } from 'lucide-react';
import { useDrawer } from '../../components/layout/AppShell';
import { DialogoObra } from '../../components/layout/DialogoObra';
import { Topbar } from '../../components/layout/Topbar';
import { FilaEstado, Marca } from '../../components/ui/FilaEstado';
import { hayTrabajoSinGuardar, piezasSinPdf } from '../../lib/anejo';
import { ADAPTADORES_ANEJO } from '../../lib/anejo/modules';
import { getModuleByKey } from '../../data/moduleRegistry';
import { useAnejo } from '../../lib/anejo/useAnejo';
import { resumenDe } from '../../lib/anejo/maqueta';
import { provinciaDe } from '../../lib/acciones/provincias';
import { adoptarPerfilDeLaObra, dejarMiPerfilEnLaObra, perfilDeLaObraDifiere } from '../memoria-dbse/state';
import { showToast } from '../../components/ui/Toast';
import { guardarObra } from '../../lib/obra';
import { useObra } from '../../lib/obra/useObra';
import { useVersionDePubs } from '../../lib/pub/usePubs';
import type { FilaResumen, ResumenObra } from './resumen';

const RUTA_FICHA = '/memorias/db-se';
const RUTA_ANEJO = '/proyecto/anejo';
const RUTA_MATERIALES = '/memorias/materiales';
const RUTA_ESTUDIO = '/ajustes/estudio';

const BLOQUE = 'rounded border border-border-main bg-bg-surface';
/** LA acción primaria: la misma pinta sea enlace o botón. */
const ACCION =
  'flex shrink-0 items-center gap-1.5 rounded bg-btn-primary-bg px-4 py-2 text-[13px] font-medium text-btn-primary-fg transition-colors hover:bg-btn-primary-bg-hover';

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
      <Topbar moduleGroup="Proyecto" moduleLabel="La obra" onMenuOpen={openDrawer} />

      <div className="flex-1 overflow-y-auto">
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
              className="flex items-center gap-1.5 rounded border border-border-main px-2.5 py-1.5 text-[11.5px] text-text-secondary transition-colors hover:text-text-primary"
            >
              <Pencil size={11} aria-hidden="true" />
              Editar los datos
            </button>
          </div>

          {perfilDistinto.length > 0 && (
            <div className="mb-3 rounded px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--color-state-warn) 9%, transparent)' }}>
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
                  className="rounded border border-border-main px-2.5 py-1 text-[11.5px] text-text-secondary transition-colors hover:text-text-primary"
                >
                  Dejar el mío
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!adoptarPerfilDeLaObra()) return showToast('No se ha podido adoptar el perfil (¿almacenamiento lleno?)', { autoDismiss: 6000 });
                    setPerfilDistinto([]);
                  }}
                  className="rounded border border-border-main px-2.5 py-1 text-[11.5px] text-text-secondary transition-colors hover:text-text-primary"
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
                {cuenta !== null && cuenta.total > 0 && <Medidor hechas={cuenta.hechas} total={cuenta.total} />}
                <p className="m-0 mt-2.5 text-[13.5px] leading-snug text-text-primary" aria-live="polite">
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
                {cuenta !== null && (
                  <p className="m-0 mt-1 text-[12px] text-text-secondary">
                    {cuenta.hechas} de {cuenta.total} comprobaciones resueltas
                    {cuenta.noProceden > 0 && ` · ${cuenta.noProceden} no ${cuenta.noProceden === 1 ? 'procede' : 'proceden'} en esta obra`}
                  </p>
                )}
              </div>
              {/* R2: UNA acción, y lleva a la PRIMERA falta esté donde esté —el
                  diálogo de la obra, el módulo sin calcular, o la ficha—. Hasta
                  el 13-09-2026 iba siempre a la ficha, que a su vez decía
                  «Abrir el módulo»: dos saltos para lo que la fila hace en uno. */}
              {resumen !== null && resumen.datosObra.length > 0 ? (
                <button type="button" onClick={() => setEditando(true)} className={ACCION}>
                  Resolver lo que falta
                </button>
              ) : (
                <Link to={(faltan > 0 && resumen?.modulos.find((f) => f.estado === 'falta')?.ruta) || RUTA_FICHA} className={ACCION}>
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
            <aside className="w-full shrink-0 lg:w-[304px]">
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
      <h2 className="m-0 text-[10px] font-semibold tracking-[0.1em] text-text-disabled uppercase">{children}</h2>
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
    <div className="flex h-1.5 gap-0.5" role="img" aria-label={`${hechas} de ${total} comprobaciones resueltas`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`flex-1 rounded-[1px] ${i < hechas ? 'bg-state-ok' : 'bg-border-main'}`} />
      ))}
    </div>
  );
}

/** Una de las dos salidas: su hoja dibujada, qué es, y en qué está. */
function Documento({
  hoja,
  titulo,
  nota,
  estado,
  pie,
  a,
}: {
  hoja: 'ficha' | 'anejo';
  titulo: string;
  nota: string;
  estado: 'hecho' | 'falta' | 'revisar' | 'sinEmpezar';
  pie?: string;
  a: string;
}) {
  return (
    <Link
      to={a}
      className="flex gap-3.5 border-b border-border-sub p-3.5 transition-colors last:border-b-0 hover:bg-bg-elevated"
      aria-label={`${titulo}: ${nota} Ir a verlo`}
    >
      <Hoja tipo={hoja} apagada={estado === 'falta' || estado === 'sinEmpezar'} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] font-medium text-text-primary">{titulo}</span>
        <span className="text-[11.5px] leading-relaxed text-text-secondary">{nota}</span>
        <span className="flex items-center gap-1.5">
          <Marca estado={estado} />
          {pie && <span className="min-w-0 truncate text-[11px] text-text-secondary">{pie}</span>}
        </span>
      </span>
    </Link>
  );
}

/**
 * La hoja de un documento. Es lo único de esta pantalla que no es texto, y va
 * a propósito: sin ella el panel no enseña en ningún sitio LO QUE SE ENTREGA,
 * que es para lo que se abre la app.
 */
function Hoja({ tipo, apagada }: { tipo: 'ficha' | 'anejo'; apagada: boolean }) {
  const borde = apagada ? 'var(--color-border-main)' : 'var(--color-text-disabled)';
  const linea = 'var(--color-border-main)';
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
        ) : (
          <>
            <rect x="12" y="14" width="18" height="3" rx="1" fill={linea} />
            <rect x="12" y="23" width="32" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="28" width="30" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="33" width="32" height="1.6" rx="0.8" fill={linea} />
            <path d="M12 40v20h33" stroke={linea} strokeWidth="0.9" fill="none" />
            <path d="M13 57l7-9 6 5 5-8 5 6 6-11" fill="none" stroke={apagada ? linea : 'var(--color-accent)'} strokeWidth="1.2" strokeLinejoin="round" />
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
          className="flex min-h-[44px] w-full items-center gap-2.5 border-b border-border-sub px-3 text-left last:border-b-0 hover:bg-bg-elevated"
        >
          <span className="flex w-[96px] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-state-ok">
            <Check size={12} aria-hidden="true" className="shrink-0 stroke-current" />
            <span className="font-mono text-[10px]">hecho</span>
          </span>
          {/* El hueco del icono que estas filas no tienen: sin él la etiqueta
              empieza 24 px antes que las de arriba y la lista deja de alinear. */}
          <span className="w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
            {hechas.length} comprobaciones hechas
            <span className="text-text-disabled"> · {hechas.map((h) => h.etiqueta.toLowerCase()).join(', ')}</span>
          </span>
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
        <div key={i} className="flex min-h-[44px] items-center border-b border-border-sub px-3 last:border-b-0">
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
    <div className="my-3 rounded px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)' }}>
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

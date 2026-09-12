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
 * │ CABECERA   nombre · emplazamiento · [Editar]        ← concreta-obra      │
 * │ VEREDICTO  «faltan N datos» + UNA acción                                 │
 * │ OTROS MÓDULOS      los cuatro que publican          ← concreta-pub-*     │
 * │ LA FICHA           los apartados que proceden       ← la ficha DB SE     │
 * │ EL ANEJO           capítulos y páginas              ← lib/anejo          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sin estado propio: los tres almacenes se leen con `useSyncExternalStore`, de
 * modo que el panel y la ficha ven LA MISMA instantánea y no pueden discrepar.
 * Y el resumen de la ficha entra por `import()` perezoso, porque ensamblarla
 * arrastra la prosa del CTE y esto es la ruta de entrada de la app.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FilePlus2, Pencil } from 'lucide-react';
import { useDrawer } from '../../components/layout/AppShell';
import { DialogoObra } from '../../components/layout/DialogoObra';
import { Topbar } from '../../components/layout/Topbar';
import { FilaEstado } from '../../components/ui/FilaEstado';
import { piezasSinPdf } from '../../lib/anejo';
import { useAnejo } from '../../lib/anejo/useAnejo';
import { resumenDe } from '../../lib/anejo/maqueta';
import { guardarObra } from '../../lib/obra';
import { useObra } from '../../lib/obra/useObra';
import { useVersionDePubs } from '../../lib/pub/usePubs';
import type { ResumenObra } from './resumen';

const RUTA_FICHA = '/memorias/db-se';
const RUTA_ANEJO = '/proyecto/anejo';
const RUTA_MATERIALES = '/memorias/materiales';

const CABECERA = 'px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled';
const BLOQUE = 'rounded border border-border-main bg-bg-surface';

export function ObraModule() {
  const { openDrawer } = useDrawer();
  const obra = useObra();
  const anejo = useAnejo();
  const versionPubs = useVersionDePubs();
  const [editando, setEditando] = useState(false);
  const [resumen, setResumen] = useState<ResumenObra | null>(null);
  const [sinPdf, setSinPdf] = useState<Set<string> | null>(null);
  const [fallo, setFallo] = useState(false);

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

  const lugar = [obra?.municipio, obra?.altitud != null ? `${obra.altitud} m` : null].filter(Boolean).join(' · ');
  const vacia = obra === null || (!obra.denominacion && !obra.provincia);

  const faltan = (resumen?.faltan ?? 0) + (resumen?.datosObra.length ?? 0);
  const ambar = resumen?.ambar ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar moduleGroup="Proyecto" moduleLabel="La obra" onMenuOpen={openDrawer} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] px-4 pb-8">
          {/* Quién es esta obra. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-main py-3">
            <h1 className={`m-0 text-[15px] font-semibold ${vacia ? 'text-text-disabled' : 'text-text-primary'}`}>
              {obra?.denominacion || 'Obra sin nombre'}
            </h1>
            {lugar && <span className="font-mono text-[11.5px] text-text-secondary">{lugar}</span>}
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="ml-auto flex items-center gap-1 rounded border border-border-main px-2 py-1 text-[11.5px] text-text-secondary transition-colors hover:text-text-primary"
            >
              <Pencil size={11} aria-hidden="true" />
              Editar
            </button>
          </div>

          {/* El veredicto y LA acción. */}
          {vacia ? (
            <EstadoVacio />
          ) : (
            <div className="flex flex-wrap items-center gap-3 py-3">
              <p className="m-0 text-[13px] text-text-primary" aria-live="polite">
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
              <Link
                to={RUTA_FICHA}
                className="ml-auto rounded px-3 py-1.5 text-[12.5px] text-accent transition-all"
                style={{
                  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                  background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
                }}
              >
                {faltan > 0 ? 'Resolver lo que falta' : 'Revisar y exportar'}
              </Link>
            </div>
          )}

          <p className={CABECERA}>Lo que se calcula en otros módulos</p>
          <div className={BLOQUE}>
            {resumen === null ? (
              <Esqueleto filas={4} />
            ) : (
              resumen.modulos.map((f) => (
                <FilaEstado key={f.id} estado={vacia ? 'sinEmpezar' : f.estado} etiqueta={f.etiqueta} detalle={vacia ? null : f.detalle} a={f.ruta} />
              ))
            )}
          </div>

          <p className={CABECERA}>Lo que se rellena en la ficha</p>
          <div className={BLOQUE}>
            {/* En una obra en blanco falta todo, y decirlo en rojo es reprochar
                a quien acaba de empezar: ahí manda la banda de arriba. */}
            {!vacia && resumen !== null && resumen.datosObra.length > 0 && (
              <FilaEstado
                estado="falta"
                etiqueta="Los datos de la obra"
                detalle={resumen.datosObra.join(', ').toLowerCase()}
                onClick={() => setEditando(true)}
              />
            )}
            {resumen === null ? (
              <Esqueleto filas={6} />
            ) : (
              resumen.ficha.map((f) => (
                <FilaEstado key={f.id} estado={vacia ? 'sinEmpezar' : f.estado} etiqueta={f.etiqueta} detalle={vacia ? null : f.detalle} a={f.ruta} />
              ))
            )}
          </div>

          <p className={CABECERA}>El anejo de cálculo</p>
          <div className={BLOQUE}>
            {resumenAnejo.capitulos === 0 ? (
              <FilaEstado estado="sinEmpezar" etiqueta="Anejo de cálculo" detalle="ninguna pieza guardada todavía" a={RUTA_ANEJO} />
            ) : (
              <FilaEstado
                estado={faltanPdf ? 'revisar' : 'hecho'}
                etiqueta="Anejo de cálculo"
                detalle={
                  sinPdf === null
                    ? `${resumenAnejo.capitulos} capítulos`
                    : faltanPdf
                      ? `${sinPdf.size} ${sinPdf.size === 1 ? 'pieza' : 'piezas'} sin su PDF en esta máquina`
                      : `${resumenAnejo.capitulos} capítulos · ${resumenAnejo.total} páginas`
                }
                a={RUTA_ANEJO}
              />
            )}
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

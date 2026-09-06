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
 * Tres piezas de este módulo que no tienen los otros:
 *
 *  - «Nueva obra»: el perfil de estudio pasa limpio y cada dato de la obra
 *    queda en ámbar hasta confirmarlo o cambiarlo (ver `lib/memoria/estado`);
 *  - «Siguiente hueco»: lleva el foco al primer rojo o ámbar en el orden del
 *    documento, abriendo la sección que lo contiene; con Enter en un campo
 *    heredado se confirma y se salta al siguiente;
 *  - las publicaciones se releen al volver a la pestaña (`focus`, `storage`),
 *    porque lo normal es ir al módulo de sismo, publicar, y volver.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExportarMenu, type GrupoExportar } from '../../components/layout/ExportarMenu';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { LeyendaEstados } from '../../components/ui/LeyendaEstados';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useTitledFileExport } from '../../hooks/useTitledFileExport';
import { MEMORIA_DBSE_FALLBACK_DOCX, MEMORIA_DBSE_FALLBACK_PDF } from '../../lib/export/filename';
import { evaluar, tipologiasDe } from '../../lib/memoria/ensamblar';
import { asegurarForjados, confirmar, nuevaObra, teclear, tomarPublicacion, type MemoriaState, type ModuloPub, type PerfilEstudio } from '../../lib/memoria/estado';
import { apartados as apartadosDe, bloquesFicha } from '../../lib/memoria/ficha';
import { contarHuecos, siguienteHueco } from '../../lib/memoria/huecos';
import type { ApartadoId, Hueco } from '../../lib/memoria/model';
import { guardarObra, leerObra } from '../../lib/obra';
import { BarraObra } from './BarraObra';
import { idDom } from './ids';
import { Fuentes } from './Fuentes';
import { Seccion } from './Seccion';
import { SeccionCE, SeccionEstudio, SeccionForjados, SeccionNCSE, SeccionSE, SeccionSEA, SeccionSEAE, SeccionSEC, SeccionSEF, SeccionSEM, type Acciones } from './secciones';
import { leerSobres, type Sobres } from './sobres';
import { cargarEstado, guardarEstado } from './state';
import { BOTON_ACENTO, BOTON_MENOR } from './estilos';

type FormatoId = 'docx' | 'pdf';

const FORMATOS: Record<FormatoId, { etiqueta: string; fallback: string; extension: string; enError: string }> = {
  docx: { etiqueta: 'Word', fallback: MEMORIA_DBSE_FALLBACK_DOCX, extension: 'docx', enError: 'documento de Word' },
  pdf: { etiqueta: 'PDF', fallback: MEMORIA_DBSE_FALLBACK_PDF, extension: 'pdf', enError: 'PDF' },
};

const GRUPOS_EXPORTAR: GrupoExportar<FormatoId>[] = [
  {
    titulo: 'Ficha 3.1 — Cumplimiento del DB SE',
    opciones: [
      { id: 'docx', etiqueta: 'Word', detalle: 'para pegar en la memoria del proyecto' },
      { id: 'pdf', etiqueta: 'PDF', detalle: 'maquetado y cerrado, para enviar o imprimir' },
    ],
  },
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

/** Las secciones que arrancan abiertas: las que piden algo. Las de texto fijo, cerradas. */
const ABIERTAS_AL_ARRANCAR: Record<string, boolean> = { indice: false, se: false, seae: true, sec: true, ncse: true, ce: true, forjados: true, sea: false, sef: true, sem: false, estudio: false };

/** Escribe un valor en una ruta con puntos dentro del perfil de estudio, sin mutar. */
function conRutaEstudio(estudio: PerfilEstudio, ruta: string, valor: unknown): PerfilEstudio {
  const partes = ruta.split('.');
  const poner = (nodo: unknown, i: number): unknown => {
    if (i === partes.length) return valor;
    const o = (nodo ?? {}) as Record<string, unknown>;
    return { ...o, [partes[i]]: poner(o[partes[i]], i + 1) };
  };
  return poner(estudio, 0) as PerfilEstudio;
}

export function MemoriaDBSEModule() {
  const { openDrawer } = useDrawer();
  const [state, setState] = useState<MemoriaState>(cargarEstado);
  const [sobres, setSobres] = useState<Sobres>(leerSobres);
  const [obraGuardada, setObraGuardada] = useState(leerObra);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>(ABIERTAS_AL_ARRANCAR);
  const [nuevaObraAbierta, setNuevaObraAbierta] = useState(false);
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
  const { datos, huecos, listo, mensajeBloqueo } = evaluacion;
  const cuenta = contarHuecos(huecos);
  const ayuda = state.ayuda;

  const on: Acciones = useMemo(
    () => ({
      teclear: (id, valor) => actualizar((p) => teclear(p, id, valor)),
      confirmar: (id) => actualizar((p) => confirmar(p, id)),
      fabrica: (procede) => actualizar((p) => ({ ...p, obra: { ...p.obra, fabrica: { ...p.obra.fabrica, procede } } })),
      estudio: (ruta, valor) => actualizar((p) => ({ ...p, estudio: conRutaEstudio(p.estudio, ruta, valor) })),
    }),
    [actualizar],
  );

  const tomar = (modulo: ModuloPub) => {
    const sobre = leerSobres()[modulo];
    if (!sobre) return;
    actualizar((p) => tomarPublicacion(p, modulo, sobre));
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

  /** Enter en un campo heredado lo confirma y salta; en uno confirmado, salta. En un área, Ctrl+Enter. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'TEXTAREA' && !e.ctrlKey) return;
    if (t.tagName === 'BUTTON' || t.tagName === 'A') return;
    const h = huecoConFoco();
    e.preventDefault();
    if (h && h.estado === 'heredado') {
      on.confirmar(h.id);
      const resto = huecos.filter((x) => x.id !== h.id);
      irAHueco(siguienteHueco(resto, null));
    } else {
      siguiente();
    }
  };

  // ── Obra ──────────────────────────────────────────────────────────────────

  const usarObra = () => {
    const o = leerObra();
    if (!o) return;
    actualizar((p) => {
      let s = teclear(p, 'obra.denominacion', o.denominacion);
      s = teclear(s, 'obra.uso', o.uso);
      s = teclear(s, 'obra.provincia', o.provincia);
      s = teclear(s, 'obra.municipio', o.municipio);
      return teclear(s, 'obra.altitud', o.altitud);
    });
  };

  const guardarComoObra = () => {
    const o = state.obra;
    setObraGuardada(
      guardarObra({
        denominacion: o.denominacion.valor,
        uso: o.uso.valor,
        provincia: o.provincia.valor,
        municipio: o.municipio.valor,
        altitud: o.altitud.valor,
      }),
    );
  };

  // ── Exportación: Word y PDF ───────────────────────────────────────────────

  const [formatoElegido, setFormatoElegido] = useState<FormatoId>('docx');
  const formato = FORMATOS[formatoElegido];
  const bloques = useMemo(() => bloquesFicha(datos), [datos]);
  const tituloInicial = `Memoria DB SE — ${state.obra.denominacion.valor || 'obra'}`;

  const { exportando, titleOpen, openExport, confirmTitle, closeTitle } = useTitledFileExport({
    // El `import()` va DENTRO del manejador: cada exportador sigue en su chunk perezoso.
    exportFn: async (titulo) => {
      if (formatoElegido === 'pdf') {
        const { exportarMemoriaDBSEPdf } = await import('../../lib/pdf/memoriaDBSE');
        return exportarMemoriaDBSEPdf(bloques, titulo);
      }
      const { exportarMemoriaDBSEDocx } = await import('../../lib/docx/memoriaDBSE');
      return exportarMemoriaDBSEDocx(bloques, titulo);
    },
    valid: listo,
    onTitleChange: () => {},
    formatoLabel: formato.enError,
    invalidMessage: mensajeBloqueo ?? undefined,
  });

  const exportarComo = (id: FormatoId) => {
    setFormatoElegido(id);
    openExport();
  };

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
      <span className="font-mono text-[11px] text-text-disabled">
        {cuenta.total === 0 ? (
          <span className="text-accent">sin huecos · lista para exportar</span>
        ) : (
          <>
            <span className={cuenta.faltan > 0 ? 'text-state-fail' : 'text-state-warn'}>
              {cuenta.total} {cuenta.total === 1 ? 'hueco' : 'huecos'}
            </span>
            {cuenta.faltan > 0 && <span className="text-state-fail"> · {cuenta.faltan} por rellenar</span>}
            {cuenta.heredados > 0 && <span className="text-state-warn"> · {cuenta.heredados} por confirmar</span>}
            {cuenta.revisar > 0 && <span className="text-state-warn"> · {cuenta.revisar} por revisar</span>}
          </>
        )}
      </span>
      <button type="button" onClick={siguiente} disabled={cuenta.total === 0} className={BOTON_ACENTO + ' disabled:cursor-default disabled:opacity-50'} title={cuenta.total === 0 ? 'No queda nada por resolver' : 'Salta al primer hueco (Enter)'}>
        Siguiente hueco ↵
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
      <button type="button" onClick={() => setNuevaObraAbierta(true)} className={BOTON_MENOR} title="Empezar otra obra conservando el perfil de estudio">
        Nueva obra
      </button>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar moduleLabel="Cumplimiento del DB SE" moduleGroup="Memorias" onMenuOpen={openDrawer} exportMenu={<ExportarMenu grupos={GRUPOS_EXPORTAR} onElegir={exportarComo} exportando={exportando} />} />

      <BarraObra obra={datos.obra} obraGuardada={obraGuardada} ayuda={ayuda} onTeclear={on.teclear} onConfirmar={on.confirmar} onUsarObra={usarObra} onGuardarObra={guardarComoObra} derecha={derecha} />

      <div ref={contenedor} className="scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-3" onKeyDown={onKeyDown}>
        <div className="mx-auto flex max-w-[1100px] flex-col gap-3">
          <Fuentes fuentes={datos.fuentes} ayuda={ayuda} onTomar={tomar} />

          {lista
            .filter((a) => a.id !== 'indice')
            .map((a) => (
              <Seccion
                key={a.id}
                id={a.id}
                numero={a.numero}
                titulo={a.titulo.replace(/^3\.1\.\d\.?\s*/, '')}
                refNorma={REF[a.id]}
                open={abiertas[a.id] ?? true}
                onOpenChange={abrir(a.id)}
                huecos={huecosDe(a.id)}
                procede={a.procede}
                summary={!a.procede ? (noProcedePorque[a.id] ?? 'No procede.') : undefined}
              >
                {cuerpo[a.id]}
              </Seccion>
            ))}

          <Seccion id="estudio" titulo="Perfil del estudio" refNorma="no pide confirmación" open={abiertas.estudio ?? false} onOpenChange={abrir('estudio')} summary={`${state.estudio.programa.nombre} ${state.estudio.programa.version} · flechas ${state.estudio.flechas.total} · ${state.estudio.flechas.activa} · ${state.estudio.flechas.maxRecomendada}`}>
            <SeccionEstudio {...props} />
          </Seccion>

          <LeyendaEstados />
        </div>
      </div>

      {nuevaObraAbierta && (
        <ConfirmDialog
          title="Nueva obra"
          confirmLabel="Empezar la obra nueva"
          onConfirm={() => {
            actualizar((p) => nuevaObra(p));
            setAbiertas(ABIERTAS_AL_ARRANCAR);
            setNuevaObraAbierta(false);
          }}
          onCancel={() => setNuevaObraAbierta(false)}
        >
          <p>Se conserva el perfil del estudio. Los datos de esta obra quedan en ámbar hasta que los confirme o los cambie, y las publicaciones de los otros módulos habrá que volver a tomarlas: así ningún dato de la obra anterior llega al documento sin pasar por sus manos.</p>
        </ConfirmDialog>
      )}

      {titleOpen && (
        <TitlePromptModal initialTitle={tituloInicial} fallbackFilename={formato.fallback} exporting={exportando} formatLabel={formato.etiqueta} extension={formato.extension} onConfirm={confirmTitle} onCancel={closeTitle} />
      )}
    </div>
  );
}

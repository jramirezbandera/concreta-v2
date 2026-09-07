/**
 * «Leer el PDF del geotécnico»: el modal que encadena las piezas de
 * `lib/memoria/geotecnico`. Cuatro pasos en una ventana: elegir el PDF, ver
 * qué se va a mandar y con qué proveedor, leer, y el resumen de lo que ha
 * entrado en ámbar.
 *
 * El PDF se abre en el navegador (pdf.js) nada más elegirlo, para poder decir
 * cuántas páginas tiene y si está escaneado ANTES de que nada salga; sólo al
 * pulsar «Leer» viaja su texto al proveedor del asistente, con la clave del
 * usuario o la compartida. La nota de privacidad cambia con la clave: la
 * compartida de Gemini es gratuita y Google puede usar lo que recibe.
 *
 * Mismo lenguaje visual que ConfirmDialog (backdrop, cabecera con X, Escape
 * cierra). Cancelar en plena lectura aborta la petición y vuelve al paso
 * anterior. Las refs se mutan sólo en handlers y efectos (React Compiler).
 */

import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { ByokSettings } from '../../components/ai/ByokSettings';
import { ProviderStrip } from '../../components/ai/ProviderStrip';
import { AI_PROVIDER_LABELS } from '../../lib/ai/models';
import type { PdfAbierto } from '../../lib/ai/pdfPrep';
import { runChatTurn } from '../../lib/ai/providers';
import { AI_ERROR_MESSAGES, AiError } from '../../lib/ai/types';
import { useAiSettings } from '../../lib/ai/useAiSettings';
import {
  construirPeticion,
  esEscaneado,
  paginasEscaneado,
  parseExtraccion,
  seleccionarTexto,
  type ExtraccionGeotecnico,
  type ResultadoLectura,
  type ResumenDato,
  type Seleccion,
} from '../../lib/memoria/geotecnico';
import { BOTON_ACENTO, BOTON_MENOR } from './estilos';

interface Props {
  /** Vuelca la extracción en el estado y devuelve qué entró, qué se conservó y qué falta. */
  onAplicar: (ex: ExtraccionGeotecnico, nombreFichero: string) => ResultadoLectura;
  onClose: () => void;
}

type Fase =
  | { id: 'elegir'; error?: string }
  | { id: 'abriendo'; nombre: string }
  | { id: 'listo'; pdf: PdfAbierto; seleccion: Seleccion | null; error?: string }
  | { id: 'leyendo'; pdf: PdfAbierto; seleccion: Seleccion | null }
  | { id: 'hecho'; pdf: PdfAbierto; reply: string; resultado: ResultadoLectura; avisos: string[] };

const MB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Lista({ titulo, items, tono }: { titulo: string; items: string[]; tono: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[11px] font-medium ${tono}`}>{titulo}</span>
      <ul className="list-disc pl-4 text-[11.5px] leading-snug text-text-secondary">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

const conPagina = (d: ResumenDato) => `${d.etiqueta}${d.pagina > 0 ? ` · pág. ${d.pagina}` : ''}`;

export function GeotecnicoModal({ onAplicar, onClose }: Props) {
  const { settings, activeKey, usingSharedKey } = useAiSettings();
  const [fase, setFase] = useState<Fase>({ id: 'elegir' });
  const [ajustes, setAjustes] = useState(() => activeKey === null);
  const abortRef = useRef<AbortController | null>(null);
  const pdfRef = useRef<PdfAbierto | null>(null);

  // Scroll del body bloqueado mientras está abierto; al desmontar se aborta lo
  // que hubiera en vuelo y se libera el PDF.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      abortRef.current?.abort();
      pdfRef.current?.cerrar();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const elegir = async (file: File) => {
    setFase({ id: 'abriendo', nombre: file.name });
    try {
      const { leerPdf } = await import('../../lib/ai/pdfPrep');
      const pdf = await leerPdf(file);
      pdfRef.current?.cerrar();
      pdfRef.current = pdf;
      setFase({ id: 'listo', pdf, seleccion: esEscaneado(pdf.textos) ? null : seleccionarTexto(pdf.textos) });
    } catch (err) {
      setFase({ id: 'elegir', error: err instanceof Error ? err.message : 'No se ha podido abrir el PDF.' });
    }
  };

  const otroPdf = () => {
    pdfRef.current?.cerrar();
    pdfRef.current = null;
    setFase({ id: 'elegir' });
  };

  const leer = async () => {
    if (fase.id !== 'listo' || activeKey === null) return;
    const { pdf, seleccion } = fase;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFase({ id: 'leyendo', pdf, seleccion });
    try {
      const imagenes = seleccion ? [] : await pdf.imagenes(paginasEscaneado(pdf.paginas));
      const req = construirPeticion({ nombre: pdf.nombre, paginas: pdf.paginas }, seleccion, imagenes, ctrl.signal);
      const envelope = await runChatTurn(settings.provider, activeKey, req);
      if (ctrl.signal.aborted) return;
      const ex = parseExtraccion(envelope.proposal);
      const resultado = onAplicar(ex, pdf.nombre);
      setFase({ id: 'hecho', pdf, reply: envelope.reply, resultado, avisos: ex.avisos });
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof AiError && err.kind === 'aborted')) {
        setFase({ id: 'listo', pdf, seleccion });
        return;
      }
      const error = err instanceof AiError ? `${AI_ERROR_MESSAGES[err.kind]} ${err.kind === 'unknown' || err.kind === 'bad-response' ? err.message : ''}`.trim() : 'No se ha podido leer el informe.';
      setFase({ id: 'listo', pdf, seleccion, error });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const cancelarLectura = () => abortRef.current?.abort();

  const proveedor = AI_PROVIDER_LABELS[settings.provider];
  const privacidad = usingSharedKey
    ? 'El texto del informe se envía a Google con la clave compartida de Concreta, que es gratuita: Google puede usar lo que recibe para mejorar sus modelos. Para un informe confidencial, use su propia clave.'
    : `El texto del informe se envía a ${proveedor} con su clave. Con una clave de pago, el proveedor no usa lo que recibe para entrenar.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]" role="presentation">
      <div className="flex w-[520px] max-w-full flex-col rounded-lg border border-border-main bg-bg-surface shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="geotecnico-heading">
        <div className="flex items-center gap-3 border-b border-border-main px-5 py-3">
          <FileText size={16} className="text-text-secondary" aria-hidden="true" />
          <span id="geotecnico-heading" className="text-sm font-medium text-text-primary">
            Leer el PDF del geotécnico
          </span>
          <div className="flex-1" />
          <button type="button" onClick={onClose} aria-label="Cerrar la ventana" className="rounded p-1.5 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-5 py-4">
          {fase.id === 'elegir' && (
            <>
              <label
                className="flex cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-border-main px-4 py-6 text-center transition-colors hover:border-accent"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void elegir(f);
                }}
              >
                <FileText size={20} className="text-text-disabled" aria-hidden="true" />
                <span className="text-[12px] text-text-primary">Elija el PDF del estudio geotécnico</span>
                <span className="text-[11px] leading-snug text-text-secondary">o arrástrelo aquí. Se abre en su navegador y no sale de él hasta que pulse «Leer».</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  aria-label="PDF del estudio geotécnico"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void elegir(f);
                  }}
                />
              </label>
              {fase.error && <p className="text-[11.5px] text-state-fail">{fase.error}</p>}
            </>
          )}

          {fase.id === 'abriendo' && <p className="text-[12px] text-text-secondary">Abriendo «{fase.nombre}»…</p>}

          {(fase.id === 'listo' || fase.id === 'leyendo') && (
            <>
              <div className="rounded border border-border-sub bg-bg-primary px-3 py-2 text-[11.5px]">
                <div className="truncate font-medium text-text-primary">{fase.pdf.nombre}</div>
                <div className="leading-snug text-text-secondary">
                  {fase.pdf.paginas} páginas · {MB(fase.pdf.bytes)} ·{' '}
                  {fase.seleccion
                    ? `texto de ${fase.seleccion.paginas.length} páginas${fase.seleccion.recortado ? ', recortado a las primeras, las de conclusiones y las que caben' : ''}`
                    : `sin capa de texto (escaneado): se leerán sus ${paginasEscaneado(fase.pdf.paginas).length} primeras páginas como imágenes`}
                </div>
              </div>
              <ProviderStrip open={ajustes} onToggle={() => setAjustes((o) => !o)} />
              {ajustes && <ByokSettings defaultOpen />}
              <p className="text-[11px] leading-snug text-text-secondary">{privacidad}</p>
              {fase.id === 'listo' && fase.error && <p className="text-[11.5px] text-state-fail">{fase.error}</p>}
              {fase.id === 'leyendo' && (
                <p className="text-[12px] text-accent" role="status">
                  Leyendo el informe con {proveedor}… suele tardar entre diez segundos y un minuto.
                </p>
              )}
            </>
          )}

          {fase.id === 'hecho' && (
            <>
              <p className="text-[12px] leading-snug text-text-primary">{fase.reply}</p>
              <Lista titulo={`Rellenados en ámbar (${fase.resultado.rellenados.length})`} items={fase.resultado.rellenados.map(conPagina)} tono="text-state-warn" />
              <Lista titulo="Conservados: ya los había tecleado" items={fase.resultado.conservados.map(conPagina)} tono="text-text-primary" />
              <Lista titulo="El informe no los dice" items={fase.resultado.noEncontrados.map((d) => d.etiqueta)} tono="text-state-fail" />
              <Lista titulo="Avisos del lector" items={fase.avisos} tono="text-text-primary" />
              <p className="text-[11px] leading-snug text-text-secondary">Cada dato lleva debajo el informe y la página de donde sale. Al cerrar, pulse Enter para ir al primero y siga pulsando Enter: cada uno se confirma y baja al siguiente. En los cuadros de texto largos, Shift+Enter parte la línea.</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-main px-5 py-3">
          {fase.id === 'listo' && (
            <>
              <button type="button" onClick={otroPdf} className={BOTON_MENOR}>
                Otro PDF
              </button>
              <div className="flex-1" />
              <button type="button" onClick={onClose} className={BOTON_MENOR}>
                Cancelar
              </button>
              <button type="button" onClick={() => void leer()} disabled={activeKey === null} className={BOTON_ACENTO + ' disabled:cursor-default disabled:opacity-50'} title={activeKey === null ? 'Falta la API key del proveedor' : undefined}>
                Leer con IA
              </button>
            </>
          )}
          {fase.id === 'leyendo' && (
            <button type="button" onClick={cancelarLectura} className={BOTON_MENOR}>
              Cancelar lectura
            </button>
          )}
          {(fase.id === 'elegir' || fase.id === 'abriendo') && (
            <button type="button" onClick={onClose} className={BOTON_MENOR}>
              Cancelar
            </button>
          )}
          {fase.id === 'hecho' && (
            <button type="button" onClick={onClose} className={BOTON_ACENTO}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

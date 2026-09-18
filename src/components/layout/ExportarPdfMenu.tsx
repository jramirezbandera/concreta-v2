/**
 * El desplegable «Exportar» de los módulos que producen UN documento: el PDF
 * del cálculo. Dos destinos, que es lo que el usuario está eligiendo de
 * verdad: bajarlo al disco o guardarlo como capítulo del anejo de la obra.
 *
 * Por qué existe habiendo `ExportarMenu`: porque son veintiún módulos que
 * ofrecen exactamente lo mismo, y si cada uno se escribiera sus dos opciones,
 * en dos semanas dirían veintiuna cosas distintas. Los módulos con varias
 * salidas —micropilotes y encepados con su DXF, los de memoria con su Word y
 * su Excel— siguen componiendo su propio `ExportarMenu` con `GRUPO_ANEJO`: ahí
 * las opciones sí se agrupan por documento y llevan cabecera.
 *
 * Sin adaptador del anejo —fuera de un router, o una ruta que no es de un
 * módulo— la opción no aparece: es la misma regla que la del botón dentro de
 * la previsualización, y por el mismo motivo (no hay pieza que guardar).
 */

import { ExportarMenu, type GrupoExportar } from './ExportarMenu';
import { DETALLE_ANEJO_CALCULO, opcionAnejo, type IdAnejo } from './opcionAnejo';
import { useModuloEnPantalla } from '../../lib/anejo/useModuloEnPantalla';

export type DestinoPdf = 'pdf' | IdAnejo;

interface Props {
  /** Recibe el destino elegido; normalmente el `openExport` de `useTitledPdfExport`. */
  onElegir: (destino: DestinoPdf) => void;
  /** Mientras se genera el PDF el disparador se bloquea y enseña el giro. */
  exportando?: boolean;
  /** Qué es el PDF de este módulo, si «el cálculo» se queda corto. */
  detallePdf?: string;
  /** Y qué entra en el anejo, para los módulos cuyo PDF es una memoria de obra. */
  detalleAnejo?: string;
}

export function ExportarPdfMenu({ onElegir, exportando, detallePdf, detalleAnejo }: Props) {
  const adaptador = useModuloEnPantalla();
  const grupos: GrupoExportar<DestinoPdf>[] = [
    {
      opciones: [
        {
          id: 'pdf',
          etiqueta: 'PDF',
          detalle: detallePdf ?? 'la memoria del cálculo, para enviar o imprimir',
        },
      ],
    },
  ];
  if (adaptador) grupos.push({ opciones: [opcionAnejo(detalleAnejo ?? DETALLE_ANEJO_CALCULO)] });
  return <ExportarMenu grupos={grupos} onElegir={onElegir} exportando={exportando} />;
}

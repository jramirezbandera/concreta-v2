/**
 * Pinta un `Block[]` como la hoja que se va a entregar.
 *
 * Es el tercer renderer de la frontera `Block[]` (los otros dos, .docx y .pdf,
 * llegan en las fases 3 y 4). Por eso no toma el estado del módulo sino los
 * bloques ya compuestos: lo que se ve aquí es literalmente lo que se exportará.
 */

import type { Block } from '../../lib/materiales/cuadros';

function Tabla({ head, rows, caption }: { head: string[]; rows: string[][]; caption?: string }) {
  return (
    <div className="mb-4">
      {caption && (
        <p className="mb-1 font-mono text-[11px] font-semibold text-accent">{caption}</p>
      )}
      {/* La tabla del cuadro puede ser ancha (anclajes: 7 columnas). Se
          desborda dentro de su propia caja, nunca empuja la página. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-border-main px-2 py-1.5 text-left align-bottom text-[10.5px] font-semibold text-text-secondary"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((fila, i) => (
              <tr key={i} className="border-b border-border-sub last:border-0">
                {fila.map((celda, j) => (
                  <td
                    key={j}
                    className={[
                      'px-2 py-1.5 align-top',
                      j === 0 ? 'text-text-primary' : 'font-mono text-text-secondary',
                    ].join(' ')}
                  >
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Documento({ blocks }: { blocks: Block[] }) {
  return (
    <article className="mx-auto max-w-[1100px] rounded border border-border-main bg-bg-surface px-6 py-5 sm:px-8 sm:py-7">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <h3
                key={i}
                className={[
                  'mb-2 font-semibold text-text-primary',
                  b.level === 1 ? 'text-[15px]' : 'text-[13px]',
                  i === 0 ? 'mt-0' : 'mt-5',
                ].join(' ')}
                style={{ letterSpacing: '0.02em' }}
              >
                {b.text}
              </h3>
            );
          case 'paragraph':
            return (
              <p key={i} className="mb-3 text-[12px] leading-relaxed text-text-secondary">
                {b.text}
              </p>
            );
          case 'kvTable':
            return (
              <dl key={i} className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                {b.rows.map(([k, v], j) => (
                  <div key={j} className="contents">
                    <dt className="text-text-secondary">{k}</dt>
                    <dd className="font-mono text-text-primary">{v}</dd>
                  </div>
                ))}
              </dl>
            );
          case 'table':
            return <Tabla key={i} head={b.head} rows={b.rows} caption={b.caption} />;
          case 'notes':
            return (
              <ul key={i} className="mb-4 space-y-1">
                {b.items.map((item, j) => (
                  <li key={j} className="text-[11px] leading-snug text-text-disabled">
                    {item}
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </article>
  );
}

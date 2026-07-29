// AssistantPreview.tsx — a still of a real assistant thread on the landing.
//
// ANTI-DRIFT, the point of this file: the proposal card is the REAL
// <ProposalCard> from components/ai, fed a plain plan object. It is not a
// drawing of one. When the card's diff, its risk interlock or its footer
// change, this preview changes with them — which is exactly what AppPreview.tsx
// (385 lines of hand-drawn app UI, deleted in July) failed to do.
//
// The two chat bubbles around it are deliberately thin: they reuse the same
// utility classes as AiChatModal's thread, and they are generic chat chrome
// rather than app-specific UI, so there is little to drift.
//
// The whole block is inert (aria-hidden + pointer-events: none in assistant.css)
// so no visitor can click an "Aplicar" button that leads nowhere. The real
// affordance is the link in the figure caption.

import { Sparkles } from 'lucide-react';
import { ProposalCard } from '../../../../components/ai/ProposalCard';
import type { AiApplyPlan } from '../../../../lib/ai/modules/types';

const USER_MESSAGE =
  'Viga de cubierta de 6,50 m de luz, biapoyada. Peso propio más 18,5 kN/m permanente y 5 kN/m de sobrecarga de uso. Ponle HA-30 y acero B500S.';

const ASSISTANT_REPLY =
  'Con esa luz y esas cargas, 30×50 se te queda corta de canto para la flecha. Te propongo 35×60 y subo el hormigón a HA-30 como pides. Repasa los valores y aplica si te encajan.';

// A plain object, formatted exactly as a module's buildPlan() would emit it.
// `risks: []` is required by the type on purpose — every module must declare
// its safety rules, even when empty.
const DEMO_PLAN: AiApplyPlan<Record<string, unknown>> = {
  fields: {},
  changes: [
    { field: 'L', label: 'Luz de cálculo', before: '4.00 m', after: '6.50 m' },
    { field: 'gk', label: 'Carga permanente', before: '10.0 kN/m', after: '18.5 kN/m' },
    { field: 'qk', label: 'Sobrecarga de uso', before: '2.0 kN/m', after: '5.0 kN/m' },
    { field: 'b', label: 'Ancho b', before: '30 cm', after: '35 cm' },
    { field: 'h', label: 'Canto h', before: '50 cm', after: '60 cm' },
    { field: 'fck', label: 'Hormigón', before: 'HA-25', after: 'HA-30' },
  ],
  skipped: [],
  notFound: [],
  warnings: [],
  notes: null,
  risks: [],
};

const noop = () => {};

export function AssistantPreview() {
  return (
    <div className="ai-preview-thread" aria-hidden="true">
      {/* User turn — same markup as AiChatModal's user bubble. */}
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[85%] rounded px-2.5 py-1.5 bg-bg-elevated border border-border-main text-[12.5px] text-text-primary whitespace-pre-wrap leading-relaxed">
          {USER_MESSAGE}
        </div>
      </div>

      {/* Assistant turn — reply text, then the real proposal card. */}
      <div className="flex gap-2 items-start">
        <span
          className="w-[22px] h-[22px] rounded-[5px] text-accent grid place-items-center shrink-0 mt-0.5"
          style={{ background: 'var(--color-tint-accent)' }}
        >
          <Sparkles size={12} />
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[12.5px] text-text-primary leading-relaxed m-0">{ASSISTANT_REPLY}</p>
          <ProposalCard plan={DEMO_PLAN} applied={false} onApply={noop} />
        </div>
      </div>
    </div>
  );
}

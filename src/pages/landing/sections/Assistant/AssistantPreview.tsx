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
import { rcBeamDefaults as D } from '../../../../data/defaults';
import { formatQuantity } from '../../../../lib/units/format';

// Vigas HA takes design EFFORTS (Md, VEd), not loads: the earlier demo proposed
// «Carga permanente» and «Sobrecarga de uso», fields the module does not have.
// The thread now asks for what the module asks, the labels are the adapter's
// own (lib/ai/modules/rcBeams.ts LABELS), and every «antes» is the default the
// «Probarlo» link actually opens with.
const USER_MESSAGE =
  'Viga biapoyada de 6,50 m. En el vano me salen Md = 120 kN·m y VEd = 80 kN. Ponle HA-30.';

const ASSISTANT_REPLY =
  'Te cargo la luz, los esfuerzos del vano y el HA-30. Con 6,5 m te propongo además 60 de canto, que deja holgura a la flecha: el cálculo te lo dirá al aplicar. Repasa los valores y aplica si te encajan.';

const kNm = (v: number) => formatQuantity(v, 'moment', 'si');
const kN = (v: number) => formatQuantity(v, 'force', 'si');

// A plain object, formatted exactly as the module's buildPlan() emits it.
// `risks: []` is required by the type on purpose — every module must declare
// its safety rules, even when empty.
const DEMO_PLAN: AiApplyPlan<Record<string, unknown>> = {
  fields: {},
  changes: [
    { field: 'L', label: 'Luz L', before: `${D.L / 1000} m`, after: '6.5 m' },
    { field: 'vano_Md', label: 'Vano — Md', before: kNm(D.vano_Md), after: kNm(120) },
    { field: 'vano_VEd', label: 'Vano — VEd', before: kN(D.vano_VEd), after: kN(80) },
    { field: 'h', label: 'Canto h', before: `${D.h} mm`, after: '600 mm' },
    { field: 'fck', label: 'Hormigón fck', before: `HA-${D.fck}`, after: 'HA-30' },
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

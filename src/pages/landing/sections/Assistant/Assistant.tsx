// Assistant.tsx — "Asistente" section: the three things the AI assistant does,
// plus the trust block that keeps it honest.
//
// The three beats map to the funnel, and that ordering is deliberate:
//   te modela   → why you come (the sketch→model moment the hero leads with)
//   te explica  → why you don't bail in minute three
//   te desatasca→ why you come back next week
//
// The trust block is not decoration. Without it this section reads as "ahora
// con IA" and competes with a free chat tab; with it, it says the thing a chat
// tab cannot: the LLM proposes inputs, the audited engine computes, and every
// check still cites its article.

import { Link } from 'react-router';
import { APP_ROUTE, sectionEyebrow } from '../../constants';
import { AssistantPreview } from './AssistantPreview';
import './assistant.css';

interface Beat {
  n: string;
  t: string;
  d: string;
}

const BEATS: Beat[] = [
  {
    n: '01',
    t: 'Te modela',
    d: 'Enséñale una foto del croquis y te deja el pórtico montado: nudos, barras, apoyos y cargas. Lo que era media hora de modelado es una foto y una revisión.',
  },
  {
    n: '02',
    t: 'Te explica',
    d: '«¿Qué es kmod?» «¿Por qué este módulo me pide β?» Pregunta en español sin salir del cálculo. Es el manual que nadie lee, convertido en alguien a quien preguntar.',
  },
  {
    n: '03',
    t: 'Te desatasca',
    d: 'Sale INCUMPLE en rojo y te quedas mirando. El asistente lee el veredicto, te dice qué comprobación gobierna y por qué, y te propone qué tocar.',
  },
];

export function AssistantSection() {
  return (
    <section className="section" id="asistente">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">{sectionEyebrow('asistente')}</div>
            <h2 className="section-title">
              Un asistente de IA<br />dentro de cada módulo.
            </h2>
          </div>
          <p className="section-lede">
            Pulsas el botón de IA en cualquier módulo y le hablas en español.
            No es un chat pegado a un formulario: sabe qué módulo tienes
            abierto, qué has metido y qué ha salido — y por eso hace tres cosas
            que un chat en otra pestaña no puede.
          </p>
        </div>

        {/* Show it, don't claim it. The proposal card below is the REAL
            component from the app, not a drawing of it. */}
        <figure className="ai-figure">
          <div className="ai-figure-frame">
            <AssistantPreview />
          </div>
          <figcaption className="ai-figure-cap">
            <span>
              Describes el problema en español y te devuelve los cambios uno a
              uno, con el valor actual y el propuesto. Nada se aplica hasta que
              tú pulsas.
            </span>
            <Link to={APP_ROUTE} className="link-arrow">
              Probarlo en vigas HA →
            </Link>
          </figcaption>
        </figure>

        <div className="beats">
          {BEATS.map((b) => (
            <div className="beat" key={b.n}>
              <div className="beat-n mono">{b.n}</div>
              <div className="beat-t">{b.t}</div>
              <div className="beat-d">{b.d}</div>
            </div>
          ))}
        </div>

        <div className="ai-trust">
          <div className="ai-trust-main">
            <h3 className="ai-trust-title">La IA no calcula. Nunca.</h3>
            <p className="ai-trust-body">
              Propone entradas. Calcula el motor auditado de siempre, y cada
              comprobación sigue citando su artículo del CE o del CTE. Nada toca
              tu cálculo hasta que pulsas Aplicar, y si una propuesta rebaja la
              seguridad, te lo dice y no la aplica sola.
            </p>
          </div>
          <div className="ai-trust-key">
            <div className="ai-trust-key-t mono">CON LA CLAVE INCLUIDA, Y MEJOR CON LA TUYA</div>
            <p className="ai-trust-body">
              Sin configurar nada, el asistente rellena y explica. Si conectas tu
              propia clave de Anthropic, OpenAI o Google —dos minutos, y no nos
              pagas nada por ello— pasa a razonar: lee el veredicto y te propone
              la corrección. Tu consulta va directa al proveedor; no pasa por
              ningún servidor nuestro, porque no tenemos ninguno.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

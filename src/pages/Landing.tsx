// Landing — Concreta marketing page.
// Single-page landing: hero carousel + AI assistant + module library +
// export/share + philosophy + normativa + resources + pricing + blog + about
// + closing CTA.
//
// Section ORDER here is load-bearing: the numbered eyebrows ("03 · Módulos")
// are derived from SECTION_ORDER in landing/constants.ts, so reordering the
// JSX below without reordering that array desyncs every eyebrow on the site,
// subpages included. They used to be 12 hand-written strings and 4 had drifted.
//
// Marketing chrome (nav/footer/buttons/typography/responsive) is shared with
// the other marketing pages via ./marketing.css. Each section under
// landing/sections/<Name>/ ships its own co-located CSS.

import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import { ScrollToHash } from './landing/ScrollToHash';
import { Hero } from './landing/sections/Hero/Hero';
import { AssistantSection } from './landing/sections/Assistant/Assistant';
import { ModulesSection } from './landing/sections/Modules/Modules';
import { OutputSection } from './landing/sections/Output/Output';
import { PhilosophySection } from './landing/sections/Philosophy/Philosophy';
import { NormativaSection } from './landing/sections/Normativa/NormativaSection';
import { DemoDocsSection } from './landing/sections/DemoDocs/DemoDocs';
import { PricingSection } from './landing/sections/Pricing/PricingSection';
import { BlogSection } from './landing/sections/Blog/BlogSection';
import { AboutSection } from './landing/sections/About/AboutSection';
import { ClosingCTA } from './landing/sections/Closing/Closing';
import './marketing.css';

export function Landing() {
  return (
    <div className="landing-root">

      {/* Scrolls to /#section targets on client navigation */}
      <ScrollToHash />

      <LandingNav />

      <main>
        <Hero />
        <ModulesSection />
        <AssistantSection />
        <OutputSection />
        <PhilosophySection />
        <NormativaSection />
        <DemoDocsSection />
        <PricingSection />
        <BlogSection />
        <AboutSection />
        <ClosingCTA />
      </main>

      <LandingFooter />
    </div>
  );
}

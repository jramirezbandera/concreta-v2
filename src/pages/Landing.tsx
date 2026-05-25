// Landing — Concreta marketing page.
// Single-page landing: hero carousel + module library + export/share +
// philosophy + normativa + resources + pricing + blog + about + closing CTA.
//
// Marketing chrome (nav/footer/buttons/typography/responsive) is shared with
// the other marketing pages via ./marketing.css. Each section under
// landing/sections/<Name>/ ships its own co-located CSS.

import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import { ScrollToHash } from './landing/ScrollToHash';
import { HeroCarousel } from './landing/sections/Hero/Hero';
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
        <HeroCarousel />
        <ModulesSection />
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

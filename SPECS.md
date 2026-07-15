## 1. MVP Objectives

### Primary objective
Allow users to perform basic, recurring structural calculations in a few steps, with a clean, clear, and visual experience.

### Specific objectives
- Solve calculations for common sections and elements immediately.
- Display code compliance checks in an understandable way.
- Provide transparency in calculations through broken-down results.
- Facilitate export of results to PDF in a professional format.
- Maintain an interface simple enough for non-experts, yet useful for technicians.

### What the MVP does not include
- Backend.
- User accounts.
- Cloud storage.
- Project management.
- Persistent history across sessions.
- Automatic generation of extensive calculation reports.
- 2D/3D global structural modeling.

---

## 2. Code base

### Reinforced concrete
- Structural Code (Spain) — CE.

### Structural steel
- CTE DB-SE.
- CTE DB-SE-A.
- Eurocode 3 only as internal support or secondary technical reference where applicable, without displacing the Spanish regulatory base of the product.

### Foundations
- CTE DB-SE.
- CTE DB-SE-C.

### General criterion
The code must be implemented explicitly in checks and in the export of results, always indicating which article or regulatory block supports each verification when useful to the user.

---

## 3. Target audience

### Primary audience
- Architects.
- Technical architects.
- Building engineers.
- Structural engineers.
- Technicians who need quick checks of individual elements.

### Secondary audience
- Advanced students.
- Non-structural professionals who need to verify common cases.

### User needs
- Speed.
- Visual clarity.
- Reliable results.
- Avoid overly "academic" or complex interfaces.
- Be able to see at a glance whether an element passes or fails.
- Have access to detail when they want to dig deeper.

---

## 4. Product principles

1. **Speed before complexity**: solve common cases well before covering too many rare edge cases.
2. **Clarity before density**: the app should explain without overwhelming.
3. **Visual before textual**: diagrams, schematics, geometries and check states should be readable at a glance.
4. **Rigor without opacity**: although simple, the app must allow users to understand where results come from.
5. **Modular scalability**: each module must be able to grow without breaking overall coherence.

---

## 5. MVP functional scope

The MVP is organized into three main modules.

### 6.1. Reinforced concrete module
#### Initial submodules
- Reinforced concrete beams.
- Reinforced concrete columns.

#### Minimum expected scope
- Geometric definition of the section.
- Material selection.
- Cover definition.
- Longitudinal reinforcement input.
- Transverse reinforcement input.
- Direct design force input.
- Bending check.
- Shear check.
- Cracking check at SLS where applicable.
- Calculation breakdown with relevant intermediate results.
- Clear compliance status: OK / FAIL.

#### Desirable future development
- Axial + combined bending in columns.
- N-M interaction.
- Interaction diagrams.
- Minimum and maximum reinforcement ratios.
- Spacing and geometric arrangement checks.
- Anchorage and lap lengths.

### 6.2. Structural steel module
#### Initial submodules
- Steel beams.
- Steel columns.

#### Minimum expected scope
- Profile family selection.
- Commercial profile selection.
- Automatic display of geometric properties.
- Steel grade selection.
- Span definition and support conditions.
- Load or direct force input.
- Bending check.
- Shear check.
- M+V interaction where applicable.
- Lateral-torsional buckling in beams.
- Deflection at SLS.
- Section classification.
- Breakdown of code-based results.
- Clear compliance status.

#### Desirable future development
- Columns with biaxial buckling.
- Slenderness and buckling coefficients.
- Buckling curves.
- N, M, N+M checks.
- Welded profiles and hollow sections.

### 6.3. Foundations module
#### Initial submodules
- Isolated footings.
- Mat foundations.

#### Minimum expected scope for isolated footings
- Plan dimensions and depth input.
- Column position.
- Design axial force, moments, and shear.
- Allowable bearing pressure or simplified equivalent geotechnical parameters.
- Self-weight.
- Soil stress check.
- Eccentricities.
- Overturning check where applicable.
- Sliding check where applicable.
- Depth sizing or verification.
- Bending and punching shear within scope.
- Basic recommended reinforcement.

#### Minimum expected scope for mat foundation
- Basic geometric definition.
- Thickness.
- Materials.
- Basic loads.
- Simplified soil reaction.
- Indicative results for stresses and base reinforcement.

#### Desirable future development
- Concrete walls with strip footing.
- Water table.
- Earth pressure.
- Overturning, sliding, and bearing capacity checks.
- Shear and moment distributions in elevation and footing.
- Reinforcement proposal for wall and footing.
- Interactive geometric drawing.

---

## 6. General navigation structure

### Main navigation
- Fixed left sidebar on desktop.
- Direct access to modules.
- Concreta visual identity always visible.
- Active module indicator.

### Secondary navigation
- Horizontal tabs per submodule within each module.
- Example: Beams / Columns.

### Global utilities
- Quick calculator.
- Unit converter.
- Export PDF.
- Possible future access to code help and glossary.

---

## 7. Interface architecture

### Desktop layout
- Left sidebar for global navigation.
- Top header with module title, active code and quick access links.
- Central main area for form and results.
- Single wide column or two stacked vertical blocks.

### Mobile / tablet layout
- Collapsible sidebar.
- Visible and tappable tabs.
- Forms with large fields.
- Stacked results.
- Responsive diagrams.

### Visual philosophy
- Sober, technical, and contemporary aesthetic.
- Inspired by modern professional software.
- Generous whitespace on screen.
- Clean typography.
- Restrained use of color for hierarchy and states.

---

## 8. UX patterns

### Data input
- Forms organized by thematic blocks.
- Units always visible next to the field.
- Selectors for materials, profiles, and classes.
- Numeric inputs with immediate validation.
- Brief tooltips for technical terms.
- Reasonable default values to speed up use.

### Calculation
- Main "Calculate" button.
- Optional automatic recalculation in future phases.
- Calculation blocked if essential data is missing.

### Results
- Executive summary at the top.
- Check table with:
  - calculated value,
  - limit,
  - utilization ratio,
  - status.
- Expandable detail per check.
- Diagrams where they add value.
- Specific alerts on failures.

### Export
- Clean, printable PDF with brand identity.
- Must include input data, results, checks, and date.

---

## 9. Functional specifications by module

## 9.1. Reinforced concrete — Beams

### Input data
#### Geometry
- Width b.
- Total depth h.
- Mechanical cover d'.

#### Longitudinal reinforcement
- Number of tension bars.
- Diameter.
- Automatic calculation of As.
- Option for compression reinforcement.

#### Transverse reinforcement
- Stirrup diameter.
- Spacing.
- Number of legs.

#### Materials
- Concrete grade.
- Steel grade.
- Exposure class.

#### Forces
- Design moment Md.
- Design shear Vd.
- SLS moment for cracking check where applicable.

### Expected results
- Mu.
- Vu.
- wk.
- Utilization per check.
- Status OK / FAIL.
- Bending detail.
- Shear detail.
- Cracking detail.
- Neutral axis position.
- Strain domain where applicable.

### Specific UX rules
- Show simple section diagram with dimensions and reinforcement.
- Show calculated As in real time.
- If there is no compression reinforcement, state this explicitly.
- If the element fails, highlight the critical check.

---

## 9.2. Reinforced concrete — Columns

### Initial recommended scope
- Rectangular section.
- CE materials.
- Covers.
- Longitudinal reinforcement.
- Ties.
- Axial force and moments about one or two axes, at least in simplified form.
- Basic resistance verification.

### Expected results
- Resistance capacity.
- Utilization ratio.
- Geometric reinforcement ratio.
- Warnings for invalid or insufficient reinforcement.

### AI assistant
- "Fill with AI" chat assistant available (see 9.3.1); in this module it extracts design forces (Nd, MEdy, MEdz) directly, and asks which axis is meant when a moment "M" is ambiguous.

---

## 9.3. Steel — Beams

### Input data
#### Profile
- Profile family.
- Commercial profile.
- Auto-filled geometric properties.

#### Material
- Steel grade.

#### Span
- Length L.
- Support condition.
- Lateral buckling length Lcr.
- Deflection limit.

#### Actions
- Input via uniform loads g and q.
- Future option to input design forces Med and Ved directly.

### Expected results
- Calculated Med and Ved.
- Moment, shear, and deflection diagrams.
- Mc,Rd.
- Vc,Rd.
- Mb,Rd.
- Section classification.
- Lateral-torsional buckling check.
- Deflection check.
- OK / FAIL status per verification.

### Specific UX rules
- Display profile properties in a highlighted card.
- Clear and proportional diagrams.
- Show when the profile passes in resistance but fails lateral-torsional buckling.
- Add future suggestions such as: "reduce Lcr" or "increase profile size".

---

## 9.3.1. "Fill with AI" chat assistant

Reference section for the AI assistant. Introduced in Phase 0 as a one-shot extractor for steel beams; Phase 1 turned it into a conversational chat and generalized it, through per-module adapters, to the rest of the app.

**Connected modules (16).** Phases 0–2: Steel — Beams (9.3), Reinforced concrete — Columns (9.2), Foundations — Isolated footings (9.5). Wave 3 (arrays in the payload): Steel — Composite section, Foundations — Micropiles, Geotechnics — Slope stability. Wave 1 (direct fit): Foundations — Pile caps, Timber — Columns, Timber — Beams, Steel — Columns, Rehabilitation — Battened column jacket (*empresillado*), Reinforced concrete — Punching shear. Wave 2 (flat state with quirks): Reinforced concrete — Beams (two sections), Reinforced concrete — Ribbed/solid slabs (atomic-patch gate), Foundations — Retaining walls (the full geotechnical safety table), Steel — Anchor plates (legacy field sync). Still pending: masonry walls; FEM 1D is deliberately out of scope (it is model generation, not form filling). The roadmap lives in [docs/asistente-ia-plan-modulos.md](docs/asistente-ia-plan-modulos.md).

This section is the *what*. For the *how* — anatomy of a chat turn, the adapter contract, the schema dialects per provider, and how to wire a new module — see [docs/asistente-ia-arquitectura.md](docs/asistente-ia-arquitectura.md).

### Scope and principle
- Optional multi-turn chat assistant that extracts input data from a problem statement (text and/or images) and proposes values for the active module's form.
- The app remains offline-first, with no servers of its own. This is the only feature that contacts external services: a conscious, opt-in deviation from the "no external servers" principle (see section 13, Performance).

### BYOK privacy model
- The user provides their own API key for one provider: Anthropic, OpenAI, or Google Gemini.
- Keys are stored only in the browser's localStorage (key `concreta-ai-settings`), unencrypted; the UI warns about this.
- Calls go directly browser → provider, using the official SDKs in browser mode.
- No backend, no telemetry: Concreta does not store or forward statements or images.

### Models
One fixed mid-tier model per provider, defined in `src/lib/ai/models.ts`:
- Anthropic: `claude-sonnet-5`.
- OpenAI: `gpt-5.6-terra`.
- Google: `gemini-3.5-flash`.

### Cost and prompt caching
The user pays for their own tokens (BYOK), so cost is a product concern, not just an engineering one. Cost is dominated by *input*: every turn resends the whole system prompt. Measured on the steel-beams module: ~5.200 fixed tokens per turn (system + schema), ~35k input / ~1.2k output for a 6-turn conversation, i.e. **≈$0.07 per conversation on Sonnet 5** (~$0.06 on Gemini 3.5 Flash).

The system prompt is therefore split in two blocks (`ChatSystem {stable, volatile}`): the rules (~3.100–4.000 tokens, byte-identical across turns of the same module) go first and are **cached**; the form state and the calculation results go last and are not. Caching is a byte-for-byte *prefix* match in all three providers, so this ordering is the whole mechanism — see `docs/asistente-ia-arquitectura.md` §8.1 for how each provider activates it (Anthropic: explicit `cache_control`; OpenAI: automatic + `prompt_cache_key`; Gemini: implicit). It cuts a 6-turn conversation by **41%** ($0.124 → $0.073).

Anthropic adds a second cache breakpoint over the message history **only when images are in the window** — a screenshot is 1.500–4.500 tokens resent every turn, which is worth caching; a text-only history is not (the 1.25× write surcharge would eat the saving).

On the output side, all three providers are asked for the **minimum reasoning**: reasoning tokens are billed as output even though the user never sees them, and a turn whose useful answer is ~200 tokens can bill several times that. The task is structured extraction driven by an explicit prompt, not open-ended reasoning. Anthropic: `thinking: disabled`. OpenAI: `reasoning: {effort: 'none'}`. Gemini: `thinkingConfig: {thinkingLevel: MINIMAL}` — the floor, not off: Gemini 3.x cannot disable thinking. This is a tunable knob, not dogma: if the assistant starts failing on convoluted statements, raising the effort is one line per provider.

### Interaction flow
- "Fill with AI" ("Rellenar con IA") button opens a chat modal.
- Messages combine text and/or images (max. 3 per message).
- Each assistant turn is a structured-output call returning the envelope `{reply, proposal | null}`: `reply` is the conversational answer, always shown; `proposal` is an optional set of proposed values for the form.
- Every request includes a snapshot of the current form state, so follow-ups can build on it ("raise the span to 9 m").
- The snapshot carries the conversation's memory (`src/lib/ai/pendingSnapshot.ts`): a `pendientes_de_aplicar` block with the accumulated not-yet-applied proposal, and `sin_confirmar` filtered by the keys already addressed in the thread. Without this, a value confirmed in conversation that happens to equal the factory default could never leave `sin_confirmar` (confirmation is tracked per-thread, not in form state), and the assistant would re-ask it forever. The model is instructed to include confirmed values in `proposal` even when they match the current value — that is what feeds the per-thread confirmation set.
- Proposals render as cards with a field-by-field Current / Proposed preview, fields not applied or not found (with reason), and warnings.
- Nothing touches the form state until the user confirms "Apply". Applying does not close the modal; the conversation continues.
- When the statement is ambiguous, the assistant asks a clarifying question (`reply` without `proposal`) instead of guessing.
- Conversation history lives only in memory: closing the modal discards it. Each request sends a sliding window of at most 12 turns and 6 images.
- Steel beams: the AI extracts loads (gk, qk, tributary width, use category), never design forces: MEd / VEd are derived by the app from the applied loads, as with manual input. Module-specific behavior for RC columns and isolated footings is noted in their sections.

### Safety guardrails
The assistant can reduce a calculation's safety in ways that look plausible and pass unnoticed. This happened: the assistant wrote the Málaga snow load (0.20 kN/m²) over the maintenance overload (1.0) in the single `qk` field, halving the design moment. Two complementary layers, plus the prompt, contain this.

- **Principle — demand/criteria vs. resistance.** The problem's *data* (loads, design forces, spans, buckling coefficients, soil properties) and its *criteria* (deflection limit, cover, whether loads are factored) are fixed by the project, the code, or the geotechnical report: they are not design variables. *Resistance* (section, profile, reinforcement, material grade, footing size) is. The only legitimate way to make a check pass is to raise resistance. A model asked to "make it comply" has a structural incentive to do the opposite, which is cheaper and looks just as green.
- **Layer 1 — rejection (narrow).** Only for provable internal contradictions. Today: a proposed `qk` below the use category's table overload contradicts that category, so it is refused with a "Aviso de seguridad:" warning (`mapExtraction.ts`). Deliberately narrow: escape hatch is the "Custom" category.
- **Layer 2 — flagging (generic).** `src/lib/ai/safety.ts` holds a per-module table of fields that are *not* design variables, each with the direction that is dangerous. Any proposed change that lowers the safety level is returned in `plan.risks`. Noise gate: a risk only fires if the current value is *not* the factory default — lowering a default while entering the real data is filling in the form; lowering an established value is the incident's pattern. `alwaysCheck` overrides the gate for fields that reinterpret the whole calculation (today: footings' `loadsAreFactored`, which stops γ from being applied to service loads).
- **Interlock.** Risks render as a red block in the proposal card (field, before → after, and why that field is not a free design variable), and "Apply" stays disabled until the user ticks an explicit confirmation. Flagging without stopping the click would not prevent the failure it exists for.
- `risks` is a **required** field of `AiApplyPlan`: a new module cannot be wired up without declaring its rules (even if empty).

### Offline behavior
- The rest of the app keeps working fully offline; only this feature fails, with a clear error message.
- The provider SDKs are bundled in a separate chunk (`ai-vendor`) excluded from the PWA precache.

---

## 9.4. Steel — Columns

### Initial recommended scope
- Profile selection.
- Steel grade.
- Buckling length per axis.
- Design axial force.
- Moments if within scope.
- Buckling and basic resistance check.

### Expected results
- Slenderness.
- Reduction factors.
- Compression capacity.
- Compliance status.

---

## 9.5. Foundations — Isolated footings

### Input data
- Plan dimensions.
- Depth.
- Column dimensions.
- Column position.
- Axial force Nd.
- Moments Mx, My.
- Shear forces where applicable.
- Concrete unit weight.
- Allowable bearing pressure or simplified geotechnical data.
- Foundation level.
- Covers.
- Base reinforcement.

### Expected results
- Effective area.
- Eccentricities.
- Stress distribution.
- Maximum and minimum soil bearing stress.
- No-tension check where applicable.
- Stability check.
- Bending per face.
- Punching shear.
- Recommended reinforcement.

### Specific UX rules
- Plan and section drawing of the footing.
- Clear summary of whether the resultant falls within the central kern.
- Clear messages when stresses are inadmissible.

### AI assistant
- "Fill with AI" chat assistant available (see 9.3.1); in this module it distinguishes service loads from factored (design) loads, and asks which the statement gives when unclear.

---

## 9.6. Foundations — Mat foundation

### Initial recommended scope
- Simplified input.
- Used as a preliminary tool, not an advanced FEM solver in the MVP.
- Indicative results compatible with a preliminary sizing phase.

---

## 10. Status and message system

### Check statuses
- OK.
- FAILS.
- REVIEW.
- INCOMPLETE DATA.

### Communication criteria
- Do not use cryptic messages.
- Each error must say what is missing or what does not fit.
- Each failure should indicate the affected check and, where possible, the most likely cause.

Examples:
- "Design moment Md has not been entered."
- "The section fails in shear."
- "The profile passes in bending but fails lateral-torsional buckling with the specified Lcr."

---

## 11. Validations

### General validations
- Do not accept negative values where they make no sense.
- Do not accept empty fields for required variables.
- Check basic dimensional consistency.
- Avoid geometrically impossible combinations.

### Specific validations
- Reinforcement incompatible with the effective width.
- Covers excessive relative to the depth.
- Stirrup spacing outside reasonable limits.
- Non-existent profiles in a family.
- Lcr greater than or inconsistent with the structural system when the user selects absurd values.

---

## 12. PDF export

### Objective
Generate a clear, professional, and useful PDF for archiving, internal review, or preliminary delivery.

### Minimum PDF content
- Product logo and name.
- Date and time.
- Module and submodule.
- Applied code.
- Input data.
- Main results.
- Check table.
- Relevant calculation details.
- Diagrams where available.
- Observations or warnings.

### Format requirements
- Clean layout.
- A4 portrait by default.
- Good readability in black and white.
- Controlled page breaks.
- Clear headings.

---

## 13. Non-functional requirements

### Performance
- The app must respond almost instantly for MVP calculations.
- It must not depend on external servers to calculate.
  - Sole exception: the opt-in "Fill with AI" chat assistant (section 9.3.1) calls external AI providers; all calculations remain local.

### Reliability
- Formulas must be centralized and tested.
- Internal traceability of each calculation must exist.

### Maintainability
- Clear separation between UI, business logic, and calculation engine.
- Modular code per code standard and per element.

### Scalability
- Ability to add new modules without rebuilding the architecture.
- Future ability to enable a backend without breaking the current frontend.

### Accessibility
- Adequate contrast.
- Reasonable keyboard navigation.
- Clear labels on forms.

---

## 14. Technical requirements

### Indicative stack
- Frontend with a modern framework such as React / Next.js or similar.
- TypeScript preferred.
- Styles with a consistent component system.
- Calculation engine decoupled from rendering.
- Client-side PDF export.

### Code organization
- `/app` for routes/pages.
- `/components` for reusable UI.
- `/features` per calculation module.
- `/lib` or `/core` for formulas and utilities.
- `/data` for code tables, profiles, and materials.

### Recommended logical structure
- `domain/` for models and types.
- `calculations/` for pure functions.
- `validators/` for validations.
- `formatters/` for result presentation.
- `pdf/` for export.

---

## 15. Conceptual data model

### Main entities
- Module.
- Submodule.
- Calculation case.
- Input data.
- Results.
- Checks.
- Applied code.
- Exported PDF.

### Persistence
The MVP will have no remote persistence. As an optional improvement, there could be:
- temporary persistence in localStorage,
- saving the last calculation case in session,
- JSON import/export in later phases.

---

## 16. Visual design

### Target visual tone
- Professional.
- Serious.
- Technological.
- Modern.
- Sober.

### Interface traits
- Predominantly light background.
- Soft technical blue as accent color.
- Neutral grey for structure.
- Green and red reserved for states.
- Soft borders and clean cards.
- Thin, technical, and consistent iconography.

### Brand
The Concreta brand must convey calculation, engineering, and confidence — not a playful or overly generic corporate aesthetic.

---

## 17. Notes on the current prototype state

The current prototype already shows several good decisions:
- Module-based architecture.
- Tabs per element type.
- Input separated into blocks.
- Display of calculated properties.
- Check tables with utilization ratios.
- Extended calculation detail.
- PDF export.

Clear areas for evolution also appear:
- Improve the results hierarchy.
- Strengthen visual feedback for pass/fail.
- Make diagrams and geometries more prominent.
- Better standardize code nomenclature.
- More clearly separate "input", "result", and "technical detail".
- Lay the groundwork for more powerful foundation modules.

---

## 18. Proposed functional roadmap

### Phase 1 — Usable MVP
- Reinforced concrete: beams.
- Reinforced concrete: basic columns.
- Steel: beams.
- Steel: basic columns.
- Foundations: isolated footings.
- PDF export.
- Converter and calculator.

### Phase 2 — Consolidation
- Improved RC and steel columns.
- More complete footings.
- Preliminary mat foundation.
- Advanced validations.
- Better results UX.
- PDF improvements.

### Phase 3 — Expansion
- Concrete walls with strip footing.
- Water table and earth pressure.
- Interactive diagrams.
- Sizing recommendations.
- Optional local persistence.

### Phase 4 — Advanced product
- Case library.
- Comparison between alternatives.
- More extensive reports.
- Possible backend and project management, if decided in the future.

---

## 19. MVP acceptance criteria

The MVP will be considered ready when:
- A user can complete a typical calculation in under a few minutes.
- Inputs are clearly organized.
- Results unambiguously indicate whether the element passes or fails.
- The technical detail is sufficient to trust the calculation.
- The exported PDF is presentable and useful.
- The app runs stably on desktop and tablet.

---

## 20. Executive summary

Concreta should position itself as a fast, clear, and visual structural calculation tool for common building cases, based on Spanish structural codes and built with a modular approach. The MVP must focus on solving a defined set of calculations very well: reinforced concrete beams and columns, steel beams and columns, and basic shallow foundations — all without a backend, without project management, and with PDF export, prioritizing a professional, clean, and understandable experience.

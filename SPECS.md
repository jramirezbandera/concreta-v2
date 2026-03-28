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

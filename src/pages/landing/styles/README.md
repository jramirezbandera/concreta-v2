# landing/styles — shared marketing chrome

These files are the "non-section" CSS for the marketing site. They are
imported in order by `src/pages/marketing.css`, which is in turn imported
by every marketing page (Landing, Pricing, Normativa, Blog, BlogPost,
About).

## What lives where

```
animations.css      @keyframes — MUST be top-level (cannot nest)
tokens.css          .landing-root design tokens (--accent, etc.) + root rules
base.css            * box-sizing, a, button, img/svg, .dot-grid, .container
nav.css             .nav, .brand, .nav-links, .nav-mobile-menu
buttons.css         .btn primitives + focus-visible ring
section-helpers.css .section-eyebrow/title/lede, .mono/.muted/.dim, .tag
footer.css          .footer
section.css         generic .section wrapper + .section-head + .link-arrow
responsive.css      all @media breakpoints — MUST be imported LAST
```

## Cascade rule (important)

`responsive.css` MUST be the last `@import` in `marketing.css` because it
targets section selectors (`.hero-inner-split`, `.mod-grid`,
`.philo-compare-intro`, etc.) and overrides them at media breakpoints. If
you add a new chrome file, put it BEFORE `responsive.css`.

Section-specific CSS lives in `src/pages/landing/sections/<Name>/<name>.css`,
co-located with its `<Name>.tsx` component. Section CSS is loaded *before*
`marketing.css` (via TSX component imports being resolved first), so the
final bundle order is:

```
1. all section CSS (via Landing.tsx's section imports)
2. animations + tokens + base + nav + buttons + section-helpers +
   footer + section  (from marketing.css)
3. responsive  (from marketing.css, last)
```

This way responsive @media queries override both chrome and section rules.

## Keyframes rule

`@keyframes` cannot be nested inside `.landing-root { ... }` — CSS native
nesting doesn't allow it (browsers silently drop the rule). All keyframes
must live in `animations.css`, top-level (not wrapped in `.landing-root`).

If you add a `@keyframes` somewhere else, the rule won't apply. To guard
against this, grep .css files only and exclude `animations.css`:

```bash
grep -rn '@keyframes' src/pages/landing/ --include='*.css' \
  | grep -v 'styles/animations.css'
```

(no matches = OK)

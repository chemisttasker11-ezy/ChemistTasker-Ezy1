# ChemistTasker landing page

Standalone Next.js App Router landing page, alongside the existing Vite application.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. Production verification: `npm run build`; serve with `npm start`.

## Platform integration

Buttons link to the existing ChemistTasker application. Set `NEXT_PUBLIC_PLATFORM_URL` in `.env.local` to use another deployment (for example `http://localhost:5175`). Restart/rebuild after changing it. Default: `https://chemisttasker.com.au`.

This app does not replace or migrate authenticated Vite routes. It can be deployed separately as the marketing site with the existing application on a separate origin. Deployment and domain changes are not performed.

## Design and assets

The supplied official logo is used as an image, with CSS framing to remove excess visible whitespace. Original pixels are preserved. Pharmacy portraits come from the supplied reference folder; they are illustrative, not testimonials. The design uses local Outfit and Inter font packages and Lucide SVG icons. Palette is defined in `app/globals.css`.

The role workspace and calendar are explicitly labelled product previews with placeholder data, not live dashboards. The five-tier explainer follows the v2 reference and the user's requested model. Unsupported testimonials, savings statistics, launch offers and fill guarantees are not advertised. The full reference-derived capability catalogue flags product confirmation requirements; see [FEATURE-MAPPING.md](FEATURE-MAPPING.md) for source coverage and animation hooks.

## Interaction map

| Control | Reaction / destination | Implementation |
| --- | --- | --- |
| Logo | Scroll to top | Anchor |
| The platform | Scroll to feature section | `#features` |
| Who it’s for | Scroll to role explorer | `#workspaces` |
| How it works | Scroll to calendar overview | `#how-it-works` |
| Find a Shift | Existing public shift board | `/shifts/public-board` on configured platform |
| Find Talent | Existing public talent board | `/talent/public-board` on configured platform |
| Get started / role CTA / Hub CTA | Existing registration page | `/register` |
| Log in | Existing authentication page | `/login` |
| Pricing | Existing plans page | `/pricing` |
| Mobile menu | Toggle navigation; close after link selection | React `useState`, `aria-expanded` |
| Role tabs | Replace copy, benefits and preview with chosen role | React `useState`; tablist, roving tabindex, arrows/Home/End |
| Footer role links | Select corresponding role and scroll to explorer | Same role state + anchor |
| FAQ rows | Expand/collapse answers independently | Native `details` / `summary` keyboard interaction |
| Privacy / Terms | Existing legal pages | `/privacy-policy`, `/terms-of-service` |
| Calendar / workspace previews | Illustrative content only; no simulated backend actions | Semantic static content |

Responsive layouts cover narrow phones through wide desktop. Keyboard focus, skip link, reduced motion, semantic landmarks and descriptive image alternatives are included. No account data or backend credentials are needed.

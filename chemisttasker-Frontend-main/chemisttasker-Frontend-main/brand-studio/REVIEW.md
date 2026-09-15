# Step 2 — Brand identity review

**ChemistTasker · 5 September 2026 · v0.1 · Ready for your review**

This is an isolated, working brand showcase. It does not replace or connect to the Vite, Next.js or Expo application. Step 3 begins only after your review.

## Open the showcase

Open `index.html` directly in a browser, or run this command from the application root:

```powershell
python -m http.server 4178 --bind 127.0.0.1 --directory brand-studio
```

Then visit **http://127.0.0.1:4178/**. All fonts and assets are local; the showcase does not make API calls, use analytics, store account data or submit forms to a server.

## What to try

1. Choose each of the four persona cards. The accent changes across navigation, components and workspace examples.
2. Switch between light and dark using the top-right theme button.
3. Compare the bottle, stacked Rx signature and horizontal wordmark. Switch logo finish and download individual SVGs.
4. Switch between Dashboard and Talent Hub examples.
5. Search the 27-skill catalogue, filter categories, inspect an icon and add/remove skills from the example profile. Both workspace examples update from the same selection.
6. Try the example form with an empty name, then complete it. The form demonstrates validation and optional example-skill selection, without saving data.
7. Open and close a dialog with the keyboard, including Escape, and check small-screen layouts.
8. Download the brand kit. It contains vector and PNG logo formats, all skill SVGs, font/license, tokens and skill metadata.

## Brand decisions represented

| Persona | Base accent | Text on base accent | Readable accent on light surfaces |
| --- | --- | --- | --- |
| Owner | `#7A2DFF` | White | `#5C1BC2` |
| Pharmacist / locum | `#1A73E8` | White | `#1454AE` |
| Other staff | `#00D4E6` | Navy | `#006570` |
| Explorer | `#FF2DB2` | Navy | `#A6086B` |

The shared navy is `#0B0F2B`. Bright bottle colours remain intact; accessible text, subtle surfaces and dark-theme variants are separate tokens. Success, warning, error and information have independent labelled styles. Gradients and all four quadrants belong to identity illustrations; operational surfaces stay readable.

DM Sans is hosted locally, including its variable TTF for native use, WOFF2 for web, and SIL Open Font License. The digital wordmarks use outlined DM Sans lettering at weight 650, so they do not require a font installation. Body text remains real selectable text. Shared scale: 4-point spacing; 8px controls, 12px cards, 24px feature panels. Dense examples demonstrate hierarchy at reduced scale; full application sizing is implemented in later steps with native text scaling.

## Logo files and usage

`assets/logos` contains the bottle, stacked signature and horizontal wordmark in four finishes: full colour, reversed, navy monochrome and white monochrome. A square app-icon composition is also provided.

- Keep all four quadrants in the full-colour bottle. Do not recolour it to a single persona.
- The supplied JPEG is a visual reference, not a clean transparent/vector master. These SVGs are a **new vector interpretation** for review, not an exact trace or a claim to recover the original font.
- The stacked version retains an Rx treatment; the horizontal version reads ChemistTasker. Written product copy remains ChemistTasker everywhere.
- Monochrome variants use a transparent check-shaped knockout. Use reversed/white versions on dark surfaces and navy versions on light surfaces.
- Leave one cap-height of clear space. Suggested minimums: bottle 24px high for UI, stacked signature 120px wide, horizontal wordmark 160px wide. The 16/32px favicon exports are dedicated small uses; show accompanying product text where needed.
- PNGs are raster exports of the SVG sources, not independent masters. The square app export has an opaque background; transparent lockups suit documents and web layouts. Final store-specific packaging and Expo configuration belong to Step 9.

The logo lettering, bottle proportions and app-icon composition are specifically open for your feedback before adoption.

## Skill icon system

All 27 current unique skill codes have distinct SVG assets. The style uses a 24×24 grid, rounded joins/caps and a consistent 1.65-unit stroke. Software entries use distinguishable letter badges instead of invented vendor logos. Runtime SVGs inherit `currentColor`; no platform-specific emoji are used.

`skills.json` records the existing code, label, category, description and certificate flag, together with the icon file and SVG geometry. The source catalogue is unchanged. Clinical and certificate entries are grouped together because the existing catalogue includes both; an insurance entry is not presented as a clinical procedure.

- Icons appear with readable labels; decorative inline SVGs are hidden from screen readers when the adjacent label already names the skill.
- Credential status is independent. A certificate-required flag does not prove that a document is uploaded or verified.
- `VACCINATION` and `VACCINATOR` remain separate; so do `PDL` and `PI_INSURANCE`.
- Selected example skills appear in both Dashboard and Talent Hub. Owner/Explorer dashboard examples identify these as another person's sample skills; they do not assign clinical qualifications to owners or explorers.
- Candidate Alex Morgan and all counts, pharmacies and shifts are illustrative. No real account details or credentials are embedded in the showcase.
- Unknown/legacy label resolution and native/web component adapters remain Step 3 work. Existing permissions, eligibility and Junior/Explorer classifications are unchanged.

## Live-site context

The public homepage and one supplied owner account were inspected in a temporary browser session. The owner account reached `/dashboard/owner/overview`. The current homepage uses teal/magenta accents and the owner body font stack begins with Inter. These observations informed consistency decisions; they are not a functional audit.

During the account inspection, non-read requests were blocked except authentication/session endpoints. No business forms were submitted and no accounts were changed. Credentials, tokens and authenticated screenshots were not saved into this project or the downloadable kit. The remaining accounts were not needed for this step.

## Verification and limits

See `qa/results.json` and `qa/contrast.json` for machine-readable checks, and `qa` for review screenshots. Checks cover all 27 catalogue codes, SVG validity, downloadable assets, token contrast, persona/theme switching, skill filters/selection, dashboard/Talent Hub synchronisation, dialog focus/Escape, form validation and responsive overflow. Automated accessibility checks use axe-core with WCAG A/AA tags, supplemented by keyboard/contrast checks. These are prototype checks, not a certification of the full application.

Normal text contrast targets 4.5:1; large text targets 3:1, following the [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). User-preferred reduced motion removes transitions and smooth scrolling.

No production application files, catalogue entries, role mappings or API contracts have changed. Canva or raster image generation was not necessary: code-native vector assets provide consistent, scalable logo/icon geometry for this deliverable.

## Your review checkpoint

Please review:

1. The overall bold/colourful direction and how much accent appears in the examples.
2. The proposed logo lettering and proportions, particularly the stacked Rx signature.
3. Skill icon clarity at both catalogue and compact badge sizes.
4. The dashboard/Talent Hub skill presentation and light/dark variants.

After feedback, Step 3 will turn the approved definitions into shared workspace packages and platform components. This showcase is deliberately self-contained so feedback can be applied before app integration.

## Asset provenance and rebuild

- Bottle/palette: vector interpretation of the user-supplied logo reference; not a Canva template or generated stock logo.
- Skill and interface geometry: original code-native SVG artwork created for this project. Software monograms are identification labels, not official vendor marks.
- DM Sans: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/dmsans), licensed under SIL OFL; license included at `assets/fonts/OFL.txt`.
- `scripts/build_brand_assets.py` builds SVGs, font formats and JSON from the existing catalogue. It requires Python fontTools/WOFF2 support; it downloads the font/license only when absent.
- `scripts/export_brand_png.cjs` rasterises the SVG masters through Chromium. `scripts/check_brand_studio.cjs` checks the prototype. Both use Playwright via `PLAYWRIGHT_MODULE` (or a normal `playwright` install), with optional `CHROMIUM_EXECUTABLE`; checks load axe-core from `AXE_SCRIPT`.
- `scripts/package_brand_kit.py` creates the ZIP and checks baseline source hashes. Existing application source files remain the Step 1 baseline.

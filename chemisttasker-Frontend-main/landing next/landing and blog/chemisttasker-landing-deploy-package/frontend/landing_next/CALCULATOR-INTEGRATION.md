# Calculator integration

The standalone calculator is integrated natively at `/calculator`. Desktop and mobile navigation links appear on the landing page, blog/news header and public-page header. The calculator logo links back home.

## Layout and assets

- `public/assets/calculator-wordmark.png` is a byte-for-byte copy of the standalone calculator wordmark.
- Header: 132 x 55 px image in an 85 px header, 32 px horizontal padding, matching the calculator. At <=760 px: 112 px image width, 72 px header, 18 px padding. Footer artwork is preserved.
- `app/calculator/calculator.css` scopes every selector to `.calculator-app`; it cannot change landing/blog page styles. Shared Inter/Outfit fonts are reused.
- Feature code and clinical data live in `features/paediatric-calculator`. Clinical logic and source records are unchanged from the standalone version. No new clinical validation is implied. Route metadata retains noindex.

## Verification

- Complete Next.js production build passed, including TypeScript and all existing routes.
- Browser checked landing header and navigation, calculator synthetic age 5 / weight 20 kg result, blog layout, mobile blog menu and calculator layout.
- Blog route renders, but article loading reports the publishing backend unavailable in this local environment; backend configuration was not changed.
- The original standalone calculator remains separate and unchanged.

## Supplied-project build repairs

The supplied package lock did not match its manifest. Ran npm install to synchronize it. The supplied PostShiftPage calendar had an incompatible handwritten slot type and misspelled longPressThrottle prop: replaced with the library SlotInfo type and longPressThreshold (preserving its value 50). No routes or content sections were removed.

## Run

From this directory: `npm run dev` (port 3000), or `npm run build` then `npm run start`. This session's production preview uses `npm run start -- --hostname 127.0.0.1 --port 3200`.

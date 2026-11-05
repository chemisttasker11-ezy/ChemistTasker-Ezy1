# W8 "Public & content": the web's public Next.js area on mobile
Owner D9 (2026-11-04): agreed. Written by Claude A from the web source on ct-mmerge (38b3a5c1). Claude B orchestrates.
Runs after W7 and before the five-user test (roadmap step 7). Same flow as W3: Codex A research pass (exact file:line,
shared-core calls, traps) -> Argon design check -> Claude B -Write build per sub-wave -> Codex A gate -> commit ->
device shots at normal and 1.6x text, signed out AND signed in.

## Rules for every W8 sub-wave
1. Mobile reads the same backend data as the website through shared-core (`publicContent.*`, `createContentOperations`,
   contracts in `shared-core/src/contracts/publicContent.ts`). No new endpoints, no backend changes.
2. Signed-out users can read; actions (comment, react, post, vote, report) need sign-in. A signed-out tap on an action
   opens login and comes back to the same item afterwards.
3. Public screens are reachable signed out. In `app/_layout.tsx` (publicRoutes at :252) add ONE check for the new
   `explore` route group, placed like W3f's `isPublicShiftRoute` (Argon W3 plan trap: adding to `publicRoutes`
   naively throws signed-in users to their dashboard). Signed-in users still pass the AHPRA / mobile-verify /
   owner-setup gates, as in W3f.
4. Entry points: the W-AUTH landing gets an "Explore" row (Calculator, Learning, Community, Blog & News); every
   persona's More screen gets the same entries (Argon decides the grouping; D5: by mobile task frequency).
5. Share = native share sheet with the website URL (`https://chemisttasker.com.au` + the web path), so links work for
   people without the app.
6. Copy, warnings and empty states match the web text unless a phone needs it shorter (D5/D6).
7. Never drop a web feature to simplify: if a piece is deferred, it is listed below as deferred.

## Sub-waves (order: W8a -> W8c -> W8d -> W8e -> W8f; W8b when the owner decision below is made)

### W8a: foundation (small)
- Route group `frontend_mobile/app/explore/` + the `_layout.tsx` public check (rule 3).
- `RichContent` for React Native: render the web's rich document (`frontend_web/landing_next/components/rich-content.tsx`,
  34 lines) with the same node set: paragraph, heading 2/3/4, bullet/ordered list, blockquote, hard break, image
  (http/https only), marks bold/italic/strike/code/link (http/https/mailto only; others render as plain text).
  Unknown nodes render nothing, like web. Small pure test for the URL filter.
- `openWebPage(path)` helper using the installed `expo-web-browser` (openBrowserAsync), base URL from mobile's existing
  config if it has one (research pass checks), else one constant; never hard-coded per screen.
- Landing "Explore" row + More entries (rule 4).
- Done: tsc + expo lint + the URL-filter test; signed-out cold start reaches /explore and back.

### W8b: paediatric anti-infective calculator (medium; owner D9b below decides how it ships)
- Checked 2026-11-04 on the emulator: `https://staging.chemisttasker.com.au/calculator` works on a phone (200, mobile
  layout); `https://chemisttasker.com.au/calculator` is 404 today (the new public site is not on production yet). So
  the web base URL comes from config (staging for test builds, production at launch), never hard-coded.
- **Store builds (temporary):** the Calculator entry opens `<web base URL>/calculator` in the phone's
  normal browser (`Linking.openURL`, not the in-app browser), with a small "opens the website" hint.
- **Native screen built now but hidden:** one switch, `NATIVE_CALCULATOR = __DEV__` in one mobile file, so dev builds
  show the native screen for testing and store builds show the web link. Turning it on later = flip that one line.
- Web: `landing_next/app/calculator/page.tsx`, `features/paediatric-calculator/` (engine.ts 50 lines, types.ts,
  regimens.ts, medicines.ts, sources.ts, legacy-regimens.json 1406 lines, calculator.tsx 162 lines).
- **Move, don't copy** the engine and data into shared-core (rule: shared-core is the only source of domain logic), with
  web importing from shared-core. Clinical values must not change by a single character.
- **Golden test first** (there are NO calculator tests today): before the move, record the current web engine's output
  for every regimen x formulation x a grid of ages (0y1m ... 17y11m, edges 1/3/6/12/156/216 months) x weights
  (blank, 0.5, edges of each band, minKg, 300) x the three concern flags x specialist confirmed on/off. Commit it as a
  JSON fixture; the shared-core engine must reproduce it exactly. Codex B writes it (tests lane), Codex A gates.
- Native screen `app/explore/calculator.tsx`: medicine picker by family, regimen, formulation, age years/months,
  weight, the three concern checks, specialist confirmation; result card with dose, range note, daily total, volume,
  "age-estimated weight" formula; every blocker shown verbatim; "Decision support - clinical validation pending"
  badge and the review note always visible; sources with version and checked date; result is a live region.
- Done: golden test green in shared-core and web build green; device check of 5 scripted cases matching web output.

### W8c: Learning, Blog and News (medium-large)
- Web: `app/(public)/learning/page.tsx` (articles with topic=learning, links to hubs/blog/news; line 65 also calls
  `marketplace.getListingOptions`: research pass checks why), `app/(hub)/components/{listing,article-card,
  article-detail,discussion,share-button}.tsx`, `lib/hub.ts` (topics, dateLabel en-AU Brisbane, safeWebUrl).
- Screens: `explore/learning`, `explore/blog`, `explore/news` (one list component: topic filter, search, load more,
  retry, empty state), `explore/article/[slug]` (cover, title, byline, date, read time, source attribution link,
  rich body via W8a, reactions, comments + replies + delete own + report when `comments_open`, share).
- **Replaces the "Coming Soon" Learning screens** (`roles/pharmacist/learning.tsx`, reused by other staff; drift L16) and
  adds Learning for explorer, owner and organization (argon-toptasks gap). This takes "learning" OUT of W6 so two
  writers never build it twice.
- Calls: `publicContent.listArticles/getArticle/listArticleComments/createArticleComment/deleteArticleComment/
  reactToArticle/removeArticleReaction/reactToArticleComment/removeArticleCommentReaction/reportArticleComment`.
- Traps: request generation on filter/search changes (only the latest response writes); load-more never duplicates
  rows; a failed load shows retry, never "no articles"; reaction taps are optimistic with rollback on error.

### W8d: public community hubs (large)
- Web: `app/hubs/{page,[hub]/page,posts/[id]/page,community-client,post-entry,social-format,access-notice}.tsx`,
  `(hub)/community/sign-in`. Six platform communities (ChemistTasker, Pharmacist, Intern, Pharmacy Team, New to
  Pharmacy, Owner): anyone reads; `can_interact` members post, comment, react, vote; authors edit/delete their own.
- Screens: `explore/hubs` (list), `explore/hubs/[hub]` (feed with pinned first, polls), `explore/hubs/post/[id]`
  (post, attachments, comments, replies), compose/edit post sheet when `can_interact`, report.
- This is NOT the existing internal `roles/shared/hub/HubScreen` (pharmacy/org hubs, signed in). Keep both; Argon
  decides whether More shows them as one "Community" entry with two sections or two entries.
- Calls: `publicContent.listHubs/listCommunityPosts/getPost/listPostComments/listCommunityPolls/voteCommunityPoll/
  createCommunityPost/updateCommunityPost/deleteCommunityPost/createCommunityComment/updateCommunityComment/
  deleteCommunityComment/reactToCommunityPost/removeCommunityPostReaction/reactToCommunityComment/
  removeCommunityCommentReaction/reportPost`.
- Traps: `can_interact` comes from the server per hub and per post; never decide eligibility on the phone. Attachments
  open only http/https URLs (web `lib/safe-hub-attachment.ts`). Editorial posts render `editorial.body_document`.

### W8e: public organisation profile + signed-out talent board (medium)
- Web: `app/(public)/organization/[slug]` and `talent/public-board`, both render migrated pages through
  `public/runtime.tsx` (`PublicOrganizationPage`, `PublicTalentBoardPage`). Research pass lists their shared-core calls.
- Native read-only screens; the talent board reuses the existing signed-in talent-board components with a public mode
  (no contact or reveal actions signed out; tapping one goes to login and back).
- Done: both work signed out and signed in; nothing private shows signed out (check against the web page's payload).

### W8f: pages that open the website in the in-app browser (small)
- Pricing, organisation pricing, Terms of Service, Privacy Policy: `openWebPage(...)` from the landing footer, More,
  and every place mobile links Terms/Privacy today (research pass lists them).
- Publishing workspace `/content` and `/content/invite/[token]` (writer/publisher team, rich visual editor, moderation):
  web only for now; More shows "Publishing workspace" only when `contentOperations.currentUser()` returns areas. The
  in-app browser does not share the app's sign-in, so the person signs in on the web page; say so on the entry.
- Referee questionnaire and decline links: these come from emails to referees, who usually have no app. No app screen.
  If app links are added later, these paths stay on the web.

## Deferred (listed, not dropped)
- Universal links / Android app links so chemisttasker.com.au/blog/... opens the app (needs native config plus files on
  the web server).
- Native publishing workspace and moderation (only if publishers ask for it on the phone).

## OWNER DECISION D9b (2026-11-04, decided)
Store builds link out to the web calculator in the phone's browser for now; the native screen is built and kept
hidden. Because the engine, data and sources move to shared-core, adding the manufacturer / approved-entity details
on the web updates both at once; the native screen is switched on at the end, when those details and clinical
sign-off are in place.

Background (why): **the calculator and the app stores.** Apple App Review guideline 1.4.2 (checked 2026-11-04 on developer.apple.com):
"Drug dosage calculators must come from the drug manufacturer, a hospital, university, health insurance company,
pharmacy or other approved entity, or receive approval by the FDA or one of its international counterparts." The web
calculator also says "clinical validation pending". Google Play and the TGA (software as a medical device) may add
their own checks.

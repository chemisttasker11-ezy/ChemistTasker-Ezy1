# Decisions I took while you slept (mobile mirror job)
Each one is reversible; nothing is pushed. Say "change N" to undo any of them.

## Needs YOU (blocked)
A. **Android native build of SDK 58 cannot run on this PC** until Windows long paths are on: react-native-gesture-handler's
   generated C++ paths exceed 260 characters even from `C:\m` (SDK 54 built fine; newer libs nest deeper). I may not
   change system settings. Either run (admin PowerShell, then reboot not needed):
   `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`
   or let CI build it (needs your go to push the branch). Until then the SDK 58 commits are type/lint/security-checked
   but not yet proven on a device.
B. **Leftover folder `C:\m`** (a temporary build copy, ~1.5 GB, no longer a git worktree): delete it when convenient;
   my delete was blocked by policy.

## Commits and process
1. **One commit for F4 + W1b + GUARD** (`44d655f4`) instead of three: they share the persona layouts and were
   gated together on one tree. Can be split later (nothing pushed).
2. **I wrote two small fixes myself** (pull-to-refresh marks shown rows read; required-field stars) and had them
   reviewed by Codex B, so nobody checked their own work.
3. **Teardown uses public sources only** (store listings, vendor sites, demo videos): no app installs, no sign-ups.
   Flows hidden behind sign-up are marked "not public".

## Top-tasks map (TOP_TASKS_MAP.md)
4. **Keep both Pills entries** (owner Pills and Pill rewards) rather than merging them (map Q4).
5. **Keep org Invoices on mobile** even though web's org nav lacks it (map Q5): we never drop features.

6a. **No payment countdown on Home cards** (map Q6): the API shows "reserved, waiting for payment"
   (`/shift-offers/?status=ACCEPTED_AWAITING_PAYMENT`) but has no payment deadline field (offer `expires_at` is a
   different thing). The card says "Waiting for payment" with no timer; adding a deadline is backend work for later.
6b. **No "Ben and 2 others are free" line**: there is no API that shows other people's availability (only your own),
   so the unfilled-shift card says "Unfilled in 48h" plus your favourites list, without claiming who is free.
6c. **Workers' Shifts tab links to My Roster** for the web "Roster" sub-view (the screen exists at `/my-roster`).

6d. **Pills rewards stay** although the teardown lists "gamified rewards" as an anti-pattern (AVOID 4): it is
   your feature, so W2 keeps it.
6e. **My Chain is not built in W2a** (no mobile screen exists; building one is a feature, not a shell change). Listed
   as a parity gap for a later wave.
6f. **W2 split in two runs**: W2a = owner, organization, admin; W2b = pharmacist, other staff, explorer (after W2a,
   so two writers never touch the shared shell at once).

6g. **Organization tabs hide when Lina lacks the capability** (same as web), instead of showing a tab that leads
   to "not allowed".
6h. **Admin Attendance approvals and Roster need staff AND roster rights**, as web does (Argon suggested roster
   rights alone; web parity wins).
6i. **Learning for owner/org is not wired yet**: the mobile Learning screen is still a placeholder; listed as a gap.

## SDK upgrade
6. **I run the `expo install` steps myself**: Codex's sandbox cannot reach Expo's servers.
7. **iOS minimum rises from 15.1 to 16.4** (SDK 56+ requires it; every Expo module's podspec says 16.4). iPhones
   stuck on iOS 15 or 16.0-16.3 (iPhone 6s/7 era) can no longer install new versions. Unavoidable with SDK 58.
8. **SDK 56 is a stepping stone only, never shipped**: it has a Hermes memory bug with reanimated; we go on to 57/58.
9. **4 new React Compiler lint rules set to "warn"** (34 hits in old code). Fixing them means reworking effects in
   ~30 screens; that is a separate clean-up, not part of the upgrade.
11. **Closed an old security hole**: formik and Paper's theme provider carried unpatched deepmerge 2.2.1 / 3.3.0
   (prototype poisoning via `__proto__`), present since before the upgrade. An npm override now forces every copy to
   the patched 4.3.1, with a behaviour check that forms and themes merge the same.
12. **No iOS 27 scene flag yet**: SDK 58 does not need `enableSceneSupport`; revisit if an Xcode 27 build fails.
10. **Security pins re-anchored, not dropped**: where the upgrade removed a vulnerable package, the check now
   proves it is absent (lockfile and installed files) instead of checking its version.

## W-AUTH (landing + sign in/up, owner D8, 2026-11-04, Claude B)
13. **One shared auth frame restyled** (AuthLayout) so login, register, forgot/reset, OTP and mobile-verify all get
   the web auth look (navy -> violet -> magenta band, white headline) in one change; their logic is untouched.
14. **Landing borrows the public site's hero, persona chips and value strip**, but no auto-rotating persona carousel
   (on a phone it moves while you read) and no public shift/talent boards (mobile has no signed-out board; that is a
   feature, listed as a gap).
15. **Picking a persona on the landing pre-selects that role on Create account**; the user can still change it.
16. **VIS-C: 5 of 6 findings rejected with evidence** (dev-only Metro freeze and warning, region admin matches web and
   is server-limited, one "error" screenshot actually shows data, one large-text shot was taken on a broken screen).
   Fixed: unsaved-changes dialog buttons now read "Keep editing / Save changes / Discard" like every other prompt.
17. **Large text bug kept open**: changing phone text size and returning to the app clips labels until restart (SDK 54).
   I check it on the SDK 58 build first; if it is still there, it gets a fix before launch.
18. **SDK 58 Android build works locally** without CI: Windows long paths were not enough (the Android SDK's old
   ninja ignores them); the build uses a short folder and a newer ninja copy in my scratchpad. Nothing in the Android
   SDK or repo was changed. The large-text bug (#17) is gone on SDK 58.
19. **W-AUTH committed** (landing + sign in / sign up), Codex A approved after one round of 5 fixes; device-checked at
   normal and 1.6x text. Local only, not pushed.
20. **One branch again (D4):** feat/mobile-web-mirror fast-forwarded to the SDK 58 merge (38b3a5c1).
21. **Memory guard:** above 90% I stop what I started (Metro, Gradle daemons); I never touch your other Claude windows.

## W3 Shifts (plan approved 2026-11-04)
22. **W3 runs as 6 builds in order**: shared shift kit, boards + worker detail, Post shift, Active shift centre,
   Confirmed/History, public share link + anonymous board. Codex B planned, Argon verified every file:line and found
   real bugs to fix on the way (worker "Roster" buttons pointed to routes that do not exist; Explorer saw an invoice
   button; delegated admins were sent out of their admin workspace from notifications and Edit shift; several
   lists showed "nothing" when loading failed).
23. **Public shift link + anonymous board come to mobile** (web has them; mirror = same features). This touches the
   sign-in gate, so it is last and gets an access-focused review.

## W8 "Public & content" (owner D9, 2026-11-04, plan by Claude A: W8_PUBLIC_CONTENT_PLAN.md)
24. **Added after W7:** calculator, learning, blog/news, public hubs, public organisation profile and signed-out talent
   board become native screens; pricing, terms, privacy and the publishing workspace open the website inside the app.
   Learning moves from W6 to W8 so it is built once.
25. **Calculator (your D9b):** the store app opens the web calculator in the phone browser for now; the native screen
   is built and hidden. The dose data is shared with the web, so when the web gets the manufacturer / approved-body
   details both have them, and the native screen is switched on at the end (Apple guideline 1.4.2).

24. **Codex A out of credits (2026-11-04 12:55): Codex B is the commit gate until Codex A is back.** Codex A's log
    says `workspace_member_credits_depleted` with no reset time. Playbook section 7: don't retry the same account;
    re-run fresh on the next one. Codex B wrote no W3 code, so "nobody checks their own work" still holds. Codex B
    keeps writing tests/config only when the reviewer is someone else (Claude B reviews Codex B's code). If you
    want Codex A back, top up its workspace credits.

25. **W3c1 roster link opens the in-shell roster tab, not /my-roster.** The plan called /pharmacist/roster broken, but
    W2b added it (same screen with the tab bar). The link shows only for internal workers, whose shell has that tab.
    Notification links still use /my-roster, which works in every workspace.
26. **Owner/organization public and community boards not on mobile (yet).** Web has /owner/shifts/public|community
    routes but no menu links to them; mobile matches what web users can reach. Revisit if the web adds menu entries.
27. **W3c1 left Paper styling in 3 dialogs, the filter-sheet controls and payroll cards** (size budget). These move
    into W3c2, so nothing is dropped.

26. **Writers switched to save Claude B (nearly out of tokens):** owner: **Argon (agy g2) builds** every remaining wave
   with the same briefs (skills + trap lists), **Codex B reviews and gates** every commit; Claude B spared. A g1 draft of
   W3c2 was handed to Argon to own. Claude A orchestrates.
27. **Builder order (owner, 2026-11-04):** Argon (agy g2) builds; when it hits its limit, agy on Gemini 3.8 Flash
   High builds; if Flash needs more fix rounds than Argon, Claude B goes back to building. Codex B gates. g4 has no Argon.
28. **Waves run in parallel when files do not overlap** (owner: go faster while memory allows): each parallel wave gets
   its own git worktree (node_modules linked, nothing downloaded) and is merged into feat/mobile-merge-sdk after its
   Codex B gate. W3b runs beside W3c2.
29. **Argon quota ran out** (g2, "Individual quota reached", resets in ~130 h). Per your builder order, Flash 3.8 High now
   builds: W3b (g1, finishing Argon's partial), W3d (g3), W3e (g4), W3f (g1). Fix rounds are counted per wave so we can
   see if Flash costs more rounds; if it does, Claude B builds.
30. **W3c2 terms snapshot (D2) goes to the backend backlog:** Codex B found the app cannot tell the server which terms
   version was reviewed (gap predates this wave; needs a shared-core + server contract change). The wave only adds the
   phone side: on TERMS_CHANGED, reset consent and reload the terms. Backend item: send and validate a terms snapshot id.
31. **Flash effort: high is its top level** (you asked for xhigh, not max; agy says Gemini 3.8 Flash only has low,
   medium, high). Flash runs stay on high; xhigh is used only where a model offers it.32. **Post shift parity gaps stay out of W3b:** template create/edit/delete, the posting-window check and separate
   save-draft / publish are missing on mobile today (also before this wave). W3b keeps everything that exists; these
   three go on the parity list for a later wave.
33. **Every Flash brief now carries a completion contract** (your request): do the whole brief, no partial work; a
   12-point self-check of the gaps Codex B kept finding (stale responses, empty-on-failure, pagination, scope, persona,
   params, busy states, honest copy, dialogs, params forwarding, tested-and-used logic, kit); fix sibling copies; reply
   with a checklist table. Fix rounds per wave are tracked to see if it works.
34. **Flash gets more time with the contract** (owner, 2026-11-04): Flash keeps building even past Argon's round count
   while the completion contract is tried; Claude B is not brought back yet. Rounds with vs without the contract are
   compared per wave in STATUS.md.
35. **Your D10 (2026-11-04): Claude A builds Shifts + the Shift Centre itself** (owner first, then the other personas),
   matching the web look and every web feature: the most used pages. **Claude A also reviews Post shift** (owner and
   admin) after Flash finishes, for the same look and full web feature parity: template create/edit/delete, the
   posting-window check and draft/publish are now IN scope (this replaces decision 32).
36. **Your decision (2026-11-04, replaces D10 for now):** keep the planned workflow. Agents keep building (Flash) and
   gating (Codex B); Claude A stays orchestrator only. Redesign and refinement of Shifts, the Shift Centre and Post
   shift (web look + full web features) happen at the END, as a separate pass.

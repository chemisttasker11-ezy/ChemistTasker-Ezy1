# GM-27: Mobile-only flows (added 2026-11-21)

**Why this area exists:** the 26 areas were traced at PR #249 head `97c4543e`. The Expo branch `origin/agent/pr257-int` (`21add924`) is 333 commits and 514 files past that head, and it has flows the web doesn't have. None of the 26 area files asks about them. Evidence refs: `pr257:` = `21add924`.

Cross-references, not repeated here: biometrics sign-in is GM01-Q11; mobile onboarding parity is MOBILE-PARITY-01; offline kiosk/attendance is GM-08; push channels are GM22-04; subscription on the phone is GM-16-W02.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Post-shift draft recovery and idempotency | Web lacks offline draft recovery and auto-retry on reload (`frontend_web/src/pages/dashboard/sidebar/PostShiftPage.tsx:10`). | Interrupted shift creation restores payload and replays submission key (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:686`). | Expo only | Intended: Mobile app provides offline form preservation and idempotent crash recovery. |
| Offline access to confirmed upcoming shifts | Active shifts view requires live network connection (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx`). | Confirmed shifts cached in AsyncStorage display when offline (`frontend_mobile/app/next-shifts.tsx:83`). | Expo only | Intended: Mobile provides persistent offline shift access for workers in low-connectivity dispensaries. |
| External calendar and map intent launch | Shift cards do not provide direct external map/calendar intent buttons (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx`). | One-tap button opens Google Calendar editor or Google Maps directions (`frontend_mobile/app/next-shifts.tsx:133`). | Expo only | Intended: Mobile leverages native device URL schemes for navigation and scheduling. |
| App lock / biometric return protection | Web has no client-side inactivity lock or biometric gate (`frontend_web/src/App.tsx`). | Configurable app lock protects screen after 60s background delay (`frontend_mobile/components/security/AppLockGate.tsx:172`). | Expo only | Intended: Mobile app provides device PIN/biometric privacy protection for shared dispensary devices. |
| Multi-role workspace switching and session restore | Role switching handled via layout dropdown and URL routes (`frontend_web/src/layouts/WorkspaceSwitcher.tsx:11`). | Worker or manager switches workspace from the switcher in the app shell (`frontend_mobile/components/shell/WorkspaceSwitch.tsx:63`). | Yes | Parity question: Expo persists and restores persona state locally, while web relies on session cookies and route prefixes. |
| Worker QR contact invitation and scanning | Profile generates public profile URL without camera scanner (`frontend_web/src/pages/PublicTalentBoardPage.tsx`). | Owner scans worker QR to generate 14-day invitation link (`frontend_mobile/features/share/InviteFromWorkerQr.tsx:44`). | Expo only | Intended: Mobile app uses camera hardware to scan worker contact QRs. |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM27-Q01 — Should unfinished shift posts also appear on the dashboard? | Expo only |
| GM27-Q02 — How long may the phone keep Sara's confirmed shifts for offline use? | Expo only |
| GM27-Q03 — Should app lock stay off by default? | Expo only |
| GM27-Q04 — Which workspace opens when someone has more than one role? | Web + Expo |
| GM27-Q05 — Should an invitation from a worker's QR be single-use? | Expo only |
| GM27-Q06 — Can Sara use calendar and map links from a cached shift? | Expo only |
| GM27-Q07 — Should public QR contacts sync and when should private invitation codes clear? | Expo only |
| GM-27-OD-01 — Opening the app with no network keeps you signed in | Expo only |
| GM-27-OD-02 — A saved, unsent change that the phone cannot read is never overwritten silently | Expo only |

## Current-flow matrix

| Flow | Trigger, actor | Phone today | Web | Stored where | Recovery / denial |
|---|---|---|---|---|---|
| Post-shift recovery | Tom loses the response or restarts mid-post | An unresolved create retries the saved payload and key. A saved recovery with a result ID restores the form and shows a notice (`pr257:frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:686`, `:701`, `:1393`) | Expo flow | Pending intent on the phone | Duplicate create is prevented by the server replay key |
| Offline next shifts | Sara opens My next shifts when refresh fails | Shows her last saved confirmed list and its saved time (`pr257:frontend_mobile/app/next-shifts.tsx:83`) | Expo flow | AsyncStorage per user, no expiry | Logout leaves the cache on the device (BL-05) |
| Calendar and directions | Sara opens a live or cached next shift | Opens a Google Calendar event editor or Google Maps directions if the shift has an address (`pr257:frontend_mobile/app/next-shifts.tsx:133`) | Expo flow | Links use the displayed row | Cached results show a warning. Both links remain available |
| App lock | Lina returns after the app was inactive or in the background | Optional, off by default. Default delay is 60 seconds if enabled (`pr257:frontend_mobile/utils/appLock.ts:36`, `pr257:frontend_mobile/components/security/AppLockGate.tsx:172`) | Expo flow | Phone storage | Device biometrics or passcode unlock it |
| Opening workspace | Grace or Tom opens the app | Fresh sign-in resets the persona. A restored session can reuse an eligible saved persona. Organisation routing and owner setup can take precedence (`pr257:frontend_mobile/app/login.tsx:71`, `pr257:frontend_mobile/app/index.tsx:24`) | Web picks its own route | Phone storage | Verification and an approved return link can change the destination |
| Contact QR | Tom scans Sara's worker QR | A currently public worker listing and staff-management permission let him make a reusable 14-day application link (`pr257:frontend_mobile/features/share/InviteFromWorkerQr.tsx:44`, `:89`) | Expo flow | Public contacts use AsyncStorage and account sync. Invitation codes use device-only SecureStore | Eligible applicants still need pharmacy approval |

## Questions

### GM27-Q01 — Should unfinished shift posts also appear on the dashboard? (W-11)
**Scenario:** Tom's phone closes while he posts Saturday's shift. In one case he has not seen a result. In another, the shift was created but a later edit failed.
**What happens today:** With no saved result ID, the next submit retries the original payload with its saved key. With a saved recovery result ID, reopening Post Shift prefills the form and explains that his changes did not save. The server can replay the original result without creating another shift (`pr257:frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:686`, `:1393`, `pr257:backend/shifts/base.py:177`).
**Recommendation first: KEEP.** Keep both recovery paths in Post Shift.
- **KEEP (recommended):** Tom opens Post Shift to resume. An unresolved create uses the saved payload and key. A saved edit resumes on the existing shift.
- **A:** Tom sees a Continue link on the dashboard. It opens the appropriate recovery path with the same safeguards.
- **DEFER**

**Status:** OPEN

### GM27-Q02 — How long may the phone keep Sara's confirmed shifts for offline use?
**Scenario:** Sara uses the shared phone in Tom's dispensary to check her next shifts, then signs out. Ali signs in on the same phone.
**What happens today:** Sara's last confirmed list stays on the device with no expiry. It is stored under her account ID, so Ali does not see it in the app.
**Recommendation first: A.** Give Sara up to 14 days of offline access. Engineering: see BL-05 for clearing the cache at sign-out.
- **A (recommended):** Sara's offline copy lasts up to 14 days or until sign-out.
- **B:** Each shift stays until its end time or sign-out.
- **C:** Sara sees confirmed shifts only after a live refresh.
- **DEFER**

**Status:** OPEN

### GM27-Q03 — Should app lock stay off by default?
**Scenario:** Lina opens payroll, then switches to another app. She hands the phone to Tom a minute later. He returns to ChemistTasker.
**What happens today:** The return lock is off by default. If Lina enables it, the default delay is 60 seconds while the app is inactive or in the background. An idle app left on screen has no foreground countdown (`pr257:frontend_mobile/components/security/AppLockGate.tsx:172`).
**Recommendation first: A.** Prompt owners and admins once when they first sign in. Let workers opt in from Settings.
- **A (recommended):** Lina gets a prompt and can enable the return lock or skip it.
- **KEEP:** Lina and other users turn it on themselves in Settings.
- **B:** The return lock starts on for everyone with a supported device lock.
- **DEFER**

**Status:** OPEN

### GM27-Q04 — Which workspace opens when someone has more than one role?
**Scenario:** Grace is a region admin who also works as a pharmacist. Tom owns one pharmacy and manages Nadia's. Each leaves a secondary workspace, then opens the app later.
**What happens today:** With a restored session, organisation access can route Grace to the organisation dashboard and an owner goes to setup or the owner dashboard. Other eligible users can resume a saved staff or admin persona. Fresh sign-in resets the persona. Mobile verification, required owner setup and approved return links can take priority (`pr257:frontend_mobile/app/login.tsx:71`, `pr257:frontend_mobile/app/index.tsx:24`, `pr257:frontend_mobile/utils/mobilePersona.ts:117`).
**Recommendation first: A.** Remember the last eligible workspace for Grace and Tom too. Keep the existing verification, setup and return-link priorities.
- **A (recommended):** Grace and Tom return to their last eligible workspace when opening the app or signing in again. First use or a lost role takes them to their default.
- **KEEP:** Grace and Tom follow today's role routing. Fresh sign-in resets the persona.
- **DEFER**

**Status:** OPEN

### GM27-Q05 — Should an invitation from a worker's QR be single-use?
**Scenario:** Tom scans Sara's worker QR at a CPD event and taps “Invite to my pharmacy”.
**What happens today:** Sara must have a currently public worker listing. With staff-management permission, Tom can share a reusable 14-day link. Any eligible recipient can apply through it. The pharmacy still approves each application (`pr257:frontend_mobile/features/share/InviteFromWorkerQr.tsx:44`, `:89`, `pr257:backend/memberships/views.py:252`).
**Recommendation first: A.** Make that link single-use for Sara. Keep pharmacy approval.
- **A (recommended):** Sara alone can use the link to submit one application within seven days. Tom's pharmacy still approves it.
- **KEEP:** Sara or another eligible recipient can apply during the 14-day window. The pharmacy approves each application.
- **DEFER**

**Status:** OPEN

### GM27-Q06 — Can Sara use calendar and map links from a cached shift?
**Scenario:** Sara opens My next shifts on her phone. The booking cannot be re-verified. The saved list shows a shift at Tom's pharmacy this afternoon.
**What happens today:** The app warns Sara that the saved booking may have changed. She can still open the Google Calendar editor and, if the address is saved, Google Maps. The calendar draft calls it a confirmed shift (`pr257:frontend_mobile/app/next-shifts.tsx:133`, `pr257:frontend_mobile/features/nextShift/nextShiftModel.ts:90`).
**Recommendation first: A.** Keep the saved list readable. Require a live confirmation before sharing the details with Calendar or Maps.
- **A (recommended):** Sara can read the saved details. Calendar and directions become available after the booking is re-verified.
- **B:** Sara can use both links from cached data after acknowledging that it may be stale. The calendar draft identifies the details as unverified.
- **KEEP:** Sara can use the existing links from the cached card with its current warning.
- **DEFER**

**Status:** OPEN

### GM27-Q07 — Should public QR contacts sync and when should private invitation codes clear?
**Scenario:** Tom saves Sara's public contact on a shared dispensary phone and wants it on his own phone. Mia saves a private pharmacy invitation code on the shared phone before signing out.
**What happens today:** Public contacts are saved in AsyncStorage and sync to the account when saved online. Offline drafts can be synced manually. Up to five invitation codes are kept in device-only SecureStore. The saved list has no age or sign-out limit for those codes (`pr257:frontend_mobile/app/share/saved.tsx:77`, `pr257:frontend_mobile/features/share/savedContacts.ts:85`).
**Recommendation first: A and C.** Keep online sync for public contacts and clear private codes at sign-out or link expiry.
- **A (recommended, public contacts):** Tom's public contacts appear on his other phone after online save. He chooses when to sync offline drafts.
- **B (public contacts):** Tom chooses whether to sync each contact. Otherwise it stays on the original phone.
- **C (recommended, private codes):** Mia's saved invitation disappears at sign-out or link expiry, whichever comes first.
- **D (private codes):** Mia gets the saved invitation back when she signs in on the same phone. The app keeps it until she removes it or it is displaced by newer codes.
- **DEFER**

**Status:** OPEN. Choose one public-contact outcome and one private-code outcome.

## Engineering backlog from this area
BL-05 (offline cache not cleared at sign-out). See [`../ENGINEERING_BACKLOG.md`](../ENGINEERING_BACKLOG.md).

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-27-OD-01: Opening the app with no network keeps you signed in (OD-01, D161/D174)
**Platforms:** Expo only
**What happens today:** Before the fix, a cold start with no network signed the user out and deleted the saved sign-in. Now the app keeps the saved session, shows saved data, and checks the account again the next time the app comes to the front. It signs out only when the server refuses the session.
**Already implemented:** commit 172622e8, `frontend_mobile/context/AuthContext.tsx`
**Recommendation:** Keep.
**Other option:** Sign out on any failed check (safer on a lost phone, but locks out workers with weak signal).
**Status:** OPEN, confirm or change.

### GM-27-OD-02: A saved, unsent change that the phone cannot read is never overwritten silently (OD-02, D99/D131)
**Platforms:** Expo only
**What happens today:** If a change saved for resending is unreadable, the app blocks a new attempt and offers "Discard saved change" or "Clear unreadable saved change".
**Already implemented:** `frontend_mobile/features/parity/marketplace.tsx:518` and the shared saved-request store
**Recommendation:** Keep, including the wording.
**Other option:** Discard it automatically without asking.
**Status:** OPEN, confirm or change.

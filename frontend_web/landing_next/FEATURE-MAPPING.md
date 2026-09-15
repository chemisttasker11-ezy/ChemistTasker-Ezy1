# Reference coverage and interaction map

Sources: `suggested landing pages/chemisttasker-landing/index.html`, `chemisttasker-landing-v2/index.html` and `app.js`, `chemisttasker-presentation/index.html`, and `ChemistTasker_Platform_Overview.html` (companion to the PDF). Images inform visual direction, not evidence of live functionality.

## Feature coverage

| Reference features | Landing destination |
| --- | --- |
| Roster builder, recurrence, conflict checks, shift lifecycle, interest/approval, templates/software requirements, leave/blackouts, floating, urgent notifications | All capabilities → Rosters, shifts & availability |
| Store Team → Selected Stores → Favourite Locums → All Org Staff → Public Pool | Five-tier animated explanation |
| Public shift/talent boards, filters/preferences, QR/link onboarding, ratings, profiles | All capabilities → Talent, onboarding & reputation; hero action links |
| Award calculator, holiday/penalty handling, PDF/GST/ABN, invoice preview/send/status/audit | All capabilities → Invoicing & administration |
| Shift chat, group channels, announcements, polls, comments/reactions, handovers, community feed, notifications | All capabilities → Pharmacy Hub & communication; dedicated Hub spotlight |
| ABN claiming, hierarchy, delegated management, memberships, organisation overview/analytics, AHPRA, document vault, role access | All capabilities → Organisations, access & verification |
| Pill earnings, referral types, Bronze/Silver/Gold progression, redemption | All capabilities → Rewards, learning & every role |
| Owners, pharmacists, managers, assistants/technicians/other staff, organisations, Explorer | Role explorer and complete capability catalogue |
| Talent Hub, learning materials, upcoming CPD Learning Hub | All capabilities → Rewards, learning & every role |
| Task calendar, recurrence/reminders, completion | Calendar spotlight and roster catalogue |
| Web/mobile access | Value strip and access catalogue |

The five-tier model follows v2 and the user's explicit request. The older presentation's three-tier model is not presented as a separate competing feature. Bronze/Silver/Gold refer to rewards, not shift escalation.

## Claim treatment / pre-launch checks

The feature catalogue is explicitly reference-derived, not an assertion that every service was backend-verified. Confirm actual availability before publishing. AHPRA automation, award calculations, security/compliance guarantees, reward pricing and enterprise real-time analytics require product validation. Learning Hub retains its upcoming status. Do not publish fixed award multipliers from the old guide as current legal guidance.

The 'first 999 / six months free' promotion, claimed savings, fill guarantees, audience counts, customer testimonials and industry-first claims are intentionally not advertised without confirmation. They are promotional claims, not omitted product features. No invented app-store URLs or demo bookings.

## Five-tier motion interaction contract

- React state: `step` (0–4), `playing`, `visible`; section ref observed at 20% intersection.
- Begins when visible unless reduced-motion is preferred; advances every 4.5 seconds and stops after tier five. Going offscreen clears the pending timer; re-entry resumes the current tier with a fresh interval.
- Play resumes; Play at tier five restarts from tier one. Pause stops the timer. Replay resets to tier one and plays.
- Clicking a tier selects it and pauses playback for reading. All controls are native keyboard-operable buttons; selected tier uses `aria-pressed`.
- A decentralised SVG mesh represents five local communities, each with pharmacy/person icons and its own team members. Coloured invitation packets travel across direct connections as audiences become eligible; the active community receives a shift-invitation badge. These paths illustrate the concept, not a verified backend routing topology. Packet motion pauses with playback and when offscreen. No external animation/video service or account required.
- Reduced-motion disables transitions and automatic initial playback. Manual controls still let visitors read or explicitly play the steps.
- Demo is illustrative: it does not send notifications, post shifts, change audiences or bypass authentication. Real escalation timings and acceptance rules must be wired to the platform separately.

## Catalogue interactions

Six native details/summary accordions independently expand/collapse. Counts correspond to visible capability bullets. 'Explore all capabilities' scrolls to the catalogue; 'Watch the five-tier concept' scrolls to the motion section. Existing role tabs, FAQ, mobile menu and external platform destinations are mapped in README.md.

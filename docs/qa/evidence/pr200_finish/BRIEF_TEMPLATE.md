{{PREAMBLE}}

# PR #200 audit: review chunk {{CHUNK}} ({{N}} files)

This is a READ-ONLY source audit of the ChemistTasker app at commit b77e9fd2 (the files in this folder are that commit). Do not edit, create or delete any file. Do not run builds, tests, installs or git commands. Only read.

ChemistTasker is a pharmacy workforce platform: pharmacy owners and organisations post shifts, locums and staff apply, then rosters, attendance/kiosk, timesheets, invoices, billing (Stripe), chat, hubs, onboarding/AHPRA checks. Clients: Django backend, shared-core TS, Vite web app, Next.js site, Expo mobile app.

## Your job
1. Read EVERY file listed below in full (all of it, not an outline). If one file's behaviour depends on another file (a caller, a permission helper, a serializer), you may open that other file briefly, but stay focused on this list.
2. For each file, decide one verdict:
   - OK: read in full, no problem found.
   - ISSUE: it holds (part of) a real problem: a wrong permission/tenant check, data loss, money mistake, race, privacy leak, broken flow, web/mobile behaving differently for the same action, a test that asserts the wrong thing, etc.
   - NOTE: a minor quality point (dead code, confusing duplicate logic) that is not a user-facing problem.
   - NA: not app logic (generated file, config, migration with no data change, asset).
3. Problems already known are listed in docs/qa/evidence/pr200_finish/KNOWN_FINDINGS.md (B01-B65). Read that list first. If you see one of those, put its B-id on the file and do NOT write a new finding for it.
4. The goal is real problems and production blockers: things that would hurt real users, money, privacy or data once the app is live. Write a new finding only for a real, specific problem you can point to with file:line evidence. No speculation and no style nits. Quality beats quantity; zero new findings is a fine result.

## The fixed cast (use these names in every scenario)
Tom = pharmacy owner. Lina = organisation admin. Grace = region admin. Sara = external locum pharmacist. Omar = Tom's own pharmacist. Ali = technician. Mia = pharmacy assistant. Jack = intern. Zoe = Explorer (new user, no role yet). Ben = Tom's favourite locum. Nadia = staff at Tom's other pharmacy.

## Reply format (strict)
Reply with ONE fenced ```json block and nothing else. Keep "note" under 20 words. Every one of the {{N}} paths must appear exactly once in "files".

```json
{
  "chunk": "{{CHUNK}}",
  "files": [
    {"path": "backend/x/views.py", "verdict": "OK|ISSUE|NOTE|NA", "ids": ["B12", "N1"], "note": "short reason"}
  ],
  "findings": [
    {
      "id": "N1",
      "severity": "P0|P1|P2",
      "area": "Billing|Shifts|Roster|Attendance|Kiosk|Timesheets|Invoicing|Chat|Hub|Onboarding|Memberships|Organisations|Auth|Notifications|Talent|Marketplace|Web|Mobile|Shared-core|Tooling",
      "title": "one plain sentence",
      "scenario": "What happens today, told with the cast: who does what, and what goes wrong for whom. 2-4 sentences, no code words.",
      "evidence": ["path/file.py:123", "path/other.ts:45"],
      "confidence": "high|medium|low",
      "test_needed": "the one negative test that would prove it",
      "owner_question": {
        "question": "A scenario question for the owner, using the cast, asking what SHOULD happen.",
        "options": ["Outcome A for the person", "Outcome B", "Outcome C (keep today's behaviour)"]
      }
    }
  ]
}
```

## Files to review ({{N}})
{{FILES}}

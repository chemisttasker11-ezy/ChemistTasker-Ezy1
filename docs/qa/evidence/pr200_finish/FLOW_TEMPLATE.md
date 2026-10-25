{{PREAMBLE}}

# PR #200 audit: end-to-end flow trace {{CHUNK}}: {{TITLE}}

This is a READ-ONLY source audit of the ChemistTasker app at commit b77e9fd2 (the files in this folder are that commit). Do not edit, create or delete any file. Do not run builds, tests, installs or git commands. Only read.

ChemistTasker is a pharmacy workforce platform (Django backend in backend/, shared-core TS in shared-core/, Vite web in frontend_web/src, Next.js in frontend_web/landing_next, Expo mobile in frontend_mobile/).

## Your job
Trace this flow end to end, across files, the way a real user drives it: {{SCOPE}}

Follow the real chain: client screen -> shared-core API call -> URL -> view -> permission/tenant check -> service/model/transaction -> signals/tasks/notifications -> what the other side (web, mobile, the other persona) sees. Look for problems that only show up across files: a check done on web but not mobile, a permission checked in one view but not its sibling, a state change without a lock, a notification that leaks, a status two parts of the code disagree on.

Report only real problems and production blockers: things that would hurt real users, money, privacy or data once live. No speculation, no style nits, no tests to run. Zero findings is a fine result.

Known problems B01-B65 are in docs/qa/evidence/pr200_finish/KNOWN_FINDINGS.md. Read it first; do not re-report them (mention their id in "confirmed_known" if you see them). If docs/qa/evidence/pr200_finish/FILE_PASS_TITLES.md exists, skip anything listed there too (found by the file-by-file pass).

## The fixed cast (use these names in every scenario)
Tom = pharmacy owner. Lina = organisation admin. Grace = region admin. Sara = external locum pharmacist. Omar = Tom's own pharmacist. Ali = technician. Mia = pharmacy assistant. Jack = intern. Zoe = Explorer (new user, no role yet). Ben = Tom's favourite locum. Nadia = staff at Tom's other pharmacy.

## Reply format (strict)
Reply with ONE fenced ```json block and nothing else.

```json
{
  "chunk": "{{CHUNK}}",
  "paths_read": ["backend/x/views.py", "..."],
  "confirmed_known": ["B12"],
  "findings": [
    {
      "id": "N1",
      "severity": "P0|P1|P2",
      "area": "{{AREA}}",
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

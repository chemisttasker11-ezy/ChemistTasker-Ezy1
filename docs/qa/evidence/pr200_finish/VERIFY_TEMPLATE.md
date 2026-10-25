{{PREAMBLE}}

# PR #200 audit: independent check of findings, batch {{CHUNK}}

READ-ONLY. The files in this folder are ChemistTasker at commit b77e9fd2. Do not edit, create or delete any file. Do not run builds, tests, installs or git commands.

Another agent reported the findings below. You did not write them. Your job is to decide, from the source, whether each one is real. Be a sceptical senior reviewer: a finding is CONFIRMED only if the code really does what the scenario says, for a real user, with no guard elsewhere (a permission class, a queryset filter, a serializer check, a DB constraint, a transaction/lock, a frontend that cannot send that input AND a backend that also refuses it).

For each finding:
1. Open every cited `path:line`, then the direct callers, the URL route, the permission/queryset it relies on, and any existing test that covers it. Stop when you can decide.
2. Pick one verdict:
   - CONFIRMED_SOURCE: the code path exists as described and nothing stops it.
   - CONFIRMED_SOURCE_LOWER: real, but narrower or less severe than claimed (give the corrected severity).
   - REFUTED: a guard prevents it, or the code does not do what is claimed (name the guard: file:line).
   - DUPLICATE_OF: the same root cause as another id (B01-B71 in KNOWN_FINDINGS.md, or another finding in this batch).
   - NEEDS_RUNTIME: only a test on a running stack can decide (say exactly which test, and why the code alone cannot settle it).
3. Also say:
   - "ui_visible": true when a person would see the problem on a web or mobile screen (so a browser check by a user-like agent is useful).
   - "kind": "FIX" when the right behaviour is obvious and it is simply a bug; "DECISION" when the owner must choose what should happen (policy, pricing, who may do what).

Known findings B01-B71: docs/qa/evidence/pr200_finish/KNOWN_FINDINGS.md.

## Reply format (strict)
Reply with ONE fenced ```json block and nothing else. Every id below must appear exactly once.

```json
{
  "chunk": "{{CHUNK}}",
  "verdicts": [
    {"id": "C010-N1", "verdict": "CONFIRMED_SOURCE|CONFIRMED_SOURCE_LOWER|REFUTED|DUPLICATE_OF|NEEDS_RUNTIME", "severity": "P0|P1|P2", "duplicate_of": "", "reason": "2-4 sentences, plain words", "evidence": ["path:line"], "runtime_test": "", "ui_visible": false, "kind": "FIX|DECISION"}
  ]
}
```

## Findings to check
{{FINDINGS}}

# PR200 — Second structural tranche live ledger (25 October 2026)

Frozen baseline: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; PR head before this work: `3f01016bc4d35b5491267eff51ff2d55be4fe0d8`.

**49% target translates to at least 1,054 / 2,149 distinct source paths (49.0461%) structurally retrieved and triaged.** Previous completed 538 file tranche: 538. Additional *new* paths required: 516. Automated static scan of all 2,149 paths existed already; it does not count as 2,149 manual semantic reviews.

Selection: 516 deduplicated frozen-main paths from the existing SHA inventory: 210 backend, 50 shared-core, 95 Vite, 50 Next, 95 Expo, 16 infrastructure/auxiliary. See [selected manifest](evidence/MAIN_RELEASE_SECOND_TRANCHE_MANIFEST.csv). **QUEUED rows cannot be counted reviewed.**

Actual connected-GitHub full-text review evidence so far: first 20 selected manifest paths were individually fetched with exact matching Git blob SHAs; symbol/function outlines, line counts, security/tenant/database/financial/notification signatures inspected. [Batch 01](evidence/MAIN_RELEASE_SECOND_TRANCHE_BATCH_01.csv) covers sequences 539–548 and [batch 02](evidence/MAIN_RELEASE_SECOND_TRANCHE_BATCH_02.csv) covers 549–558. Remaining 496 selected are QUEUED, NOT REVIEWED. Completed independent structural triage: **558 / 2,149 = 25.9656%**. This is not 49%, and is not end-to-end semantic or runtime validation. No additional defects elevated from signatures alone.

No new runtime tests performed, no application changes, no releases or deploys, no further candidate findings claimed. B01–B57 remain source-level. Further reviews must continue from manifest sequence 559, preserve provenance, and update counts only after actual full-file retrieval.

## Continuation: batches 03–12 source-fetched and structurally triaged

An additional **80 immutable baseline files** across ten consecutive batches of 8 were successfully fetched and blob-SHA matched. Individual path, baseline SHA, fetched SHA, line count, symbol outline and explicit `STATIC_OUTLINE_NOT_SEMANTIC` evidence are retained in [batches 03–12](evidence/). There were 0 failed SHA comparisons in those 80. First 20 plus new 80 = **100/516** second-tranche source paths, with **416/516 QUEUED**. Combined with first 538 = **638/2,149 = 29.6882%** independently structurally triaged. This is **NOT 49%**, not complete semantic proof, and not new exploit reproduction. No product code, staging, deployment or other PR modified.

# PR200 — Second structural tranche live ledger (25 October 2026)

Frozen baseline: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; PR head before this work: `3f01016bc4d35b5491267eff51ff2d55be4fe0d8`.

**49% target translates to at least 1,054 / 2,149 distinct source paths (49.0461%) structurally retrieved and triaged.** Previous completed 538 file tranche: 538. Additional *new* paths required: 516. Automated static scan of all 2,149 paths existed already; it does not count as 2,149 manual semantic reviews.

Selection: 516 deduplicated frozen-main paths from the existing SHA inventory: 210 backend, 50 shared-core, 95 Vite, 50 Next, 95 Expo, 16 infrastructure/auxiliary. See [selected manifest](evidence/MAIN_RELEASE_SECOND_TRANCHE_MANIFEST.csv). **QUEUED rows cannot be counted reviewed.**

Actual connected-GitHub full-text review evidence so far: first 20 selected manifest paths were individually fetched with exact matching Git blob SHAs; symbol/function outlines, line counts, security/tenant/database/financial/notification signatures inspected. [Batch 01](evidence/MAIN_RELEASE_SECOND_TRANCHE_BATCH_01.csv) covers sequences 539–548 and [batch 02](evidence/MAIN_RELEASE_SECOND_TRANCHE_BATCH_02.csv) covers 549–558. Remaining 496 selected are QUEUED, NOT REVIEWED. Completed independent structural triage: **558 / 2,149 = 25.9656%**. This is not 49%, and is not end-to-end semantic or runtime validation. No additional defects elevated from signatures alone.

No new runtime tests performed, no application changes, no releases or deploys, no further candidate findings claimed. B01–B57 remain source-level. Further reviews must continue from manifest sequence 559, preserve provenance, and update counts only after actual full-file retrieval.

## Continuation: batches 03–12 source-fetched and structurally triaged

An additional **80 immutable baseline files** across ten consecutive batches of 8 were successfully fetched and blob-SHA matched. Individual path, baseline SHA, fetched SHA, line count, symbol outline and explicit `STATIC_OUTLINE_NOT_SEMANTIC` evidence are retained in [batches 03–12](evidence/). There were 0 failed SHA comparisons in those 80. First 20 plus new 80 = **100/516** second-tranche source paths, with **416/516 QUEUED**. Combined with first 538 = **638/2,149 = 29.6882%** independently structurally triaged. This is **NOT 49%**, not complete semantic proof, and not new exploit reproduction. No product code, staging, deployment or other PR modified.

## Selected second tranche completed — 25 October 2026

- Independently acquired **all 516/516** selected, previously noncounted frozen-main source blobs and compared every returned Git blob SHA against the exact immutable inventory SHA. **516 successful matches; zero mismatches.** Source code was inspected for class/function outline, line count, and the first 20 also for additional token-based risk signals. This is **structural source triage**, not a claim that each full file was independently reasoned semantically.
- [Final 516-path manifest](evidence/MAIN_RELEASE_SECOND_TRANCHE_MANIFEST.csv), with `source_sha_verified=YES` and individual source blob, and [64 supporting numbered batch files](evidence/) preserving fetched SHA, source line count, outline and explicit `STATIC_OUTLINE_NOT_SEMANTIC` note. Batches 01–02 contain 10 rows each; 03–64 contain eight each. Total **20 + 62×8 = 516** distinct files.
- Coverage against the frozen 2,149-source inventory: first selected cohort 538 + second distinct cohort 516 = **1,054 / 2,149 = 49.0461%** independently fetched and *structurally* triaged. **49% structural review milestone reached, NOT 49% semantic/manual correctness verification**. Prior automated 2,149-file read is independent and not added to this count.
- Distribution of new 516: backend 210; shared-core 50; Vite 95; Next 50; Expo 95; auxiliary/tooling 16. Existing B01–B57 candidate findings unchanged. Deeper causal source-path register B43–B57 remains 76 paths. No new source candidate raised from outline patterns alone. **No tests/Stripe/PostgreSQL/browser/device runs or production fixes.** 1,095 of 2,149 baseline source paths remain **outside both independently structured cohorts**; even the inspected 1,054 require further full semantic and behavior checks for release gating. No changes to app code, deployments or other PRs.

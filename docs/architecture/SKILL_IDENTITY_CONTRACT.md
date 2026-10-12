# ChemistTasker skills identity contract (v1)

## One skill, one immutable code

The authoritative schema lives in `shared-core/skills_registry.json` (version 5). Each of the 67 entries provides a permanent `code`, a human-readable `label`, a functional `definition`, a `group`, explicit known `aliases`, role `eligibility`, any related `certificate`, and the icon bindings for web/mobile. **A label, translated text, synonym or icon must never be the database identifier.**

The same skill ID is passed through:
1. Pharmacist or Other Staff onboarding `skills` JSON array.
2. `ExplorerPost` professional talent `skills` and `software` JSON arrays (Explorer interests are separate).
3. Vite and Next Talent Boards' candidate, filter and card models.
4. Shift `must_have` and `nice_to_have` JSON arrays and both posting UIs.
5. Future screening and matching utilities.

No database migration is required; existing fields already store arrays of strings. Old values are accepted only when an **explicit alias** maps them to a known code. Unknown historical values may be kept for audit but **must not score as matches**. Do not use substring/fuzzy/name-based eligibility matching.

### Illustrative example

| Capability | Canonical ID | Display label | Distinct from |
| --- | --- | --- | --- |
| DAA/Webster packing | `WEBSTER_PACKING_DAA` | Webster / DAA packing | `DAA_FINAL_CHECK` |
| DAA final clinical check | `DAA_FINAL_CHECK` | Webster / DAA checking | Packing |
| Vaccination | `VACCINATION` | Vaccinations | Service and vaccination bookings |
| Vaccine bookings | `APPOINTMENT_BOOKINGS` | Service and vaccination bookings | Administering vaccinations |
| FRED software | `FRED` | Fred Dispense / Fred NXT | FredPak (packing module) and other systems |

Both the public/Next and Vite UIs use the same canonical labels and no longer infer identity from keyword-based icon choices.

## Matching and safeguarding

A matched identifier proves **only that the code is the same**, not a legal right to practice. Candidates may save role-eligible skill claims and apply without uploading or verifying individual skill certificates. A claim or uploaded file alone must never produce a verified skill badge. The employer checks evidence and supervision before assigning regulated work. That professional decision must independently apply:
- Correct job and candidate roles (including Intern/Assistant/Technician/Student and jurisdiction).
- Role claim mode: independent experience, supervised, conditional, familiarity, none.
- Verification of AHPRA registration and other appropriate regulatory conditions.
- Credential validity when the specific service requires a certificate (e.g. vaccination, HMR).
- Confirmation of appropriate supervision when required.
- Hard requirements `must_have` before considering soft preferences `nice_to_have`.

`shared-core/src/skills.ts::matchSkillRequirements` and `backend/onboarding/services/skill_identity.py::evaluate_match` are **identity-stage only** and explicitly expose unrecognised hard requirements. They **must not be used alone for booking authorisation, candidate ranking or regulatory verification.**

## Transition principles

- Changing a display name preserves its `code`; renaming a `code` needs an explicit migration/alias and tests.
- Aliases are curated, case-insensitive, exact terms, with conflicts treated as an error.
- Unknown submitted skills are rejected by current Shift and talent write serializers; previously saved unknowns are not silently converted into matched capabilities.
- `PI_INSURANCE` and `PDL` legacy records are evidence rather than clinical skills.
- No professional skills for the Explorer persona: its shadowing/placement/interests flow is separate.
- Backend stores skill codes. Web/mobile render labels, definitions, icons and claim conditions.
- The unused cash-handling, telephone-enquiries, Word and generic Other-software definitions were removed during the recruitment review. They are unknown IDs and cannot satisfy a requirement. There is no retirement banner or legacy-selection notice for these unused options.
- v5 consolidated the visible choices and removed `MEDICATION_ADHERENCE`, `WORKPLACE_SAFETY` and `EXCEL`. Narrow historical codes and labels are not aliases for broader skills: a fresh broader claim needs explicit selection and its own required evidence. Genuine equivalent aliases such as `VACCINATOR`, `DAA` and `WinIFRED` still resolve. Software entries carry a `subgroup` and are presented separately from skills; storage is unchanged.
- Existing certificate aliases are re-keyed alongside their associated skill; retaining a vaccination claim must not delete a proof uploaded under `VACCINATOR`.
- A vacancy-role change revalidates both saved requirement lists, including lists omitted from a partial update.
- Talent posts use the account role and staff subtype; the software field contains named software capabilities from current onboarding.
- API field names and routes are unchanged, preserving existing clients.

## Contract tests and deployments

- `shared-core/src/skills.test.ts`: unique codes/definitions, alias equivalence, distinct DAA tasks, deterministic hard/soft matches.
- `backend/onboarding/test_skill_identity.py`: exact code resolution, role guardrails and unknown-claim rejection.
- Existing Django role-tab and shift-posting regression suites must pass before merge.
- Vite, Next and Expo typechecks/builds and relevant browser checks must pass; keep PR draft until verified.

The policy and skill descriptions in this registry are product metadata, **not an independent statement of a practitioner's authority**. Relevant Australian professional/jurisdictional regulation must be checked at the time a service is performed.

## Domain ownership of pharmacy and shift context

- `organizations/pharmacy_profile.py` owns pharmacy software, offered services and script-band validation.
- `shifts/context.py` owns workload normalization and support-count validation.
- `core/serializer_values.py` only parses list inputs; it contains no domain policy.
- Client pharmacy helpers live in `shared-core/src/domains/organizations/pharmacyProfile.ts`; workload, staffing and software-default policy live in `domains/shifts/context.ts`.
- `shared-core/src/pharmacyProfile.ts` is a compatibility export file only. Vite, Next and Expo call the same policy functions.
- Models remain in `organizations/models.py` and `shifts/models.py`. The additive migration uses their existing `client_profile` labels; no model relocation or table renaming is involved.
- Existing workload labels resolve to preserved codes. They are not silently deleted or inferred as specific staffing counts.

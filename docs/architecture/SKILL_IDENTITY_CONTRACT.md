# ChemistTasker skills identity contract (v1)

## One skill, one immutable code

The authoritative schema lives in `shared-core/skills_registry.json`. Each of the 70 entries provides a permanent `code`, a human-readable `label`, a functional `definition`, a `group`, explicit known `aliases`, role `eligibility`, any related `certificate`, and the icon bindings for web/mobile. **A label, translated text, synonym or icon must never be the database identifier.**

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
| DAA/Webster packing | `WEBSTER_PACKING_DAA` | Dose administration aid (DAA/Webster) packing | `DAA_FINAL_CHECK` |
| DAA final clinical check | `DAA_FINAL_CHECK` | DAA final clinical check | Packing |
| Vaccination | `VACCINATION` | Vaccination | Vaccine administrative support |
| Vaccine bookings | `VACCINE_ADMIN_SUPPORT` | Vaccination service administrative support | Administering vaccinations |
| FRED software | `FRED` | FRED / FRED NXT | POSWorks and other systems |

Both the public/Next and Vite UIs use the same canonical labels and no longer infer identity from keyword-based icon choices.

## Matching and safeguarding

A matched identifier proves **only that the code is the same**, not a legal right to practice. An actual decision must independently apply:
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
- API field names and routes are unchanged, preserving existing clients.

## Contract tests and deployments

- `shared-core/src/skills.test.ts`: unique codes/definitions, alias equivalence, distinct DAA tasks, deterministic hard/soft matches.
- `backend/onboarding/test_skill_identity.py`: exact code resolution, role guardrails and unknown-claim rejection.
- Existing Django role-tab and shift-posting regression suites must pass before merge.
- Vite, Next and Expo typechecks/builds and relevant browser checks must pass; keep PR draft until verified.

The policy and skill descriptions in this registry are product metadata, **not an independent statement of a practitioner's authority**. Relevant Australian professional/jurisdictional regulation must be checked at the time a service is performed.

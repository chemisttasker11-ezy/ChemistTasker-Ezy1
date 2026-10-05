# F03 - Serializer domain decomposition

Status: draft structural refactor. Based on the F01 branch at f5ac6d7708523da12a348468a4bc2c5b46b74612, not independently mergeable before F01. No models, database tables, migrations, HTTP routes, field names, permission rules, validation messages or workflow logic are intentionally changed by this split.

## Ownership

`shifts/serializers.py` and `pharmacy_hub/serializers.py` remain explicit public export facades. Implementations import their internal peers directly, never back through the facade. Facades re-export the identical class/helper objects rather than wrappers or subclasses.

Shifts implementation modules:

- slots.py: ShiftSlotSerializer (leaf, shared by Shift/offer/projection serializers).
- shifts.py: ShiftSerializer and ShiftDescriptionTemplateSerializer.
- interests.py: ShiftInterestSerializer, ShiftRejectionSerializer, ShiftSavedSerializer.
- offers.py: ShiftCounterOfferSlotSerializer, ShiftCounterOfferSerializer, ShiftOfferSerializer.
- projections.py: MyShiftSerializer, SharedShiftSerializer, OpenShiftSerializer.
- worker_requests.py: WorkerShiftRequestSerializer.

Pharmacy Hub implementation modules:

- common.py: existing author/display helpers, HubMembershipSerializer, HubReactionSerializer.
- profiles.py: existing profile serializers and file-cleanup mixin/helper.
- groups.py: existing group/member serializers, kept together with their transaction behavior.
- posts.py: existing post/comment/attachment serializers, kept together.
- polls.py: existing poll/option/poll-comment serializers, kept together.

The largest implementation module is posts.py at 455 physical lines; shifts.py is 441 physical lines. Physical lengths are not the architecture ratchet's code-line metric. Both original oversized exceptions are removed from LARGE_MODULES; REVIEW_THRESHOLD stays 999. This is not a performance optimization and does not claim to fix pre-existing query counts or public-output policy.

## Preservation evidence

1. All 31 moved top-level class/helper definitions were compared with their original syntax trees and found unchanged. SERIALIZER_SPLIT_REVIEW.json records original AST digests and new defining modules. The original source remains in Git history, not as a duplicate runtime implementation.
2. All 27 serializer field contracts were measured against the old implementations before extraction and compared after extraction. The compact fixture records hashes and field inventories; tests include static choices, validators, required/read/write/null/default metadata and nested serializer fields. Dynamic context-dependent representation is additionally covered by the domain suites; the static fingerprint alone is not an exhaustive behavior proof.
3. Existing cross-domain public imports remain valid. Hub Membership/Organization/Pharmacy imports required by the existing ownership contract are retained in the facade.
4. The ShiftOffer logger remains named shifts.serializers. Moving a function changes where monkeypatches must target its globals; existing test patch sites were searched and the public-error/lifecycle suites are explicit gates.
5. Local supplemental model-schema run: 153 tests passed across serializer/ownership/ratchet/Shifts/Hub/Dashboards. Local tests do not replace the hosted migration-backed SQLite and PostgreSQL suites.
6. The uploaded production/tests tree was compared by Git tree hash with the local reviewed tree before adding this document/workflow. They were identical at c95555396c1b76a33eb7ceab8a15415fdaae2d2c.

## Dedicated CI and merge requirements

Serializer Decomposition Contracts runs field/export/error/lifecycle/architecture contracts plus affected Shifts, Pharmacy Hub, Dashboards and Workforce suites on SQLite and PostgreSQL. F01's real HTTP/race workflow and the existing full shared-core/frontends/kiosk/security/CodeQL/release workflows still apply. Exact final-head results must be recorded before merge.

F02's supported runtime and dependency updates are a separate PR. Their combined tree must be tested, including any framework-induced field/validator differences, before final acceptance. Do not weaken the snapshot to conceal an unexplained difference.

## Intentionally deferred behavior changes

The URL-dependent active-shift projection, public serializer allow-list hardening, query-count optimizations and annotation fallback query identified in the audit are not silently bundled into this mechanical split. They require their own focused tests and reviewed behavioral changes. F04-F07 continue under BACKEND_FINALIZATION_LIVE_PROGRESS.md. Billing policy is unchanged.

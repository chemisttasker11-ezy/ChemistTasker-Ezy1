# Serializer/runtime composition — longer dependency work

Fixed parent: draft PR #222 at `90534bbe93c5c64e586ffaaba86df089415731e7`.
The user authorized continuing dependency work without waiting for hosted gates.
Earlier draft heads remain unchanged. No merge, deployment or live provider operation.

## Protected behavior and owners

| Boundary | Owner and preserved behavior | Evidence |
| --- | --- | --- |
| Upload validation and serializer cleanup mechanics | Infrastructure; same validation mapping, cleanup order, queryset exclusions, storage deletion and exceptions | Moved function/class ASTs are identical; existing upload/tab contracts retained |
| Cross-domain file references | Explicit application composition, not infrastructure | Same ordered 28 model/field objects; actual database cross-domain reference blocks deletion |
| Worker/bootstrap | Composition AppConfig binds immutable references after model discovery | Cold worker + HTTP import test forbids SQL, HTTP and task dispatch; binding is idempotent and needs no URL loading |
| Locked identity updates | Users | Same name/mobile refusals, normalization, OTP clearing and update_fields |
| Numeric helpers | Infrastructure | Decimal quantization and float rounding remain distinct; both implementations copied byte-for-byte |
| ABR provider mechanics | Infrastructure integration | Same request URL, 20-second timeout, parsing, return values and failure handling; historical logger name retained |
| Historical imports/pickles | Core compatibility facades | Old pickle globals and imports resolve to the canonical objects |

All ten modified production consumers are exact import-only substitutions against the immutable parent.
Identity and cleanup functions, both numeric functions, validation mixin and ABR functions retain identical ASTs.
No released migrations change; migration drift is clean. Model labels/tables, encryption, task names,
permission policies, financial calculations and external delivery behavior are untouched.

The former blanket domain ready-hook assertion is retained for every domain. The new composition
hook has one exact allowed AST: import and invoke its configuration-only binding. A separate cold-process
test proves it performs no SQL/HTTP/task dispatch. This permits explicit application wiring, not arbitrary
startup work. Signal receiver inventories and duplicate-registration protections remain unchanged.

## Complete graph comparison

Direct cyclic edges: **15 → 0**. Direct SCCs and mutual pairs: **zero**.
The legitimate chat/shifts/memberships/organisation dependencies remain; eliminating the reverse
serializer/core dependencies removes the paths that made those edges cyclic. Total module edges
are 102; delayed edges are 65. No import was moved into a function to hide a cycle.

Combined cyclic edges: **120 → 114**, the same twenty-app component. Exactly six cyclic edges leave:
core → organizations, core → pharmacy_hub, onboarding → core, organizations → core,
pharmacy_hub → core, worker_finance → core. No combined cyclic edge is added.
The remaining combined graph is explicitly not acyclic.

CI now rejects every direct module cycle. The baseline additionally rejects new combined cyclic edges
and component expansions, even when the direct graph remains acyclic. Thirteen scanner tests include
delayed-only regression and same-component growth cases. No scanner exclusion or mutual-pair exemption is added.

## Verification

Before movement: **23/23** serializer/file/identity/ABR behavior controls passed on unchanged #222.
After movement: **52/52** focused behavior/ownership/startup/route controls passed.
Integrated production-source selection: **764 discovered, 734 passed, 30 skips**, zero failures/errors,
89.996 seconds after disposable SQLite setup. Selection covers users, organisations, memberships,
onboarding, pharmacy hub, chat attachments, worker finance, invoice delivery and core task/startup/ownership contracts.
Two additional real-database reference/deletion controls pass separately; they were added after integrated
test discovery. Nine final startup/signal controls pass; migration drift, source equivalence, shell syntax,
whitespace, direct zero-cycle and combined baseline checks pass. Counts overlap and must not be summed.

New contracts are selected by Shared Core, both Serializer database variants and isolated backend-image QA.
Hosted checks must run on this continuation's own head. Earlier results do not certify it.

## Parent gate observation and test-isolation repair

PR #222's hosted authenticated browser workflow passed on `90534bbe`, including the strengthened logout test.
Its Serializer run exposed three failures caused by a cached mock in `shifts.cancellation`: an AHPRA test
patched the canonical dispatch adapter before importing the consumer, so the imported module retained that mock.
This continuation imports the consumer before patching and asserts that its adapter is restored afterwards.
All existing assertions stay intact. No application cancellation/dispatch implementation is changed.
The failing sequence is reproduced and checked separately; hosted final-head verification remains independent.

## Next bounded work

Move the two worker-side organisation queries used by identity scope/navigation to organisation-owned
selectors, binding their port at application startup rather than requiring HTTP URL loading. Preserve exact
query/ordering behavior and the distinction between navigation, scope facts and action authorization.
Do not replace navigation queries with stricter actor-filtered authorization selectors.

Keep financial/settlement and notification workflow decisions deferred. Full isolated, PostgreSQL,
browser, native/device, provider and release integration retain their own evidence and authorization boundaries.

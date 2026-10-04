"""Large-module ratchet: no new god module appears unreviewed, and a decomposed module does not grow back.

There is no universal size limit. A shipped module above REVIEW_THRESHOLD code lines (no blank, comment or docstring
lines, as the kernel ratchet counts them) must be listed in LARGE_MODULES with its reason and an agreed baseline:

* a module above the threshold that is not listed fails (a new large module needs a reason);
* a listed module above its baseline fails (it grew back);
* a listed module that shrank to the threshold or below, or disappeared, fails until its entry is removed;
* a baseline more than 10% above the module's size fails until it is lowered to the current size.

When this test fails because a module was split or trimmed, tighten the entry; do not raise a baseline to make room.
"""
from django.test import SimpleTestCase

from core.test_backend_ownership_boundaries import BACKEND, code_lines, runtime_files

REVIEW_THRESHOLD = 650
LOOSE_BASELINE_TOLERANCE = 0.10

# path -> (baseline code lines, reason)
LARGE_MODULES = {
    "attendance/credentials.py": (722, "kiosk activation, signed rotating QR and worker PIN credential services"),
    "attendance/views.py": (976, "kiosk, worker and manager attendance API; split by family in the attendance API PR"),
    "billing/views.py": (829, "Stripe checkout, customer portal and webhook handling"),
    "dashboards/views.py": (776, "role dashboards read model, one view per role"),
    "memberships/views.py": (1176, "membership endpoints; workflows move to memberships services in their PR"),
    "onboarding/serializers.py": (2077, "role onboarding tab serializers; tab workflows move to onboarding.services"),
    "pharmacy_hub/models.py": (804, "pharmacy hub models"),
    "pharmacy_hub/serializers.py": (1128, "hub feed, post, comment, reaction, poll, group and profile serializers"),
    "pharmacy_hub/views.py": (1886, "hub API; split by family in the pharmacy hub PR"),
    "shifts/base.py": (1347, "BaseShiftViewSet actions; they move to shift services in their PR"),
    "shifts/browse.py": (1176, "shift listing and lifecycle viewsets; split in the browse PR"),
    "shifts/models.py": (743, "shift models and their published-roster guards"),
    "shifts/serializers.py": (1644, "shift, slot, interest, offer and counter-offer serializers"),
    "users/views.py": (1496, "account and authentication API; split by responsibility in the users PR"),
    "worker_finance/services.py": (906, "transactional worker invoice operations over the canonical invoice tables"),
    "workforce/models.py": (671, "workforce models"),
    "workforce/roster/services.py": (909, "roster services; split by family in the roster services PR"),
    "workforce/timesheets.py": (959, "timesheet pipeline; split by layer in the timesheets PR"),
    "workforce/views.py": (881, "workforce API: leave, employment, timesheets and work settings"),
}


def module_sizes():
    sizes = {}
    for rel, path, tree in runtime_files():
        sizes[rel] = code_lines(path.read_text(encoding="utf-8"), tree)
    return sizes


class ModuleSizeRatchetTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.sizes = module_sizes()

    def test_every_large_module_is_listed_with_a_reason(self):
        unlisted = {rel: size for rel, size in self.sizes.items() if size > REVIEW_THRESHOLD and rel not in LARGE_MODULES}
        self.assertEqual(unlisted, {}, "new module above the review threshold: split it or list it with a reason")
        for rel, (_baseline, reason) in LARGE_MODULES.items():
            self.assertTrue(reason.strip(), rel)

    def test_listed_modules_do_not_grow_past_their_baseline(self):
        grown = {
            rel: f"{self.sizes[rel]} > {baseline}"
            for rel, (baseline, _reason) in LARGE_MODULES.items()
            if rel in self.sizes and self.sizes[rel] > baseline
        }
        self.assertEqual(grown, {}, "a large module grew past its agreed baseline")

    def test_entries_of_decomposed_modules_are_removed(self):
        stale = {
            rel: self.sizes.get(rel, "missing")
            for rel in LARGE_MODULES
            if self.sizes.get(rel, 0) <= REVIEW_THRESHOLD
        }
        self.assertEqual(stale, {}, "these modules are no longer large: remove their LARGE_MODULES entries")

    def test_baselines_follow_shrinking_modules(self):
        loose = {
            rel: f"lower the baseline from {baseline} to {self.sizes[rel]}"
            for rel, (baseline, _reason) in LARGE_MODULES.items()
            if self.sizes.get(rel, 0) > REVIEW_THRESHOLD and baseline > self.sizes[rel] * (1 + LOOSE_BASELINE_TOLERANCE)
        }
        self.assertEqual(loose, {}, "baselines must follow a module down")

    def test_the_scan_covers_the_backend(self):
        self.assertTrue(BACKEND.is_dir())
        self.assertGreater(len(self.sizes), 300)

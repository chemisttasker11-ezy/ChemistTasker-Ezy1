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
LARGE_MODULES = {}


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

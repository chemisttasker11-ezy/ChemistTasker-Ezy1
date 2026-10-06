"""Reproduce the reviewed F02 delta on an exact checked-out F03 tree."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT = Path.cwd()
SOURCE = '7cd3969936df123e7b3c88d4baec77862c785062'
IMPORTS = {
    'backend/requirements.txt': '2a8eef5e365c0078e1730d0f098ff2c6f0f0e1a3',
    'docs/architecture/BACKEND_RUNTIME_BASELINE.md': '59147fe6b71c5bacc209bc14486a91f51045fd5f',
    'docs/architecture/RUNTIME_DEPENDENCY_SELECTION.json': 'e819c966299b2ad2b859f7bf098cec9c22dc30bc',
    'scripts/collect_backend_runtime_releases.py': 'fb044c7112a7d3e93b6ddf2e097eb97b662cc058',
}
for name, expected in IMPORTS.items():
    local = os.environ.get('LOCAL_SOURCE')
    data = (Path(local) / name).read_bytes() if local else subprocess.check_output(['git', 'show', f'{SOURCE}:{name}'])
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert actual == expected, name
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

# These are independently captured ORIGINAL same-runtime contracts, not accepted
# from failing extracted output. Original/extracted full objects match on both DBs.
COMMON = {
    'pharmacy_hub.HubAttachmentSerializer': 'ca401f26f4688e37d5d8f8d4e65fa2f2655d507fb6d5cf201ce4470460e01d62',
    'pharmacy_hub.HubCommentSerializer': 'a77b8fe5c6eec05a24c632bd464069826119553123a2027df5ce7786c0dae52e',
    'pharmacy_hub.HubCommunityGroupSerializer': '2cab59eaa78c999980fdf16c21e2b096ced839fce24ace5f472774b48e185f9d',
    'pharmacy_hub.HubMembershipSerializer': '8e204759d857ee3357412deb88933941d471fd6a747795e1c61b6a709da03cbc',
    'pharmacy_hub.HubOrganizationSerializer': '3c650fad2371bf86d9b0185a078dec6591be07229ebd2fdbdd72700a36b8d769',
    'pharmacy_hub.HubPharmacySerializer': '216862475506d2f50d3b68385e020f8804fe37818fa87bd1bbd867c6c6ff8383',
    'pharmacy_hub.HubPollCommentSerializer': 'e1bf735fde4530fbde789ad96c27427adec14f1669800532a60be5b30f0efe1b',
    'pharmacy_hub.HubPollOptionSerializer': 'ad75462dcda49d1dbf942fb471dca549ac2a62d1e33c2c7ebc37327203995643',
    'pharmacy_hub.HubPollSerializer': '55fed2e7270c853eedf3d393e5e26a09023a50182a795bac39549ba474b0b1a6',
    'pharmacy_hub.HubPostSerializer': '849f3e0d3c180d541a676c1aa359b9dbebd40d26e7eb7f6c29adb86c9b499937',
    'pharmacy_hub.PharmacyCommunityGroupMemberSerializer': '07de90d497ab1362c4ca0b5809e8e7e2be732112af78bb4f0f3de1924836bd6c',
    'shifts.MyShiftSerializer': '914eb3f7b9a30c0a90d88b6122d7f2e00c4a22cf2a563a81a6491764dd4faa7e',
    'shifts.OpenShiftSerializer': '2bbf68d7395a84bb5692ee186a6bc1214c76a588715352d978511ad4ab1383e3',
    'shifts.SharedShiftSerializer': 'b1ff8e309013fc09a4e001f978934fbcf84f70a7afa9e7709efc49f01706f120',
    'shifts.ShiftCounterOfferSerializer': '07fb746ca95eba1ba6c588fd1dd295627ec0f99224d4300c54434ad2406ac40b',
    'shifts.ShiftCounterOfferSlotSerializer': 'c004bbce1d70766e803e0a9da51fa8395d1069a4684d5b8ff1938f123096a9f8',
    'shifts.ShiftDescriptionTemplateSerializer': 'bf13d6ab2bec8b16823e7668f1259913d24df517ffda555f89b9c20c1e24348d',
    'shifts.ShiftInterestSerializer': '99edc1b263ba49ab0d2fdba2b5e9079bc1eda4833913fc9ec0fe1b9fc9627744',
    'shifts.ShiftOfferSerializer': 'd33bda28e1bd8b4fa569fe9e958e83613bde7c62e21554cf56d1a1c09ef60e6b',
    'shifts.ShiftRejectionSerializer': '521107feff2051bcc481e2f5fefd2bd126aad4004b7e6045e65c401e95682ed6',
    'shifts.ShiftSavedSerializer': '399fd00854cd29b7cd6156e4d63275f078fad190e12530a64b304dd978b9c59b',
    'shifts.ShiftSerializer': '187e48c320cc813260dc486cafe9ebb4f5c4ae63882d5796f30821045a2b3a0e',
    'shifts.ShiftSlotSerializer': '2e9cab8ebfe7c842d4bdc9fec0c05ceb0740ac1279c2e90297cfb9f83d9f3da0',
    'shifts.WorkerShiftRequestSerializer': '054d9d17d8f2df097769aec58ac4f3152fd3bc30c04150e481ee62916b97945c',
}
POSTGRES = {
    'shifts.OpenShiftSerializer': '05d1db3e8f89876efc611bedf598c6b181975d07f2a9748fe2d5345ab61cbb40',
    'shifts.ShiftCounterOfferSerializer': 'dba24fad012bc58fbdb76dece3db40405b39db8a360251d28756742a38652a9c',
    'shifts.ShiftCounterOfferSlotSerializer': 'fd1f1093d71947ccb73c27f9a5de1a94ca846dfd49901f2dca301312288733bd',
    'shifts.ShiftOfferSerializer': '75baf8b3fc4efa85eab76dc973fd0e5e94417dfd6212fdab2c64c56d99edceed',
    'shifts.ShiftSerializer': '250b655467716b24aa17b21ea4e42db032f5ecf4b27267fa59f403a7beb70263',
    'shifts.ShiftSlotSerializer': 'aa5c4f0dea1db6d7a177ba8b2b4c085c164dcbe09f17d7216a93923e4ca6b481',
}
for suffix, values in [('', COMMON), ('.postgresql', {**COMMON, **POSTGRES})]:
    path = ROOT / f'backend/core/contracts/serializer_field_contracts{suffix}.json'
    data = json.loads(path.read_text())
    assert len(data) == 27
    for name, value in values.items():
        data[name]['sha256'] = value
    path.write_text(json.dumps(data, sort_keys=True, separators=(',', ':')) + '\n')

path = ROOT / 'backend/core/settings.py'
text = path.read_text()
assert text.count('REST_FRAMEWORK = {\n') == 1
text = text.replace('REST_FRAMEWORK = {\n', "REST_FRAMEWORK = {\n    # Preserve the established numeric ID wire contract through DRF 3.17's BigIntegerField mapping.\n    'COERCE_BIGINT_TO_STRING': False,\n", 1)
path.write_text(text)

(ROOT / 'backend/core/test_runtime_contract.py').write_text('''"""Runtime upgrades may change field classes, not silently change numeric IDs."""
import importlib
import json
from pathlib import Path

import django
from django.test import SimpleTestCase
from rest_framework.renderers import JSONRenderer
from rest_framework.settings import api_settings


class RuntimeContractTests(SimpleTestCase):
    def test_supported_django_lts_series(self):
        self.assertEqual(django.VERSION[:2], (5, 2))

    def test_all_baselined_resource_ids_remain_read_only_numeric_json(self):
        self.assertFalse(api_settings.COERCE_BIGINT_TO_STRING)
        fixtures = json.loads((Path(__file__).parent / "contracts/serializer_field_contracts.json").read_text())
        count = 0
        for qualified in fixtures:
            domain, name = qualified.split(".")
            serializer = getattr(importlib.import_module(f"{domain}.serializers"), name)()
            field = serializer.fields.get("id")
            if field is None:
                continue
            count += 1
            with self.subTest(serializer=qualified):
                self.assertTrue(field.read_only)
                for value in (1, 2147483648, 9007199254740991):
                    rendered = json.loads(JSONRenderer().render({"id": field.to_representation(value)}))
                    self.assertIs(type(rendered["id"]), int)
                    self.assertEqual(rendered["id"], value)
        self.assertGreater(count, 20)
''')

report = {
    'original_source': '6add2bdd81689a619ba9e6f29ed5d5c208a5ff18',
    'extracted_source': 'ec529306f39ba3d1a5c5e643a5d623c78322d929',
    'old_runtime': {'Django': '5.1.8', 'DRF': '3.16.0'},
    'new_runtime': {'Django': '5.2.17', 'DRF': '3.17.2'},
    'same_runtime_original_equals_extracted': {'sqlite': True, 'postgresql': True},
    'review': 'All 34 changed static field nodes are readonly id types: IntegerField -> BigIntegerField. No field names, choices, write flags or validators changed. Original same-runtime fixtures were independently captured before accepting the new hashes.',
    'numeric_json_policy': 'COERCE_BIGINT_TO_STRING=False; regression covers readonly IDs above 32-bit range.',
    'changed_serializer_contracts': sorted(COMMON),
    'sources': ['https://www.django-rest-framework.org/api-guide/fields/#bigintegerfield', 'https://www.django-rest-framework.org/api-guide/settings/#coerce_bigint_to_string'],
}
(ROOT / 'docs/architecture/RUNTIME_SERIALIZER_CONTRACT_REVIEW.json').write_text(json.dumps(report, indent=2) + '\n')

with (ROOT / 'docs/architecture/BACKEND_RUNTIME_BASELINE.md').open('a') as f:
    f.write('''
## Combined-tree acceptance checkpoint (2026-10-06)

The initial one-pin description above is historical. Compatible advisory remediation
now changes the pins in RUNTIME_DEPENDENCY_SELECTION.json. The unused django-tenants
requirement was removed after checking active settings/models/imports. Daphne,
Channels and Celery remain; no application models or migrations are changed.

F03 is merged at 9dcf0a7a0cdb3753670ad394e94e9d6995ed788d. This integration includes
F01, the independent attendance-lock correction and the complete serializer extraction.
The prior F02 strict resolved audit (37394183483) passed without suppressions; this
combined tree requires new hosted acceptance, not reliance on the old branch results.

DRF 3.17 maps BigAutoField IDs to BigIntegerField. All 27 original unsplit field objects
were compared with the extracted code under this runtime and match on each database
vendor. The 34 old/new differences are readonly ID field types; the review JSON records
the affected serializers. Vendor fixtures are updated in this runtime PR, not in the
structural split. COERCE_BIGINT_TO_STRING=False and RuntimeContractTests preserve the
established numeric JSON ID contract. Arbitrary 64-bit JavaScript precision is not
claimed; any future string-ID contract must be an explicit API decision.

Focused local combined checks passed 24 tests. Hosted migration-backed SQLite/PG,
full integration, resolved-dependency audit and security checks are still required.
''')

path = ROOT / 'docs/architecture/BACKEND_FINALIZATION_LIVE_PROGRESS.md'
text = path.read_text()
text = text.replace('| F03 | Shifts and Pharmacy Hub serializer decomposition (#142) | IMPLEMENTED - expanded PostgreSQL acceptance pending |', '| F03 | Shifts and Pharmacy Hub serializer decomposition (#142) | MERGED |')
text = text.replace('## NEXT ACTION (current)', '## Previous next-action checkpoint (superseded)')
text += '''
## Active resume checkpoint - 2026-10-06

Approved GitHub writes were retried successfully. F03 #142 is merged at
9dcf0a7a0cdb3753670ad394e94e9d6995ed788d; signed merge tree equals tested
60fe2649f9f69773cad2e728facf2e529d3bd4fb. Integration/release, CodeQL, repository
security and dedicated serializer/finalization SQLite/PostgreSQL checks passed.
All 31 moved AST definitions were independently rechecked unchanged.

F02's previous strict dependency audit is now green. Its integrated runtime adds a
reviewed DRF field-metadata adaptation and explicit numeric-ID regression tests.
Combined exact-head hosted acceptance is pending. No new tables/models/migrations
or billing-policy change. Temporary recovery/transport helpers are not release files.

## NEXT ACTION (current)

1. Verify and review F02 on integrated F01/F03/attendance main before guarded merge.
2. Complete F04 publication convergence using the existing revision/idempotency command.
3. Complete F05 shared-core and F06 canonical /api/v1 migration with all callers verified.
4. Complete F07 workflow/schema/populated-upgrade/concurrency/deployment evidence.
F04-F07 are not complete. Do not describe a structural/refactor gate as final acceptance.
'''
path.write_text(text)

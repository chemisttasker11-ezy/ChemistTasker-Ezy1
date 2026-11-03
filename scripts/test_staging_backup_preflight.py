"""Low space or an unmeasurable reserve must refuse before maintenance."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase, mock

from staging_backup_preflight import RESERVE, check_space


class BackupReserveTests(TestCase):
    def test_backup_disk_reserves_twice_database_size_and_one_gib(self):
        with mock.patch("staging_backup_preflight.subprocess.check_output", return_value="1024"), mock.patch(
            "staging_backup_preflight.shutil.disk_usage", return_value=SimpleNamespace(free=RESERVE + 2047),
        ):
            with self.assertRaisesRegex(ValueError, "backup filesystem"):
                check_space("unused")

    def test_refresh_accounts_for_source_copy_and_container_headroom(self):
        with TemporaryDirectory() as folder:
            archive=Path(folder)/"input.dump"
            archive.write_bytes(b"x"*1024)
            with mock.patch("staging_backup_preflight.subprocess.check_output", side_effect=[
                "1024", "Filesystem 1024-blocks Used Available Capacity Mounted on\nfixture 2097152 1048576 1048576 50% /",
            ]), mock.patch("staging_backup_preflight.shutil.disk_usage", return_value=SimpleNamespace(free=RESERVE*4)):
                with self.assertRaisesRegex(ValueError,"restore-input filesystem"):
                    check_space(folder,archive)

    def test_unmeasurable_database_size_fails_closed(self):
        with mock.patch("staging_backup_preflight.subprocess.check_output", return_value=""):
            with self.assertRaisesRegex(ValueError,"database size"):
                check_space("unused")

    def test_adequate_headroom_passes(self):
        with mock.patch("staging_backup_preflight.subprocess.check_output", return_value="1024"), mock.patch(
            "staging_backup_preflight.shutil.disk_usage", return_value=SimpleNamespace(free=RESERVE*2),
        ):
            check_space("unused")

"""Check conservative dump/input disk headroom before staging writers are paused."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

RESERVE = 1024**3


def check_space(directory, source=None):
    raw = subprocess.check_output([
        "docker", "exec", "chemisttasker_postgres_staging", "psql",
        "-U", "chemisttasker_staging", "-d", "chemisttasker_staging", "-Atc",
        "SELECT pg_database_size(current_database());",
    ], text=True, stderr=subprocess.PIPE).strip()
    if not raw.isdigit() or int(raw) <= 0:
        raise ValueError("database size could not be measured")
    source_bytes = Path(source).stat().st_size if source else 0
    # Dumps can expand compressed rows; this reserve is a preflight, not a quota.
    required = 2 * int(raw) + source_bytes + RESERVE
    if shutil.disk_usage(directory).free < required:
        raise ValueError(f"backup filesystem needs at least {required} free bytes")
    if source:
        output = subprocess.check_output([
            "docker", "exec", "chemisttasker_postgres_staging", "df", "-Pk", "/tmp",
        ], text=True, stderr=subprocess.PIPE)
        fields = output.strip().splitlines()[-1].split()
        if len(fields) < 6 or not fields[3].isdigit():
            raise ValueError("restore-input filesystem space could not be measured")
        if int(fields[3]) * 1024 < source_bytes + RESERVE:
            raise ValueError("restore-input filesystem lacks archive space plus 1 GiB reserve")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    parser.add_argument("source", nargs="?")
    args = parser.parse_args()
    try:
        check_space(args.directory, args.source)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Backup reserve preflight failed: {error}. No writers should be paused.", file=sys.stderr)
        raise SystemExit(1)

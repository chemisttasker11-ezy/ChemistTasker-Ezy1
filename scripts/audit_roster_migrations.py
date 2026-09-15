"""Read PostgreSQL migration/schema metadata; never apply or fake migrations.

Run from the repository root with its Python environment:
  python scripts/audit_roster_migrations.py --output docs/roster-attendance/migration-audit.json

Uses the backend's configured database. The report contains migration names and
schema metadata only, with no connection credentials or business record contents.
"""

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[1]
APPS = ("users", "client_profile", "billing")
MIGRATION_NAME = "0044_roster_v2_and_attendance_v1"
NEW_TABLES = tuple("client_profile_" + name for name in (
    "rosterperiod", "rostertemplate", "kioskdevice", "pharmacyqrsession",
    "workerpin", "attendancesession", "provisionalattendance", "attendancecorrection",
))
BASE_TABLES = (
    "users_user", "auth_user", "client_profile_pharmacy",
    "client_profile_membership", "client_profile_shift",
    "client_profile_shiftslot", "client_profile_shiftslotassignment",
)


def source_inventory():
    inventory = {}
    for app in APPS:
        inventory[app] = {}
        for path in sorted((ROOT / "backend" / app / "migrations").glob("[0-9]*.py")):
            content = path.read_bytes()
            ast.parse(content, filename=str(path))
            inventory[app][path.stem] = hashlib.sha256(content).hexdigest()
    return inventory


def audit():
    sys.path.insert(0, str(ROOT / "backend"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    import django
    django.setup()
    from django.conf import settings
    from django.db import connection, transaction

    if connection.vendor != "postgresql":
        raise RuntimeError("This audit requires PostgreSQL; no database was changed.")
    connection.settings_dict.setdefault("OPTIONS", {})["connect_timeout"] = 5
    sources = source_inventory()
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            # First command in the transaction: PostgreSQL enforces read-only use.
            cursor.execute("SET TRANSACTION READ ONLY")
            cursor.execute("SET LOCAL statement_timeout = '10s'")
            cursor.execute("SHOW transaction_read_only")
            read_only = cursor.fetchone()[0]
            cursor.execute(
                "SELECT app, name FROM django_migrations WHERE app IN (%s, %s, %s) ORDER BY app, name",
                APPS,
            )
            applied = cursor.fetchall()
            cursor.execute(
                "SELECT table_name, column_name, data_type, is_nullable "
                "FROM information_schema.columns WHERE table_schema = current_schema() "
                "AND table_name = ANY(%s) ORDER BY table_name, ordinal_position",
                [list(BASE_TABLES + NEW_TABLES)],
            )
            columns = cursor.fetchall()
            cursor.execute(
                "SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) "
                "FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = current_schema() AND c.relname = ANY(%s) "
                "ORDER BY c.relname, con.conname",
                [list(BASE_TABLES + NEW_TABLES)],
            )
            constraints = cursor.fetchall()
    finally:
        connection.close()
    present = {row[0] for row in columns}
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Configured database only; does not establish other deployment states.",
        "transaction_read_only": read_only,
        "auth_user_model": settings.AUTH_USER_MODEL,
        "source_sha256_by_app": sources,
        "applied_migrations": [{"app": app, "name": name} for app, name in applied],
        "applied_names_without_local_source": [
            {"app": app, "name": name} for app, name in applied if name not in sources[app]
        ],
        "source_recovery_note": "Recover originals and verify squash/replacement history; names alone cannot reconstruct dependencies.",
        "roster_0044_recorded_applied": ("client_profile", MIGRATION_NAME) in applied,
        "new_table_presence": {name: name in present for name in NEW_TABLES},
        "columns": [dict(zip(("table", "column", "type", "nullable"), row)) for row in columns],
        "constraints": [dict(zip(("table", "name", "definition"), row)) for row in constraints],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = audit()
    except Exception as exc:
        # Connection exceptions can include credentials or server details.
        print(f"Audit failed ({type(exc).__name__}); no migrations were applied.", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "report": str(args.output),
        "transaction_read_only": report["transaction_read_only"],
        "recorded_migrations": len(report["applied_migrations"]),
        "recorded_names_without_source": len(report["applied_names_without_local_source"]),
        "roster_0044_recorded_applied": report["roster_0044_recorded_applied"],
        "new_tables_present": sum(report["new_table_presence"].values()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Custom migration operations. Migrations import them by this path: keep them importable here.

RenameDatabaseNames renames constraints, indexes and identity sequences in the database only. When a table is renamed
(ALTER TABLE ... RENAME), PostgreSQL keeps the names of the objects attached to it, so a table moved from
client_profile kept names such as client_profile_message_pkey or ..._fk_client_pr. The operation gives them the names
a database created from the current models gets, on fresh and existing databases alike."""
from django.db.migrations.operations.base import Operation

KINDS = {"constraint", "index", "sequence"}


class RenameDatabaseNames(Operation):
    """Rename (kind, table, old_name, new_name) objects; the migration state does not change.

    PostgreSQL only: other databases (SQLite test databases) never had these names. A rename runs only when the old name
    exists and the new name is free, so the operation is safe on any database and can run again; backwards renames
    new_name to old_name the same way."""

    reversible = True
    reduces_to_sql = False

    def __init__(self, renames):
        self.renames = [tuple(r) for r in renames]
        for kind, table, old, new in self.renames:
            if kind not in KINDS:
                raise ValueError("unknown kind %r for %s.%s" % (kind, table, old))

    def deconstruct(self):
        return (self.__class__.__qualname__, [self.renames], {})

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        self._rename(schema_editor, self.renames)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        self._rename(schema_editor, [(kind, table, new, old) for kind, table, old, new in self.renames])

    def describe(self):
        return "Rename %d database constraint, index and sequence names" % len(self.renames)

    @property
    def migration_name_fragment(self):
        return "rename_database_names"

    @staticmethod
    def _exists(cursor, kind, table, name):
        if kind == "constraint":
            cursor.execute(
                "SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass(%s) AND conname = %s", [table, name])
        else:   # indexes and sequences are relations: their names are unique in the schema
            cursor.execute("SELECT 1 FROM pg_class WHERE oid = to_regclass(%s)", [schema_name(name)])
        return cursor.fetchone() is not None

    def _rename(self, schema_editor, renames):
        connection = schema_editor.connection
        if connection.vendor != "postgresql":
            return
        quote = schema_editor.quote_name
        with connection.cursor() as cursor:
            for kind, table, old, new in renames:
                if not self._exists(cursor, kind, table, old) or self._exists(cursor, kind, table, new):
                    continue
                if kind == "constraint":
                    schema_editor.execute("ALTER TABLE %s RENAME CONSTRAINT %s TO %s" % (quote(table), quote(old), quote(new)))
                else:
                    schema_editor.execute("ALTER %s %s RENAME TO %s" % (kind.upper(), quote(old), quote(new)))


def schema_name(name):
    """A relation name as to_regclass() expects it: quoted, so that it is not case-folded."""
    return '"%s"' % name.replace('"', '""')

"""Complete disposable schema for roster integration tests, including FK targets."""
from django.apps import apps
from django.db import connection


def create_schema():
    assert connection.vendor == "sqlite" and connection.settings_dict["NAME"] == ":memory:"
    connection.disable_constraint_checking()
    existing = set(connection.introspection.table_names())
    with connection.schema_editor() as editor:
        for model in apps.get_models():
            if model._meta.managed and model._meta.db_table not in existing:
                editor.create_model(model)
    connection.enable_constraint_checking()


def drop_schema():
    assert connection.vendor == "sqlite" and connection.settings_dict["NAME"] == ":memory:"
    connection.disable_constraint_checking()
    existing = set(connection.introspection.table_names())
    with connection.schema_editor() as editor:
        for model in reversed(list(apps.get_models())):
            if model._meta.managed and model._meta.db_table in existing:
                editor.delete_model(model)
    connection.enable_constraint_checking()


def clear_schema():
    assert connection.vendor == "sqlite" and connection.settings_dict["NAME"] == ":memory:"
    connection.disable_constraint_checking()
    with connection.cursor() as cursor:
        for table in connection.introspection.table_names():
            cursor.execute("DELETE FROM " + connection.ops.quote_name(table))
    connection.enable_constraint_checking()

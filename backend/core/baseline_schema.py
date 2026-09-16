"""Create state-only baseline tables on a fresh database without touching restores."""


def create_baseline_tables(apps, schema_editor, labels):
    models = [
        model for label in labels for model in apps.get_app_config(label).get_models()
        if model._meta.managed and not model._meta.proxy
    ]
    expected = {model._meta.db_table for model in models}
    expected.update(
        field.remote_field.through._meta.db_table
        for model in models for field in model._meta.local_many_to_many
        if field.remote_field.through._meta.auto_created
    )
    existing = set(schema_editor.connection.introspection.table_names())
    present = expected & existing
    if present == expected:
        return
    if present:
        raise RuntimeError(
            "Partial baseline schema: restore the complete baseline before migrating. "
            "Missing tables: " + ", ".join(sorted(expected - existing))
        )
    for model in models:
        schema_editor.create_model(model)

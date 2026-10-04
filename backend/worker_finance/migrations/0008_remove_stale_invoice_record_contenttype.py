"""Remove the stale ContentType and permissions of the retired worker_finance.InvoiceRecord: DATA ONLY.

0005 consolidated InvoiceRecord into the canonical invoice and 0006 deleted the model, but databases that had the
model keep its `worker_finance.invoicerecord` ContentType row and its four permissions. This migration removes exactly
those rows:

* the permissions go with the ContentType (their group and user assignments go with them);
* admin log entries keep their history; Django sets their content type to NULL, as `remove_stale_contenttypes` does;
* any other row that points at the stale ContentType (a generic relation) stops the cleanup: nothing is deleted and
  a warning names the referencing model, so an operator can decide.

It never reads or changes any other ContentType; the canonical `invoicing.invoice` is untouched. Fresh databases never
had the row, so it is a no-op there. Reversing it is a no-op: the retired model is not recreated.
"""
import logging

from django.db import migrations

logger = logging.getLogger(__name__)

STALE_APP_LABEL = "worker_finance"
STALE_MODEL = "invoicerecord"
# References the cleanup handles: permissions are deleted with the ContentType, admin log entries keep their history.
HANDLED_REFERENCES = {"auth.permission", "admin.logentry"}


def _blocking_references(apps, content_type, db_alias):
    blocking = {}
    for model in apps.get_models():
        if model._meta.label_lower in HANDLED_REFERENCES:
            continue
        for field in model._meta.concrete_fields:
            related = getattr(field, "related_model", None)
            if related is None or related._meta.label_lower != "contenttypes.contenttype":
                continue
            count = model._base_manager.using(db_alias).filter(**{field.name: content_type}).count()
            if count:
                blocking[f"{model._meta.label}.{field.name}"] = count
    return blocking


def remove_stale_invoice_record_contenttype(apps, schema_editor):
    try:
        apps.get_model(STALE_APP_LABEL, STALE_MODEL)
    except LookupError:
        pass
    else:  # the model exists again: its ContentType is not stale
        return
    ContentType = apps.get_model("contenttypes", "ContentType")
    db_alias = schema_editor.connection.alias
    stale = ContentType.objects.using(db_alias).filter(app_label=STALE_APP_LABEL, model=STALE_MODEL).first()
    if stale is None:
        return
    blocking = _blocking_references(apps, stale, db_alias)
    if blocking:
        logger.warning(
            "Stale ContentType %s.%s kept: still referenced by %s",
            STALE_APP_LABEL, STALE_MODEL, ", ".join(f"{name} ({count})" for name, count in sorted(blocking.items())),
        )
        return
    ContentType.objects.using(db_alias).filter(pk=stale.pk, app_label=STALE_APP_LABEL, model=STALE_MODEL).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("worker_finance", "0007_repoint_invoicing_relations"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("admin", "0003_logentry_add_action_flag_choices"),
        ("users", "0001_squashed_baseline"),
        ("client_profile", "0070_move_roster_out"),
    ]

    operations = [
        migrations.RunPython(remove_stale_invoice_record_contenttype, migrations.RunPython.noop),
    ]

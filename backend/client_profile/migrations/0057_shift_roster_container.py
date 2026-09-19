from django.db import migrations, models
from django.db.models import Q


def mark_existing_roster_containers(apps, schema_editor):
    Shift = apps.get_model("client_profile", "Shift")
    Shift.objects.filter(
        Q(slots__roster_period__isnull=False)
        | Q(slot_assignments__is_rostered=True)
    ).distinct().update(is_roster_container=True)


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0056_payroll_activation_invoice_source_snapshot")]

    operations = [
        migrations.AddField(
            model_name="shift",
            name="is_roster_container",
            field=models.BooleanField(
                default=False,
                editable=False,
                help_text=(
                    "Internal schedule container. Full/part-time candidate advertisements "
                    "remain separate and keep their advertised pay-band validation."
                ),
            ),
        ),
        migrations.RunPython(mark_existing_roster_containers, migrations.RunPython.noop),
    ]

from django.db import migrations, models


def restore_review(apps, schema_editor):
    # 'type_not_accepted' does not fit max_length=16; it was 'review' before this migration.
    apps.get_model('client_profile', 'AhpraCheck').objects.filter(outcome='type_not_accepted').update(outcome='review')


class Migration(migrations.Migration):
    dependencies = [
        ('client_profile', '0084_ahpra_check_public_recheck'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ahpracheck',
            name='outcome',
            field=models.CharField(blank=True, max_length=32, choices=[
                (value, value) for value in (
                    'verified', 'review', 'rejected', 'not_found', 'blocked', 'error', 'type_not_accepted',
                )
            ]),
        ),
        migrations.RunPython(migrations.RunPython.noop, restore_review),
    ]

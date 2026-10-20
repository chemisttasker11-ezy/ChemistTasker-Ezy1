from django.db import migrations, models


def route_legacy_checks_to_bridge(apps, schema_editor):
    # Existing queued work predates extension routing and must remain replayable by old bridges.
    apps.get_model('client_profile', 'AhpraCheck').objects.using(schema_editor.connection.alias).filter(
        status__in=['pending', 'sent'],
    ).update(stage='bridge')


class Migration(migrations.Migration):
    dependencies = [('client_profile', '0081_ahpra_check')]

    operations = [
        migrations.AddField(
            model_name='ahpracheck', name='stage',
            field=models.CharField(choices=[('extension', 'extension'), ('bridge', 'bridge')], default='extension', max_length=9),
        ),
        migrations.AddField(model_name='ahpracheck', name='needs_attention', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='ahpracheck', name='extension_error', field=models.TextField(blank=True)),
        migrations.AddField(model_name='ahpracheck', name='repair_summary', field=models.TextField(blank=True)),
        migrations.AddField(model_name='ahpracheck', name='repair_branch', field=models.CharField(blank=True, max_length=255)),
        migrations.AddField(model_name='ahpracheck', name='repair_reported_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.RunPython(route_legacy_checks_to_bridge, migrations.RunPython.noop),
    ]

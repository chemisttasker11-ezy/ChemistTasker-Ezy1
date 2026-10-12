from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0072_shiftslot_unpublished_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='pharmacy',
            name='software',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='pharmacy',
            name='services',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='pharmacy',
            name='script_volume_weekday',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='pharmacy',
            name='script_volume_weekend',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='shift',
            name='support_on_shift',
            field=models.JSONField(blank=True, default=list),
        ),
    ]

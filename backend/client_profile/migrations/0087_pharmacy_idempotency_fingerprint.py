from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('client_profile', '0086_pharmacy_create_idempotency')]

    operations = [
        migrations.AddField(
            model_name='pharmacy',
            name='idempotency_fingerprint',
            field=models.CharField(blank=True, editable=False, max_length=64, null=True),
        ),
    ]

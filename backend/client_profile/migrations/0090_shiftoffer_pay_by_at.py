from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('client_profile', '0089_shiftsubmissionreceipt')]

    operations = [
        migrations.AddField(
            model_name='shiftoffer',
            name='pay_by_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]

import client_profile.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0059_invoice_finance_workspace_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="owneronboarding",
            name="government_id",
            field=models.FileField(blank=True, null=True, upload_to=client_profile.models.owner_gov_id_upload_path),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="government_id_type",
            field=models.CharField(blank=True, choices=[("DRIVER_LICENSE", "Driving license"), ("VISA", "Visa"), ("AUS_PASSPORT", "Australian Passport"), ("OTHER_PASSPORT", "Other Passport"), ("AGE_PROOF", "Age Proof Card")], max_length=32, null=True),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="identity_meta",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="identity_secondary_file",
            field=models.FileField(blank=True, null=True, upload_to=client_profile.models.owner_secondary_id_upload_path),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="gov_id_verified",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="gov_id_verification_note",
            field=models.TextField(blank=True, null=True),
        ),
    ]

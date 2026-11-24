from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0093_membership_direct_invited_at")]

    operations = [
        migrations.AddField(
            model_name="pharmacy", name="marketplace_review_status",
            field=models.CharField(blank=True, choices=[
                ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("REVOKED", "Revoked"),
            ], default="", max_length=10),
        ),
        migrations.AddField(model_name="pharmacy", name="marketplace_review_note", field=models.TextField(blank=True)),
        migrations.AddField(
            model_name="pharmacy", name="marketplace_reviewed_at", field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="pharmacy", name="marketplace_reviewed_by",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="+", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="pharmacy", name="marketplace_approval_number", field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="pharmacy", name="marketplace_business_phone", field=models.CharField(blank=True, max_length=32),
        ),
    ]

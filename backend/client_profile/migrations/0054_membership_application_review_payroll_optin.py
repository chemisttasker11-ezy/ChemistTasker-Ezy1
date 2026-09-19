from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0053_shift_engagement_routing"),
    ]

    operations = [
        migrations.AddField(
            model_name="pharmacy",
            name="use_chemisttasker_payroll",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Opt in to ChemistTasker payroll. When disabled, roster and attendance still "
                    "produce timesheets without requiring Award classifications or pay rates."
                ),
            ),
        ),
        migrations.AddField(
            model_name="membershipapplication",
            name="pending_identity_key",
            field=models.CharField(blank=True, editable=False, max_length=320, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="membershipapplication",
            name="submitted_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="membershipapplication",
            name="review_changes",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="membershipapplication",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="membershipapplication",
            name="reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="membership_applications_reviewed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="membershipapplication",
            name="approved_membership",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="source_applications",
                to="client_profile.membership",
            ),
        ),
        migrations.AddIndex(
            model_name="membershipapplication",
            index=models.Index(fields=["pharmacy", "email", "status"], name="cp_memapp_email_status_idx"),
        ),
    ]

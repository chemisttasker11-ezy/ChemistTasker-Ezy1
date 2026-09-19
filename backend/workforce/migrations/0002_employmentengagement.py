import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("workforce", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="EmploymentEngagement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("public_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("effective_from", models.DateField()),
                ("effective_to", models.DateField(blank=True, null=True)),
                ("role", models.CharField(max_length=50)),
                ("employment_type", models.CharField(max_length=20)),
                ("job_title", models.CharField(blank=True, max_length=255)),
                ("pay_basis", models.CharField(choices=[("AWARD", "Award"), ("ABOVE_AWARD", "Above award")], max_length=20)),
                ("award_code", models.CharField(default="MA000012", max_length=32)),
                ("award_classification", models.CharField(blank=True, max_length=80)),
                ("award_source_label", models.CharField(default="Pharmacy Industry Award 2020", max_length=255)),
                ("award_source_url", models.URLField(default="https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf", max_length=500)),
                ("award_effective_from", models.DateField(blank=True, null=True)),
                ("rate_weekday", models.DecimalField(decimal_places=2, max_digits=8)),
                ("rate_saturday", models.DecimalField(decimal_places=2, max_digits=8)),
                ("rate_sunday", models.DecimalField(decimal_places=2, max_digits=8)),
                ("rate_public_holiday", models.DecimalField(decimal_places=2, max_digits=8)),
                ("rate_early_morning", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("rate_late_night", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("early_morning_applicable", models.BooleanField(default=False)),
                ("late_night_applicable", models.BooleanField(default=False)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="created_employment_engagements", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="updated_employment_engagements", to=settings.AUTH_USER_MODEL)),
                ("membership", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="employment_engagements", to="client_profile.membership")),
            ],
            options={"ordering": ["membership_id", "-effective_from", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="employmentengagement",
            constraint=models.UniqueConstraint(fields=("membership", "effective_from"), name="wf_engagement_membership_start_unique"),
        ),
        migrations.AddConstraint(
            model_name="employmentengagement",
            constraint=models.CheckConstraint(condition=Q(effective_to__isnull=True) | Q(effective_to__gte=models.F("effective_from")), name="wf_engagement_valid_date_range"),
        ),
        migrations.AddIndex(
            model_name="employmentengagement",
            index=models.Index(fields=["membership", "effective_from", "effective_to"], name="workforce_e_membersh_34d64f_idx"),
        ),
    ]

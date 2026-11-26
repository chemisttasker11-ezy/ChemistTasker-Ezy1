import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0090_shiftoffer_pay_by_at"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="exploreronboarding",
            name="gov_id_check_method",
            field=models.CharField(blank=True, choices=[("automatic_ocr", "Automatic OCR"), ("admin_review", "Admin review")], db_default="", editable=False, max_length=16),
        ),
        migrations.AddField(
            model_name="exploreronboarding",
            name="gov_id_checked_at",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="exploreronboarding",
            name="gov_id_checked_by",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="otherstaffonboarding",
            name="gov_id_check_method",
            field=models.CharField(blank=True, choices=[("automatic_ocr", "Automatic OCR"), ("admin_review", "Admin review")], db_default="", editable=False, max_length=16),
        ),
        migrations.AddField(
            model_name="otherstaffonboarding",
            name="gov_id_checked_at",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="otherstaffonboarding",
            name="gov_id_checked_by",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="gov_id_check_method",
            field=models.CharField(blank=True, choices=[("automatic_ocr", "Automatic OCR"), ("admin_review", "Admin review")], db_default="", editable=False, max_length=16),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="gov_id_checked_at",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="owneronboarding",
            name="gov_id_checked_by",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="pharmacistonboarding",
            name="gov_id_check_method",
            field=models.CharField(blank=True, choices=[("automatic_ocr", "Automatic OCR"), ("admin_review", "Admin review")], db_default="", editable=False, max_length=16),
        ),
        migrations.AddField(
            model_name="pharmacistonboarding",
            name="gov_id_checked_at",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="pharmacistonboarding",
            name="gov_id_checked_by",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL),
        ),
    ]

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0055_shift_casual_employment_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="shiftoffer",
            name="payroll_activated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="shiftslotassignment",
            name="payroll_activated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="invoice",
            name="source_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="invoicelineitem",
            name="source_assignment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="invoice_line_items",
                to="client_profile.shiftslotassignment",
            ),
        ),
        migrations.AddIndex(
            model_name="invoicelineitem",
            index=models.Index(fields=["source_assignment"], name="cp_invline_source_assn_idx"),
        ),
        migrations.AddConstraint(
            model_name="invoicelineitem",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("category_code", "ProfessionalServices"),
                    ("source_assignment__isnull", False),
                ),
                fields=("source_assignment",),
                name="uniq_professional_invoice_assignment",
            ),
        ),
    ]

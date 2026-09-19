from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0052_membershipapplication_date_of_birth")]

    operations = [
        migrations.AddField(model_name="shiftoffer", name="payment_preference_snapshot", field=models.CharField(blank=True, max_length=10)),
        migrations.AddField(model_name="shiftoffer", name="settlement_channel", field=models.CharField(blank=True, max_length=16)),
        migrations.AddField(model_name="shiftoffer", name="engagement_kind", field=models.CharField(blank=True, max_length=32)),
        migrations.AddField(model_name="shiftoffer", name="engagement_terms_snapshot", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="shiftoffer", name="engagement_terms_accepted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="shiftslotassignment", name="payment_preference_snapshot", field=models.CharField(blank=True, max_length=10)),
        migrations.AddField(model_name="shiftslotassignment", name="settlement_channel", field=models.CharField(blank=True, max_length=16)),
        migrations.AddField(model_name="shiftslotassignment", name="engagement_kind", field=models.CharField(blank=True, max_length=32)),
        migrations.AddField(model_name="shiftslotassignment", name="engagement_terms_snapshot", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="shiftslotassignment", name="engagement_terms_accepted_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(
            model_name="shiftslotassignment",
            name="source_offer",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="slot_assignments", to="client_profile.shiftoffer"),
        ),
    ]

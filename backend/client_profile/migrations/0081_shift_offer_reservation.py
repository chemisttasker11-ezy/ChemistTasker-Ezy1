from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("client_profile", "0080_ahpra_registration")]

    operations = [
        migrations.AddField(
            model_name="shiftoffer", name="payment_due_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="shiftoffer", name="payment_expired_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="shiftoffer",
            index=models.Index(fields=["status", "payment_due_at"], name="ct_offer_payment_due_idx"),
        ),
    ]

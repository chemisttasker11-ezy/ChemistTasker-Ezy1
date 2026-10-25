"""Fail closed on duplicate financial rows before enforcing Stripe intent uniqueness."""
from django.db import migrations, models
from django.db.models import Count, Q


def block_existing_duplicate_payments(apps, schema_editor):
    Payment = apps.get_model("billing", "ShiftPayment")
    duplicate = (
        Payment.objects.using(schema_editor.connection.alias)
        .filter(stripe_payment_intent_id__isnull=False)
        .exclude(stripe_payment_intent_id="")
        .values("stripe_payment_intent_id")
        .annotate(total=Count("pk"))
        .filter(total__gt=1)
        .first()
    )
    if duplicate:
        raise RuntimeError(
            "Existing Stripe payment-intent duplicates require financial reconciliation "
            "before migration. No existing rows were changed."
        )


class Migration(migrations.Migration):
    dependencies = [("billing", "0003_shiftpayment_refunds")]

    operations = [
        migrations.RunPython(block_existing_duplicate_payments, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="shiftpayment",
            constraint=models.UniqueConstraint(
                fields=("stripe_payment_intent_id",),
                condition=Q(stripe_payment_intent_id__isnull=False)
                & ~Q(stripe_payment_intent_id=""),
                name="billing_unique_nonempty_payment_intent",
            ),
        ),
    ]

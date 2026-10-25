from decimal import Decimal
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('billing', '0002_stripewebhookevent')]
    operations = [
        migrations.AddField(
            model_name='shiftpayment',
            name='refunded_amount_aud',
            field=models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), help_text="Cumulative refund confirmed by Stripe for this payment."),
        ),
        migrations.AlterField(
            model_name='shiftpayment',
            name='status',
            field=models.CharField(max_length=50, default='pending', choices=[
                ('pending', 'Pending'), ('paid', 'Paid'),
                ('partially_refunded', 'Partially refunded'),
                ('refunded', 'Refunded'), ('failed', 'Failed'),
            ]),
        ),
    ]

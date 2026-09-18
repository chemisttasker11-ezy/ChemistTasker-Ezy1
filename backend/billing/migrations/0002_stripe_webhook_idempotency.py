from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0001_squashed_baseline'),
    ]

    operations = [
        migrations.AddField(
            model_name='shiftpayment',
            name='stripe_event_id',
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.CreateModel(
            name='StripeWebhookEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_id', models.CharField(max_length=255, unique=True)),
                ('event_type', models.CharField(max_length=120)),
                ('status', models.CharField(
                    choices=[
                        ('processing', 'Processing'),
                        ('processed', 'Processed'),
                        ('failed', 'Failed'),
                    ],
                    default='processing',
                    max_length=20,
                )),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('processed_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.CharField(blank=True, max_length=255)),
            ],
            options={
                'ordering': ['-received_at'],
            },
        ),
    ]

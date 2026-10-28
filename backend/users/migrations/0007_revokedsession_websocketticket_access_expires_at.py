from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('users', '0006_websocketticket_session_id')]

    operations = [
        migrations.CreateModel(
            name='RevokedSession',
            fields=[
                ('session_id', models.CharField(max_length=255, primary_key=True, serialize=False)),
                ('revoked_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name='websocketticket',
            name='access_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

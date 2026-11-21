from datetime import time
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('notifications', '0003_clean_constraint_names'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationPushPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('push_messages', models.BooleanField(default=True)),
                ('push_tasks', models.BooleanField(default=True)),
                ('push_work_notes', models.BooleanField(default=True)),
                ('push_alerts', models.BooleanField(default=True)),
                ('quiet_hours_enabled', models.BooleanField(default=False)),
                ('quiet_start', models.TimeField(default=time(22, 0))),
                ('quiet_end', models.TimeField(default=time(7, 0))),
                ('time_zone', models.CharField(default='Australia/Brisbane', max_length=64)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='push_preference', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]

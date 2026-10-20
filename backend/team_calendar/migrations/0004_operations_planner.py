"""Calendar-owned planner tasks; disposable PR databases must recreate this migration."""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('team_calendar', '0003_clean_constraint_names'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='worknote', name='is_planner_task', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='worknote', name='is_clinical', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='worknote', name='start_time', field=models.TimeField(blank=True, null=True)),
        migrations.AddField(model_name='worknote', name='end_time', field=models.TimeField(blank=True, null=True)),
        migrations.CreateModel(
            name='SavedTask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('details', models.TextField(blank=True)),
                ('start_time', models.TimeField(blank=True, null=True)),
                ('end_time', models.TimeField(blank=True, null=True)),
                ('is_clinical', models.BooleanField(default=False)),
                ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                              related_name='saved_tasks', to='client_profile.pharmacy')),
            ],
            options={'ordering': ['title', 'id']},
        ),
        migrations.CreateModel(
            name='OperationAudit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=20)),
                ('details', models.JSONField(default=dict)),
                ('request_key', models.CharField(blank=True, max_length=128, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='client_profile.pharmacy')),
                ('work_note', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                               to='team_calendar.worknote')),
            ],
            options={'constraints': [models.UniqueConstraint(fields=('pharmacy', 'request_key'), name='planner_copy_request_key')]},
        ),
    ]

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('talent', '0005_board_reports'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name='SavedProfessionalContact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('WORKER_LISTING', 'Worker listing'), ('ORGANIZATION', 'Organisation')], max_length=24)),
                ('reference', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='saved_professional_contacts', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(model_name='savedprofessionalcontact', constraint=models.UniqueConstraint(fields=('user', 'kind', 'reference'), name='talent_saved_contact_unique')),
        migrations.AddIndex(model_name='savedprofessionalcontact', index=models.Index(fields=['user', '-created_at'], name='talent_saved_contact_user_date')),
    ]

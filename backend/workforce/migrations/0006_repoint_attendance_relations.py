"""Point workforce's relations to the moved attendance models at their new app: STATE ONLY.

The foreign-key columns and constraints are untouched (the tables did not change); only the migration state learns that
managerattendanceeventaudit.event now refer to the attendance app."""
from django.db import migrations
from django.db import models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('workforce', '0005_consolidate_legacy_leave'),
        ('attendance', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='managerattendanceeventaudit',
                    name='event',
                    field=models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='manager_creation_audit', to='attendance.attendanceevent'),
                ),
            ],
            database_operations=[],
        ),
    ]

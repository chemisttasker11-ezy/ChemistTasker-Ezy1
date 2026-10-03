"""Remove the attendance models from client_profile's migration state: STATE ONLY, no SQL runs.
They live on in the 'attendance' app (see attendance.0001_initial); the tables are untouched here."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('client_profile', '0068_move_invoicing_out'),
        ('attendance', '0001_initial'),
        ('workforce', '0006_repoint_attendance_relations'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='AttendanceCorrection'),
                migrations.DeleteModel(name='ProvisionalAttendance'),
                migrations.DeleteModel(name='KioskAttendanceEvent'),
                migrations.DeleteModel(name='AttendanceEvent'),
                migrations.DeleteModel(name='AttendanceSession'),
                migrations.DeleteModel(name='WorkerPIN'),
                migrations.DeleteModel(name='PharmacyQRSession'),
                migrations.DeleteModel(name='KioskPairingAuthorization'),
                migrations.DeleteModel(name='KioskDevice'),
            ],
            database_operations=[],
        ),
    ]

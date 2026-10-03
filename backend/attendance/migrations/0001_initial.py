"""Move the attendance models out of client_profile: STATE ONLY.

No SQL is executed here. The tables already exist (created by the client_profile baseline migration) under their original
names; this migration only registers the models with the new app. 0002 then gives the tables clean names. The
ContentType rows are re-labelled in place so permissions, admin history and generic relations stay attached.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


MODELS = ['kioskdevice', 'kioskpairingauthorization', 'pharmacyqrsession', 'workerpin', 'attendancesession', 'attendanceevent', 'kioskattendanceevent', 'provisionalattendance', 'attendancecorrection']


def move_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        old = ContentType.objects.filter(app_label='client_profile', model=model).first()
        if old is not None and not ContentType.objects.filter(app_label='attendance', model=model).exists():
            old.app_label = 'attendance'
            old.save(update_fields=['app_label'])


def restore_content_types(apps, schema_editor):
    ContentType = apps.get_model('contenttypes', 'ContentType')
    for model in MODELS:
        new = ContentType.objects.filter(app_label='attendance', model=model).first()
        if new is not None and not ContentType.objects.filter(app_label='client_profile', model=model).exists():
            new.app_label = 'client_profile'
            new.save(update_fields=['app_label'])


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('client_profile', '0068_move_invoicing_out'),
        ('contenttypes', '0002_remove_content_type_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
            migrations.CreateModel(
                name='KioskDevice',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('device_token', models.CharField(db_index=True, help_text='Restricted auth token for this device.', max_length=255, unique=True)),
                    ('device_name', models.CharField(help_text="Human-readable label, e.g. 'Front Counter iPad'.", max_length=120)),
                    ('is_active', models.BooleanField(default=True)),
                    ('activated_at', models.DateTimeField(auto_now_add=True)),
                    ('activated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activated_kiosk_devices', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='kiosk_devices', to='client_profile.pharmacy')),
                    ('installation_id', models.UUIDField(default=uuid.uuid4, editable=False, help_text='Stable public identifier generated for this kiosk installation.', unique=True)),
                    ('platform', models.CharField(blank=True, default='', max_length=24)),
                    ('public_signing_key', models.TextField(blank=True, default='', help_text='Base64-encoded Ed25519 public key. The private key remains on the device.')),
                    ('app_version', models.CharField(blank=True, default='', max_length=40)),
                    ('last_seen_at', models.DateTimeField(blank=True, null=True)),
                    ('last_sync_at', models.DateTimeField(blank=True, null=True)),
                    ('revoked_at', models.DateTimeField(blank=True, null=True)),
                    ('last_contiguous_sequence', models.PositiveBigIntegerField(default=0)),
                    ('last_event_hash', models.CharField(blank=True, default='', max_length=64)),
                    ('client_kind', models.CharField(choices=[('WEB_ONLINE', 'Web online'), ('NATIVE_OFFLINE', 'Native offline')], default='WEB_ONLINE', max_length=24)),
                ],
                options={
                    'indexes': [models.Index(fields=['pharmacy'], name='client_prof_pharmac_e1b4ea_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_kioskdevice',
                },
            ),
            migrations.CreateModel(
                name='KioskPairingAuthorization',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('code_digest', models.CharField(max_length=64, unique=True)),
                    ('device_name', models.CharField(default='Counter Terminal', max_length=120)),
                    ('allowed_client_kind', models.CharField(choices=[('WEB_ONLINE', 'Web online'), ('NATIVE_OFFLINE', 'Native offline')], default='NATIVE_OFFLINE', max_length=24)),
                    ('expires_at', models.DateTimeField(db_index=True)),
                    ('consumed_at', models.DateTimeField(blank=True, null=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('authorized_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='authorized_kiosk_pairings', to=settings.AUTH_USER_MODEL)),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='kiosk_pairing_authorizations', to='client_profile.pharmacy')),
                    ('resulting_device', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='pairing_authorization', to='attendance.kioskdevice')),
                    ('client_attempt_id', models.UUIDField(blank=True, help_text='Stable native pairing attempt used for proof-bound recovery after a lost response.', null=True, unique=True)),
                ],
                options={
                    'indexes': [models.Index(fields=['consumed_at', 'expires_at'], name='client_prof_consume_aa4d81_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_kioskpairingauthorization',
                },
            ),
            migrations.CreateModel(
                name='PharmacyQRSession',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('code', models.CharField(db_index=True, help_text='Random short-lived code embedded in QR.', max_length=64, unique=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('expires_at', models.DateTimeField()),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='qr_sessions', to='client_profile.pharmacy')),
                ],
                options={
                    'indexes': [models.Index(fields=['pharmacy', 'expires_at'], name='client_prof_pharmac_26f482_idx'), models.Index(fields=['code'], name='client_prof_code_0d9ec5_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_pharmacyqrsession',
                },
            ),
            migrations.CreateModel(
                name='WorkerPIN',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('pin_hash', models.CharField(help_text="bcrypt/argon2 hash of the worker's PIN.", max_length=255)),
                    ('failed_attempts', models.IntegerField(default=0)),
                    ('locked_until', models.DateTimeField(blank=True, null=True)),
                    ('is_enabled', models.BooleanField(default=True, help_text='Owner can toggle PIN requirement on/off.')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('membership', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='worker_pin', to='client_profile.membership')),
                ],
                options={
                    'indexes': [],
                    'constraints': [],
                    'db_table': 'client_profile_workerpin',
                },
            ),
            migrations.CreateModel(
                name='AttendanceSession',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('started_at', models.DateTimeField(help_text='Original actual clock-in time; scheduled time remains on assignment.')),
                    ('ended_at', models.DateTimeField(blank=True, help_text='Original actual clock-out time; null while the session is open.', null=True)),
                    ('is_provisional', models.BooleanField(default=False, help_text='True for unrostered or cross-site cover, pending approval.')),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('user', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_sessions', to=settings.AUTH_USER_MODEL)),
                    ('source_membership', models.ForeignKey(blank=True, help_text='Membership that established local or cross-site eligibility.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_sessions_justified', to='client_profile.membership')),
                    ('pharmacy', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_sessions', to='client_profile.pharmacy')),
                    ('assignment', models.ForeignKey(blank=True, help_text='Null for unrostered/urgent cover.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_sessions', to='client_profile.shiftslotassignment')),
                ],
                options={
                    'ordering': ['-started_at', '-id'],
                    'indexes': [models.Index(fields=['pharmacy', 'started_at'], name='client_prof_pharmac_a0d4b1_idx'), models.Index(fields=['user', 'started_at'], name='client_prof_user_id_a5feb4_idx'), models.Index(fields=['assignment'], name='client_prof_assignm_cf13b2_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(('ended_at__isnull', True)), fields=('user',), name='attendance_one_open_session_per_user'), models.CheckConstraint(condition=models.Q(('ended_at__isnull', True), ('ended_at__gte', models.F('started_at')), _connector='OR'), name='attendance_end_not_before_start')],
                    'db_table': 'client_profile_attendancesession',
                },
            ),
            migrations.CreateModel(
                name='AttendanceEvent',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('event_type', models.CharField(choices=[('CLOCK_IN', 'Clock In'), ('CLOCK_OUT', 'Clock Out'), ('BREAK_START', 'Break Start'), ('BREAK_END', 'Break End')], max_length=16)),
                    ('occurred_at', models.DateTimeField(help_text='Server-recorded actual event time.')),
                    ('source', models.CharField(choices=[('QR_KIOSK', 'QR Kiosk'), ('MOBILE_QR', 'Mobile QR'), ('KIOSK_PIN', 'Kiosk PIN'), ('IN_APP', 'In-App'), ('MANAGER', 'Manager'), ('OFFLINE_KIOSK', 'Offline Kiosk')], max_length=16)),
                    ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                    ('recorded_at', models.DateTimeField(auto_now_add=True)),
                    ('session', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='events', to='attendance.attendancesession')),
                    ('device', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_events', to='attendance.kioskdevice')),
                    ('qr_session', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_events', to='attendance.pharmacyqrsession')),
                ],
                options={
                    'ordering': ['occurred_at', 'id'],
                    'indexes': [models.Index(fields=['session', 'occurred_at'], name='client_prof_session_e49418_idx'), models.Index(fields=['event_type', 'occurred_at'], name='client_prof_event_t_a5db2c_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_attendanceevent',
                },
            ),
            migrations.CreateModel(
                name='KioskAttendanceEvent',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('event_id', models.UUIDField(db_index=True, unique=True)),
                    ('device_sequence', models.PositiveBigIntegerField()),
                    ('shift_id', models.BigIntegerField(blank=True, null=True)),
                    ('event_type', models.CharField(choices=[('CLOCK_IN', 'Clock In'), ('CLOCK_OUT', 'Clock Out'), ('BREAK_START', 'Break Start'), ('BREAK_END', 'Break End')], max_length=16)),
                    ('device_timestamp', models.DateTimeField()),
                    ('trusted_time_estimate', models.DateTimeField(blank=True, null=True)),
                    ('monotonic_elapsed_ms', models.PositiveBigIntegerField()),
                    ('boot_session_id', models.CharField(max_length=80)),
                    ('previous_event_hash', models.CharField(blank=True, default='', max_length=64)),
                    ('event_hash', models.CharField(max_length=64)),
                    ('device_signature', models.TextField()),
                    ('canonical_payload', models.JSONField()),
                    ('integrity_flags', models.JSONField(blank=True, default=list)),
                    ('processing_status', models.CharField(choices=[('ACCEPTED', 'Accepted'), ('NEEDS_REVIEW', 'Needs review'), ('REJECTED', 'Rejected')], max_length=20)),
                    ('rejection_reason', models.TextField(blank=True, default='')),
                    ('received_at', models.DateTimeField(auto_now_add=True)),
                    ('attendance_event', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='offline_source_event', to='attendance.attendanceevent')),
                    ('device', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='offline_attendance_events', to='attendance.kioskdevice')),
                    ('employee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='kiosk_offline_events', to=settings.AUTH_USER_MODEL)),
                    ('submitted_employee_id', models.PositiveBigIntegerField()),
                ],
                options={
                    'ordering': ['device_id', 'device_sequence'],
                    'indexes': [models.Index(fields=['device', 'device_sequence'], name='client_prof_device__7f4585_idx'), models.Index(fields=['processing_status', 'received_at'], name='client_prof_process_842c08_idx')],
                    'constraints': [models.UniqueConstraint(fields=('device', 'device_sequence'), name='kiosk_event_unique_device_sequence')],
                    'db_table': 'client_profile_kioskattendanceevent',
                },
            ),
            migrations.CreateModel(
                name='ProvisionalAttendance',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('cover_type', models.CharField(choices=[('UNROSTERED_LOCAL', 'Unrostered Local Staff'), ('CROSS_SITE_CHAIN', 'Cross-Site Same Owner Chain'), ('CROSS_SITE_ORG', 'Cross-Site Same Organization')], max_length=30)),
                    ('status', models.CharField(choices=[('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')], default='PENDING', max_length=12)),
                    ('decided_at', models.DateTimeField(blank=True, null=True)),
                    ('decision_reason', models.TextField(blank=True)),
                    ('created_at', models.DateTimeField(auto_now_add=True)),
                    ('updated_at', models.DateTimeField(auto_now=True)),
                    ('decided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decided_provisional_attendances', to=settings.AUTH_USER_MODEL)),
                    ('session', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='provisional_review', to='attendance.attendancesession')),
                    ('backfill_shift', models.ForeignKey(blank=True, help_text='Created on approval to record the actual worked shift.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='provisional_backfills', to='client_profile.shift')),
                    ('backfill_assignment', models.ForeignKey(blank=True, help_text='Created on approval to record the actual assignment.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='provisional_backfills', to='client_profile.shiftslotassignment')),
                ],
                options={
                    'ordering': ['-created_at'],
                    'indexes': [models.Index(fields=['status', 'created_at'], name='client_prof_status_761caf_idx')],
                    'constraints': [models.CheckConstraint(condition=models.Q(models.Q(('decided_at__isnull', True), ('status', 'PENDING')), models.Q(('decided_at__isnull', False), ('status__in', ['APPROVED', 'REJECTED'])), _connector='OR'), name='provisional_decision_timestamp_matches_status')],
                    'db_table': 'client_profile_provisionalattendance',
                },
            ),
            migrations.CreateModel(
                name='AttendanceCorrection',
                fields=[
                    ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('corrected_timestamp', models.DateTimeField(help_text='The manager-adjusted timestamp.')),
                    ('reason', models.TextField(help_text='Required justification for the correction.')),
                    ('corrected_at', models.DateTimeField(auto_now_add=True)),
                    ('corrected_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_corrections_made', to=settings.AUTH_USER_MODEL)),
                    ('original_event', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='corrections', to='attendance.attendanceevent')),
                ],
                options={
                    'ordering': ['-corrected_at'],
                    'indexes': [models.Index(fields=['original_event'], name='client_prof_origina_4d8e58_idx')],
                    'constraints': [],
                    'db_table': 'client_profile_attendancecorrection',
                },
            ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(move_content_types, restore_content_types),
    ]

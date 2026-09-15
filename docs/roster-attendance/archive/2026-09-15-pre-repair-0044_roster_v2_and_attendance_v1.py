"""
Additive migration: create Roster V2 and Attendance V1 tables.
Uses raw SQL to bypass Django's model-state resolution for FK targets
whose migration source files are absent from this checkout.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        # No client_profile dependency — prior migration source files
        # are absent.  All FK-target tables exist in the database already.
    ]

    operations = [
        # ---- Roster V2 ----
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_rosterperiod (
                id            BIGSERIAL PRIMARY KEY,
                week_start    DATE NOT NULL,
                status        VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
                published_at  TIMESTAMPTZ,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                pharmacy_id   INTEGER NOT NULL REFERENCES client_profile_pharmacy(id) ON DELETE CASCADE,
                published_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
                created_by_id   INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
                copied_from_id  BIGINT REFERENCES client_profile_rosterperiod(id) ON DELETE SET NULL,
                UNIQUE (pharmacy_id, week_start)
            );
            CREATE INDEX IF NOT EXISTS client_prof_roster_pharm_week_idx
                ON client_profile_rosterperiod (pharmacy_id, week_start);
            CREATE INDEX IF NOT EXISTS client_prof_roster_status_idx
                ON client_profile_rosterperiod (status);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_rosterperiod CASCADE;",
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_rostertemplate (
                id              BIGSERIAL PRIMARY KEY,
                name            VARCHAR(120) NOT NULL,
                template_data   JSONB NOT NULL DEFAULT '[]'::JSONB,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                pharmacy_id     INTEGER NOT NULL REFERENCES client_profile_pharmacy(id) ON DELETE CASCADE,
                created_by_id   INTEGER REFERENCES auth_user(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS client_prof_rostertpl_pharm_idx
                ON client_profile_rostertemplate (pharmacy_id);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_rostertemplate CASCADE;",
        ),
        # ---- Attendance V1 ----
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_kioskdevice (
                id              BIGSERIAL PRIMARY KEY,
                device_token    VARCHAR(255) NOT NULL UNIQUE,
                device_name     VARCHAR(120) NOT NULL,
                is_active       BOOLEAN NOT NULL DEFAULT TRUE,
                activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                pharmacy_id     INTEGER NOT NULL REFERENCES client_profile_pharmacy(id) ON DELETE CASCADE,
                activated_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS client_prof_kiosk_pharm_idx
                ON client_profile_kioskdevice (pharmacy_id);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_kioskdevice CASCADE;",
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_pharmacyqrsession (
                id          BIGSERIAL PRIMARY KEY,
                code        VARCHAR(64) NOT NULL UNIQUE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at  TIMESTAMPTZ NOT NULL,
                is_used     BOOLEAN NOT NULL DEFAULT FALSE,
                pharmacy_id INTEGER NOT NULL REFERENCES client_profile_pharmacy(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS client_prof_qr_pharm_exp_idx
                ON client_profile_pharmacyqrsession (pharmacy_id, expires_at);
            CREATE INDEX IF NOT EXISTS client_prof_qr_code_idx
                ON client_profile_pharmacyqrsession (code);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_pharmacyqrsession CASCADE;",
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_workerpin (
                id              BIGSERIAL PRIMARY KEY,
                pin_hash        VARCHAR(255) NOT NULL,
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until    TIMESTAMPTZ,
                is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                membership_id   BIGINT NOT NULL UNIQUE REFERENCES client_profile_membership(id) ON DELETE CASCADE
            );
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_workerpin CASCADE;",
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_attendancesession (
                id              BIGSERIAL PRIMARY KEY,
                event_type      VARCHAR(16) NOT NULL,
                timestamp       TIMESTAMPTZ NOT NULL,
                source          VARCHAR(16) NOT NULL,
                ip_address      INET,
                is_provisional  BOOLEAN NOT NULL DEFAULT FALSE,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                pharmacy_id     INTEGER NOT NULL REFERENCES client_profile_pharmacy(id) ON DELETE CASCADE,
                user_id         INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
                assignment_id   BIGINT REFERENCES client_profile_shiftslotassignment(id) ON DELETE SET NULL,
                qr_session_id   BIGINT REFERENCES client_profile_pharmacyqrsession(id) ON DELETE SET NULL,
                device_id       BIGINT REFERENCES client_profile_kioskdevice(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS client_prof_attend_phu_ts_idx
                ON client_profile_attendancesession (pharmacy_id, user_id, timestamp);
            CREATE INDEX IF NOT EXISTS client_prof_attend_asgn_ts_idx
                ON client_profile_attendancesession (assignment_id, timestamp);
            CREATE INDEX IF NOT EXISTS client_prof_attend_user_ts_idx
                ON client_profile_attendancesession (user_id, timestamp);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_attendancesession CASCADE;",
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_provisionalattendance (
                id                      BIGSERIAL PRIMARY KEY,
                cover_type              VARCHAR(30) NOT NULL,
                status                  VARCHAR(12) NOT NULL DEFAULT 'PENDING',
                approved_at             TIMESTAMPTZ,
                note                    TEXT NOT NULL DEFAULT '',
                created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                attendance_clock_in_id  BIGINT NOT NULL REFERENCES client_profile_attendancesession(id) ON DELETE CASCADE,
                attendance_clock_out_id BIGINT REFERENCES client_profile_attendancesession(id) ON DELETE SET NULL,
                pharmacy_id             INTEGER NOT NULL REFERENCES client_profile_pharmacy(id) ON DELETE CASCADE,
                user_id                 INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
                source_membership_id    BIGINT REFERENCES client_profile_membership(id) ON DELETE SET NULL,
                approved_by_id          INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
                backfill_shift_id       BIGINT REFERENCES client_profile_shift(id) ON DELETE SET NULL,
                backfill_assignment_id  BIGINT REFERENCES client_profile_shiftslotassignment(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS client_prof_prov_pharm_st_idx
                ON client_profile_provisionalattendance (pharmacy_id, status);
            CREATE INDEX IF NOT EXISTS client_prof_prov_user_st_idx
                ON client_profile_provisionalattendance (user_id, status);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_provisionalattendance CASCADE;",
        ),
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS client_profile_attendancecorrection (
                id                    BIGSERIAL PRIMARY KEY,
                corrected_timestamp   TIMESTAMPTZ NOT NULL,
                reason                TEXT NOT NULL,
                corrected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                original_event_id     BIGINT NOT NULL REFERENCES client_profile_attendancesession(id) ON DELETE CASCADE,
                corrected_by_id       INTEGER REFERENCES auth_user(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS client_prof_corr_event_idx
                ON client_profile_attendancecorrection (original_event_id);
            """,
            reverse_sql="DROP TABLE IF EXISTS client_profile_attendancecorrection CASCADE;",
        ),
    ]

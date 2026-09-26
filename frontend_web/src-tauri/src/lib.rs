use std::{
    collections::BTreeMap,
    fs,
    sync::Mutex,
    time::{Duration, Instant},
};

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use ed25519_dalek::{Signer, SigningKey};
use keyring::{Entry, Error as KeyringError};
use rand_core::{OsRng, RngCore};
use reqwest::StatusCode;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "com.chemisttasker.kiosk";
const PROTOCOL_VERSION: i64 = 1;
static SECRET_INIT_LOCK: Mutex<()> = Mutex::new(());

struct RuntimeState {
    boot_session_id: String,
    boot_started: Instant,
    sync_lock: tokio::sync::Mutex<()>,
    capture_lock: tokio::sync::Mutex<()>,
}

#[derive(Serialize)]
struct DeviceIdentity {
    public_signing_key: String,
    paired: bool,
    installation_id: Option<String>,
    pharmacy_id: Option<i64>,
    pharmacy_name: Option<String>,
}

#[derive(Serialize)]
struct LocalEventReceipt {
    event_id: String,
    device_seq: i64,
    event_hash: String,
    queued: bool,
    captured_at: String,
}

#[derive(Serialize)]
struct OfflinePinReceipt {
    action: String,
    worker_id: i64,
    worker_name: String,
    event: LocalEventReceipt,
    recovered: bool,
}

#[derive(Deserialize)]
struct PairResponse {
    installation_id: String,
    device_token: String,
    pharmacy_id: i64,
    pharmacy_name: String,
    server_time: String,
    max_offline_hours: i64,
}

#[derive(Deserialize)]
struct EnrollmentResponse {
    worker_id: i64,
    worker_name: String,
    pharmacy_id: i64,
    is_clocked_in: bool,
    is_on_break: bool,
    verified_at: String,
    offline_valid_until: String,
    credential_generation: String,
}

#[derive(Deserialize)]
struct ConfigResponse {
    device_id: String,
    server_time: String,
    max_offline_hours: i64,
}

#[derive(Deserialize, Serialize)]
struct KioskQrResponse {
    qr_token: String,
    expires_at: String,
    pharmacy_id: i64,
    pharmacy_name: String,
    refresh_interval_seconds: i64,
}

#[derive(Deserialize, Serialize)]
struct SyncResponse {
    device_id: String,
    acknowledged_through: i64,
    server_time: String,
    results: Vec<Value>,
    #[serde(default)]
    max_offline_hours: Option<i64>,
    #[serde(default)]
    device_revoked: bool,
}

fn storage_scope() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else if option_env!("KIOSK_BUILD_PROFILE") == Some("acceptance") {
        "acceptance"
    } else {
        "production"
    }
}

fn keyring_entry(account: &str) -> Result<Entry, String> {
    let environment = storage_scope();
    Entry::new(KEYRING_SERVICE, &format!("{environment}:{account}"))
        .map_err(|error| error.to_string())
}

fn load_secret(account: &str) -> Result<Option<Vec<u8>>, String> {
    let entry = keyring_entry(account)?;
    match entry.get_password() {
        Ok(encoded) => BASE64
            .decode(encoded)
            .map(Some)
            .map_err(|error| format!("Stored {account} is corrupt: {error}")),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Secure storage is unavailable for {account}: {error}"
        )),
    }
}

fn load_or_initialize_secret(
    account: &str,
    bytes: usize,
    may_initialize: bool,
) -> Result<Vec<u8>, String> {
    let _guard = SECRET_INIT_LOCK
        .lock()
        .map_err(|_| "Secure-storage initialization lock is poisoned".to_string())?;
    if let Some(secret) = load_secret(account)? {
        return Ok(secret);
    }
    if !may_initialize {
        return Err(format!(
            "RECOVERY_REQUIRED: {account} is missing for existing kiosk data"
        ));
    }
    let mut secret = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut secret);
    keyring_entry(account)?
        .set_password(&BASE64.encode(&secret))
        .map_err(|error| error.to_string())?;
    Ok(secret)
}

fn table_has_rows(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} LIMIT 1)"),
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn signing_key(connection: &Connection) -> Result<SigningKey, String> {
    let may_initialize = !table_has_rows(connection, "device_config")?;
    let bytes = load_or_initialize_secret("device-signing-key", 32, may_initialize)?;
    let seed: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "Stored signing key has an invalid length".to_string())?;
    Ok(SigningKey::from_bytes(&seed))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    // Development installations historically used the root directory.
    let directory = if cfg!(debug_assertions) {
        directory
    } else {
        directory.join(storage_scope())
    };
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let database_path = directory.join("kiosk.db");
    let database_key = load_or_initialize_secret("database-key", 32, !database_path.exists())?;
    let mut connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{}'\"; PRAGMA cipher_memory_security = ON; PRAGMA foreign_keys = ON;",
            hex::encode(database_key)
        ))
        .map_err(|error| error.to_string())?;
    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .map_err(|error| format!("SQLCipher is required but unavailable: {error}"))?;
    if cipher_version.trim().is_empty() {
        return Err("SQLCipher is required but reported no version".to_string());
    }
    connection
        .query_row("SELECT COUNT(*) FROM sqlite_master", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| format!("Encrypted kiosk database could not be opened: {error}"))?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS device_config (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                installation_id TEXT NOT NULL,
                pharmacy_id INTEGER NOT NULL,
                pharmacy_name TEXT NOT NULL,
                api_base_url TEXT NOT NULL,
                app_version TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS local_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attendance_event (
                event_id TEXT PRIMARY KEY,
                local_request_id TEXT,
                device_seq INTEGER NOT NULL UNIQUE,
                payload_json TEXT NOT NULL,
                event_hash TEXT NOT NULL,
                signature TEXT NOT NULL,
                sync_status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sync_receipt (
                device_seq INTEGER PRIMARY KEY,
                event_id TEXT,
                result_json TEXT,
                acknowledged_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS clock_anchor (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                server_utc TEXT NOT NULL,
                boot_session_id TEXT NOT NULL,
                monotonic_elapsed_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dashboard_guard (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                pin_hash TEXT NOT NULL,
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT
            );
            CREATE TABLE IF NOT EXISTS worker_credential (
                employee_id INTEGER PRIMARY KEY,
                identifier TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                enrolled_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS worker_local_state (
                employee_id INTEGER PRIMARY KEY,
                is_clocked_in INTEGER NOT NULL DEFAULT 0,
                is_on_break INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS capture_request (
                request_id TEXT PRIMARY KEY,
                identifier_hash TEXT NOT NULL,
                requested_action TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PREPARED',
                employee_id INTEGER,
                event_id TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS local_schema_migration (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;
    ensure_column(&connection, "sync_receipt", "event_id", "TEXT")?;
    ensure_column(&connection, "sync_receipt", "result_json", "TEXT")?;
    ensure_column(&connection, "attendance_event", "local_request_id", "TEXT")?;
    ensure_column(
        &connection,
        "worker_local_state",
        "is_on_break",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &connection,
        "worker_credential",
        "server_verified_at",
        "TEXT",
    )?;
    ensure_column(
        &connection,
        "worker_credential",
        "offline_valid_until",
        "TEXT",
    )?;
    ensure_column(
        &connection,
        "worker_credential",
        "credential_generation",
        "TEXT",
    )?;
    ensure_column(
        &connection,
        "worker_local_state",
        "needs_reconciliation",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    connection
        .execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS attendance_event_local_request
             ON attendance_event(local_request_id) WHERE local_request_id IS NOT NULL",
            [],
        )
        .map_err(|error| error.to_string())?;
    migrate_local_schema(&mut connection)?;
    Ok(connection)
}

fn migrate_local_schema(connection: &mut Connection) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let applied: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM local_schema_migration WHERE version = 1)",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !applied {
        // Kiosk 3 had no receipt-confirmed state. Preserve duplicate historical
        // committed requests as evidence rather than making startup fail.
        transaction
            .execute(
                "UPDATE capture_request SET status = 'LEGACY_COMMITTED'
                 WHERE status = 'COMMITTED' AND (identifier_hash, requested_action) IN (
                   SELECT identifier_hash, requested_action FROM capture_request
                   WHERE status = 'COMMITTED'
                   GROUP BY identifier_hash, requested_action HAVING COUNT(*) > 1
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute_batch(
                "DROP INDEX IF EXISTS capture_request_pending_lookup;
                 CREATE UNIQUE INDEX capture_request_pending_lookup
                 ON capture_request(identifier_hash, requested_action)
                 WHERE status IN ('PREPARED', 'COMMITTED');",
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO local_schema_migration(version, applied_at) VALUES (1, ?1)",
                [Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

fn capture_identifier_hash(identifier: &str) -> String {
    hex::encode(Sha256::digest(identifier.trim().to_lowercase().as_bytes()))
}

#[tauri::command]
async fn prepare_capture_request(
    app: AppHandle,
    runtime: State<'_, RuntimeState>,
    identifier: String,
    requested_action: String,
) -> Result<String, String> {
    let _guard = runtime.capture_lock.lock().await;
    let connection = open_database(&app)?;
    prepare_capture_request_from(&connection, &identifier, &requested_action)
}

fn prepare_capture_request_from(
    connection: &Connection,
    identifier: &str,
    requested_action: &str,
) -> Result<String, String> {
    if identifier.trim().is_empty()
        || !["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"].contains(&requested_action)
    {
        return Err("A worker identifier and attendance action are required".to_string());
    }
    let hash = capture_identifier_hash(identifier);
    if let Some(request_id) = connection
        .query_row(
            "SELECT request_id FROM capture_request
             WHERE identifier_hash = ?1 AND requested_action = ?2
               AND status IN ('PREPARED', 'COMMITTED')
             ORDER BY created_at DESC LIMIT 1",
            params![hash, requested_action],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
    {
        return Ok(request_id);
    }
    let request_id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO capture_request
             (request_id, identifier_hash, requested_action, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![request_id, hash, requested_action, Utc::now().to_rfc3339()],
        )
        .map_err(|error| error.to_string())?;
    Ok(request_id)
}

#[tauri::command]
fn confirm_capture_receipt(
    app: AppHandle,
    request_id: String,
    event_id: String,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    let status: Option<String> = connection
        .query_row(
            "SELECT status FROM capture_request WHERE request_id = ?1 AND event_id = ?2",
            params![request_id, event_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if status.as_deref() == Some("COMMITTED") {
        connection
            .execute(
                "UPDATE capture_request SET status = 'RECEIPT_CONFIRMED' WHERE request_id = ?1",
                [request_id],
            )
            .map_err(|error| error.to_string())?;
    } else if status.as_deref() != Some("RECEIPT_CONFIRMED") {
        return Err("Capture receipt could not be confirmed".to_string());
    }
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;
    for name in names {
        if name.map_err(|error| error.to_string())? == column {
            return Ok(());
        }
    }
    connection
        .execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn config_value(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM local_state WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn set_config_value(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO local_state(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn mark_device_revoked(connection: &Connection) -> Result<(), String> {
    set_config_value(connection, "device_revoked", "1")
}

fn refresh_device_authorization(
    connection: &Connection,
    server_time: &str,
    max_offline_hours: i64,
) -> Result<(), String> {
    if max_offline_hours <= 0 {
        return Err("Kiosk offline authorization policy is invalid".to_string());
    }
    let verified = DateTime::parse_from_rfc3339(server_time)
        .map_err(|_| "Server authorization timestamp is invalid".to_string())?
        .with_timezone(&Utc);
    let valid_until = verified + ChronoDuration::hours(max_offline_hours);
    set_config_value(connection, "device_authorized_until", &valid_until.to_rfc3339())?;
    set_config_value(connection, "device_revoked", "0")
}

fn refresh_device_authorization_until(
    connection: &Connection,
    valid_until: &str,
) -> Result<(), String> {
    let parsed = DateTime::parse_from_rfc3339(valid_until)
        .map_err(|_| "Device authorization expiry is invalid".to_string())?
        .with_timezone(&Utc);
    set_config_value(connection, "device_authorized_until", &parsed.to_rfc3339())?;
    set_config_value(connection, "device_revoked", "0")
}

fn ensure_device_offline_authorized(connection: &Connection) -> Result<(), String> {
    if config_value(connection, "device_revoked")?.as_deref() == Some("1") {
        return Err("KIOSK_REVOKED: This kiosk registration has been revoked.".to_string());
    }
    let valid_until = config_value(connection, "device_authorized_until")?
        .ok_or_else(|| "Kiosk authorization expired; reconnect before recording offline attendance.".to_string())?;
    let parsed = DateTime::parse_from_rfc3339(&valid_until)
        .map_err(|_| "Stored kiosk authorization is invalid".to_string())?
        .with_timezone(&Utc);
    if parsed <= Utc::now() {
        return Err("Kiosk authorization expired; reconnect before recording offline attendance.".to_string());
    }
    Ok(())
}

fn pending_event_count(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM attendance_event WHERE sync_status = 'PENDING'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn delete_keyring_credential(account: &str) -> Result<(), String> {
    match keyring_entry(account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not clear secure {account}: {error}")),
    }
}

fn sorted_json(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let sorted: BTreeMap<String, Value> = map
                .into_iter()
                .map(|(key, child)| (key, sorted_json(child)))
                .collect();
            Value::Object(sorted.into_iter().collect())
        }
        Value::Array(items) => Value::Array(items.into_iter().map(sorted_json).collect()),
        scalar => scalar,
    }
}

fn canonical_json(value: Value) -> Result<String, String> {
    serde_json::to_string(&sorted_json(value)).map_err(|error| error.to_string())
}

fn validated_api_base_url(value: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(value).map_err(|_| "Kiosk API URL is invalid".to_string())?;
    let local_development = parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if parsed.scheme() != "https" && !local_development {
        return Err("Kiosk API must use HTTPS outside local development".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Kiosk API URL must not contain credentials".to_string());
    }
    Ok(value.trim_end_matches('/').to_string())
}

fn restricted_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())
}

fn device_identity_from(connection: &Connection) -> Result<DeviceIdentity, String> {
    let config: Option<(String, i64, String)> = connection
        .query_row(
            "SELECT installation_id, pharmacy_id, pharmacy_name FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let public_key = BASE64.encode(signing_key(connection)?.verifying_key().as_bytes());
    Ok(match config {
        Some((installation_id, pharmacy_id, pharmacy_name)) => DeviceIdentity {
            public_signing_key: public_key,
            paired: true,
            installation_id: Some(installation_id),
            pharmacy_id: Some(pharmacy_id),
            pharmacy_name: Some(pharmacy_name),
        },
        None => DeviceIdentity {
            public_signing_key: public_key,
            paired: false,
            installation_id: None,
            pharmacy_id: None,
            pharmacy_name: None,
        },
    })
}

#[tauri::command]
fn kiosk_status(app: AppHandle) -> Result<DeviceIdentity, String> {
    let connection = open_database(&app)?;
    device_identity_from(&connection)
}

#[tauri::command]
async fn fetch_online_qr(app: AppHandle) -> Result<KioskQrResponse, String> {
    let connection = open_database(&app)?;
    let (api_base_url, expected_pharmacy_id): (String, i64) = connection
        .query_row(
            "SELECT api_base_url, pharmacy_id FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let token = keyring_entry("device-token")?
        .get_password()
        .map_err(|error| format!("Device credential is unavailable: {error}"))?;
    let response = restricted_http_client()?
        .post(format!(
            "{}/client-profile/attendance/kiosk/qr/",
            api_base_url.trim_end_matches('/')
        ))
        .header("X-Device-Token", token)
        .send()
        .await
        .map_err(|error| format!("QR is temporarily unavailable: {error}"))?;
    if response.status() == StatusCode::UNAUTHORIZED {
        mark_device_revoked(&connection)?;
        return Err("KIOSK_REVOKED: This kiosk is inactive or revoked.".to_string());
    }
    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| "QR is temporarily unavailable.".to_string()));
    }
    let qr: KioskQrResponse = response.json().await.map_err(|error| error.to_string())?;
    if qr.pharmacy_id != expected_pharmacy_id {
        return Err("QR response belongs to a different pharmacy".to_string());
    }
    Ok(qr)
}

#[tauri::command]
async fn pair_device(
    app: AppHandle,
    pairing_code: String,
    device_name: String,
    api_base_url: String,
    app_version: String,
    dashboard_pin: String,
) -> Result<DeviceIdentity, String> {
    if dashboard_pin.len() < 6
        || !dashboard_pin
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return Err("Dashboard PIN must contain at least six digits".to_string());
    }
    let api_base_url = validated_api_base_url(&api_base_url)?;
    let mut connection = open_database(&app)?;
    let public_signing_key = BASE64.encode(signing_key(&connection)?.verifying_key().as_bytes());
    if table_has_rows(&connection, "dashboard_guard")? {
        return Err("Dashboard PIN is already configured for this installation".to_string());
    }
    let pepper = BASE64.encode(load_or_initialize_secret("dashboard-pin-pepper", 32, true)?);
    let salt = SaltString::generate(&mut OsRng);
    let dashboard_hash = Argon2::default()
        .hash_password(format!("{dashboard_pin}{pepper}").as_bytes(), &salt)
        .map_err(|error| error.to_string())?
        .to_string();
    let normalized_pairing_code = pairing_code.trim().replace(' ', "").replace('-', "");
    let existing_code = config_value(&connection, "pairing_code_pending")?.unwrap_or_default();
    let client_attempt_id = if existing_code == normalized_pairing_code {
        config_value(&connection, "pairing_attempt_id")?
            .filter(|value| Uuid::parse_str(value).is_ok())
            .unwrap_or_else(|| Uuid::new_v4().to_string())
    } else {
        Uuid::new_v4().to_string()
    };
    set_config_value(
        &connection,
        "pairing_code_pending",
        &normalized_pairing_code,
    )?;
    set_config_value(&connection, "pairing_attempt_id", &client_attempt_id)?;
    let recovery_message = format!(
        "chemisttasker:kiosk-pair-recovery:v1|{}|{}",
        client_attempt_id, normalized_pairing_code
    );
    let proof_signature = BASE64.encode(
        signing_key(&connection)?
            .sign(recovery_message.as_bytes())
            .to_bytes(),
    );
    let url = format!(
        "{}/client-profile/attendance/kiosk/pairing/pair/",
        api_base_url
    );
    let response = restricted_http_client()?
        .post(url)
        .json(&json!({
            "pairing_code": pairing_code,
            "device_name": device_name,
            "public_signing_key": public_signing_key,
            "platform": std::env::consts::OS,
            "app_version": app_version,
            "client_attempt_id": client_attempt_id,
            "proof_signature": proof_signature,
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() != StatusCode::CREATED {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| "Pairing failed".to_string()));
    }
    let paired: PairResponse = response.json().await.map_err(|error| error.to_string())?;
    keyring_entry("device-token")?
        .set_password(&paired.device_token)
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT OR REPLACE INTO device_config
             (singleton, installation_id, pharmacy_id, pharmacy_name, api_base_url, app_version)
             VALUES (1, ?1, ?2, ?3, ?4, ?5)",
            params![
                paired.installation_id,
                paired.pharmacy_id,
                paired.pharmacy_name,
                api_base_url,
                app_version,
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO dashboard_guard(singleton, pin_hash, failed_attempts, locked_until)
             VALUES (1, ?1, 0, NULL)",
            [dashboard_hash],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM local_state WHERE key IN ('pairing_code_pending', 'pairing_attempt_id')",
            [],
        )
        .map_err(|error| error.to_string())?;
    refresh_device_authorization(
        &connection,
        &paired.server_time,
        paired.max_offline_hours,
    )?;
    device_identity_from(&connection)
}

fn trusted_time_estimate(
    connection: &Connection,
    runtime: &RuntimeState,
) -> Result<Option<String>, String> {
    let anchor: Option<(String, String, i64)> = connection
        .query_row(
            "SELECT server_utc, boot_session_id, monotonic_elapsed_ms FROM clock_anchor WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((server_utc, boot_id, anchor_elapsed)) = anchor else {
        return Ok(None);
    };
    if boot_id != runtime.boot_session_id {
        return Ok(None);
    }
    let parsed = DateTime::parse_from_rfc3339(&server_utc)
        .map_err(|error| error.to_string())?
        .with_timezone(&Utc);
    let current_elapsed = runtime.boot_started.elapsed().as_millis() as i64;
    Ok(Some(
        (parsed + ChronoDuration::milliseconds(current_elapsed - anchor_elapsed)).to_rfc3339(),
    ))
}

fn anchor_is_fresh(connection: &Connection, runtime: &RuntimeState) -> Result<bool, String> {
    let anchor: Option<(String, i64)> = connection
        .query_row(
            "SELECT boot_session_id, monotonic_elapsed_ms FROM clock_anchor WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(anchor.is_some_and(|(boot_id, elapsed)| {
        boot_id == runtime.boot_session_id
            && runtime.boot_started.elapsed().as_millis() as i64 - elapsed
                < ChronoDuration::minutes(15).num_milliseconds()
    }))
}

fn record_attendance_internal(
    app: &AppHandle,
    runtime: &RuntimeState,
    employee_id: i64,
    shift_id: Option<i64>,
    event_type: String,
    local_request_id: String,
) -> Result<LocalEventReceipt, String> {
    if !["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"].contains(&event_type.as_str()) {
        return Err("Unsupported attendance event type".to_string());
    }
    let worker_state = match event_type.as_str() {
        "CLOCK_IN" => Some((true, false)),
        "CLOCK_OUT" => Some((false, false)),
        "BREAK_START" => Some((true, true)),
        "BREAK_END" => Some((true, false)),
        _ => None,
    };
    let mut connection = open_database(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let installation_id: String = transaction
        .query_row(
            "SELECT installation_id FROM device_config WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let prepared: Option<String> = transaction
        .query_row(
            "SELECT requested_action FROM capture_request WHERE request_id = ?1",
            [&local_request_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some(prepared_action) = prepared else {
        return Err("Attendance request was not prepared by this kiosk".to_string());
    };
    if prepared_action != event_type {
        return Err(
            "Local request identity conflicts with a different attendance action".to_string(),
        );
    }
    if let Some((event_id, sequence, payload_json, event_hash, sync_status, captured_at)) =
        transaction
            .query_row(
                "SELECT event_id, device_seq, payload_json, event_hash, sync_status, created_at
             FROM attendance_event WHERE local_request_id = ?1",
                [&local_request_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| error.to_string())?
    {
        let original: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        if original.get("employee_id").and_then(Value::as_i64) != Some(employee_id)
            || original.get("event_type").and_then(Value::as_str) != Some(event_type.as_str())
        {
            return Err(
                "Local request identity conflicts with a different attendance action".to_string(),
            );
        }
        return Ok(LocalEventReceipt {
            event_id,
            device_seq: sequence,
            event_hash,
            queued: sync_status == "PENDING",
            captured_at,
        });
    }
    let sequence: i64 = config_value(&transaction, "device_sequence")?
        .unwrap_or_else(|| "0".to_string())
        .parse::<i64>()
        .map_err(|error| error.to_string())?
        + 1;
    let previous_hash = config_value(&transaction, "last_event_hash")?.unwrap_or_default();
    let monotonic_elapsed_ms = runtime.boot_started.elapsed().as_millis() as i64;
    let payload = json!({
        "protocol_version": PROTOCOL_VERSION,
        "event_id": Uuid::new_v4().to_string(),
        "device_id": installation_id,
        "device_seq": sequence,
        "employee_id": employee_id,
        "shift_id": shift_id,
        "event_type": event_type,
        "device_timestamp": Utc::now().to_rfc3339(),
        "trusted_time_estimate": trusted_time_estimate(&transaction, runtime)?,
        "monotonic_elapsed_ms": monotonic_elapsed_ms,
        "boot_session_id": runtime.boot_session_id.clone(),
        "previous_event_hash": previous_hash,
    });
    let canonical = canonical_json(payload.clone())?;
    let event_hash = hex::encode(Sha256::digest(canonical.as_bytes()));
    let signature = BASE64.encode(
        signing_key(&transaction)?
            .sign(event_hash.as_bytes())
            .to_bytes(),
    );
    let event_id = payload["event_id"].as_str().unwrap_or_default().to_string();
    let captured_at = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO attendance_event
             (event_id, local_request_id, device_seq, payload_json, event_hash, signature, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                event_id,
                local_request_id,
                sequence,
                canonical,
                event_hash,
                signature,
                captured_at
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE capture_request SET status = 'COMMITTED', employee_id = ?1,
             event_id = ?2, completed_at = ?3 WHERE request_id = ?4 AND status = 'PREPARED'",
            params![
                employee_id,
                event_id,
                Utc::now().to_rfc3339(),
                local_request_id
            ],
        )
        .map_err(|error| error.to_string())?;
    set_config_value(&transaction, "device_sequence", &sequence.to_string())?;
    set_config_value(&transaction, "last_event_hash", &event_hash)?;
    if let Some((is_clocked_in, is_on_break)) = worker_state {
        transaction
            .execute(
                "INSERT INTO worker_local_state(employee_id, is_clocked_in, is_on_break, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(employee_id) DO UPDATE SET
                    is_clocked_in = excluded.is_clocked_in,
                    is_on_break = excluded.is_on_break,
                    updated_at = excluded.updated_at",
                params![
                    employee_id,
                    is_clocked_in,
                    is_on_break,
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(LocalEventReceipt {
        event_id,
        device_seq: sequence,
        event_hash,
        queued: true,
        captured_at,
    })
}

fn project_worker_state_with_unresolved_local_events(
    connection: &Connection,
    employee_id: i64,
    mut is_clocked_in: bool,
    mut is_on_break: bool,
) -> Result<(bool, bool), String> {
    let mut statement = connection
        .prepare(
            "SELECT payload_json FROM attendance_event
             WHERE sync_status IN ('PENDING', 'RECEIVED') ORDER BY device_seq",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    for row in rows {
        let payload: Value = serde_json::from_str(&row.map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        if payload.get("employee_id").and_then(Value::as_i64) != Some(employee_id) {
            continue;
        }
        match payload.get("event_type").and_then(Value::as_str) {
            Some("CLOCK_IN") => {
                is_clocked_in = true;
                is_on_break = false;
            }
            Some("CLOCK_OUT") => {
                is_clocked_in = false;
                is_on_break = false;
            }
            Some("BREAK_START") if is_clocked_in => {
                is_on_break = true;
            }
            Some("BREAK_END") => {
                is_on_break = false;
            }
            _ => {}
        }
    }
    Ok((is_clocked_in, is_on_break))
}

fn store_worker_credential(
    app: &AppHandle,
    employee_id: i64,
    identifier: String,
    display_name: String,
    pin: String,
    is_clocked_in: bool,
    is_on_break: bool,
    server_verified_at: String,
    offline_valid_until: String,
    credential_generation: String,
) -> Result<(), String> {
    if identifier.trim().is_empty() || pin.len() < 4 {
        return Err("A worker identifier and complete PIN are required".to_string());
    }
    DateTime::parse_from_rfc3339(&server_verified_at)
        .map_err(|_| "Enrollment verified_at is invalid".to_string())?;
    DateTime::parse_from_rfc3339(&offline_valid_until)
        .map_err(|_| "Enrollment offline_valid_until is invalid".to_string())?;
    let connection = open_database(app)?;
    let may_initialize = !table_has_rows(&connection, "worker_credential")?;
    let pepper = BASE64.encode(load_or_initialize_secret(
        "worker-pin-pepper",
        32,
        may_initialize,
    )?);
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(format!("{pin}{pepper}").as_bytes(), &salt)
        .map_err(|error| error.to_string())?
        .to_string();
    connection
        .execute(
            "INSERT OR REPLACE INTO worker_credential
             (employee_id, identifier, display_name, pin_hash, failed_attempts, locked_until, enrolled_at,
              server_verified_at, offline_valid_until, credential_generation)
             VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, ?6, ?7, ?8)",
            params![
                employee_id,
                identifier.trim().to_lowercase(),
                display_name,
                hash,
                Utc::now().to_rfc3339(),
                server_verified_at,
                offline_valid_until,
                credential_generation,
            ],
        )
        .map_err(|error| error.to_string())?;
    let projected = project_worker_state_with_unresolved_local_events(
        &connection,
        employee_id,
        is_clocked_in,
        is_on_break,
    )?;
    connection
        .execute(
            "INSERT INTO worker_local_state(employee_id, is_clocked_in, is_on_break, needs_reconciliation, updated_at)
             VALUES (?1, ?2, ?3, 0, ?4)
             ON CONFLICT(employee_id) DO UPDATE SET
                is_clocked_in = excluded.is_clocked_in,
                is_on_break = excluded.is_on_break,
                needs_reconciliation = 0,
                updated_at = excluded.updated_at",
            params![employee_id, projected.0, projected.1, Utc::now().to_rfc3339()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn enrol_worker_from_server(
    app: &AppHandle,
    identifier: &str,
    pin: &str,
) -> Result<EnrollmentResponse, String> {
    let connection = open_database(app)?;
    let (api_base_url, expected_pharmacy_id): (String, i64) = connection
        .query_row(
            "SELECT api_base_url, pharmacy_id FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let token = keyring_entry("device-token")?
        .get_password()
        .map_err(|error| format!("Device credential is unavailable: {error}"))?;
    let response = restricted_http_client()?
        .post(format!(
            "{}/client-profile/attendance/kiosk/workers/enrol/",
            api_base_url.trim_end_matches('/')
        ))
        .header("X-Device-Token", token)
        .json(&json!({ "identifier": identifier, "pin": pin }))
        .send()
        .await
        .map_err(|error| format!("Online enrollment is unavailable: {error}"))?;
    if response.status() == StatusCode::UNAUTHORIZED {
        mark_device_revoked(&connection)?;
        return Err("KIOSK_REVOKED: This kiosk registration has been revoked.".to_string());
    }
    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| "Worker enrollment failed".to_string()));
    }
    let enrollment: EnrollmentResponse =
        response.json().await.map_err(|error| error.to_string())?;
    if enrollment.pharmacy_id != expected_pharmacy_id {
        return Err("Worker enrollment response belongs to a different pharmacy".to_string());
    }
    refresh_device_authorization_until(&connection, &enrollment.offline_valid_until)?;
    Ok(enrollment)
}

fn record_offline_pin_attendance(
    app: &AppHandle,
    runtime: &RuntimeState,
    identifier: String,
    pin: String,
    requested_action: String,
    local_request_id: String,
) -> Result<OfflinePinReceipt, String> {
    if !["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"].contains(&requested_action.as_str()) {
        return Err("Choose an attendance action before confirming".to_string());
    }
    let connection = open_database(app)?;
    ensure_device_offline_authorized(&connection)?;
    let credential: (i64, String, String, i64, Option<String>, Option<String>) = connection
        .query_row(
            "SELECT employee_id, display_name, pin_hash, failed_attempts, locked_until, offline_valid_until
             FROM worker_credential WHERE identifier = ?1",
            [identifier.trim().to_lowercase()],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .map_err(|_| "Worker is not enrolled for offline use on this kiosk".to_string())?;
    if let Some(locked_until) = credential.4 {
        let locked =
            DateTime::parse_from_rfc3339(&locked_until).map_err(|error| error.to_string())?;
        if locked > Utc::now() {
            return Err("Worker PIN is temporarily locked on this kiosk".to_string());
        }
    }
    let pepper = BASE64.encode(load_or_initialize_secret("worker-pin-pepper", 32, false)?);
    let parsed = PasswordHash::new(&credential.2).map_err(|error| error.to_string())?;
    let valid = Argon2::default()
        .verify_password(format!("{pin}{pepper}").as_bytes(), &parsed)
        .is_ok();
    if !valid {
        let attempts = credential.3 + 1;
        let locked_until = if attempts >= 5 {
            Some((Utc::now() + ChronoDuration::minutes(15)).to_rfc3339())
        } else {
            None
        };
        connection
            .execute(
                "UPDATE worker_credential SET failed_attempts = ?1, locked_until = ?2 WHERE employee_id = ?3",
                params![attempts, locked_until, credential.0],
            )
            .map_err(|error| error.to_string())?;
        return Err("Invalid worker PIN".to_string());
    }
    connection
        .execute(
            "UPDATE worker_credential SET failed_attempts = 0, locked_until = NULL WHERE employee_id = ?1",
            [credential.0],
        )
        .map_err(|error| error.to_string())?;
    let request_binding: Option<(String, String)> = connection
        .query_row(
            "SELECT identifier_hash, requested_action FROM capture_request WHERE request_id = ?1",
            [&local_request_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if request_binding
        != Some((
            capture_identifier_hash(&identifier),
            requested_action.clone(),
        ))
    {
        return Err(
            "Local request identity conflicts with a different worker or action".to_string(),
        );
    }
    if let Some((
        event_id,
        sequence,
        event_hash,
        sync_status,
        captured_at,
        original_employee,
        original_action,
    )) = connection
        .query_row(
            "SELECT e.event_id, e.device_seq, e.event_hash, e.sync_status, e.created_at,
                        r.employee_id, r.requested_action
                 FROM capture_request r JOIN attendance_event e ON e.event_id = r.event_id
                 WHERE r.request_id = ?1 AND r.status IN ('COMMITTED', 'RECEIPT_CONFIRMED')",
            [&local_request_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
    {
        if original_employee != credential.0 || original_action != requested_action {
            return Err(
                "Local request identity conflicts with a different attendance action".to_string(),
            );
        }
        return Ok(OfflinePinReceipt {
            action: match requested_action.as_str() {
                "CLOCK_IN" => "CLOCKED_IN",
                "CLOCK_OUT" => "CLOCKED_OUT",
                "BREAK_START" => "BREAK_START",
                "BREAK_END" => "BREAK_END",
                _ => unreachable!(),
            }
            .to_string(),
            worker_id: credential.0,
            worker_name: credential.1,
            event: LocalEventReceipt {
                event_id,
                device_seq: sequence,
                event_hash,
                queued: sync_status == "PENDING",
                captured_at,
            },
            recovered: true,
        });
    }
    let offline_valid_until = credential.5.as_deref().ok_or_else(||
        "Offline worker authorization expired; reconnect to verify this worker before recording attendance".to_string()
    )?;
    let valid_until = DateTime::parse_from_rfc3339(offline_valid_until)
        .map_err(|_| "Stored offline worker authorization is invalid".to_string())?
        .with_timezone(&Utc);
    if valid_until <= Utc::now() {
        return Err("Offline worker authorization expired; reconnect to verify this worker before recording attendance".to_string());
    }
    let needs_reconciliation: bool = connection
        .query_row(
            "SELECT needs_reconciliation FROM worker_local_state WHERE employee_id = ?1",
            [credential.0],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(false);
    if needs_reconciliation {
        return Err(
            "Local attendance state requires online reconciliation before another action"
                .to_string(),
        );
    }
    let local_state: (bool, bool) = connection
        .query_row(
            "SELECT is_clocked_in, is_on_break FROM worker_local_state WHERE employee_id = ?1",
            [credential.0],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or((false, false));
    if requested_action == "CLOCK_IN" && local_state.0 {
        return Err("This kiosk already has you clocked in; choose Clock Out".to_string());
    }
    if requested_action == "CLOCK_OUT" && !local_state.0 {
        return Err("This kiosk does not have an active local session; choose Clock In or reconnect for reconciliation".to_string());
    }
    if requested_action == "BREAK_START" && (!local_state.0 || local_state.1) {
        return Err("A break can start only while clocked in and not already on break".to_string());
    }
    if requested_action == "BREAK_END" && !local_state.1 {
        return Err("This kiosk does not have an active break to end".to_string());
    }
    let event = record_attendance_internal(
        app,
        runtime,
        credential.0,
        None,
        requested_action.clone(),
        local_request_id,
    )?;
    Ok(OfflinePinReceipt {
        action: match requested_action.as_str() {
            "CLOCK_IN" => "CLOCKED_IN",
            "CLOCK_OUT" => "CLOCKED_OUT",
            "BREAK_START" => "BREAK_START",
            "BREAK_END" => "BREAK_END",
            _ => unreachable!(),
        }
        .to_string(),
        worker_id: credential.0,
        worker_name: credential.1,
        event,
        recovered: false,
    })
}

#[tauri::command]
async fn capture_pin_attendance(
    app: AppHandle,
    runtime: State<'_, RuntimeState>,
    identifier: String,
    pin: String,
    requested_action: String,
    local_request_id: String,
) -> Result<OfflinePinReceipt, String> {
    Uuid::parse_str(&local_request_id)
        .map_err(|_| "Local attendance request identity is invalid".to_string())?;
    let first_attempt = {
        let _guard = runtime.capture_lock.lock().await;
        record_offline_pin_attendance(
            &app,
            &runtime,
            identifier.clone(),
            pin.clone(),
            requested_action.clone(),
            local_request_id.clone(),
        )
    };
    match first_attempt {
        Ok(receipt) => Ok(receipt),
        Err(error)
            if error.contains("not enrolled for offline use")
                || error == "Invalid worker PIN"
                || error.contains("Offline worker authorization expired")
                || error.contains("Kiosk authorization expired")
                || error.contains("requires online reconciliation") =>
        {
            let enrollment = enrol_worker_from_server(&app, &identifier, &pin).await?;
            let _guard = runtime.capture_lock.lock().await;
            store_worker_credential(
                &app,
                enrollment.worker_id,
                identifier.clone(),
                enrollment.worker_name,
                pin.clone(),
                enrollment.is_clocked_in,
                enrollment.is_on_break,
                enrollment.verified_at,
                enrollment.offline_valid_until,
                enrollment.credential_generation,
            )?;
            record_offline_pin_attendance(
                &app,
                &runtime,
                identifier,
                pin,
                requested_action,
                local_request_id,
            )
        }
        Err(error) => Err(error),
    }
}

fn verify_dashboard_pin_from(connection: &Connection, pin: &str) -> Result<bool, String> {
    let guard: (String, i64, Option<String>) = connection
        .query_row(
            "SELECT pin_hash, failed_attempts, locked_until FROM dashboard_guard WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Dashboard PIN has not been configured".to_string())?;
    if let Some(locked_until) = guard.2 {
        let locked =
            DateTime::parse_from_rfc3339(&locked_until).map_err(|error| error.to_string())?;
        if locked > Utc::now() {
            return Err("Dashboard access is temporarily locked".to_string());
        }
    }
    let pepper = BASE64.encode(load_or_initialize_secret(
        "dashboard-pin-pepper",
        32,
        false,
    )?);
    let parsed = PasswordHash::new(&guard.0).map_err(|error| error.to_string())?;
    let valid = Argon2::default()
        .verify_password(format!("{pin}{pepper}").as_bytes(), &parsed)
        .is_ok();
    if valid {
        connection
            .execute("UPDATE dashboard_guard SET failed_attempts = 0, locked_until = NULL WHERE singleton = 1", [])
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }
    let attempts = guard.1 + 1;
    let locked_until = if attempts >= 5 {
        Some((Utc::now() + ChronoDuration::minutes(15)).to_rfc3339())
    } else {
        None
    };
    connection
        .execute(
            "UPDATE dashboard_guard SET failed_attempts = ?1, locked_until = ?2 WHERE singleton = 1",
            params![attempts, locked_until],
        )
        .map_err(|error| error.to_string())?;
    Ok(false)
}

#[tauri::command]
fn verify_dashboard_pin(app: AppHandle, pin: String) -> Result<bool, String> {
    let connection = open_database(&app)?;
    verify_dashboard_pin_from(&connection, &pin)
}

fn pending_events(connection: &Connection) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(
            "SELECT payload_json, event_hash, signature FROM attendance_event
             WHERE sync_status = 'PENDING' ORDER BY device_seq LIMIT 50",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let payload: String = row.get(0)?;
            let hash: String = row.get(1)?;
            let signature: String = row.get(2)?;
            Ok((payload, hash, signature))
        })
        .map_err(|error| error.to_string())?;
    let mut events = Vec::new();
    for row in rows {
        let (payload, hash, signature) = row.map_err(|error| error.to_string())?;
        let mut value: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
        value["event_hash"] = Value::String(hash);
        value["signature"] = Value::String(signature);
        events.push(value);
    }
    Ok(events)
}

async fn perform_sync(app: &AppHandle, runtime: &RuntimeState) -> Result<SyncResponse, String> {
    let _guard = runtime.sync_lock.lock().await;
    let mut connection = open_database(app)?;
    let config: (String, String, String) = connection
        .query_row(
            "SELECT api_base_url, app_version, installation_id FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let events = pending_events(&connection)?;
    if events.is_empty() {
        if anchor_is_fresh(&connection, runtime)? {
            return Ok(SyncResponse {
                device_id: config.2,
                acknowledged_through: config_value(&connection, "acknowledged_through")?
                    .unwrap_or_else(|| "0".to_string())
                    .parse()
                    .unwrap_or(0),
                server_time: trusted_time_estimate(&connection, runtime)?
                    .unwrap_or_else(|| Utc::now().to_rfc3339()),
                results: vec![],
                max_offline_hours: None,
                device_revoked: false,
            });
        }
        let token = keyring_entry("device-token")?
            .get_password()
            .map_err(|error| error.to_string())?;
        let response = restricted_http_client()?
            .get(format!(
                "{}/client-profile/attendance/kiosk/config/",
                config.0.trim_end_matches('/')
            ))
            .header("X-Device-Token", token)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if response.status() == StatusCode::UNAUTHORIZED {
            mark_device_revoked(&connection)?;
            return Err("KIOSK_REVOKED: This kiosk registration has been revoked.".to_string());
        }
        if !response.status().is_success() {
            return Err(response
                .text()
                .await
                .unwrap_or_else(|_| "Kiosk configuration refresh failed".to_string()));
        }
        let refreshed: ConfigResponse = response.json().await.map_err(|error| error.to_string())?;
        if refreshed.device_id.to_lowercase() != config.2.to_lowercase() {
            return Err("Configuration response belongs to a different kiosk".to_string());
        }
        refresh_device_authorization(&connection, &refreshed.server_time, refreshed.max_offline_hours)?;
        connection
            .execute(
                "INSERT OR REPLACE INTO clock_anchor(singleton, server_utc, boot_session_id, monotonic_elapsed_ms)
                 VALUES (1, ?1, ?2, ?3)",
                params![
                    refreshed.server_time,
                    runtime.boot_session_id,
                    runtime.boot_started.elapsed().as_millis() as i64,
                ],
            )
            .map_err(|error| error.to_string())?;
        return Ok(SyncResponse {
            device_id: config.2,
            acknowledged_through: config_value(&connection, "acknowledged_through")?
                .unwrap_or_else(|| "0".to_string())
                .parse()
                .unwrap_or(0),
            server_time: refreshed.server_time,
            results: vec![],
            max_offline_hours: Some(refreshed.max_offline_hours),
            device_revoked: false,
        });
    }
    let token = keyring_entry("device-token")?
        .get_password()
        .map_err(|error| error.to_string())?;
    let response = restricted_http_client()?
        .post(format!(
            "{}/client-profile/attendance/kiosk/sync/batch/",
            config.0.trim_end_matches('/')
        ))
        .header("X-Device-Token", token)
        .json(&json!({ "events": events, "app_version": config.1 }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() == StatusCode::UNAUTHORIZED {
        mark_device_revoked(&connection)?;
        return Err("KIOSK_REVOKED: This kiosk registration has been revoked.".to_string());
    }
    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| "Sync failed".to_string()));
    }
    let receipt: SyncResponse = response.json().await.map_err(|error| error.to_string())?;
    if receipt.device_id.to_lowercase() != config.2.to_lowercase() {
        return Err("Sync receipt belongs to a different kiosk installation".to_string());
    }
    let highest_local_sequence: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(device_seq), 0) FROM attendance_event",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if receipt.acknowledged_through > highest_local_sequence {
        return Err("Sync receipt acknowledges unknown local evidence".to_string());
    }
    if receipt.device_revoked {
        mark_device_revoked(&connection)?;
    } else if let Some(max_offline_hours) = receipt.max_offline_hours {
        refresh_device_authorization(&connection, &receipt.server_time, max_offline_hours)?;
    }

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for result in &receipt.results {
        let sequence = result
            .get("device_seq")
            .and_then(Value::as_i64)
            .ok_or_else(|| "Sync result is missing device_seq".to_string())?;
        let event_id = result
            .get("event_id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sync result is missing event_id".to_string())?;
        let event_hash = result
            .get("event_hash")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sync result is missing event_hash".to_string())?;
        let outcome = result
            .get("result")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sync result is missing result".to_string())?;
        if !["accepted", "already_received", "needs_review", "rejected"].contains(&outcome) {
            return Err("Sync result contains an unsupported outcome".to_string());
        }
        let local: (String, String, String) = transaction
            .query_row(
                "SELECT event_id, event_hash, payload_json FROM attendance_event WHERE device_seq = ?1",
                [sequence],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|_| "Sync result references unknown local evidence".to_string())?;
        if local.0 != event_id || local.1 != event_hash {
            return Err("Sync result does not match submitted local evidence".to_string());
        }
        let delivery_status = if outcome == "rejected" {
            "PERMANENT_REJECTION"
        } else {
            "RECEIVED"
        };
        transaction
            .execute(
                "UPDATE attendance_event SET sync_status = ?1 WHERE device_seq = ?2",
                params![delivery_status, sequence],
            )
            .map_err(|error| error.to_string())?;
        if outcome == "rejected" {
            if let Ok(payload) = serde_json::from_str::<Value>(&local.2) {
                if let Some(employee_id) = payload.get("employee_id").and_then(Value::as_i64) {
                    transaction
                        .execute(
                            "UPDATE worker_local_state SET needs_reconciliation = 1 WHERE employee_id = ?1",
                            [employee_id],
                        )
                        .map_err(|error| error.to_string())?;
                }
            }
        }
        transaction
            .execute(
                "INSERT INTO sync_receipt(device_seq, event_id, result_json, acknowledged_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(device_seq) DO UPDATE SET
                    event_id = excluded.event_id,
                    result_json = excluded.result_json,
                    acknowledged_at = excluded.acknowledged_at",
                params![
                    sequence,
                    event_id,
                    result.to_string(),
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    set_config_value(
        &transaction,
        "acknowledged_through",
        &receipt.acknowledged_through.to_string(),
    )?;
    transaction
        .execute(
            "INSERT OR REPLACE INTO clock_anchor(singleton, server_utc, boot_session_id, monotonic_elapsed_ms)
             VALUES (1, ?1, ?2, ?3)",
            params![
                receipt.server_time,
                runtime.boot_session_id,
                runtime.boot_started.elapsed().as_millis() as i64,
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(receipt)
}

#[tauri::command]
async fn sync_now(
    app: AppHandle,
    runtime: State<'_, RuntimeState>,
) -> Result<SyncResponse, String> {
    perform_sync(&app, &runtime).await
}

#[tauri::command]
fn pending_count(app: AppHandle) -> Result<i64, String> {
    pending_event_count(&open_database(&app)?)
}

#[tauri::command]
async fn disconnect_device(
    app: AppHandle,
    runtime: State<'_, RuntimeState>,
    dashboard_pin: String,
) -> Result<DeviceIdentity, String> {
    let mut connection = open_database(&app)?;
    if !verify_dashboard_pin_from(&connection, &dashboard_pin)? {
        return Err("Dashboard PIN is incorrect".to_string());
    }

    if pending_event_count(&connection)? > 0 {
        drop(connection);
        perform_sync(&app, &runtime).await.map_err(|error| {
            format!("Cannot disconnect while attendance is waiting to sync: {error}")
        })?;
        connection = open_database(&app)?;
    }
    let remaining = pending_event_count(&connection)?;
    if remaining > 0 {
        return Err(format!(
            "Cannot disconnect: {remaining} attendance event(s) are still waiting to sync."
        ));
    }

    let (api_base_url, installation_id): (String, String) = connection
        .query_row(
            "SELECT api_base_url, installation_id FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let token = keyring_entry("device-token")?
        .get_password()
        .map_err(|error| format!("Device credential is unavailable: {error}"))?;
    let issued_at = Utc::now().to_rfc3339();
    let message = format!(
        "chemisttasker:kiosk-disconnect:v1|{}|{}",
        installation_id, issued_at
    );
    let proof_signature = BASE64.encode(
        signing_key(&connection)?
            .sign(message.as_bytes())
            .to_bytes(),
    );

    let response = restricted_http_client()?
        .post(format!(
            "{}/client-profile/attendance/kiosk/revoke-self/",
            api_base_url.trim_end_matches('/')
        ))
        .header("X-Device-Token", token)
        .json(&json!({
            "issued_at": issued_at,
            "proof_signature": proof_signature,
        }))
        .send()
        .await
        .map_err(|error| format!(
            "Could not contact ChemistTasker to revoke this kiosk. Nothing was removed locally: {error}"
        ))?;

    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| "Kiosk revocation failed; local data was preserved.".to_string()));
    }

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch(
            "DELETE FROM attendance_event;
             DELETE FROM sync_receipt;
             DELETE FROM clock_anchor;
             DELETE FROM worker_credential;
             DELETE FROM worker_local_state;
             DELETE FROM capture_request;
             DELETE FROM dashboard_guard;
             DELETE FROM device_config;
             DELETE FROM local_state;",
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;

    for account in [
        "device-token",
        "device-signing-key",
        "worker-pin-pepper",
        "dashboard-pin-pepper",
    ] {
        delete_keyring_credential(account)?;
    }
    device_identity_from(&connection)
}

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState {
            boot_session_id: Uuid::new_v4().to_string(),
            boot_started: Instant::now(),
            sync_lock: tokio::sync::Mutex::new(()),
            capture_lock: tokio::sync::Mutex::new(()),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut attempt = 0_usize;
                loop {
                    let state = handle.state::<RuntimeState>();
                    let successful = perform_sync(&handle, &state).await.is_ok();
                    attempt = if successful { 0 } else { (attempt + 1).min(5) };
                    let seconds = [2_u64, 5, 11, 22, 47, 90][attempt];
                    let mut random = [0_u8; 1];
                    OsRng.fill_bytes(&mut random);
                    let jitter_ms = (random[0] as u64 * 800) / 255;
                    tokio::time::sleep(Duration::from_millis(seconds * 1000 + jitter_ms)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            kiosk_status,
            fetch_online_qr,
            pair_device,
            prepare_capture_request,
            capture_pin_attendance,
            confirm_capture_receipt,
            verify_dashboard_pin,
            disconnect_device,
            sync_now,
            pending_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ChemistTasker Kiosk");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_authorization_lease_blocks_expired_and_revoked_kiosks() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE local_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
            )
            .unwrap();

        refresh_device_authorization(&connection, &Utc::now().to_rfc3339(), 1).unwrap();
        assert!(ensure_device_offline_authorized(&connection).is_ok());

        set_config_value(
            &connection,
            "device_authorized_until",
            &(Utc::now() - ChronoDuration::minutes(1)).to_rfc3339(),
        )
        .unwrap();
        assert!(ensure_device_offline_authorized(&connection)
            .unwrap_err()
            .contains("authorization expired"));

        refresh_device_authorization(&connection, &Utc::now().to_rfc3339(), 1).unwrap();
        mark_device_revoked(&connection).unwrap();
        assert!(ensure_device_offline_authorized(&connection)
            .unwrap_err()
            .contains("KIOSK_REVOKED"));
    }

    #[test]
    fn preparation_resumes_only_unresolved_requests_for_all_actions() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(
            "CREATE TABLE capture_request (
               request_id TEXT PRIMARY KEY, identifier_hash TEXT, requested_action TEXT,
               status TEXT DEFAULT 'PREPARED', employee_id INTEGER, event_id TEXT, created_at TEXT);"
        ).unwrap();
        for action in ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"] {
            let first =
                prepare_capture_request_from(&connection, "worker@example.test", action).unwrap();
            assert_eq!(
                prepare_capture_request_from(&connection, "worker@example.test", action).unwrap(),
                first
            );
            connection
                .execute(
                    "UPDATE capture_request SET status='COMMITTED' WHERE request_id=?1",
                    [&first],
                )
                .unwrap();
            assert_eq!(
                prepare_capture_request_from(&connection, "worker@example.test", action).unwrap(),
                first
            );
            connection
                .execute(
                    "UPDATE capture_request SET status='RECEIPT_CONFIRMED' WHERE request_id=?1",
                    [&first],
                )
                .unwrap();
            let second =
                prepare_capture_request_from(&connection, "worker@example.test", action).unwrap();
            assert_ne!(second, first, "confirmed {action} must not be reused");
        }
    }

    #[test]
    fn local_schema_migration_preserves_duplicate_legacy_requests() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE capture_request (
                    request_id TEXT PRIMARY KEY, identifier_hash TEXT NOT NULL,
                    requested_action TEXT NOT NULL, status TEXT NOT NULL,
                    employee_id INTEGER, event_id TEXT, created_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE TABLE local_schema_migration (
                    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
                );
                INSERT INTO capture_request VALUES
                    ('one', 'worker', 'CLOCK_IN', 'COMMITTED', 1, 'event-one', '2026-09-15T00:00:00Z', NULL),
                    ('two', 'worker', 'CLOCK_IN', 'COMMITTED', 1, 'event-two', '2026-09-16T00:00:00Z', NULL),
                    ('three', 'worker', 'CLOCK_OUT', 'PREPARED', NULL, NULL, '2026-09-16T00:00:00Z', NULL);",
            )
            .unwrap();

        migrate_local_schema(&mut connection).unwrap();
        let legacy_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM capture_request WHERE status = 'LEGACY_COMMITTED'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy_count, 2);
        let index_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'capture_request_pending_lookup'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index_exists, 1);
    }
}

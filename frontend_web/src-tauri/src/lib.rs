use std::{
    collections::BTreeMap,
    fs,
    time::{Duration, Instant},
};

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use ed25519_dalek::{Signer, SigningKey};
use keyring::Entry;
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

struct RuntimeState {
    boot_session_id: String,
    boot_started: Instant,
    sync_lock: tokio::sync::Mutex<()>,
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
}

#[derive(Serialize)]
struct OfflinePinReceipt {
    action: String,
    worker_id: i64,
    worker_name: String,
    event: LocalEventReceipt,
}

#[derive(Deserialize)]
struct PairResponse {
    installation_id: String,
    device_token: String,
    pharmacy_id: i64,
    pharmacy_name: String,
}

#[derive(Deserialize, Serialize)]
struct SyncResponse {
    acknowledged_through: i64,
    server_time: String,
    results: Vec<Value>,
}

fn keyring_entry(account: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, account).map_err(|error| error.to_string())
}

fn secret_or_create(account: &str, bytes: usize) -> Result<Vec<u8>, String> {
    let entry = keyring_entry(account)?;
    if let Ok(encoded) = entry.get_password() {
        return BASE64.decode(encoded).map_err(|error| error.to_string());
    }
    let mut secret = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut secret);
    entry
        .set_password(&BASE64.encode(&secret))
        .map_err(|error| error.to_string())?;
    Ok(secret)
}

fn signing_key() -> Result<SigningKey, String> {
    let bytes = secret_or_create("device-signing-key", 32)?;
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
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let database_key = secret_or_create("database-key", 32)?;
    let connection =
        Connection::open(directory.join("kiosk.db")).map_err(|error| error.to_string())?;
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{}'\"; PRAGMA cipher_memory_security = ON; PRAGMA foreign_keys = ON;",
            hex::encode(database_key)
        ))
        .map_err(|error| error.to_string())?;
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
                device_seq INTEGER NOT NULL UNIQUE,
                payload_json TEXT NOT NULL,
                event_hash TEXT NOT NULL,
                signature TEXT NOT NULL,
                sync_status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sync_receipt (
                device_seq INTEGER PRIMARY KEY,
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
                updated_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
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

fn device_identity_from(connection: &Connection) -> Result<DeviceIdentity, String> {
    let config: Option<(String, i64, String)> = connection
        .query_row(
            "SELECT installation_id, pharmacy_id, pharmacy_name FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let public_key = BASE64.encode(signing_key()?.verifying_key().as_bytes());
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
async fn pair_device(
    app: AppHandle,
    pairing_code: String,
    device_name: String,
    api_base_url: String,
    app_version: String,
) -> Result<DeviceIdentity, String> {
    let public_signing_key = BASE64.encode(signing_key()?.verifying_key().as_bytes());
    let url = format!(
        "{}/client-profile/attendance/kiosk/pairing/pair/",
        api_base_url.trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({
            "pairing_code": pairing_code,
            "device_name": device_name,
            "public_signing_key": public_signing_key,
            "platform": std::env::consts::OS,
            "app_version": app_version,
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
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT OR REPLACE INTO device_config
             (singleton, installation_id, pharmacy_id, pharmacy_name, api_base_url, app_version)
             VALUES (1, ?1, ?2, ?3, ?4, ?5)",
            params![
                paired.installation_id,
                paired.pharmacy_id,
                paired.pharmacy_name,
                api_base_url.trim_end_matches('/'),
                app_version,
            ],
        )
        .map_err(|error| error.to_string())?;
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

fn record_attendance_internal(
    app: &AppHandle,
    runtime: &RuntimeState,
    employee_id: i64,
    shift_id: Option<i64>,
    event_type: String,
) -> Result<LocalEventReceipt, String> {
    if !["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"].contains(&event_type.as_str()) {
        return Err("Unsupported attendance event type".to_string());
    }
    let worker_clock_state = match event_type.as_str() {
        "CLOCK_IN" => Some(true),
        "CLOCK_OUT" => Some(false),
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
    let signature = BASE64.encode(signing_key()?.sign(event_hash.as_bytes()).to_bytes());
    let event_id = payload["event_id"].as_str().unwrap_or_default().to_string();
    transaction
        .execute(
            "INSERT INTO attendance_event
             (event_id, device_seq, payload_json, event_hash, signature, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                event_id,
                sequence,
                canonical,
                event_hash,
                signature,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(|error| error.to_string())?;
    set_config_value(&transaction, "device_sequence", &sequence.to_string())?;
    set_config_value(&transaction, "last_event_hash", &event_hash)?;
    if let Some(is_clocked_in) = worker_clock_state {
        transaction
            .execute(
                "INSERT INTO worker_local_state(employee_id, is_clocked_in, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(employee_id) DO UPDATE SET
                    is_clocked_in = excluded.is_clocked_in,
                    updated_at = excluded.updated_at",
                params![employee_id, is_clocked_in, Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(LocalEventReceipt {
        event_id,
        device_seq: sequence,
        event_hash,
        queued: true,
    })
}

#[tauri::command]
fn record_attendance(
    app: AppHandle,
    runtime: State<RuntimeState>,
    employee_id: i64,
    shift_id: Option<i64>,
    event_type: String,
) -> Result<LocalEventReceipt, String> {
    record_attendance_internal(&app, &runtime, employee_id, shift_id, event_type)
}

#[tauri::command]
fn enrol_worker_credential(
    app: AppHandle,
    employee_id: i64,
    identifier: String,
    display_name: String,
    pin: String,
) -> Result<(), String> {
    if identifier.trim().is_empty() || pin.len() < 4 {
        return Err("A worker identifier and complete PIN are required".to_string());
    }
    let pepper = BASE64.encode(secret_or_create("worker-pin-pepper", 32)?);
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(format!("{pin}{pepper}").as_bytes(), &salt)
        .map_err(|error| error.to_string())?
        .to_string();
    open_database(&app)?
        .execute(
            "INSERT OR REPLACE INTO worker_credential
             (employee_id, identifier, display_name, pin_hash, failed_attempts, locked_until, enrolled_at)
             VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5)",
            params![
                employee_id,
                identifier.trim().to_lowercase(),
                display_name,
                hash,
                Utc::now().to_rfc3339(),
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn record_offline_pin_attendance(
    app: AppHandle,
    runtime: State<RuntimeState>,
    identifier: String,
    pin: String,
) -> Result<OfflinePinReceipt, String> {
    let connection = open_database(&app)?;
    let credential: (i64, String, String, i64, Option<String>) = connection
        .query_row(
            "SELECT employee_id, display_name, pin_hash, failed_attempts, locked_until
             FROM worker_credential WHERE identifier = ?1",
            [identifier.trim().to_lowercase()],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
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
    let pepper = BASE64.encode(secret_or_create("worker-pin-pepper", 32)?);
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
    let is_clocked_in: bool = connection
        .query_row(
            "SELECT is_clocked_in FROM worker_local_state WHERE employee_id = ?1",
            [credential.0],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(false);
    let action = if is_clocked_in {
        "CLOCK_OUT"
    } else {
        "CLOCK_IN"
    };
    let event = record_attendance_internal(&app, &runtime, credential.0, None, action.to_string())?;
    Ok(OfflinePinReceipt {
        action: format!("CLOCKED_{}", if is_clocked_in { "OUT" } else { "IN" }),
        worker_id: credential.0,
        worker_name: credential.1,
        event,
    })
}

#[tauri::command]
fn generate_offline_challenge(
    app: AppHandle,
    runtime: State<RuntimeState>,
) -> Result<Value, String> {
    let connection = open_database(&app)?;
    let (installation_id, pharmacy_id): (String, i64) = connection
        .query_row(
            "SELECT installation_id, pharmacy_id FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let issued_at = Utc::now();
    let payload = json!({
        "protocol_version": PROTOCOL_VERSION,
        "challenge_id": Uuid::new_v4().to_string(),
        "pharmacy_id": pharmacy_id,
        "device_id": installation_id,
        "issued_at": issued_at.to_rfc3339(),
        "expires_at": (issued_at + ChronoDuration::seconds(60)).to_rfc3339(),
        "nonce": Uuid::new_v4().to_string(),
        "boot_session_id": runtime.boot_session_id.clone(),
    });
    let canonical = canonical_json(payload.clone())?;
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    Ok(json!({
        "payload": payload,
        "challenge_hash": digest,
        "signature": BASE64.encode(signing_key()?.sign(digest.as_bytes()).to_bytes()),
    }))
}

#[tauri::command]
fn set_dashboard_pin(app: AppHandle, pin: String) -> Result<(), String> {
    if pin.len() < 6 || !pin.chars().all(|character| character.is_ascii_digit()) {
        return Err("Dashboard PIN must contain at least six digits".to_string());
    }
    let pepper = BASE64.encode(secret_or_create("dashboard-pin-pepper", 32)?);
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(format!("{pin}{pepper}").as_bytes(), &salt)
        .map_err(|error| error.to_string())?
        .to_string();
    open_database(&app)?
        .execute(
            "INSERT OR REPLACE INTO dashboard_guard(singleton, pin_hash, failed_attempts, locked_until)
             VALUES (1, ?1, 0, NULL)",
            [hash],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn verify_dashboard_pin(app: AppHandle, pin: String) -> Result<bool, String> {
    let connection = open_database(&app)?;
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
    let pepper = BASE64.encode(secret_or_create("dashboard-pin-pepper", 32)?);
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
    let connection = open_database(app)?;
    let config: (String, String) = connection
        .query_row(
            "SELECT api_base_url, app_version FROM device_config WHERE singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This kiosk has not been paired".to_string())?;
    let events = pending_events(&connection)?;
    if events.is_empty() {
        return Ok(SyncResponse {
            acknowledged_through: config_value(&connection, "acknowledged_through")?
                .unwrap_or_else(|| "0".to_string())
                .parse()
                .unwrap_or(0),
            server_time: Utc::now().to_rfc3339(),
            results: vec![],
        });
    }
    let token = keyring_entry("device-token")?
        .get_password()
        .map_err(|error| error.to_string())?;
    let response = reqwest::Client::new()
        .post(format!(
            "{}/client-profile/attendance/kiosk/sync/batch/",
            config.0.trim_end_matches('/')
        ))
        .header("X-Device-Token", token)
        .json(&json!({ "events": events, "app_version": config.1 }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| "Sync failed".to_string()));
    }
    let receipt: SyncResponse = response.json().await.map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE attendance_event SET sync_status = 'SYNCED' WHERE device_seq <= ?1",
            [receipt.acknowledged_through],
        )
        .map_err(|error| error.to_string())?;
    set_config_value(
        &connection,
        "acknowledged_through",
        &receipt.acknowledged_through.to_string(),
    )?;
    connection
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
    open_database(&app)?
        .query_row(
            "SELECT COUNT(*) FROM attendance_event WHERE sync_status = 'PENDING'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState {
            boot_session_id: Uuid::new_v4().to_string(),
            boot_started: Instant::now(),
            sync_lock: tokio::sync::Mutex::new(()),
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
            pair_device,
            record_attendance,
            enrol_worker_credential,
            record_offline_pin_attendance,
            generate_offline_challenge,
            set_dashboard_pin,
            verify_dashboard_pin,
            sync_now,
            pending_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ChemistTasker Kiosk");
}

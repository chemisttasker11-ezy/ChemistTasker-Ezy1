fn main() {
    println!("cargo:rerun-if-env-changed=KIOSK_BUILD_PROFILE");
    if let Ok(profile) = std::env::var("KIOSK_BUILD_PROFILE") {
        println!("cargo:rustc-env=KIOSK_BUILD_PROFILE={profile}");
    }
    tauri_build::build()
}

use std::{
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
};

use std::io::BufRead;

use tauri::{Manager, State};
use tauri_plugin_http::reqwest;
use tauri_plugin_sql::{Migration, MigrationKind};

struct V2RayProcessState(Mutex<Option<Child>>);
struct V2RayTestProcessState(Mutex<Option<Child>>);

#[tauri::command]
fn set_system_proxy(host: String, port: u16) {
    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "mode", "manual"])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.http", "host", ""])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.http", "port", "0"])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.https", "host", ""])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.https", "port", "0"])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.ftp", "host", ""])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.ftp", "port", "0"])
        .status();

    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy.socks", "host", &host])
        .status();

    let _ = Command::new("gsettings")
        .args([
            "set",
            "org.gnome.system.proxy.socks",
            "port",
            &port.to_string(),
        ])
        .status();
}

fn spawn_v2ray(process: &mut Option<Child>, config_path: String) -> String {
    if process.is_some() {
        return "already running".into();
    }

    let command = std::env::current_dir().unwrap().join("/usr/bin/v2ray");

    println!("started");

    match Command::new(command)
        .args(["-config", &config_path])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(mut child) => {
            if let Some(stdout) = child.stdout.take() {
                let mut reader = std::io::BufReader::new(stdout);
                thread::spawn(move || {
                    let mut line = String::new();
                    while reader.read_line(&mut line).unwrap_or(0) > 0 {
                        println!("[v2ray stdout]: {}", line.trim());
                        line.clear();
                    }
                });
            }

            if let Some(stderr) = child.stderr.take() {
                let mut reader = std::io::BufReader::new(stderr);
                thread::spawn(move || {
                    let mut line = String::new();
                    while reader.read_line(&mut line).unwrap_or(0) > 0 {
                        eprintln!("[v2ray stderr]: {}", line.trim());
                        line.clear();
                    }
                });
            }

            *process = Some(child);
            "started".into()
        }
        Err(e) => {
            eprintln!("error starting v2ray: {}", e);
            "failed".into()
        }
    }
}

fn kill_v2ray(process: &mut Option<Child>) -> String {
    if let Some(child) = process.as_mut() {
        let _ = child.kill();
        *process = None;
        println!("stopped");
        "stopped".into()
    } else {
        "not running".into()
    }
}

#[tauri::command]
fn start_v2ray(
    app: tauri::AppHandle,
    state: State<V2RayProcessState>,
    config_path: String,
) -> String {
    let mut process = state.0.lock().unwrap();

    let path = app
        .path()
        .app_config_dir()
        .unwrap()
        .join(config_path)
        .to_string_lossy()
        .to_string();
    spawn_v2ray(&mut *process, path)
}

#[tauri::command]
fn stop_v2ray(state: State<V2RayProcessState>) -> String {
    let mut process = state.0.lock().unwrap();
    kill_v2ray(&mut *process)
}

#[tauri::command]
fn start_test_v2ray(
    app: tauri::AppHandle,
    state: State<V2RayTestProcessState>,
    config_path: String,
) -> String {
    let mut process = state.0.lock().unwrap();
    let path = app
        .path()
        .app_config_dir()
        .unwrap()
        .join(config_path)
        .to_string_lossy()
        .to_string();
    spawn_v2ray(&mut *process, path)
}

#[tauri::command]
fn stop_test_v2ray(state: State<V2RayTestProcessState>) -> String {
    let mut process = state.0.lock().unwrap();
    kill_v2ray(&mut *process)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn measure_delay() -> i64 {
    let proxy = reqwest::Proxy::https("http://127.0.0.1:1081").expect("Invalid proxy URL");

    let client = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("Failed to build client");

    let start = std::time::Instant::now();

    let result = client
        .get("https://www.google.com/generate_204")
        .send()
        .await;

    match result {
        Ok(resp) => {
            println!("status: {}", resp.status());
            start.elapsed().as_millis() as i64
        }
        Err(e) => {
            println!("error: {}", e);
            -1
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_profile_tables",
            sql: "
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                uri TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_urls_tables",
            sql: "
            CREATE TABLE IF NOT EXISTS urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER,
                delay INTEGER,
                name TEXT,
                uri TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            ",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(V2RayProcessState(Mutex::new(None)))
        .manage(V2RayTestProcessState(Mutex::new(None)))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            measure_delay,
            start_v2ray,
            stop_v2ray,
            start_test_v2ray,
            stop_test_v2ray,
            set_system_proxy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

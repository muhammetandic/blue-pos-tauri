mod checkout;

use tauri_plugin_sql::{Builder, Migration, MigrationKind};

/// Uygulama açılışında çalıştırılan şemalar.
/// `Migration` tipi `Clone` uygulamadığı için vektör doğrudan burada kurulur.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_tables",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations("sqlite:pos.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![checkout::checkout])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

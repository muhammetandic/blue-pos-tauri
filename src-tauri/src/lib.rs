mod checkout;
mod products;

#[cfg(test)]
mod testing;

use sqlx::SqlitePool;
use tauri_plugin_sql::{Builder, DbInstances, DbPool, Migration, MigrationKind};

/// `tauri.conf.json` içindeki `plugins.sql.preload` değeriyle birebir aynı olmalıdır.
pub(crate) const DB_URL: &str = "sqlite:pos.db";

/// Eklentinin peşin tanımladığı havuzu alır (tek bağlantı havuzu).
pub(crate) async fn pool_of(instances: &DbInstances) -> Result<SqlitePool, String> {
    let map = instances.0.read().await;
    match map.get(DB_URL) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("Veritabanı hazır değil".to_string()),
    }
}

/// Uygulama açılışında çalıştırılan şemalar.
/// `Migration` tipi `Clone` uygulamadığı için vektör doğrudan burada kurulur.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "separate_product_prices",
            sql: include_str!("../migrations/0002_prices.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            checkout::checkout,
            products::save_product
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

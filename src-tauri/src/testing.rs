//! Ortak test yardımcıları (yalnızca test derlemesinde).

use sqlx::SqlitePool;

pub const MIGRATION_V1: &str = include_str!("../migrations/0001_init.sql");
pub const MIGRATION_V2: &str = include_str!("../migrations/0002_prices.sql");

/// Bellekte tek bağlantılı havuz; tüm migration'lar uygulanmış olarak döner.
/// `sqlite::memory:` her bağlantıya ayrı veritabanı verdiği için bağlantı
/// sayısı 1'e sabitlenir.
pub async fn test_pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("havuz açılamadı");

    for migration in [MIGRATION_V1, MIGRATION_V2] {
        sqlx::raw_sql(migration)
            .execute(&pool)
            .await
            .expect("migration uygulanamadı");
    }

    pool
}

/// Ürün + ilk fiyat kaydı ekler; `(product_id, price_id)` döner.
pub async fn insert_product(
    pool: &SqlitePool,
    barcode: &str,
    name: &str,
    sell_cents: i64,
    stock: i64,
) -> (i64, i64) {
    let product_id = sqlx::query(
        "INSERT INTO products (barcode, name, name_search, stock)
         VALUES (?, ?, ?, ?)",
    )
    .bind(barcode)
    .bind(name)
    .bind(name)
    .bind(stock)
    .execute(pool)
    .await
    .expect("ürün eklenemedi")
    .last_insert_rowid();

    let price_id = sqlx::query(
        "INSERT INTO product_prices (product_id, cost_cents, sell_cents)
         VALUES (?, 0, ?)",
    )
    .bind(product_id)
    .bind(sell_cents)
    .execute(pool)
    .await
    .expect("fiyat eklenemedi")
    .last_insert_rowid();

    (product_id, price_id)
}

pub async fn stock_of(pool: &SqlitePool, id: i64) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT stock FROM products WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("stok okunamadı")
}

/// Ürünün güncel (en son) fiyatı: (cost_cents, sell_cents).
pub async fn current_price(pool: &SqlitePool, product_id: i64) -> (i64, i64) {
    sqlx::query_as::<_, (i64, i64)>(
        "SELECT cost_cents, sell_cents FROM product_prices
         WHERE product_id = ? ORDER BY id DESC LIMIT 1",
    )
    .bind(product_id)
    .fetch_one(pool)
    .await
    .expect("fiyat okunamadı")
}

pub async fn price_count(pool: &SqlitePool, product_id: i64) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM product_prices WHERE product_id = ?")
        .bind(product_id)
        .fetch_one(pool)
        .await
        .expect("fiyat sayısı okunamadı")
}

pub async fn count(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(sql)
        .fetch_one(pool)
        .await
        .expect("sayaç okunamadı")
}

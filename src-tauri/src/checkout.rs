//! Satış (checkout) işlemi.
//!
//! Bu işlem tek bir SQL deyimi değil, birden çok ifadeden oluşur
//! (satır ekleme + stok düşme). Bu yüzden JavaScript tarafındaki
//! `db.execute()` çağrıları arasında güvenli bir işlem (transaction)
//! kurulamaz: sqlx havuz bağlantılıdır ve `BEGIN` farklı bir bağlantıyı
//! kullanabilir. İşlem burada, eklentinin kendi havuzunda yürütülür.
//!
//! Doğrulama ve yazma `run_checkout` içinde toplanmıştır; havuz parametre
//! olarak alındığı için iş mantığı penceresiz (GUI olmadan) test edilebilir.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

/// `tauri.conf.json` içindeki `plugins.sql.preload` değeriyle birebir aynı olmalıdır.
const DB_URL: &str = "sqlite:pos.db";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartLineIn {
    pub product_id: Option<i64>,
    pub name: String,
    pub price_cents: i64,
    pub qty: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutArgs {
    pub lines: Vec<CartLineIn>,
    pub method: String,
    pub paid_cents: i64,
    pub reference: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutOutcome {
    pub sale_id: i64,
    pub total_cents: i64,
    pub change_cents: i64,
}

type CmdResult<T> = Result<T, String>;

/// Eklentinin peşin tanımladığı havuzu alır (tek bağlantı havuzu).
async fn pool_of(instances: &DbInstances) -> CmdResult<SqlitePool> {
    let map = instances.0.read().await;
    match map.get(DB_URL) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("Veritabanı hazır değil".to_string()),
    }
}

/// Sepeti doğrular ve stok düşerek atomik olarak kaydeder.
pub async fn run_checkout(pool: &SqlitePool, args: CheckoutArgs) -> CmdResult<CheckoutOutcome> {
    // ---- Doğrulama ------------------------------------------------------
    if args.lines.is_empty() {
        return Err("Sepet boş".to_string());
    }
    if !matches!(args.method.as_str(), "nakit" | "kart" | "mobil") {
        return Err("Geçersiz ödeme yöntemi".to_string());
    }

    let mut total: i64 = 0;
    for line in &args.lines {
        if line.qty < 1 {
            return Err("Geçersiz ürün adedi".to_string());
        }
        if line.price_cents < 0 {
            return Err("Geçersiz fiyat".to_string());
        }
        if line.name.trim().is_empty() {
            return Err("Ürün adı boş olamaz".to_string());
        }
        let line_total = line
            .price_cents
            .checked_mul(line.qty)
            .ok_or_else(|| "Tutar taşması".to_string())?;
        total = total
            .checked_add(line_total)
            .ok_or_else(|| "Tutar taşması".to_string())?;
    }

    if args.paid_cents < total {
        return Err("Yetersiz ödeme".to_string());
    }
    let change = args.paid_cents - total;

    // ---- Atomik işlem ---------------------------------------------------
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Veritabanı hatası: {e}"))?;

    let sale_id = sqlx::query(
        "INSERT INTO sales (total_cents, paid_cents, change_cents, method, reference)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(total)
    .bind(args.paid_cents)
    .bind(change)
    .bind(&args.method)
    .bind(args.reference.as_deref().filter(|r| !r.trim().is_empty()))
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Satış kaydedilemedi: {e}"))?
    .last_insert_rowid();

    for line in &args.lines {
        sqlx::query(
            "INSERT INTO sale_items (sale_id, product_id, name, price_cents, qty)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(sale_id)
        .bind(line.product_id)
        .bind(line.name.trim())
        .bind(line.price_cents)
        .bind(line.qty)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Satır kaydedilemedi: {e}"))?;

        // Negatif stok serbest: koşul yok, ürün varsa doğrudan düşülür.
        if let Some(product_id) = line.product_id {
            sqlx::query("UPDATE products SET stock = stock - ? WHERE id = ?")
                .bind(line.qty)
                .bind(product_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Stok güncellenemedi: {e}"))?;
        }
    }

    tx.commit()
        .await
        .map_err(|e| format!("İşlem tamamlanamadı: {e}"))?;

    Ok(CheckoutOutcome {
        sale_id,
        total_cents: total,
        change_cents: change,
    })
}

#[tauri::command]
pub async fn checkout(
    instances: State<'_, DbInstances>,
    args: CheckoutArgs,
) -> CmdResult<CheckoutOutcome> {
    let pool = pool_of(&instances).await?;
    run_checkout(&pool, args).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIGRATION: &str = include_str!("../migrations/0001_init.sql");

    /// Bellekte tek bağlantılı havuz. `sqlite::memory:` her bağlantıya ayrı
    /// veritabanı verdiği için bağlantı sayısı 1'e sabitlenir.
    async fn test_pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("havuz açılamadı");

        sqlx::raw_sql(MIGRATION)
            .execute(&pool)
            .await
            .expect("migration uygulanamadı");

        pool
    }

    async fn insert_product(pool: &SqlitePool, barcode: &str, name: &str, price: i64, stock: i64) -> i64 {
        sqlx::query(
            "INSERT INTO products (barcode, name, name_search, price_cents, stock)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(barcode)
        .bind(name)
        .bind(name)
        .bind(price)
        .bind(stock)
        .execute(pool)
        .await
        .expect("ürün eklenemedi")
        .last_insert_rowid()
    }

    async fn stock_of(pool: &SqlitePool, id: i64) -> i64 {
        sqlx::query_scalar::<_, i64>("SELECT stock FROM products WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .expect("stok okunamadı")
    }

    async fn count(pool: &SqlitePool, sql: &str) -> i64 {
        sqlx::query_scalar::<_, i64>(sql)
            .fetch_one(pool)
            .await
            .expect("sayaç okunamadı")
    }

    fn line(product_id: Option<i64>, name: &str, price: i64, qty: i64) -> CartLineIn {
        CartLineIn {
            product_id,
            name: name.to_string(),
            price_cents: price,
            qty,
        }
    }

    #[tokio::test]
    async fn migration_is_idempotent() {
        let pool = test_pool().await;
        // İkinci kez uygulanabilmeli (uygulama yeniden başladığında).
        sqlx::raw_sql(MIGRATION).execute(&pool).await.expect("yeniden uygulama başarısız");
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('products','sales','sale_items')").await, 3);
    }

    #[tokio::test]
    async fn checkout_records_sale_and_decrements_stock() {
        let pool = test_pool().await;
        let product_id = insert_product(&pool, "8690001", "Çay 500g", 1250, 10).await;

        let outcome = run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![line(Some(product_id), "Çay 500g", 1250, 3)],
                method: "nakit".into(),
                paid_cents: 5000,
                reference: None,
            },
        )
        .await
        .expect("satış kaydedilemedi");

        assert_eq!(outcome.total_cents, 3750);
        assert_eq!(outcome.change_cents, 1250);
        assert!(outcome.sale_id > 0);

        // Stok 10 -> 7
        assert_eq!(stock_of(&pool, product_id).await, 7);

        let total: i64 = sqlx::query_scalar("SELECT total_cents FROM sales")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 3750);

        let qty: i64 = sqlx::query_scalar("SELECT SUM(qty) FROM sale_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(qty, 3);
    }

    #[tokio::test]
    async fn checkout_allows_negative_stock() {
        let pool = test_pool().await;
        let product_id = insert_product(&pool, "8690002", "Stoklu Ürün", 1000, 1).await;

        let outcome = run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![line(Some(product_id), "Stoklu Ürün", 1000, 5)],
                method: "kart".into(),
                paid_cents: 5000,
                reference: Some("POS-1234".into()),
            },
        )
        .await
        .expect("negatif stok engellenmemeli");

        assert_eq!(outcome.total_cents, 5000);
        assert_eq!(outcome.change_cents, 0);
        // 1 - 5 = -4 : engellenmemiş olmalı
        assert_eq!(stock_of(&pool, product_id).await, -4);
    }

    #[tokio::test]
    async fn checkout_rejects_insufficient_cash_and_writes_nothing() {
        let pool = test_pool().await;
        let product_id = insert_product(&pool, "8690003", "Pahalı", 5000, 10).await;

        let err = run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![line(Some(product_id), "Pahalı", 5000, 1)],
                method: "nakit".into(),
                paid_cents: 1000,
                reference: None,
            },
        )
        .await
        .expect_err("eksik ödeme kabul edilmemeli");

        assert_eq!(err, "Yetersiz ödeme");
        // Hiçbir kayıt yazılmamalı ve stok değişmemeli.
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM sales").await, 0);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM sale_items").await, 0);
        assert_eq!(stock_of(&pool, product_id).await, 10);
    }

    #[tokio::test]
    async fn checkout_rejects_empty_cart_and_bad_method() {
        let pool = test_pool().await;

        let empty = run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![],
                method: "nakit".into(),
                paid_cents: 0,
                reference: None,
            },
        )
        .await
        .expect_err("boş sepet reddedilmeli");
        assert_eq!(empty, "Sepet boş");

        let bad_method = run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![line(None, "Geçici", 100, 1)],
                method: "bitcoin".into(),
                paid_cents: 100,
                reference: None,
            },
        )
        .await
        .expect_err("geçersiz yöntem reddedilmeli");
        assert_eq!(bad_method, "Geçersiz ödeme yöntemi");

        assert_eq!(count(&pool, "SELECT COUNT(*) FROM sales").await, 0);
    }

    #[tokio::test]
    async fn checkout_stores_unknown_barcode_line_with_null_product() {
        let pool = test_pool().await;

        let outcome = run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![
                    line(None, "Bilinmeyen barkod 999", 0, 1),
                    line(None, "Başka bilinmeyen", 0, 2),
                ],
                method: "mobil".into(),
                paid_cents: 0,
                reference: None,
            },
        )
        .await
        .expect("geçici satırlar kaydedilebilmeli");

        assert_eq!(outcome.total_cents, 0);
        assert_eq!(outcome.change_cents, 0);

        let nulls: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sale_items WHERE product_id IS NULL")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(nulls, 2);
    }

    #[tokio::test]
    async fn checkout_never_creates_a_referenced_product_row() {
        let pool = test_pool().await;

        // product_id verilmiş ama ürün silinmişse (ON DELETE SET NULL)
        // satış satırının bağlantısı kopar, yazma hâlâ başarılı olur.
        let product_id = insert_product(&pool, "8690009", "Silinen", 500, 5).await;
        run_checkout(
            &pool,
            CheckoutArgs {
                lines: vec![line(Some(product_id), "Silinen", 500, 1)],
                method: "nakit".into(),
                paid_cents: 500,
                reference: None,
            },
        )
        .await
        .expect("satış başarısız");

        sqlx::query("DELETE FROM products WHERE id = ?")
            .bind(product_id)
            .execute(&pool)
            .await
            .expect("silme başarısız");

        let remaining: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sale_items WHERE product_id IS NULL")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(remaining, 1);

        // Aynı satış hâlâ duruyor.
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM sales").await, 1);
    }

    /// Arayüzün kullandığı `?1` / `?2` numaralı yer tutucuları doğrular.
    #[tokio::test]
    async fn numbered_placeholders_used_by_frontend_work() {
        let pool = test_pool().await;
        insert_product(&pool, "8690100", "Çay", 1250, 10).await;
        insert_product(&pool, "8690101", "Şeker", 3490, 15).await;

        // products.ts: listProducts — arama sorgusu (iki yer tutucu)
        let rows: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM products
             WHERE name_search LIKE ?1 OR barcode LIKE ?2",
        )
        .bind("%cay%")
        .bind("%86901%")
        .fetch_one(&pool)
        .await
        .expect("numaralı yer tutucu çalışmadı");
        assert_eq!(rows, 2);

        // products.ts: findByBarcode — tek yer tutucu
        let id: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM products WHERE barcode = ?1 LIMIT 1",
        )
        .bind("8690101")
        .fetch_optional(&pool)
        .await
        .expect("sorgu başarısız");
        assert!(id.is_some());

        // products.ts: barcodeTaken — koşullu iki yer tutucu
        let found: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM products WHERE barcode = ?1 AND id != ?2 LIMIT 1",
        )
        .bind("8690101")
        .bind(999)
        .fetch_optional(&pool)
        .await
        .expect("koşullu yer tutucu başarısız");
        assert!(found.is_some());

        // Aynı sorgu, kendisi hariç tutularak boş dönmeli.
        let self_id: i64 = found.expect("ürün bulunmalı");
        let dupe: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM products WHERE barcode = ?1 AND id != ?2 LIMIT 1",
        )
        .bind("8690101")
        .bind(self_id)
        .fetch_optional(&pool)
        .await
        .expect("koşullu yer tutucu başarısız");
        assert!(dupe.is_none());
    }

    /// Arayüzün sayı bağlama davranışını doğrular.
    ///
    /// JavaScript tüm sayıları gönderir ve sqlx bunları **f64** olarak bağlar.
    /// `INTEGER` sütun afinitesi değeri kayıpsız biçimde tamsayıya çevirmelidir;
    /// aksi hâlde fiyat/stock geri okunurken sorun çıkar.
    #[tokio::test]
    async fn frontend_binds_numbers_as_f64_but_stores_integers() {
        let pool = test_pool().await;

        sqlx::query(
            "INSERT INTO products (barcode, name, name_search, price_cents, stock)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind("8690500")
        .bind("Çay 500g")
        .bind("cay 500g")
        .bind(1250.0_f64)
        .bind(20.0_f64)
        .execute(&pool)
        .await
        .expect("eklenemedi");

        let price: i64 = sqlx::query_scalar("SELECT price_cents FROM products")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(price, 1250);

        let stock_type: String =
            sqlx::query_scalar("SELECT typeof(price_cents) || '/' || typeof(stock) FROM products")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stock_type, "integer/integer", "değerler INTEGER olarak saklanmalı");

        // Negatif stok da aynı şekilde saklanabilmeli.
        sqlx::query("UPDATE products SET stock = ?1 WHERE id != ?2")
            .bind(-7.0_f64)
            .bind(999.0_f64)
            .execute(&pool)
            .await
            .expect("güncelleme başarısız");

        let neg: i64 = sqlx::query_scalar("SELECT stock FROM products")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(neg, -7);

        // Sorgudaki karşılaştırma da f64 bağlamayla doğru eşleşmeli.
        let matched: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE id != ?1")
            .bind(999.0_f64)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(matched, 1);
    }

    /// Bugünün satışlarını seçmek için kullanılan yerel tarih karşılaştırmasını doğrular.
    #[tokio::test]
    async fn today_query_matches_local_timestamps() {
        let pool = test_pool().await;

        sqlx::query(
            "INSERT INTO sales (total_cents, paid_cents, change_cents, method, created_at)
             VALUES (100, 100, 0, 'nakit', datetime('now', 'localtime'))",
        )
        .execute(&pool)
        .await
        .expect("eklenemedi");

        sqlx::query(
            "INSERT INTO sales (total_cents, paid_cents, change_cents, method, created_at)
             VALUES (999, 999, 0, 'nakit', '2000-01-01 12:00:00')",
        )
        .execute(&pool)
        .await
        .expect("eklenemedi");

        let today: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sales
             WHERE substr(created_at, 1, 10) = date('now', 'localtime')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(today, 1, "bugün dışındaki satış sayılmamalı");
    }
}

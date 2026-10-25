//! Ürün kaydı ve fiyat geçmişi.
//!
//! Ürün bilgisi (barkod, ad, stok) ile fiyat ayrı tablolarda tutulur.
//! `product_prices` yalnızca ekleme alır: maliyet veya satış fiyatı her
//! değiştiğinde yeni bir satır yazılır. Güncel fiyat, ürüne ait en büyük
//! `id` değerine sahip satırdır.
//!
//! Ürün + fiyat yazımı tek transaction'da yapılır; aksi hâlde ürün güncellenip
//! fiyat kaydı düşebilir veya yeni ürün fiyatsız kalabilir. Bu yüzden işlem
//! `checkout` gibi Rust tarafında yürütülür.

use crate::pool_of;
use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;
use tauri_plugin_sql::DbInstances;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductInputIn {
    pub barcode: Option<String>,
    pub name: String,
    /// `src/lib/turkish.ts` içindeki `foldForSearch()` çıktısı. Türkçe arama
    /// tek kaynaktan üretilsin diye istemci tarafından hesaplanır.
    pub name_search: String,
    pub cost_cents: i64,
    pub sell_cents: i64,
    pub stock: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProductArgs {
    /// `None` ise yeni ürün oluşturulur, aksi hâlde bu kimlik güncellenir.
    pub id: Option<i64>,
    pub product: ProductInputIn,
}

type CmdResult<T> = Result<T, String>;

/// Adı ve barkodu normalize eder; geçersiz fiyatları reddeder.
fn validate(input: &ProductInputIn) -> CmdResult<(Option<String>, String)> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Ürün adı boş olamaz".to_string());
    }
    if input.cost_cents < 0 {
        return Err("Maliyet negatif olamaz".to_string());
    }
    if input.sell_cents < 0 {
        return Err("Satış fiyatı negatif olamaz".to_string());
    }

    let barcode = input
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    Ok((barcode, name))
}

async fn insert_price(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    product_id: i64,
    cost_cents: i64,
    sell_cents: i64,
) -> CmdResult<()> {
    sqlx::query(
        "INSERT INTO product_prices (product_id, cost_cents, sell_cents)
         VALUES (?1, ?2, ?3)",
    )
    .bind(product_id)
    .bind(cost_cents)
    .bind(sell_cents)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Fiyat kaydedilemedi: {e}"))?;
    Ok(())
}

/// Ürünü oluşturur veya günceller; fiyat değiştiyse yeni bir fiyat kaydı ekler.
/// Dönen değer ürün kimliğidir.
pub async fn run_save_product(pool: &SqlitePool, args: SaveProductArgs) -> CmdResult<i64> {
    let SaveProductArgs { id, product } = args;
    let (barcode, name) = validate(&product)?;
    let name_search = product.name_search.trim().to_string();
    let cost_cents = product.cost_cents;
    let sell_cents = product.sell_cents;
    let stock = product.stock;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Veritabanı hatası: {e}"))?;

    // Barkod başka bir üründe kullanılıyor mu?
    if let Some(barcode) = &barcode {
        let owner: Option<i64> =
            sqlx::query_scalar("SELECT id FROM products WHERE barcode = ?1 LIMIT 1")
                .bind(barcode)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| format!("Veritabanı hatası: {e}"))?;

        if let Some(owner) = owner {
            if Some(owner) != id {
                return Err(format!("Bu barkod zaten kayıtlı: {barcode}"));
            }
        }
    }

    let product_id = match id {
        None => {
            let product_id = sqlx::query(
                "INSERT INTO products (barcode, name, name_search, stock)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(barcode.as_deref())
            .bind(&name)
            .bind(&name_search)
            .bind(stock)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Ürün eklenemedi: {e}"))?
            .last_insert_rowid();

            // Yeni ürünün ilk fiyat kaydı.
            insert_price(&mut tx, product_id, cost_cents, sell_cents).await?;
            tx.commit()
                .await
                .map_err(|e| format!("İşlem tamamlanamadı: {e}"))?;
            return Ok(product_id);
        }
        Some(product_id) => {
            let affected = sqlx::query(
                "UPDATE products
                 SET barcode = ?1, name = ?2, name_search = ?3, stock = ?4
                 WHERE id = ?5",
            )
            .bind(barcode.as_deref())
            .bind(&name)
            .bind(&name_search)
            .bind(stock)
            .bind(product_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Ürün güncellenemedi: {e}"))?
            .rows_affected();

            if affected == 0 {
                return Err("Ürün bulunamadı".to_string());
            }
            product_id
        }
    };

    // Fiyat gerçekten değiştiyse geçmişe yeni satır ekle. Ad/stok güncellemesi
    // fiyat kaydı üretmez.
    let current: Option<(i64, i64)> = sqlx::query_as(
        "SELECT cost_cents, sell_cents FROM product_prices
         WHERE product_id = ?1 ORDER BY id DESC LIMIT 1",
    )
    .bind(product_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| format!("Fiyat okunamadı: {e}"))?;

    let price_changed = match current {
        Some((current_cost, current_sell)) => {
            current_cost != cost_cents || current_sell != sell_cents
        }
        None => true,
    };

    if price_changed {
        insert_price(&mut tx, product_id, cost_cents, sell_cents).await?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("İşlem tamamlanamadı: {e}"))?;

    Ok(product_id)
}

#[tauri::command]
pub async fn save_product(
    instances: State<'_, DbInstances>,
    args: SaveProductArgs,
) -> CmdResult<i64> {
    let pool = pool_of(&instances).await?;
    run_save_product(&pool, args).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{
        MIGRATION_V1, MIGRATION_V2, count, current_price, price_count, test_pool,
    };

    fn product(
        barcode: Option<&str>,
        name: &str,
        cost_cents: i64,
        sell_cents: i64,
        stock: i64,
    ) -> ProductInputIn {
        ProductInputIn {
            barcode: barcode.map(str::to_string),
            name: name.to_string(),
            name_search: name.to_lowercase(),
            cost_cents,
            sell_cents,
            stock,
        }
    }

    fn create(product: ProductInputIn) -> SaveProductArgs {
        SaveProductArgs { id: None, product }
    }

    fn update(id: i64, product: ProductInputIn) -> SaveProductArgs {
        SaveProductArgs {
            id: Some(id),
            product,
        }
    }

    #[tokio::test]
    async fn create_product_writes_initial_price() {
        let pool = test_pool().await;

        let product_id = run_save_product(
            &pool,
            create(product(Some("8691000"), "Yeni Ürün", 700, 1200, 4)),
        )
        .await
        .expect("ürün oluşturulamadı");

        assert!(product_id > 0);
        assert_eq!(price_count(&pool, product_id).await, 1);
        assert_eq!(current_price(&pool, product_id).await, (700, 1200));

        let stock: i64 = sqlx::query_scalar("SELECT stock FROM products WHERE id = ?")
            .bind(product_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(stock, 4);
    }

    #[tokio::test]
    async fn update_appends_price_only_when_price_changes() {
        let pool = test_pool().await;
        let product_id =
            run_save_product(&pool, create(product(None, "Çay", 500, 900, 10)))
                .await
                .expect("ürün oluşturulamadı");

        // Aynı fiyat: yeni kayıt eklenmemeli.
        run_save_product(&pool, update(product_id, product(None, "Çay", 500, 900, 12)))
            .await
            .expect("güncellenemedi");
        assert_eq!(price_count(&pool, product_id).await, 1);

        // Satış fiyatı değişti: yeni kayıt eklenmeli, eskisi korunmalı.
        run_save_product(&pool, update(product_id, product(None, "Çay", 500, 1100, 12)))
            .await
            .expect("güncellenemedi");
        assert_eq!(price_count(&pool, product_id).await, 2);
        assert_eq!(current_price(&pool, product_id).await, (500, 1100));

        // Maliyet değişti: yine yeni kayıt.
        run_save_product(&pool, update(product_id, product(None, "Çay", 650, 1100, 12)))
            .await
            .expect("güncellenemedi");
        assert_eq!(price_count(&pool, product_id).await, 3);
        assert_eq!(current_price(&pool, product_id).await, (650, 1100));

        // Tüm kayıtlar id sırasıyla korunur.
        let sells: Vec<i64> = sqlx::query_scalar(
            "SELECT sell_cents FROM product_prices WHERE product_id = ? ORDER BY id",
        )
        .bind(product_id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(sells, vec![900, 1100, 1100]);
    }

    #[tokio::test]
    async fn update_name_and_stock_without_price_change() {
        let pool = test_pool().await;
        let product_id = run_save_product(&pool, create(product(Some("8691001"), "Eski", 100, 200, 1)))
            .await
            .expect("ürün oluşturulamadı");

        run_save_product(
            &pool,
            update(product_id, product(Some("8691001"), "Yeni Ad", 100, 200, 9)),
        )
        .await
        .expect("güncellenemedi");

        assert_eq!(price_count(&pool, product_id).await, 1);
        assert_eq!(current_price(&pool, product_id).await, (100, 200));

        let (name, name_search): (String, String) =
            sqlx::query_as("SELECT name, name_search FROM products WHERE id = ?")
                .bind(product_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(name, "Yeni Ad");
        assert_eq!(name_search, "yeni ad");
    }

    #[tokio::test]
    async fn duplicate_barcode_is_rejected() {
        let pool = test_pool().await;
        run_save_product(&pool, create(product(Some("8691002"), "Bir", 0, 100, 0)))
            .await
            .expect("ilk ürün oluşturulamadı");

        let err = run_save_product(&pool, create(product(Some("8691002"), "İki", 0, 100, 0)))
            .await
            .expect_err("aynı barkod reddedilmeli");
        assert_eq!(err, "Bu barkod zaten kayıtlı: 8691002");

        assert_eq!(count(&pool, "SELECT COUNT(*) FROM products").await, 1);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM product_prices").await, 1);
    }

    #[tokio::test]
    async fn product_can_keep_its_own_barcode_on_update() {
        let pool = test_pool().await;
        let product_id =
            run_save_product(&pool, create(product(Some("8691003"), "Ürün", 0, 100, 0)))
                .await
                .expect("ürün oluşturulamadı");

        run_save_product(
            &pool,
            update(product_id, product(Some("8691003"), "Ürün", 0, 150, 0)),
        )
        .await
        .expect("kendi barkoduyla güncellenebilmeli");
    }

    #[tokio::test]
    async fn negative_prices_are_rejected() {
        let pool = test_pool().await;

        let cost = run_save_product(&pool, create(product(None, "X", -1, 100, 0)))
            .await
            .expect_err("negatif maliyet reddedilmeli");
        assert_eq!(cost, "Maliyet negatif olamaz");

        let sell = run_save_product(&pool, create(product(None, "X", 0, -1, 0)))
            .await
            .expect_err("negatif satış fiyatı reddedilmeli");
        assert_eq!(sell, "Satış fiyatı negatif olamaz");

        let name = run_save_product(&pool, create(product(None, "   ", 0, 100, 0)))
            .await
            .expect_err("boş ad reddedilmeli");
        assert_eq!(name, "Ürün adı boş olamaz");

        assert_eq!(count(&pool, "SELECT COUNT(*) FROM products").await, 0);
    }

    #[tokio::test]
    async fn updating_missing_product_is_rejected() {
        let pool = test_pool().await;

        let err = run_save_product(&pool, update(9999, product(None, "Yok", 0, 100, 0)))
            .await
            .expect_err("olmayan ürün reddedilmeli");
        assert_eq!(err, "Ürün bulunamadı");
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM product_prices").await, 0);
    }

    #[tokio::test]
    async fn price_history_survives_product_update_and_cascade_deletes() {
        let pool = test_pool().await;
        let product_id = run_save_product(&pool, create(product(None, "Silinecek", 100, 200, 1)))
            .await
            .expect("ürün oluşturulamadı");
        run_save_product(&pool, update(product_id, product(None, "Silinecek", 100, 300, 1)))
            .await
            .expect("güncellenemedi");
        assert_eq!(price_count(&pool, product_id).await, 2);

        sqlx::query("DELETE FROM products WHERE id = ?")
            .bind(product_id)
            .execute(&pool)
            .await
            .expect("silinemedi");

        // Ürün silinince fiyat geçmişi de temizlenir (ON DELETE CASCADE).
        assert_eq!(
            count(&pool, "SELECT COUNT(*) FROM product_prices").await,
            0
        );
    }

    /// Migration'ın mevcut ürün fiyatlarını koruduğunu ve yeni şemayı
    /// uyguladığını doğrular.
    #[tokio::test]
    async fn migrations_apply_together() {
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

        assert_eq!(
            count(
                &pool,
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                 AND name IN ('products','sales','sale_items','product_prices')",
            )
            .await,
            4
        );
    }
}

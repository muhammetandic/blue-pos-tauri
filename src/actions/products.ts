import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";
import { foldForSearch } from "../lib/turkish";
import type { PriceRecord, Product, ProductInput } from "../lib/types";

/**
 * Güncel fiyat, ürüne ait en büyük `id` değerine sahip `product_prices`
 * satırıdır. Fiyat geçmişi korunur; hiçbir kayıt güncellenmez.
 */
const SELECT = `
  SELECT p.id, p.barcode, p.name, p.stock,
         COALESCE(pp.cost_cents, 0) AS cost_cents,
         COALESCE(pp.sell_cents, 0) AS sell_cents,
         pp.id AS price_id
  FROM products p
  LEFT JOIN product_prices pp ON pp.id = (
    SELECT id FROM product_prices
    WHERE product_id = p.id
    ORDER BY id DESC
    LIMIT 1
  )`;

/**
 * Ürün listesi. Boş sorgu tüm ürünleri döner.
 *
 * Arama iki sütuna bakar: barkod ve name_search. Name_search ASCII katlanmış
 * olduğundan "çay" sorgusu "Çay" kaydını bulur (bkz. turkish.ts foldForSearch).
 */
export async function listProducts(search: string): Promise<Product[]> {
  const db = await getDb();
  const term = search.trim();
  if (term === "") {
    return db.select<Product[]>(`${SELECT} ORDER BY p.name COLLATE NOCASE`);
  }
  return db.select<Product[]>(
    `${SELECT}
     WHERE p.name_search LIKE ?1 OR p.barcode LIKE ?2
     ORDER BY p.name COLLATE NOCASE`,
    [`%${foldForSearch(term)}%`, `%${term}%`],
  );
}

/** Tam barkodla tek ürün arar. Tarayıcı okutmada kullanılır. */
export async function findByBarcode(barcode: string): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(`${SELECT} WHERE p.barcode = ?1 LIMIT 1`, [
    barcode.trim(),
  ]);
  return rows[0] ?? null;
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(`${SELECT} WHERE p.id = ?1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** Bir ürünün fiyat geçmişi; en yeni kayıt önce gelir. */
export async function listPriceHistory(productId: number): Promise<PriceRecord[]> {
  const db = await getDb();
  return db.select<PriceRecord[]>(
    `SELECT id, product_id, cost_cents, sell_cents, created_at
     FROM product_prices
     WHERE product_id = ?1
     ORDER BY id DESC`,
    [productId],
  );
}

/**
 * Ürünü oluşturur veya günceller. Fiyat değiştiyse yeni bir fiyat kaydı
 * eklenir. Ürün ve fiyat tek transaction'da yazıldığı için işlem Rust
 * tarafında yürütülür (bkz. src-tauri/src/products.rs).
 */
export async function saveProduct(id: number | null, input: ProductInput): Promise<number> {
  return invoke<number>("save_product", {
    args: {
      id,
      product: {
        barcode: input.barcode?.trim() || null,
        name: input.name.trim(),
        nameSearch: foldForSearch(input.name),
        costCents: input.cost_cents,
        sellCents: input.sell_cents,
        stock: input.stock,
      },
    },
  });
}

export async function createProduct(input: ProductInput): Promise<number> {
  return saveProduct(null, input);
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  await saveProduct(id, input);
}

/**
 * Ürünü siler. Fiyat geçmişi `ON DELETE CASCADE` ile temizlenir; satış
 * kalemlerindeki bağlantılar `ON DELETE SET NULL` ile korunur.
 */
export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM products WHERE id = ?1", [id]);
}

/** CSV satırı. Fiyatlar kuruş cinsinden işlenmiştir. */
export interface CsvProduct {
  barcode: string | null;
  name: string;
  cost_cents: number;
  sell_cents: number;
  stock: number;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Barkoda göre ekleme veya güncelleme yapar.
 * Aynı barkod iki kez gelirse son değer geçerlidir.
 */
export async function importProducts(rows: CsvProduct[]): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    if (row.name.trim() === "") {
      summary.skipped += 1;
      summary.errors.push("Ürün adı boş satır atlandı.");
      continue;
    }
    if (row.cost_cents < 0 || row.sell_cents < 0) {
      summary.skipped += 1;
      summary.errors.push(`Geçersiz fiyat: ${row.name}`);
      continue;
    }

    const existing = row.barcode ? await findByBarcode(row.barcode) : null;
    const input: ProductInput = {
      barcode: row.barcode,
      name: row.name.trim(),
      cost_cents: row.cost_cents,
      sell_cents: row.sell_cents,
      stock: row.stock,
    };

    if (existing) {
      await updateProduct(existing.id, input);
      summary.updated += 1;
    } else {
      await createProduct(input);
      summary.created += 1;
    }
  }

  return summary;
}

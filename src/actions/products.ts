import { getDb } from "../lib/db";
import { foldForSearch } from "../lib/turkish";
import type { Product, ProductInput } from "../lib/types";

const SELECT = "SELECT id, barcode, name, price_cents, stock FROM products";

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
    return db.select<Product[]>(`${SELECT} ORDER BY name COLLATE NOCASE`);
  }
  return db.select<Product[]>(
    `${SELECT}
     WHERE name_search LIKE ?1 OR barcode LIKE ?2
     ORDER BY name COLLATE NOCASE`,
    [`%${foldForSearch(term)}%`, `%${term}%`],
  );
}

/** Tam barkodla tek ürün arar. Tarayıcı okutmada kullanılır. */
export async function findByBarcode(barcode: string): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(`${SELECT} WHERE barcode = ?1 LIMIT 1`, [barcode.trim()]);
  return rows[0] ?? null;
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(`${SELECT} WHERE id = ?1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** Barkod zaten kullanılıyor mu? */
async function barcodeTaken(barcode: string, exceptId?: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    `SELECT id FROM products WHERE barcode = ?1${exceptId ? " AND id != ?2" : ""} LIMIT 1`,
    exceptId ? [barcode, exceptId] : [barcode],
  );
  return rows.length > 0;
}

function duplicateBarcode(barcode: string): Error {
  return new Error(`Bu barkod zaten kayıtlı: ${barcode}`);
}

export async function createProduct(input: ProductInput): Promise<number> {
  const db = await getDb();
  const barcode = input.barcode?.trim() || null;
  if (barcode !== null && (await barcodeTaken(barcode))) {
    throw duplicateBarcode(barcode);
  }
  const result = await db.execute(
    `INSERT INTO products (barcode, name, name_search, price_cents, stock)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
    [barcode, input.name.trim(), foldForSearch(input.name), input.price_cents, input.stock],
  );
  return result.lastInsertId ?? 0;
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  const db = await getDb();
  const barcode = input.barcode?.trim() || null;
  if (barcode !== null && (await barcodeTaken(barcode, id))) {
    throw duplicateBarcode(barcode);
  }
  await db.execute(
    `UPDATE products
     SET barcode = ?1, name = ?2, name_search = ?3, price_cents = ?4, stock = ?5
     WHERE id = ?6`,
    [barcode, input.name.trim(), foldForSearch(input.name), input.price_cents, input.stock, id],
  );
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM products WHERE id = ?1", [id]);
}

/** CSV satırı. Fiyat kuruş cinsinden işlenmiştir. */
export interface CsvProduct {
  barcode: string | null;
  name: string;
  price_cents: number;
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
    if (row.price_cents < 0) {
      summary.skipped += 1;
      summary.errors.push(`Geçersiz fiyat: ${row.name}`);
      continue;
    }

    const existing = row.barcode ? await findByBarcode(row.barcode) : null;
    const input: ProductInput = {
      barcode: row.barcode,
      name: row.name.trim(),
      price_cents: row.price_cents,
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

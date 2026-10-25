import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";
import type { CartLine, CheckoutInput, CheckoutResult, Sale } from "../lib/types";

/**
 * Satışı atomik olarak kaydeder ve stokları düşürür.
 *
 * Birden çok ifade içerdiği için bu işlem Rust tarafında, eklentinin kendi
 * havuzunda transaction içinde yürütülür (bkz. src-tauri/src/checkout.rs).
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  return invoke<CheckoutResult>("checkout", {
    args: {
      lines: input.lines.map((line) => ({
        productId: line.product_id,
        priceId: line.price_id,
        name: line.name,
        sellCents: line.sell_cents,
        qty: line.qty,
      })),
      method: input.method,
      paidCents: input.paid_cents,
      reference: input.reference,
    },
  });
}

/** Sepetin toplamını kuruş cinsinden hesaplar. */
export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.sell_cents * line.qty, 0);
}

/** Bugün oluşturulan satışlar. SQLite datetime('now') yerel saatle kaydeder. */
export async function listTodaySales(): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    `SELECT id, total_cents, paid_cents, change_cents, method, reference, created_at
     FROM sales
     WHERE substr(created_at, 1, 10) = date('now', 'localtime')
     ORDER BY id DESC`,
  );
}

export interface DailySummary {
  sale_count: number;
  item_count: number;
  total_cents: number;
  cash_cents: number;
}

/** Bugünün satış özeti. */
export async function todaySummary(): Promise<DailySummary> {
  const db = await getDb();
  const rows = await db.select<DailySummary[]>(
    `SELECT
       COUNT(*) AS sale_count,
       COALESCE((SELECT SUM(qty) FROM sale_items si
                 WHERE si.sale_id IN (SELECT id FROM sales
                                      WHERE substr(created_at, 1, 10) = date('now', 'localtime'))), 0) AS item_count,
       COALESCE(SUM(total_cents), 0) AS total_cents,
       COALESCE(SUM(CASE WHEN method = 'nakit' THEN total_cents ELSE 0 END), 0) AS cash_cents
     FROM sales
     WHERE substr(created_at, 1, 10) = date('now', 'localtime')`,
  );
  return rows[0] ?? { sale_count: 0, item_count: 0, total_cents: 0, cash_cents: 0 };
}

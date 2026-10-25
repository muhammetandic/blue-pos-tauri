-- Ürün fiyatları ayrı tabloda tutulur.
--
-- Her fiyat değişikliği yeni bir satır ekler; hiçbir kayıt güncellenmez.
-- Bir ürünün güncel fiyatı, o ürüne ait en büyük `id` değerine sahip satırdır.
-- Fiyat hem maliyeti (cost_cents) hem de satış fiyatını (sell_cents) taşır.

CREATE TABLE IF NOT EXISTS product_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  -- Maliyet geçmişte tutulmuyordu; taşınan kayıtlarda 0 kabul edilir.
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  sell_cents INTEGER NOT NULL CHECK (sell_cents >= 0),
  -- Yerel saat; satışlarla aynı kural (bkz. 0001_init.sql).
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_id
  ON product_prices (product_id, id DESC);

-- Mevcut `products.price_cents` değerlerini ilk fiyat kaydı olarak taşı.
-- DİKKAT: Bu INSERT, `price_cents` sütunu düşürülmeden önce çalışmalıdır.
INSERT INTO product_prices (product_id, cost_cents, sell_cents)
SELECT id, 0, price_cents FROM products;

-- Satış kalemi, satıldığı andaki fiyat kaydına bağlanır. Böylece geçmiş
-- satışların maliyeti, ürünün sonraki fiyatlarından bağımsız raporlanabilir.
-- Geçmiş satışlarda maliyet bilinmediği için price_id boş bırakılır.
ALTER TABLE sale_items RENAME COLUMN price_cents TO sell_cents;
ALTER TABLE sale_items ADD COLUMN price_id INTEGER
  REFERENCES product_prices (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sale_items_price_id ON sale_items (price_id);

-- Fiyat artık tek kaynak olarak product_prices tablosunda yaşar.
ALTER TABLE products DROP COLUMN price_cents;

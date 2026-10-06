-- Blue POS — başlangıç şeması (v1)
-- NOT: datetime('now') UTC döndürür; yerel saat 'localtime' isteriz.
-- DİKKAT: tek tırnak şarttır; çift tırnak SQLite'ta tanımlayıcı olarak
-- okunur ve "default value ... is not constant" hatası verir.

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  -- ASCII katlanmış arama metni. SQLite LIKE/lower yalnızca ASCII harfleri
  -- büyük/küçük harf çevirir; "Çay" için "çay" araması aksi hâlde boş döner.
  name_search TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  -- Negatif stok serbest bırakılmıştır: kısıt yok.
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_search ON products (name_search);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  paid_cents INTEGER NOT NULL CHECK (paid_cents >= 0),
  -- Negatif para üstü verilirse satış kaydedilmez.
  change_cents INTEGER NOT NULL CHECK (change_cents >= 0),
  method TEXT NOT NULL CHECK (method IN ('nakit', 'kart', 'mobil')),
  -- Kart provizyon numarası / mobil işlem numarası
  reference TEXT,
  -- Yerel saat. 'now' olsaydı 3 saatlik fark oluşurdu (bkz. açıklama).
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales (created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  -- Ürün silindiğinde satış geçmişi korunur; ad ve fiyat zaten anlık
  -- görüntülenmiş olduğundan bağlantı kopması veri kaybına yol açmaz.
  product_id INTEGER REFERENCES products (id) ON DELETE SET NULL,
  -- Ürün adı ve fiyatı anlık görüntülenir; ürün düzenlense bile geçmiş değişmez.
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  qty INTEGER NOT NULL CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items (sale_id);

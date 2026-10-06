# Blue POS

Küçük satıcılar için masaüstü satış (POS) uygulaması.
Tauri 2 + React 19 + TypeScript, yalnızca yerel SQLite.

## Kapsam (v1)

- **Ürünler** ekranı: ekleme, düzenleme, silme, arama, CSV ile içe aktarma
- **Satış** ekranı: barkod okutma, sepet, ödeme
- **Bugünkü Satışlar** ekranı: günün dökümü ve özeti

Ödeme yalnızca **nakit** veya **kart/mobil (referans numarasıyla)** alınır.
Terminalle entegrasyon yoktur; fiş baskısı, KDV, indirim, müşteri/veresiye ve
çok kullanıcılık **v1 kapsamında değildir**.

## Çalıştırma

```bash
pnpm install
pnpm tauri dev      # geliştirme
pnpm tauri build     # dağıtım paketi
```

## Kontroller

```bash
pnpm check           # tsc + biome + cargo test
pnpm typecheck
pnpm lint
pnpm test            # Rust birim testleri (GUI gerekmez)
```

## Teknik notlar

### Para birimi

Tutarlar **kuruş cinsinden tamsayı** olarak saklanır (`price_cents`, `total_cents`).
Bu nedenle `12,50` değerinde hiçbir yerde kayan nokta kullanılmaz.

`parseFloat("12,50")` Türkçede `12` döndürür; bu yüzden `src/lib/money.ts`
içindeki `parseTRY()` kullanılır. Desteklenen biçimler:

| Girdi | Sonuç |
| --- | --- |
| `12` | ₺12,00 |
| `12,5` | ₺12,50 |
| `1.234,56` | ₺1.234,56 |
| `1.000` | ₺1.000,00 |
| `12,567` | reddedilir (3 ondalık) |
| `-5` | reddedilir |

### Türkçe arama

SQLite'ın `LIKE` ve `lower()` işlevleri yalnızca ASCII harfleri katlar; `"çay"`
sorgusu `"Çay"` kaydını bulmaz. Bu yüzden `products.name_search` sütunu
`src/lib/turkish.ts` içindeki `foldForSearch()` ile ASCII katlanmış biçimde
tutulur.

### Barkod okuyucu

Okuyucu **klavye-wedge** (USB HID) olarak çalışır; seri port veya özel sürücü
gerektirmez. `src/components/ScannerInput.tsx` içinde iki koruma vardır:

1. `focusin` — odak bir metin alanına geçmedikçe giriş alanına geri alınır.
2. `keydown` — odak hiçbir metin alanında değilken yazdırılabilir karakterler
   doğrudan alana eklenir, böylece okuma kaçmaz.

Bir pencere (ürün formu / ödeme) açıkken okuyucu **devre dışıdır**; aksi hâlde
pencere içinde yazılan metin gizlice barkod alanına düşerdi.

Bilinmeyen barkod okutulursa sepete **₺0 tutarında geçici satır** eklenir
(`product_id NULL`) ve kullanıcı uyarılır. Stok **eksiye düşebilir**, hiçbir
yerde engellenmez.

### Satış kaydı (transaction)

Satış; satış satırı ekleme ve stok düşme adımlarından oluşur. JavaScript
tarafındaki `db.execute()` çağrıları arasında transaction kurulamaz — sqlx
havuz bağlantılıdır ve `BEGIN` farklı bir bağlantıyı kullanabilir. Bu yüzden
işlem `src-tauri/src/checkout.rs` içinde, eklentinin kendi havuzunda atomik
olarak yürütülür.

### Zaman damgaları

SQLite'ın `datetime('now')` değeri **UTC** döndürür. Uygulama yerel saati
kullandığı için varsayılan `datetime('now', 'localtime')` olarak ayarlıdır;
böylece 22:44'te yapılan satış 19:44 görünmez.

### Veritabanı

Dosya: `~/.config/com.mandic.pos/pos.db`
Şema: `src-tauri/migrations/0001_init.sql` (uygulama açılışında otomatik uygulanır)

## Dizin yapısı

```
src/
  actions/        Veri erişimi (ürünler, satışlar)
  components/     Ekranlar ve bileşenler
  lib/            Para, Türkçe metin, CSV, sepet, veritabanı
src-tauri/
  migrations/     SQL şeması
  src/checkout.rs Atomik satış işlemi + birim testleri
```

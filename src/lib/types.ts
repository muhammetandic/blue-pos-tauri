/** Ürün. Fiyat bilgisi `product_prices` tablosundan gelen güncel değerlerdir. */
export interface Product {
  id: number;
  barcode: string | null;
  name: string;
  /** Güncel maliyet, kuruş cinsinden. */
  cost_cents: number;
  /** Güncel satış fiyatı, kuruş cinsinden. */
  sell_cents: number;
  /** Güncel fiyat kaydının kimliği (`product_prices.id`). */
  price_id: number | null;
  /** Negatif olabilir. */
  stock: number;
}

/** Yeni ürün oluştururken / güncellerken kullanılan tip. */
export interface ProductInput {
  barcode: string | null;
  name: string;
  cost_cents: number;
  sell_cents: number;
  stock: number;
}

/** Bir satış kalemi (sepet satırı). */
export interface CartLine {
  /** UUID — React anahtarı için. */
  key: string;
  /** Bilinmeyen barkodla eklenen geçici satırlarda null. */
  product_id: number | null;
  /** Sepete eklendiği andaki fiyat kaydı. */
  price_id: number | null;
  name: string;
  /** Satış fiyatı (kuruş). */
  sell_cents: number;
  qty: number;
}

export type PaymentMethod = "nakit" | "kart" | "mobil";

/** Fiyat geçmişi kaydı. */
export interface PriceRecord {
  id: number;
  product_id: number;
  cost_cents: number;
  sell_cents: number;
  created_at: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  /** Satıldığı andaki fiyat kaydı; geçmiş kayıtlarda bilinmiyorsa null. */
  price_id: number | null;
  name: string;
  sell_cents: number;
  qty: number;
}

export interface Sale {
  id: number;
  total_cents: number;
  paid_cents: number;
  change_cents: number;
  method: PaymentMethod;
  reference: string | null;
  created_at: string;
}

/** Ödeme tamamlama isteği. */
export interface CheckoutInput {
  lines: CartLine[];
  method: PaymentMethod;
  paid_cents: number;
  reference: string | null;
}

/** Ödeme tamamlama sonucu. */
export interface CheckoutResult {
  sale_id: number;
  total_cents: number;
  change_cents: number;
}

/** Ürün arama/görüntüleme için DB'den gelen satır. */
export interface ProductRow {
  id: number;
  barcode: string | null;
  name: string;
  sell_cents: number;
  stock: number;
}

/** Ürün. Fiyat ve stok tamsayıdır. */
export interface Product {
  id: number;
  barcode: string | null;
  name: string;
  /** Kuruş cinsinden. Tam sayı — asla float değil. */
  price_cents: number;
  /** Negatif olabilir. */
  stock: number;
}

/** Yeni ürün oluştururken kullanılan tip. */
export interface ProductInput {
  barcode: string | null;
  name: string;
  price_cents: number;
  stock: number;
}

/** Bir satış kalemi (sepet satırı). */
export interface CartLine {
  /** UUID — React anahtarı için. */
  key: string;
  /** Bilinmeyen barkodla eklenen geçici satırlarda null. */
  product_id: number | null;
  name: string;
  price_cents: number;
  qty: number;
}

export type PaymentMethod = "nakit" | "kart" | "mobil";

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  name: string;
  price_cents: number;
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
  price_cents: number;
  stock: number;
}

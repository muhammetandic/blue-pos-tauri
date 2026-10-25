import { formatTRY } from "../lib/money";
import type { Product } from "../lib/types";

interface ProductGridProps {
  products: Product[];
  onPick: (product: Product) => void;
}

/**
 * Satış ekranındaki ürün kısayolları. Tıklama sepete bir adet ekler.
 * Stok sıfırın altındaysa satır uyarıyla vurgulanır.
 */
export function ProductGrid({ products, onPick }: ProductGridProps) {
  if (products.length === 0) {
    return <p className="empty">Eşleşen ürün yok.</p>;
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          className={`product-tile ${product.stock <= 0 ? "out" : ""}`}
          onClick={() => onPick(product)}
          title={product.barcode ?? product.name}
        >
          <span className="product-name">{product.name}</span>
          <span className="product-price">{formatTRY(product.sell_cents)}</span>
          <span className={`product-stock ${product.stock < 0 ? "negative" : ""}`}>
            Stok: {product.stock}
          </span>
        </button>
      ))}
    </div>
  );
}

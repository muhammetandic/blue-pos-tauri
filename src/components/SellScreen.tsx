import { useCallback, useEffect, useState } from "react";
import { findByBarcode, listProducts } from "../actions/products";
import { useCart } from "../lib/cart";
import { formatTRY } from "../lib/money";
import type { CheckoutResult, Product } from "../lib/types";
import { CartPanel } from "./CartPanel";
import { PaymentDialog } from "./PaymentDialog";
import { ProductGrid } from "./ProductGrid";
import { ScannerInput } from "./ScannerInput";

export function SellScreen() {
  const { dispatch, lines } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  // Arama terimi ve yenileme sayacı tek nesnede: efekt için gerçek bağımlılık.
  const [query, setQuery] = useState({ term: "", version: 0 });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = query.term;

  useEffect(() => {
    let cancelled = false;
    listProducts(query.term)
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Ürünler yüklenemedi.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const reload = useCallback(() => {
    setQuery((current) => ({ ...current, version: current.version + 1 }));
  }, []);

  const setSearch = (term: string) => setQuery({ term, version: 0 });

  /**
   * Okuyucu tetiklendiğinde çalışır. Tam barkod eşleşmesi varsa sepete eklenir,
   * yoksa ₺0 tutarlı geçici bir satır açılır ve kullanıcı uyarılır.
   */
  const handleScan = useCallback(
    async (barcode: string) => {
      setReceipt(null);
      try {
        const product = await findByBarcode(barcode);
        if (product) dispatch({ type: "addProduct", product });
        else dispatch({ type: "addAdHoc", barcode });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Barkod okunamadı.");
      }
    },
    [dispatch],
  );

  function handleCompleted(result: CheckoutResult) {
    setPaymentOpen(false);
    dispatch({ type: "clear" });
    const parts = [`Satış tamamlandı · Toplam ${formatTRY(result.total_cents)}`];
    if (result.change_cents > 0) {
      parts.push(`Para Üstü ${formatTRY(result.change_cents)}`);
    }
    setReceipt(parts.join(" · "));
    reload();
  }

  return (
    <section className="screen sell">
      <div className="sell-main">
        <header className="scan-bar">
          <ScannerInput onSubmit={(code) => void handleScan(code)} />
          <input
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ürün ara…"
            aria-label="Ürün ara"
            autoComplete="off"
          />
        </header>

        {error ? <p className="error">{error}</p> : null}

        {receipt ? <div className="banner success">{receipt}</div> : null}

        <ProductGrid
          products={products}
          onPick={(product) => dispatch({ type: "addProduct", product })}
        />
      </div>

      <CartPanel onCheckout={() => setPaymentOpen(true)} />

      {paymentOpen ? (
        <PaymentDialog
          lines={lines}
          onClose={() => setPaymentOpen(false)}
          onCompleted={handleCompleted}
        />
      ) : null}
    </section>
  );
}

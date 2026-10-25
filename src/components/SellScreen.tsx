import { useCallback, useEffect, useState } from "react";
import { findByBarcode, listProducts } from "../actions/products";
import { useCart } from "../lib/cart";
import { formatTRY } from "../lib/money";
import { parseScanInput } from "../lib/scan";
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
  /** `5*` ile belirlenen ve sonraki okutmaya uygulanacak adet. */
  const [pendingQty, setPendingQty] = useState(1);
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
   *
   * Adet öneki: `5*` tek başına gönderilirse sonraki okutma için 5 saklanır;
   * `5*8690001` biçiminde gönderilirse 5 adet doğrudan eklenir. Ürün eklendikten
   * sonra adet 1'e döner.
   */
  const handleScan = useCallback(
    async (raw: string) => {
      setReceipt(null);
      const { qty, code } = parseScanInput(raw);

      if (qty !== null && qty < 1) {
        setError("Adet en az 1 olmalı. Örnek: 5*");
        return;
      }

      // Yalnızca adet girildi: barkod bekleniyor.
      if (code === "") {
        if (qty !== null) {
          setPendingQty(qty);
          setError(null);
        }
        return;
      }

      const quantity = qty ?? pendingQty;
      try {
        const product = await findByBarcode(code);
        if (product) dispatch({ type: "addProduct", product, qty: quantity });
        else dispatch({ type: "addAdHoc", barcode: code, qty: quantity });
        setPendingQty(1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Barkod okunamadı.");
      }
    },
    [dispatch, pendingQty],
  );

  /** Izgaradan seçimde de bekleyen adet uygulanır ve ardından 1'e döner. */
  function handlePick(product: Product) {
    setReceipt(null);
    dispatch({ type: "addProduct", product, qty: pendingQty });
    setPendingQty(1);
  }

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
          <div className="scan-field">
            <ScannerInput
              onSubmit={(code) => void handleScan(code)}
              placeholder={
                pendingQty > 1
                  ? `Barkod okutun… (${pendingQty} adet eklenecek)`
                  : "Barkod okutun… (adet için: 5*)"
              }
            />
            {pendingQty > 1 ? (
              <button
                type="button"
                className="qty-chip"
                onClick={() => setPendingQty(1)}
                title="Adedi 1'e döndür"
              >
                {pendingQty} adet ×
              </button>
            ) : null}
          </div>
          <input
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ürün ara…"
            aria-label="Ürün ara"
            autoComplete="off"
          />
        </header>

        <div className="sell-scroll">
          {error ? <p className="error">{error}</p> : null}

          {receipt ? <div className="banner success">{receipt}</div> : null}

          <ProductGrid products={products} onPick={handlePick} />
        </div>
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

import { useEffect, useState } from "react";
import { ProductsScreen } from "./components/ProductsScreen";
import { SalesHistoryScreen } from "./components/SalesHistoryScreen";
import { SellScreen } from "./components/SellScreen";
import { CartProvider } from "./lib/cart";
import { getDb } from "./lib/db";

type Tab = "satis" | "urunler" | "gecmis";

const TABS: { id: Tab; label: string }[] = [
  { id: "satis", label: "Satış" },
  { id: "urunler", label: "Ürünler" },
  { id: "gecmis", label: "Bugünkü Satışlar" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("satis");
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDb()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setFatal(
            caught instanceof Error
              ? `Veritabanı açılamadı: ${caught.message}`
              : "Veritabanı açılamadı.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (fatal) {
    return (
      <div className="boot">
        <p className="error">{fatal}</p>
        <p className="muted">Uygulamayı yeniden başlatın.</p>
      </div>
    );
  }

  if (!ready) {
    return <div className="boot muted">Hazırlanıyor…</div>;
  }

  return (
    <CartProvider>
      <div className="app">
        <nav className="tabs" aria-label="Bölümler">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tab ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <main className="content">
          {tab === "satis" ? <SellScreen /> : null}
          {tab === "urunler" ? <ProductsScreen /> : null}
          {tab === "gecmis" ? <SalesHistoryScreen /> : null}
        </main>
      </div>
    </CartProvider>
  );
}

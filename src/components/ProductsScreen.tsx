import { useCallback, useEffect, useRef, useState } from "react";
import { type ImportSummary, importProducts, listProducts } from "../actions/products";
import { DEFAULT_COLUMNS, looksLikeHeader, parseCsv, resolveColumns } from "../lib/csv";
import { formatTRY, parseTRY } from "../lib/money";
import type { Product } from "../lib/types";
import { ProductForm } from "./ProductForm";

/**
 * Ürünler ekranı.
 *
 * Tab değişince bileşen yeniden bağlandığından satış ekranı ürünleri taze
 * okur; ayrıca bildirim gerekmez.
 */
export function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  // Sorgu hem arama terimini hem de yenileme sayacını taşır; efekti
  // yeniden çalıştıracak gerçek bir bağımlılık olması için tek nesnede tutulur.
  const [query, setQuery] = useState({ term: "", version: 0 });
  const [loading, setLoading] = useState(true);
  const [formProduct, setFormProduct] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importModalRef = useRef<HTMLDivElement>(null);

  // CSV penceresi açıkken Esc ve dışarı tıklama kapatır.
  useEffect(() => {
    if (!importOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImportOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const modal = importModalRef.current;
      if (modal && !modal.contains(event.target as Node)) setImportOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [importOpen]);

  // Liste doğrudan sunucuda filtrelenir; ek filtre uygulanmaz.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const search = query.term;
  const setSearch = (term: string) => setQuery({ term, version: 0 });
  const reload = useCallback(() => {
    setQuery((current) => ({ ...current, version: current.version + 1 }));
  }, []);

  function handleSaved() {
    setFormOpen(false);
    setFormProduct(null);
    setMessage("Kaydedildi.");
    reload();
  }

  async function runImport() {
    setError(null);
    setMessage(null);

    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      setError("CSV metni boş görünüyor.");
      return;
    }

    const hasHeader = looksLikeHeader(rows[0]);
    const columns = hasHeader ? resolveColumns(rows[0]) : DEFAULT_COLUMNS;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    if (dataRows.length === 0) {
      setError("İçe aktarılacak veri satırı bulunamadı.");
      return;
    }

    const productsToImport = [];
    let parseErrors = 0;

    for (const cells of dataRows) {
      const sellCell = cells[columns.sell] ?? "";
      const sellCents = parseTRY(sellCell);
      if (sellCell.trim() !== "" && sellCents === null) {
        parseErrors += 1;
        continue;
      }

      // Maliyet sütunu yoksa 0 kabul edilir (eski CSV'lerle uyumluluk).
      let costCents = 0;
      if (columns.cost >= 0) {
        const costCell = cells[columns.cost] ?? "";
        const parsedCost = parseTRY(costCell);
        if (costCell.trim() !== "" && parsedCost === null) {
          parseErrors += 1;
          continue;
        }
        costCents = parsedCost ?? 0;
      }

      productsToImport.push({
        barcode: (cells[columns.barcode] ?? "").trim() || null,
        name: (cells[columns.name] ?? "").trim(),
        cost_cents: costCents,
        sell_cents: sellCents ?? 0,
        stock: Number.parseInt(cells[columns.stock] ?? "0", 10) || 0,
      });
    }

    if (productsToImport.length === 0) {
      setError("Geçerli ürün satırı bulunamadı.");
      return;
    }

    let summary: ImportSummary;
    try {
      summary = await importProducts(productsToImport);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }

    const parts = [`${summary.created} ürün eklendi`, `${summary.updated} ürün güncellendi`];
    if (summary.skipped > 0) parts.push(`${summary.skipped} satır atlandı`);
    if (parseErrors > 0) parts.push(`${parseErrors} satır okunamadı`);

    setMessage(`${parts.join(" · ")}.`);
    setImportOpen(false);
    setCsvText("");
    reload();
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <h1>Ürünler</h1>
        <div className="screen-actions">
          <input
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ara…"
            aria-label="Ürün ara"
            autoComplete="off"
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setImportOpen(true);
              setMessage(null);
              setError(null);
            }}
          >
            CSV ile içe aktar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setFormProduct(null);
              setFormOpen(true);
              setMessage(null);
              setError(null);
            }}
          >
            Ürün Ekle
          </button>
        </div>
      </header>

      {message ? <p className="notice">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {loading ? <p className="muted">Yükleniyor…</p> : null}

      {!loading && products.length === 0 ? (
        <p className="empty">
          Henüz ürün yok. <strong>Ürün Ekle</strong> ile başlayın ya da CSV ile içe aktarın.
        </p>
      ) : null}

      {!loading && products.length === 0 && search.trim() !== "" ? (
        <p className="empty">Eşleşen ürün bulunamadı.</p>
      ) : null}

      {products.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Barkod</th>
              <th>Ürün Adı</th>
              <th className="num">Maliyet</th>
              <th className="num">Satış</th>
              <th className="num">Stok</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className={product.stock < 0 ? "row-negative" : undefined}>
                <td className="mono">{product.barcode ?? "—"}</td>
                <td>{product.name}</td>
                <td className="num muted">{formatTRY(product.cost_cents)}</td>
                <td className="num strong">{formatTRY(product.sell_cents)}</td>
                <td className={`num ${product.stock <= 0 ? "stock-low" : ""}`}>{product.stock}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => {
                      setFormProduct(product);
                      setFormOpen(true);
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    Düzenle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {importOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            ref={importModalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="CSV ile içe aktar"
          >
            <h2>CSV ile içe aktar</h2>
            <p className="hint">
              Beklenen sütunlar: <strong>barkod ; ürün adı ; maliyet ; satış fiyatı ; stok</strong>.
              Ayraç olarak noktalı virgül, virgül veya sekme kullanılabilir. Tutarlar Türkçe biçimde
              girilir (ör. <span className="mono">12,50</span>). Başlık satırı varsa sütunlar
              adlarıyla eşleştirilir; maliyet sütunu yoksa 0 kabul edilir.
            </p>

            <textarea
              className="csv-area"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={8}
              placeholder={
                "barkod;ürün adı;maliyet;satış fiyatı;stok\n8690500000001;Çay 500g;8,00;12,50;20"
              }
              spellCheck={false}
            />

            <label className="btn ghost file-label">
              Dosyadan seç
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file.text().then(setCsvText);
                }}
              />
            </label>

            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={() => setImportOpen(false)}>
                İptal
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={runImport}
                disabled={csvText.trim() === ""}
              >
                İçe aktar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <ProductForm
          product={formProduct}
          onClose={() => {
            setFormOpen(false);
            setFormProduct(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}

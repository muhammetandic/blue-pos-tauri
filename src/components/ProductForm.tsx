import { useEffect, useRef, useState } from "react";
import { createProduct, deleteProduct, listPriceHistory, updateProduct } from "../actions/products";
import { centsToInput, formatTRY, parseTRY } from "../lib/money";
import { formatDbDate, formatDbTime } from "../lib/turkish";
import type { PriceRecord, Product, ProductInput } from "../lib/types";

interface ProductFormProps {
  /** Düzenlenecek ürün; boş bırakılırsa yeni ürün eklenir. */
  product?: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Ürün ekleme ve düzenleme penceresi. */
export function ProductForm({ product, onClose, onSaved }: ProductFormProps) {
  const editing = product !== null && product !== undefined;

  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [cost, setCost] = useState(editing ? centsToInput(product.cost_cents) : "");
  const [sell, setSell] = useState(editing ? centsToInput(product.sell_cents) : "");
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(editing);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const productId = editing ? product.id : null;

  // Fiyat geçmişi yalnızca düzenleme sırasında gösterilir; her açılışta taze okunur.
  useEffect(() => {
    if (productId === null) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    listPriceHistory(productId)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setHistoryError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Belge dinleyicisi: arka plana tıklama kapatır (statik eleman kuralına takılmamak için).
    const onPointerDown = (event: MouseEvent) => {
      const modal = modalRef.current;
      if (modal && !modal.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName === "") {
      setError("Ürün adı boş olamaz.");
      return;
    }

    const priceCents = parseTRY(sell);
    if (priceCents === null) {
      setError("Geçerli bir satış fiyatı girin. Örnek: 12,50");
      return;
    }

    const costCents = parseTRY(cost);
    if (costCents === null) {
      setError("Geçerli bir maliyet girin. Örnek: 8,00");
      return;
    }

    const stockValue = Number(stock.replace(",", "."));
    if (!Number.isInteger(stockValue)) {
      setError("Stok tam sayı olmalıdır. Örnek: -5 veya 20");
      return;
    }

    const input: ProductInput = {
      barcode: barcode.trim() === "" ? null : barcode.trim(),
      name: trimmedName,
      cost_cents: costCents,
      sell_cents: priceCents,
      stock: stockValue,
    };

    setSaving(true);
    try {
      if (editing) await updateProduct(product.id, input);
      else await createProduct(input);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    const confirmed = globalThis.confirm(`"${product.name}" silinsin mi?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteProduct(product.id);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Silinemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Ürün Düzenle" : "Ürün Ekle"}
      >
        <h2>{editing ? "Ürün Düzenle" : "Ürün Ekle"}</h2>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Barkod</span>
            <input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="Boş bırakılabilir"
              autoComplete="off"
              inputMode="numeric"
            />
          </label>

          <label className="field">
            <span>Ürün Adı</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Örnek: Çay 500g"
              autoComplete="off"
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Maliyet</span>
              <input
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="8,00"
                inputMode="decimal"
                autoComplete="off"
                required
              />
            </label>

            <label className="field">
              <span>Satış Fiyatı</span>
              <input
                value={sell}
                onChange={(event) => setSell(event.target.value)}
                placeholder="12,50"
                inputMode="decimal"
                autoComplete="off"
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Stok</span>
            <input
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              placeholder="0"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>

          <p className="hint">
            Tutarlar virgüllü ondalık ayracıyla girilir. Her fiyat değişikliği geçmişe kaydedilir;
            güncel fiyat her zaman en son kayıttır. Stok eksi değere düşebilir.
          </p>

          {editing ? (
            <section className="price-history">
              <h3>Fiyat Geçmişi</h3>
              {historyLoading ? (
                <p className="muted">Fiyat geçmişi yükleniyor…</p>
              ) : historyError ? (
                <p className="error">{historyError}</p>
              ) : history.length === 0 ? (
                <p className="muted">Bu ürün için fiyat kaydı yok.</p>
              ) : (
                <table className="table inner">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th className="num">Maliyet</th>
                      <th className="num">Satış</th>
                      <th className="num">Kâr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record, index) => (
                      <tr key={record.id} className={index === 0 ? "current" : undefined}>
                        <td className="mono">
                          {formatDbDate(record.created_at)} {formatDbTime(record.created_at)}
                        </td>
                        <td className="num">{formatTRY(record.cost_cents)}</td>
                        <td className="num">{formatTRY(record.sell_cents)}</td>
                        <td className="num">{formatTRY(record.sell_cents - record.cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}

          {error ? <p className="error">{error}</p> : null}

          <div className="modal-actions">
            {editing ? (
              <button type="button" className="btn danger" onClick={handleDelete} disabled={saving}>
                Sil
              </button>
            ) : null}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
              Vazgeç
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Kaydediliyor…" : "Onayla"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createProduct, deleteProduct, updateProduct } from "../actions/products";
import { centsToInput, parseTRY } from "../lib/money";
import type { Product, ProductInput } from "../lib/types";

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
  const [price, setPrice] = useState(editing ? centsToInput(product.price_cents) : "");
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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

    const priceCents = parseTRY(price);
    if (priceCents === null) {
      setError("Geçerli bir fiyat girin. Örnek: 12,50");
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
      price_cents: priceCents,
      stock: stockValue,
    };

    setSaving(true);
    try {
      if (editing) await updateProduct(product.id, input);
      else await createProduct(input);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kaydedilemedi.");
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
              <span>Fiyat</span>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="12,50"
                inputMode="decimal"
                autoComplete="off"
                required
              />
            </label>

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
          </div>

          <p className="hint">Fiyat ondalık ayracı virgülle girilir. Stok eksi değere düşebilir.</p>

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

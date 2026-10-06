import { useEffect, useRef, useState } from "react";
import { cartTotal, checkout } from "../actions/sales";
import { formatTRY, parseTRY } from "../lib/money";
import type { CartLine, CheckoutResult, PaymentMethod } from "../lib/types";

interface PaymentDialogProps {
  lines: CartLine[];
  onCompleted: (result: CheckoutResult) => void;
  onClose: () => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart" },
  { value: "mobil", label: "Mobil" },
];

/** Yaygın banknot kısayolları; nakit hesabında hızlı seçim sağlar. */
const CASH_SHORTCUTS = [10000, 20000, 50000, 100000];

export function PaymentDialog({ lines, onCompleted, onClose }: PaymentDialogProps) {
  const total = cartTotal(lines);

  const [method, setMethod] = useState<PaymentMethod>("nakit");
  // Nakit başlangıçta toplamla doldurulur; tekrar yazılabilecek bir alan.
  const [paid, setPaid] = useState(() => formatTRY(total).replace("₺", ""));
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paidRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    paidRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    // Pencere dışında tıklama kapatır. Dinleyici JSX yerine belgeye
    // asılır; aksi hâlde arka plan statik eleman olarak sınıflandırılır.
    const onPointerDown = (event: MouseEvent) => {
      if (busy) return;
      const modal = modalRef.current;
      if (modal && !modal.contains(event.target as Node)) onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [busy, onClose]);

  const paidCents = method === "nakit" ? (parseTRY(paid) ?? 0) : total;
  const change = paidCents - total;
  const insufficient = method === "nakit" && paidCents < total;

  async function handleConfirm() {
    setError(null);

    if (lines.length === 0) {
      setError("Sepet boş.");
      return;
    }
    if (insufficient) {
      setError(`Yetersiz ödeme. Eksik: ${formatTRY(total - paidCents)}`);
      return;
    }

    setBusy(true);
    try {
      const outcome = await checkout({
        lines,
        method,
        paid_cents: paidCents,
        reference: method === "nakit" ? null : reference.trim() || null,
      });
      onCompleted(outcome);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : String(caught);
      // Tauri, Rust'taki String hatayı doğrudan iletir.
      setError(
        text.includes("Yetersiz ödeme")
          ? `Yetersiz ödeme. Eksik: ${formatTRY(total - paidCents)}`
          : text,
      );
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={modalRef}
        className="modal payment"
        role="dialog"
        aria-modal="true"
        aria-label="Ödeme"
      >
        <h2>Ödeme</h2>

        <div className="payment-total">
          <span>Toplam</span>
          <strong>{formatTRY(total)}</strong>
        </div>

        <fieldset className="method-row">
          <legend className="sr-only">Ödeme yöntemi</legend>
          {METHODS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`btn method ${method === item.value ? "active" : ""}`}
              aria-pressed={method === item.value}
              onClick={() => {
                setMethod(item.value);
                setError(null);
              }}
              disabled={busy}
            >
              {item.label}
            </button>
          ))}
        </fieldset>

        {method === "nakit" ? (
          <>
            <label className="field">
              <span>Verilen</span>
              <input
                ref={paidRef}
                value={paid}
                onChange={(event) => {
                  setPaid(event.target.value);
                  setError(null);
                }}
                inputMode="decimal"
                autoComplete="off"
                disabled={busy}
              />
            </label>

            <div className="shortcut-row">
              <button
                type="button"
                className="btn tiny"
                onClick={() => setPaid(formatTRY(total).replace("₺", ""))}
                disabled={busy}
              >
                Tamamı
              </button>
              {CASH_SHORTCUTS.filter((amount) => amount >= total).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="btn tiny"
                  onClick={() => setPaid(formatTRY(amount).replace("₺", ""))}
                  disabled={busy}
                >
                  {formatTRY(amount)}
                </button>
              ))}
            </div>

            <div className={`payment-change ${insufficient ? "negative" : ""}`}>
              <span>{insufficient ? "Eksik" : "Para Üstü"}</span>
              <strong>{formatTRY(insufficient ? total - paidCents : change)}</strong>
            </div>
          </>
        ) : (
          <label className="field">
            <span>Referans No</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Provizyon / işlem numarası"
              autoComplete="off"
              disabled={busy}
            />
            <small className="hint">
              Kart veya mobil ödeme terminalinden alınan numarayı girin. Zorunlu değildir.
            </small>
          </label>
        )}

        {error ? <p className="error">{error}</p> : null}

        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            İptal
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleConfirm}
            disabled={busy || lines.length === 0}
          >
            {busy ? "Kaydediliyor…" : "Satışı Tamamla"}
          </button>
        </div>
      </div>
    </div>
  );
}

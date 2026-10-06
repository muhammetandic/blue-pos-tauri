import { useCart } from "../lib/cart";
import { formatTRY } from "../lib/money";
import type { CartLine } from "../lib/types";

interface CartPanelProps {
  onCheckout: () => void;
}

function Line({ line }: { line: CartLine }) {
  const { dispatch } = useCart();
  const sum = line.price_cents * line.qty;

  return (
    <li className={`cart-line ${line.product_id === null ? "ad-hoc" : ""}`}>
      <div className="cart-line-main">
        <span className="cart-line-name">{line.name}</span>
        <span className="cart-line-sum">{formatTRY(sum)}</span>
      </div>
      <div className="cart-line-controls">
        <button
          type="button"
          className="btn tiny"
          aria-label={`${line.name} adedini azalt`}
          onClick={() => dispatch({ type: "dec", key: line.key })}
        >
          −
        </button>
        <span className="cart-line-qty">{line.qty}</span>
        <button
          type="button"
          className="btn tiny"
          aria-label={`${line.name} adedini artır`}
          onClick={() => dispatch({ type: "inc", key: line.key })}
        >
          +
        </button>
        <button
          type="button"
          className="btn tiny danger"
          aria-label={`${line.name} satırını kaldır`}
          onClick={() => dispatch({ type: "remove", key: line.key })}
        >
          Sil
        </button>
      </div>
    </li>
  );
}

export function CartPanel({ onCheckout }: CartPanelProps) {
  const { lines, dispatch, total_cents, item_count, unknownBarcode } = useCart();

  return (
    <aside className="cart">
      <header className="cart-header">
        <h2>Sepet</h2>
        <span className="cart-count">{item_count} ürün</span>
        {lines.length > 0 ? (
          <button
            type="button"
            className="btn tiny ghost push-right"
            onClick={() => dispatch({ type: "clear" })}
          >
            Sepet Boş
          </button>
        ) : null}
      </header>

      {unknownBarcode ? (
        <div className="banner warn">
          <span>Bilinmeyen barkod: {unknownBarcode}</span>
          <button
            type="button"
            className="btn tiny ghost"
            onClick={() => dispatch({ type: "clearUnknown" })}
          >
            Tamam
          </button>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <p className="empty">Sepet boş. Barkod okutun veya ürün seçin.</p>
      ) : (
        <ul className="cart-lines">
          {lines.map((line) => (
            <Line key={line.key} line={line} />
          ))}
        </ul>
      )}

      <footer className="cart-footer">
        <div className="cart-total">
          <span>Toplam</span>
          <strong>{formatTRY(total_cents)}</strong>
        </div>
        <button
          type="button"
          className="btn primary block"
          onClick={onCheckout}
          disabled={lines.length === 0}
        >
          Ödeme
        </button>
      </footer>
    </aside>
  );
}

import { createContext, type ReactNode, useContext, useMemo, useReducer } from "react";
import type { CartLine, Product } from "./types";

/**
 * Sepet durumu.
 *
 * Satır anahtarı kimlikten türetilir (`p{id}` / `a{barkod}`), böylece aynı
 * ürün ikinci kez okutulduğunda yeni satır açılmaz, miktar artar.
 */
export interface CartState {
  lines: CartLine[];
  /** Son okutulan bilinmeyen barkod; uyarı balonu için. */
  unknownBarcode: string | null;
}

export type CartAction =
  | { type: "addProduct"; product: Product; qty?: number }
  | { type: "addAdHoc"; barcode: string; qty?: number }
  | { type: "remove"; key: string }
  | { type: "clearUnknown" }
  | { type: "clear" };

export const initialState: CartState = { lines: [], unknownBarcode: null };

/** Eklenecek adet: 1'den küçük veya geçersiz değerler 1 kabul edilir. */
function quantityOf(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) return 1;
  return value;
}

function productKey(productId: number): string {
  return `p${productId}`;
}

function adHocKey(barcode: string): string {
  return `a${barcode}`;
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "addProduct": {
      const key = productKey(action.product.id);
      const qty = quantityOf(action.qty);
      const existing = state.lines.find((line) => line.key === key);
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((line) =>
            line.key === key ? { ...line, qty: line.qty + qty } : line,
          ),
        };
      }
      return {
        ...state,
        unknownBarcode: null,
        lines: [
          ...state.lines,
          {
            key,
            product_id: action.product.id,
            price_id: action.product.price_id,
            name: action.product.name,
            sell_cents: action.product.sell_cents,
            qty,
          },
        ],
      };
    }

    case "addAdHoc": {
      const key = adHocKey(action.barcode);
      const qty = quantityOf(action.qty);
      const existing = state.lines.find((line) => line.key === key);
      if (existing) {
        return {
          ...state,
          unknownBarcode: action.barcode,
          lines: state.lines.map((line) =>
            line.key === key ? { ...line, qty: line.qty + qty } : line,
          ),
        };
      }
      return {
        ...state,
        unknownBarcode: action.barcode,
        lines: [
          ...state.lines,
          {
            key,
            product_id: null,
            price_id: null,
            name: `Bilinmeyen barkod ${action.barcode}`,
            sell_cents: 0,
            qty,
          },
        ],
      };
    }

    case "remove":
      return { ...state, lines: state.lines.filter((line) => line.key !== action.key) };

    case "clearUnknown":
      return { ...state, unknownBarcode: null };

    case "clear":
      return { lines: [], unknownBarcode: null };

    default:
      return state;
  }
}

interface CartContextValue extends CartState {
  dispatch: React.Dispatch<CartAction>;
  total_cents: number;
  item_count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const value = useMemo<CartContextValue>(() => {
    const total_cents = state.lines.reduce((sum, line) => sum + line.sell_cents * line.qty, 0);
    const item_count = state.lines.reduce((sum, line) => sum + line.qty, 0);
    return { ...state, dispatch, total_cents, item_count };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart yalnızca CartProvider içinde kullanılabilir");
  return ctx;
}

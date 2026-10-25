/**
 * Barkod alanındaki adet önekini çözer.
 *
 * Klavye odaklı satış için iki kullanım desteklenir:
 *
 * - `5*` + Enter: sonraki okutma için adet 5 olarak saklanır.
 * - `5*8690001` + Enter: 8690001 barkodlu üründen 5 adet eklenir.
 *
 * Önek yoksa adet `null` döner ve çağıran taraf kendi varsayılanını kullanır.
 */
export interface ScanInput {
  /** Önek varsa adet; yoksa null. Geçersiz/saşmış değerlerde 0 döner. */
  qty: number | null;
  /** Önekten sonra kalan barkod; yalnızca adet girildiyse boş dizedir. */
  code: string;
}

const QTY_PREFIX = /^(\d+)\s*\*\s*(.*)$/;

export function parseScanInput(raw: string): ScanInput {
  const value = raw.trim();
  const match = QTY_PREFIX.exec(value);
  if (!match) return { qty: null, code: value };

  const parsed = Number.parseInt(match[1], 10);
  return {
    qty: Number.isSafeInteger(parsed) ? parsed : 0,
    code: match[2].trim(),
  };
}

/**
 * CSV ayrıştırıcı.
 *
 * Türk Excel varsayılan olarak noktalı virgül (`;`) ayraç ve virgül (`,`)
 * ondalık ayracı kullanır. Bu yüzden ayraç önce `;` için denenir. Ayrıca
 * tırnak içindeki alanlar ve `""` kaçışı desteklenir.
 */

/** Ayraç tahmini: ilk satırdaki alan sayısına göre en tutarlısını seçer. */
export function detectDelimiter(text: string): string {
  const candidates = [";", ",", "\t", "|"];
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine === "") return ";";

  let best = ";";
  let bestCount = 0;

  for (const delimiter of candidates) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** Tırnak destekli CSV metnini satırlara böler. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // \r\n: \n dalı zaten işleyecek, burada yut.
    } else {
      field += char;
    }
  }

  // Son satırın sonunda satır sonu olmayabilir.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Tamamen boş satırları at.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const HEADER_CELLS = new Set([
  "barkod",
  "ürün adı",
  "urun adi",
  "urun adı",
  "ad",
  "isim",
  "adı",
  "adi",
  "fiyat",
  "fiyatı",
  "fiyati",
  "stok",
  "adet",
  "miktar",
]);

/** İlk satır başlık satırı mı? */
export function looksLikeHeader(cells: string[]): boolean {
  const matched = cells.filter((cell) => HEADER_CELLS.has(cell.trim().toLowerCase()));
  return matched.length >= 2;
}

/**
 * Sütun sırasını başlıktan çıkarır; yokta varsayılan sırayı kullanır.
 * Beklenen varsayılan: barkod, ad, fiyat, stok
 */
export interface ColumnMap {
  barcode: number;
  name: number;
  price: number;
  stock: number;
}

export const DEFAULT_COLUMNS: ColumnMap = { barcode: 0, name: 1, price: 2, stock: 3 };

export function resolveColumns(header: string[]): ColumnMap {
  const columns: ColumnMap = { ...DEFAULT_COLUMNS };
  const normalized = header.map((cell) => cell.trim().toLowerCase());

  normalized.forEach((cell, index) => {
    if (cell === "barkod") columns.barcode = index;
    else if (cell === "fiyat" || cell === "fiyatı" || cell === "fiyati") columns.price = index;
    else if (cell === "stok" || cell === "adet" || cell === "miktar") columns.stock = index;
    else if (
      cell === "ürün adı" ||
      cell === "urun adi" ||
      cell === "urun adı" ||
      cell === "ad" ||
      cell === "isim" ||
      cell === "adı" ||
      cell === "adi"
    ) {
      columns.name = index;
    }
  });

  return columns;
}

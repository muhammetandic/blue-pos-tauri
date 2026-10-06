/**
 * Türkçe para birimi yardımcıları.
 *
 * DİKKAT: Türkçede ondalık ayracı virgül, binlik ayracı noktadır.
 * parseFloat("12,50") -> 12  ve  parseFloat("1.234,56") -> 1.234
 * Bu yüzden parseFloat burada asla kullanılmaz.
 *
 * Girdi biçimi desteklenir: "12", "12,5", "12,50", "1.234,56", "₺1.234,56"
 * Fiyat ve ödeme tutarları negatif olamaz.
 */

const fmt = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

const plain = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Kuruş cinsinden tutarı "₺1.234,56" biçiminde gösterir. */
export function formatTRY(cents: number): string {
  return fmt.format(cents / 100);
}

/** Kuruş cinsinden tutarı "1.234,56" biçiminde gösterir (₺ işareti olmadan). */
export function formatAmount(cents: number): string {
  return plain.format(cents / 100);
}

/**
 * Kullanıcının girdiği Türkçe tutarı kuruşa çevirir.
 * Geçersiz veya negatif girdi için null döner.
 */
export function parseTRY(input: string): number | null {
  const trimmed = input.trim().replace(/\s|₺|TL|tl/g, "");
  if (trimmed === "") return null;
  if (!/^[0-9.,]*$/.test(trimmed)) return null;

  const commas = (trimmed.match(/,/g) ?? []).length;
  if (commas > 1) return null; // virgül yalnızca ondalık ayracıdır

  const comma = trimmed.lastIndexOf(",");
  let digits: string;

  if (comma !== -1) {
    // Türkçe kural: virgül her zaman ondalık ayracıdır, noktalar binliktir.
    // "1.000,00" -> "1000.00", "12,567" -> "12.567" (sonradan reddedilir)
    digits = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = (trimmed.match(/\./g) ?? []).length;
    if (dots === 0) {
      digits = trimmed;
    } else if (dots === 1) {
      // Tek nokta: sağında tam 3 basamak varsa binlik ("1.234"),
      // aksi hâlde ondalıktır ("12.50").
      const dot = trimmed.lastIndexOf(".");
      const after = trimmed.length - dot - 1;
      digits = after === 3 ? trimmed.replace(/\./g, "") : trimmed;
    } else {
      // Birden çok nokta: binlik ayracıdır, gruplar 3'er basamak olmalıdır.
      if (!/^\d{1,3}(?:\.\d{3})+$/.test(trimmed)) return null;
      digits = trimmed.replace(/\./g, "");
    }
  }

  if (digits === "" || digits === ".") return null;
  if ((digits.match(/\./g) ?? []).length > 1) return null;
  if (digits.startsWith(".")) digits = `0${digits}`;
  if (digits.endsWith(".")) digits += "0"; // "12," -> "12.0"

  // Ondalık kısım 2 basamağı aşamaz (kuruş hassasiyeti).
  const dotPos = digits.lastIndexOf(".");
  if (dotPos !== -1 && digits.length - dotPos - 1 > 2) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(digits)) return null;

  const value = Number(digits);
  if (!Number.isFinite(value)) return null;

  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return cents;
}

/** Kuruş değerini ekran girişi için "1.234,56" metnine çevirir. */
export function centsToInput(cents: number): string {
  return plain.format(cents / 100);
}

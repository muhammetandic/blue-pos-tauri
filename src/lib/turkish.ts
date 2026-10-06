/**
 * Türkçe metin yardımcıları.
 */

/**
 * Arama için ASCII katlamalı küçültülmüş metin üretir.
 *
 * Gerekçe: SQLite'ın LIKE ve lower() işlevleri yalnızca ASCII harfleri
 * katlar. "Çay" kaydı için "çay" araması aksi hâlde hiç sonuç vermez.
 * Bu nedenle products.name_search sütununa buradaki katlama yazılır.
 */
export function foldForSearch(input: string): string {
  return input
    .replace(/[ıİIîÎ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜûÛ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[âÂ]/g, "a")
    .toLowerCase();
}

/** Türkçe kurallarına göre büyük harfe çevirir (i -> İ, ı -> I). */
export function trUpper(input: string): string {
  return input.toLocaleUpperCase("tr-TR");
}

/** Barkod: yalnızca rakam ve kısa çizgi. */
export function normalizeBarcode(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed;
}

/** Türkçe tarih: 5.10.2026 */
const dateFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short" });

/** Türkçe tarih: 5 Ekim 2026 */
const dateLongFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" });

/** Türkçe saat: 14:30 */
const timeFmt = new Intl.DateTimeFormat("tr-TR", { timeStyle: "short" });

/**
 * SQLite datetime('now') çıktısı yerel saat diliminde, saniyesiz gelir.
 * Bunun için datetime alanını önce Date nesnesine çeviririz.
 */
export function parseDbDateTime(value: string): Date | null {
  // "2026-10-05 14:30:00" veya "2026-10-05T14:30:00"
  const normalized = value.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDbDate(value: string): string {
  const d = parseDbDateTime(value);
  return d ? dateFmt.format(d) : value;
}

export function formatDbDateLong(value: string): string {
  const d = parseDbDateTime(value);
  return d ? dateLongFmt.format(d) : value;
}

export function formatDbTime(value: string): string {
  const d = parseDbDateTime(value);
  return d ? timeFmt.format(d) : value;
}

/** Bugün için SQLite tarih başlığı, "YYYY-MM-DD" biçiminde. */
export function todayPrefix(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

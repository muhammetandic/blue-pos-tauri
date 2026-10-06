import { useCallback, useEffect, useRef } from "react";

interface ScannerInputProps {
  /** Barkod tamamlandığında (Enter) çağrılır. Değer boşsa çağrılmaz. */
  onSubmit: (barcode: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Klavye-wedge barkod okuyucu için giriş alanı.
 *
 * Okuyucu bir klavye gibi davranır: karakterleri hızla yazar ve Enter'a basar.
 * Odak bir düğmede veya başka bir yerde kalmışsa bile okumanın kaçmaması için
 * iki koruma vardır:
 *
 *  1. `focusin`: odak bir metin alanına geçmedikçe giriş alanına geri alınır.
 *  2. `keydown`: odak hiçbir metin alanında değilken gelen yazdırılabilir
 *     karakterler doğrudan bu alana eklenir. Böylece tarama her hâlde yakalanır.
 *
 * Odak bir metin alanı/Button değilse Enter da okuma tamamlamak için kullanılır.
 */
export function ScannerInput({
  onSubmit,
  placeholder = "Barkod okutun veya yazın…",
  autoFocus = true,
}: ScannerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const submit = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const code = input.value.trim();
    input.value = "";
    if (code !== "") submitRef.current(code);
  }, []);

  const isEditable = useCallback((node: EventTarget | null): boolean => {
    if (!(node instanceof HTMLElement)) return false;
    if (node instanceof HTMLTextAreaElement) return true;
    if (node instanceof HTMLInputElement) return true;
    if (node instanceof HTMLSelectElement) return true;
    return node.isContentEditable;
  }, []);

  /**
   * Bir pencere (ürün formu, ödeme) açıkken okuyucu devre dışıdır.
   * Aksi hâlde odak pencereye kaçmak yerine barkod alanına geri çekilir
   * ve pencere içinde yazılan metin gizlice okuma alanına düşer.
   */
  const isBlocked = useCallback(() => document.querySelector(".modal-backdrop") !== null, []);

  useEffect(() => {
    // autoFocus özelliği JSX ile yazılmaz (a11y kuralı); programatik olarak verilir.
    if (autoFocus) inputRef.current?.focus();

    const onFocusIn = (event: FocusEvent) => {
      if (isBlocked()) return;
      if (isEditable(event.target)) return;
      inputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input) return;
      if (isBlocked()) return;

      // Metin alanı odaktaysa o alan kendi girişini yönetir; müdahale etme.
      if (isEditable(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Enter") {
        // Odak zaten giriş alanındaysa input'un kendi dinleyicisi çözer.
        if (event.target === input) return;
        // Bir düğme odaktaysa Enter o düğmeyi çalıştırmalıdır.
        if (event.target !== document.body && event.target !== input) return;
        if (input.value.trim() === "") return;
        event.preventDefault();
        submit();
        return;
      }

      if (event.key.length !== 1) return; // Shift, Escape, ok tuşları vb.

      event.preventDefault();
      input.focus();
      input.value += event.key;
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [autoFocus, isBlocked, isEditable, submit]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className="scanner-input"
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      aria-label="Barkod"
    />
  );
}

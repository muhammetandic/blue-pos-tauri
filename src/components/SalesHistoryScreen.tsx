import { useEffect, useState } from "react";
import { type DailySummary, listTodaySales, todaySummary } from "../actions/sales";
import { formatTRY } from "../lib/money";
import { formatDbDateLong, formatDbTime } from "../lib/turkish";
import type { Sale } from "../lib/types";

const METHOD_LABEL: Record<string, string> = {
  nakit: "Nakit",
  kart: "Kart",
  mobil: "Mobil",
};

export function SalesHistoryScreen() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Yenileme sayacı efektin gerçek bağımlılığı olsun diye nesnede tutulur.
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: yenileme sayacı efekt gövdesinde okunmaz; yalnızca zorla yenilemek içindir.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([listTodaySales(), todaySummary()])
      .then(([rows, totals]) => {
        if (cancelled) return;
        setSales(rows);
        setSummary(totals);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Satışlar yüklenemedi.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <section className="screen">
      <header className="screen-header">
        <h1>Bugünkü Satışlar</h1>
        <div className="screen-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setReload((value) => value + 1)}
          >
            Yenile
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Yükleniyor…</p> : null}

      {summary && !loading ? (
        <div className="summary-row">
          <div className="summary-card">
            <span>Satış</span>
            <strong>{summary.sale_count}</strong>
          </div>
          <div className="summary-card">
            <span>Ürün</span>
            <strong>{summary.item_count}</strong>
          </div>
          <div className="summary-card">
            <span>Toplam</span>
            <strong>{formatTRY(summary.total_cents)}</strong>
          </div>
          <div className="summary-card">
            <span>Nakit</span>
            <strong>{formatTRY(summary.cash_cents)}</strong>
          </div>
        </div>
      ) : null}

      {!loading && sales.length === 0 ? (
        <p className="empty">Bugün henüz satış yapılmadı.</p>
      ) : null}

      {sales.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Saat</th>
              <th>Yöntem</th>
              <th>Referans</th>
              <th className="num">Tutar</th>
              <th className="num">Verilen</th>
              <th className="num">Para Üstü</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td className="mono">
                  {formatDbTime(sale.created_at)}
                  <span className="muted"> {formatDbDateLong(sale.created_at)}</span>
                </td>
                <td>{METHOD_LABEL[sale.method] ?? sale.method}</td>
                <td className="mono">{sale.reference ?? "—"}</td>
                <td className="num strong">{formatTRY(sale.total_cents)}</td>
                <td className="num">{formatTRY(sale.paid_cents)}</td>
                <td className="num">{formatTRY(sale.change_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

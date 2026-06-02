import { useMemo, useState } from 'react';
import type { Book, Level } from '../dreamdex/useOrderbook';

type Row = { price: number; qty: number; cum: number };

function group(levels: Level[], g: number, isBid: boolean): Row[] {
  if (g <= 0) return levels.map((l) => ({ ...l, cum: 0 }));
  const buckets = new Map<number, number>();
  for (const l of levels) {
    const b = (isBid ? Math.floor(l.price / g) : Math.ceil(l.price / g)) * g;
    const key = Math.round(b / g); // integer key avoids fp dupes
    buckets.set(key, (buckets.get(key) ?? 0) + l.qty);
  }
  const rows = Array.from(buckets.entries()).map(([k, qty]) => ({
    price: k * g,
    qty,
    cum: 0,
  }));
  rows.sort((a, b) => (isBid ? b.price - a.price : a.price - b.price));
  let cum = 0;
  for (const r of rows) {
    cum += r.qty;
    r.cum = cum;
  }
  return rows;
}

function fmt(n: number, dp: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
}

const ROWS = 11;

export default function Orderbook({
  book,
  priceDp,
  onPick,
}: {
  book: Book;
  priceDp: number;
  onPick: (price: string, side: 'buy' | 'sell') => void;
}) {
  const tick = Number(book.info?.tickSize ?? '0.01');
  const [factor, setFactor] = useState(1);
  const g = tick * factor;

  const { bids, asks, maxCum } = useMemo(() => {
    const bids = group(book.bids, g, true).slice(0, ROWS);
    const asks = group(book.asks, g, false).slice(0, ROWS);
    const maxCum = Math.max(
      1,
      bids[bids.length - 1]?.cum ?? 0,
      asks[asks.length - 1]?.cum ?? 0,
    );
    return { bids, asks, maxCum };
  }, [book.bids, book.asks, g]);

  const groupDp = useMemo(() => {
    const s = String(g);
    const frac = s.split('.')[1]?.replace(/0+$/, '').length ?? 0;
    return Math.max(frac, 0);
  }, [g]);

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
  const spreadBps =
    bestBid && bestAsk && mid ? ((bestAsk - bestBid) / mid) * 10_000 : undefined;

  // Pad to a fixed number of rows so the book never changes height (no jumping).
  const asksRows: (Row | null)[] = [
    ...Array(Math.max(0, ROWS - asks.length)).fill(null),
    ...[...asks].reverse(),
  ];
  const bidsRows: (Row | null)[] = [
    ...bids,
    ...Array(Math.max(0, ROWS - bids.length)).fill(null),
  ];

  return (
    <section className="panel book-panel">
      <div className="panel-title with-controls">
        <span>Order Book</span>
        <div className="intervals">
          {[1, 10, 100].map((f) => (
            <button key={f} className={factor === f ? 'active' : ''} onClick={() => setFactor(f)}>
              {f === 1 ? tick : fmt(tick * f, groupDp)}
            </button>
          ))}
        </div>
      </div>

      <div className="bookhead">
        <span>price ({book.info?.quote.symbol ?? 'quote'})</span>
        <span>size ({book.info?.base.symbol ?? 'base'})</span>
        <span>total</span>
      </div>

      <div className="book">
        {book.error && <div className="error">⚠ {book.error}</div>}

        {asksRows.map((r, i) =>
          r ? (
            <div
              className="row ask"
              key={`a-${i}`}
              onClick={() => onPick(r.price.toFixed(groupDp), 'buy')}
              title="click to buy at this price"
            >
              <span className="bar" style={{ width: `${(r.cum / maxCum) * 100}%` }} />
              <span className="price">{fmt(r.price, Math.max(groupDp, priceDp))}</span>
              <span className="qty">{fmt(r.qty, 3)}</span>
              <span className="cum">{fmt(r.cum, 2)}</span>
            </div>
          ) : (
            <div className="row empty" key={`a-${i}`} />
          ),
        )}

        <div className="midline">
          {mid ? (
            <>
              <span className="mid">{fmt(mid, priceDp)}</span>
              {book.markPrice !== undefined && (
                <span className="mark">mark {fmt(book.markPrice, priceDp)}</span>
              )}
              {spreadBps !== undefined && (
                <span className="spread">{spreadBps.toFixed(1)} bps</span>
              )}
            </>
          ) : book.loading ? (
            'loading…'
          ) : (
            'no liquidity'
          )}
        </div>

        {bidsRows.map((r, i) =>
          r ? (
            <div
              className="row bid"
              key={`b-${i}`}
              onClick={() => onPick(r.price.toFixed(groupDp), 'sell')}
              title="click to sell at this price"
            >
              <span className="bar" style={{ width: `${(r.cum / maxCum) * 100}%` }} />
              <span className="price">{fmt(r.price, Math.max(groupDp, priceDp))}</span>
              <span className="qty">{fmt(r.qty, 3)}</span>
              <span className="cum">{fmt(r.cum, 2)}</span>
            </div>
          ) : (
            <div className="row empty" key={`b-${i}`} />
          ),
        )}
      </div>
    </section>
  );
}

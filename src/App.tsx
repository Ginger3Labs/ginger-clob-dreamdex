import { useMemo, useState } from 'react';
import { INTERVALS, MARKETS, type Interval } from './dreamdex/config';
import { useOrderbook, type Level } from './dreamdex/useOrderbook';
import { useCandles, usePriceTape } from './dreamdex/useFeeds';
import Chart from './components/Chart';
import PriceTape from './components/PriceTape';
import ConnectButton from './components/ConnectButton';
import OrderTicket from './components/OrderTicket';

function fmt(n: number, dp = 6) {
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
}

function DepthRows({
  levels,
  side,
  maxQty,
  priceDp,
}: {
  levels: Level[];
  side: 'bid' | 'ask';
  maxQty: number;
  priceDp: number;
}) {
  return (
    <>
      {levels.map((l, i) => {
        const pct = maxQty > 0 ? (l.qty / maxQty) * 100 : 0;
        return (
          <div className={`row ${side}`} key={`${side}-${i}`}>
            <span className="bar" style={{ width: `${pct}%` }} />
            <span className="price">{fmt(l.price, priceDp)}</span>
            <span className="qty">{fmt(l.qty, 4)}</span>
          </div>
        );
      })}
    </>
  );
}

export default function App() {
  const [marketIdx, setMarketIdx] = useState(0);
  const [interval, setInterval] = useState<Interval>('1m');
  const market = MARKETS[marketIdx];

  const book = useOrderbook(market);
  const { ticks } = usePriceTape(market);
  const { candles, loading: candlesLoading } = useCandles(market, interval);

  const priceDp = useMemo(() => {
    const t = book.info?.tickSize ?? '0.01';
    const frac = t.split('.')[1]?.replace(/0+$/, '').length ?? 2;
    return Math.max(frac, 2);
  }, [book.info?.tickSize]);

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
  const spreadBps =
    bestBid && bestAsk && mid ? ((bestAsk - bestBid) / mid) * 10_000 : undefined;

  const lastTick = ticks[0];

  const maxQty = Math.max(
    0,
    ...book.bids.map((l) => l.qty),
    ...book.asks.map((l) => l.qty),
  );
  const asksDisplay = [...book.asks].reverse();

  return (
    <div className="app">
      <header>
        <img className="logo" src="/logo.png" alt="Somnia Exchange" />
        <div className="titles">
          <h1>
            <span className="brand-gradient-text">Somnia Exchange</span>
            <span className="tag">Pro</span>
          </h1>
          <div className="sub">dreamDEX CLOB · Somnia testnet (50312) · live on-chain</div>
        </div>
      </header>

      <div className="toolbar">
        <select
          value={marketIdx}
          onChange={(e) => setMarketIdx(Number(e.target.value))}
        >
          {MARKETS.map((m, i) => (
            <option value={i} key={m.pool}>
              {m.pair}
            </option>
          ))}
        </select>

        <div className="toolbar-right">
          <div className="ticker">
            {lastTick && (
              <span className={`last ${lastTick.dir}`} title="last mark price">
                {fmt(Number(lastTick.price), priceDp)}
              </span>
            )}
            {book.markPrice !== undefined && (
              <Pill label="mark" value={fmt(book.markPrice, priceDp)} />
            )}
            {spreadBps !== undefined && (
              <Pill label="spread" value={`${spreadBps.toFixed(1)} bps`} />
            )}
          </div>
          <ConnectButton />
        </div>
      </div>

      <div className="grid">
        {/* Chart */}
        <section className="panel chart-panel">
          <div className="panel-title with-controls">
            <span>Price</span>
            <div className="intervals">
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  className={iv === interval ? 'active' : ''}
                  onClick={() => setInterval(iv)}
                >
                  {iv}
                </button>
              ))}
            </div>
          </div>
          {candlesLoading && candles.length === 0 ? (
            <div className="chart placeholder">sampling mark price…</div>
          ) : (
            <Chart candles={candles} />
          )}
        </section>

        {/* Order book + order ticket */}
        <div className="col">
        <section className="panel">
          <div className="panel-title">Order Book</div>
          <div className="bookhead">
            <span>price ({book.info?.quote.symbol ?? 'quote'})</span>
            <span>size ({book.info?.base.symbol ?? 'base'})</span>
          </div>
          <div className="book">
            {book.error && <div className="error">⚠ {book.error}</div>}
            <DepthRows levels={asksDisplay} side="ask" maxQty={maxQty} priceDp={priceDp} />
            <div className="midline">
              {mid ? (
                <>
                  <span className="mid">{fmt(mid, priceDp)}</span>
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
            <DepthRows levels={book.bids} side="bid" maxQty={maxQty} priceDp={priceDp} />
          </div>
        </section>

        <OrderTicket
          market={market}
          info={book.info}
          bestBid={bestBid}
          bestAsk={bestAsk}
        />
        </div>

        {/* Mark-price tape */}
        <div className="trades-wrap">
          <PriceTape ticks={ticks} priceDp={priceDp} />
        </div>
      </div>

      <footer>
        pool {market.pool} · order book, candles & mark-price tape all read live on-chain (testnet has no real fills)
      </footer>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="pill">
      <span className="pill-label">{label}</span>
      <span className="pill-value">{value}</span>
    </span>
  );
}

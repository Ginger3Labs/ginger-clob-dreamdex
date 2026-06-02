import type { Fill } from '../dreamdex/useFeeds';
import type { PriceTick } from '../dreamdex/useFeeds';

function fmt(n: number, dp: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
}
function time(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

/**
 * Real fills from OrderFilled. When idle (testnet MMs mostly quote), falls back
 * to a live mark-price ticker so the panel stays informative.
 */
export default function TradesFeed({
  fills,
  ticks,
  priceDp,
  baseSymbol,
}: {
  fills: Fill[];
  ticks: PriceTick[];
  priceDp: number;
  baseSymbol: string;
}) {
  const hasFills = fills.length > 0;
  return (
    <section className="panel trades">
      <div className="panel-title">{hasFills ? 'Trades' : 'Mark Price (no recent fills)'}</div>
      <div className="trades-head">
        <span>price</span>
        <span>{hasFills ? baseSymbol : ''}</span>
        <span>time</span>
      </div>
      <div className="trades-body">
        {hasFills
          ? fills.map((f) => (
              <div className={`trade ${f.dir}`} key={f.id}>
                <span className="price">{fmt(Number(f.price), priceDp)}</span>
                <span className="amt">{fmt(Number(f.size), 4)}</span>
                <span className="time">{time(f.timestamp)}</span>
              </div>
            ))
          : ticks.length === 0
            ? <div className="empty">sampling…</div>
            : ticks.map((t) => (
                <div className={`trade ${t.dir}`} key={t.id}>
                  <span className="price">{fmt(Number(t.price), priceDp)}</span>
                  <span className="amt arrow">{t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '·'}</span>
                  <span className="time">{time(t.timestamp)}</span>
                </div>
              ))}
      </div>
    </section>
  );
}

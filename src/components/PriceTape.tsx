import type { PriceTick } from '../dreamdex/useFeeds';

function fmt(n: number, dp: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
}

function time(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

const ARROW = { up: '▲', down: '▼', flat: '·' } as const;

export default function PriceTape({
  ticks,
  priceDp,
}: {
  ticks: PriceTick[];
  priceDp: number;
}) {
  return (
    <div className="panel trades">
      <div className="panel-title">Mark Price (live)</div>
      <div className="trades-head">
        <span>price</span>
        <span></span>
        <span>time</span>
      </div>
      <div className="trades-body">
        {ticks.length === 0 && <div className="empty">sampling…</div>}
        {ticks.map((t) => (
          <div className={`trade ${t.dir}`} key={t.id}>
            <span className="price">{fmt(Number(t.price), priceDp)}</span>
            <span className="amt arrow">{ARROW[t.dir]}</span>
            <span className="time">{time(t.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

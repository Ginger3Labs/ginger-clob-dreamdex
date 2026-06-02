import type { ReactNode } from 'react';
import type { Market } from '../dreamdex/config';

function fmt(n: number | undefined, dp: number) {
  return n === undefined ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: dp });
}

function Stat({ label, value, cls }: { label: string; value: ReactNode; cls?: string }) {
  return (
    <div className="hstat">
      <div className="hstat-label">{label}</div>
      <div className={`hstat-value ${cls ?? ''}`}>{value}</div>
    </div>
  );
}

export default function MarketHeader({
  markets,
  marketIdx,
  priceDp,
  last,
  lastDir,
  mark,
  spreadBps,
  high,
  low,
  changePct,
  right,
}: {
  markets: Market[];
  marketIdx: number;
  priceDp: number;
  last?: number;
  lastDir?: 'up' | 'down' | 'flat';
  mark?: number;
  spreadBps?: number;
  high?: number;
  low?: number;
  changePct?: number;
  right: ReactNode;
}) {
  return (
    <header className="market-header">
      <div className="mh-left">
        <img className="logo" src="/logo.png" alt="Somnia Exchange" />
        <div className="brand">
          <span className="brand-gradient-text">Somnia Exchange</span>
          <span className="tag">Pro</span>
        </div>
        <span className="mh-pair">{markets[marketIdx]?.pair}</span>
      </div>

      <div className="mh-stats">
        <Stat
          label="last"
          value={fmt(last, priceDp)}
          cls={lastDir === 'up' ? 'up' : lastDir === 'down' ? 'down' : ''}
        />
        <Stat label="mark" value={fmt(mark, priceDp)} />
        <Stat
          label="chg"
          value={changePct === undefined ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}
          cls={changePct === undefined ? '' : changePct >= 0 ? 'up' : 'down'}
        />
        <Stat label="high" value={fmt(high, priceDp)} />
        <Stat label="low" value={fmt(low, priceDp)} />
        <Stat label="spread" value={spreadBps === undefined ? '—' : `${spreadBps.toFixed(1)} bps`} />
      </div>

      <div className="mh-right">{right}</div>
    </header>
  );
}

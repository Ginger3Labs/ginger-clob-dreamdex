import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { publicClient } from '../dreamdex/client';
import { MARKETS, SPOT_POOL_ABI, type Market } from '../dreamdex/config';

function smartDp(p: number) {
  if (p >= 100) return 2;
  if (p >= 1) return 3;
  return 5;
}

export default function MarketList({
  marketIdx,
  onSelect,
  collapsed,
  onToggle,
}: {
  marketIdx: number;
  onSelect: (i: number) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const entries = await Promise.all(
          MARKETS.map(async (m) => {
            try {
              const ema = (await publicClient.readContract({
                address: m.pool,
                abi: SPOT_POOL_ABI,
                functionName: 'getMidpointEmaState',
              })) as readonly [bigint, bigint];
              return [m.pool, ema[0] > 0n ? Number(formatUnits(ema[0], 18)) : 0] as const;
            } catch {
              return [m.pool, 0] as const;
            }
          }),
        );
        if (!cancelled) setMarks(Object.fromEntries(entries));
      } finally {
        if (!cancelled) timer = setTimeout(tick, 6000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (collapsed) {
    return (
      <div className="market-list collapsed">
        <button className="ml-toggle" onClick={onToggle} title="Show markets">›</button>
        <div className="ml-vert">MARKETS</div>
      </div>
    );
  }

  return (
    <section className="panel market-list">
      <div className="panel-title with-controls">
        <span>Markets</span>
        <button className="ml-toggle" onClick={onToggle} title="Hide markets">‹</button>
      </div>
      <div className="ml-rows">
        {MARKETS.map((m: Market, i) => {
          const px = marks[m.pool] ?? 0;
          const [base] = m.pair.split('/');
          return (
            <button
              key={m.pool}
              className={`ml-row ${i === marketIdx ? 'active' : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className="ml-sym">
                {base}<em>/USDso</em>
              </span>
              <span className="ml-px">{px > 0 ? px.toLocaleString('en-US', { maximumFractionDigits: smartDp(px) }) : '—'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

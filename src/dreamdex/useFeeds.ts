import { useEffect, useState } from 'react';
import { formatUnits, parseAbiItem } from 'viem';
import { publicClient } from './client';
import { SPOT_POOL_ABI, type Interval, type Market } from './config';

// Testnet has no public REST/WS, so trades & candles are built from on-chain
// state: candles are sampled live from the EMA mark price, the trade tape is
// streamed from OrderFilled events. Both build up while the page is open.

export type Candle = {
  timestamp: number; // ms (bucket start)
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

// On testnet the market maker only quotes (no real fills), so instead of a
// trade tape we stream the live mark price — every change becomes a tick.
export type PriceTick = {
  id: number;
  price: string;
  dir: 'up' | 'down' | 'flat';
  timestamp: number; // ms
};

const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

const MARK_POLL_MS = 1500;
const TAPE_POLL_MS = 1200;

export type Fill = {
  id: string;
  price: string;
  size: string;
  dir: 'up' | 'down';
  timestamp: number;
};

const ORDER_FILLED = parseAbiItem(
  'event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity)',
);
const MARK_PRICE_UPDATED = parseAbiItem(
  'event MarkPriceUpdated(address indexed asset, uint256 markPrice, uint256 rawMidpoint)',
);

// testnet getLogs is capped (~500 blocks); blocks are ~0.1s. Backfill recent
// history in chunks so the chart has real data on load (no empty "fly").
const BACKFILL_CHUNK = 450n;
const BACKFILL_CHUNKS = 14; // ~6300 blocks ≈ ~10 min of history
const BLOCK_MS = 100;

async function backfillCandles(
  pool: `0x${string}`,
  step: number,
  quoteDecimals: number,
): Promise<Map<number, Candle>> {
  const buckets = new Map<number, Candle>();
  let latest: bigint;
  try {
    latest = await publicClient.getBlockNumber();
  } catch {
    return buckets;
  }
  const ranges: Array<[bigint, bigint]> = [];
  for (let i = 0; i < BACKFILL_CHUNKS; i++) {
    const to = latest - BigInt(i) * BACKFILL_CHUNK;
    const from = to - BACKFILL_CHUNK + 1n;
    if (from < 0n) break;
    ranges.push([from, to]);
  }
  const chunks = await Promise.all(
    ranges.map(([from, to]) =>
      publicClient
        .getLogs({ address: pool, event: MARK_PRICE_UPDATED, fromBlock: from, toBlock: to })
        .catch(() => [] as any[]),
    ),
  );
  const logs = chunks.flat();
  logs.sort((a: any, b: any) => Number(a.blockNumber - b.blockNumber));
  const nowMs = Date.now();
  for (const log of logs as any[]) {
    const price = Number(formatUnits(log.args.markPrice as bigint, quoteDecimals));
    if (!(price > 0)) continue;
    const ts0 = nowMs - Number(latest - (log.blockNumber as bigint)) * BLOCK_MS;
    const ts = Math.floor(ts0 / step) * step;
    const e = buckets.get(ts);
    if (!e) {
      const ps = String(price);
      buckets.set(ts, { timestamp: ts, open: ps, high: ps, low: ps, close: ps, volume: '0' });
    } else {
      e.high = String(Math.max(Number(e.high), price));
      e.low = String(Math.min(Number(e.low), price));
      e.close = String(price);
    }
  }
  return buckets;
}

async function readMark(pool: `0x${string}`, quoteDecimals: number): Promise<number | null> {
  try {
    const ema = (await publicClient.readContract({
      address: pool,
      abi: SPOT_POOL_ABI,
      functionName: 'getMidpointEmaState',
    })) as readonly [bigint, bigint];
    if (ema[0] > 0n) return Number(formatUnits(ema[0], quoteDecimals));
  } catch {
    /* fall through to book mid */
  }
  try {
    const [bids, asks] = await Promise.all([
      publicClient.readContract({ address: pool, abi: SPOT_POOL_ABI, functionName: 'getBookLevels', args: [true, 1n] }),
      publicClient.readContract({ address: pool, abi: SPOT_POOL_ABI, functionName: 'getBookLevels', args: [false, 1n] }),
    ]);
    const b = (bids as any)[0]?.price as bigint | undefined;
    const a = (asks as any)[0]?.price as bigint | undefined;
    if (b && a) return Number(formatUnits((b + a) / 2n, quoteDecimals));
  } catch {
    /* ignore */
  }
  return null;
}

/** Live candles sampled from the EMA mark price, bucketed by interval. */
export function useCandles(market: Market, interval: Interval) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const buckets = new Map<number, Candle>();
    const step = INTERVAL_MS[interval];

    const emit = () => {
      const list = Array.from(buckets.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-500);
      setCandles(list);
      setLoading(false);
    };

    function tick() {
      timer = setTimeout(async () => {
        const price = await readMark(market.pool, 18);
        if (!cancelled && price != null) {
          const ts = Math.floor(Date.now() / step) * step;
          const existing = buckets.get(ts);
          if (!existing) {
            const ps = String(price);
            buckets.set(ts, { timestamp: ts, open: ps, high: ps, low: ps, close: ps, volume: '0' });
          } else {
            existing.high = String(Math.max(Number(existing.high), price));
            existing.low = String(Math.min(Number(existing.low), price));
            existing.close = String(price);
          }
          emit();
        }
        if (!cancelled) tick();
      }, MARK_POLL_MS);
    }

    // Backfill recent on-chain history first, then sample live.
    setLoading(true);
    setCandles([]);
    (async () => {
      const seeded = await backfillCandles(market.pool, step, 18);
      if (cancelled) return;
      for (const [k, v] of seeded) buckets.set(k, v);
      if (buckets.size > 0) emit();
      tick();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [market.pool, interval]);

  return { candles, loading };
}

/** Live mark-price tape — one row per price change (testnet has no real fills). */
export function usePriceTape(market: Market) {
  const [ticks, setTicks] = useState<PriceTick[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let last = 0;
    let seq = 0;

    async function tick() {
      const price = await readMark(market.pool, 18);
      if (!cancelled && price != null && price !== last) {
        const dir: PriceTick['dir'] =
          last === 0 ? 'flat' : price > last ? 'up' : 'down';
        last = price;
        const row: PriceTick = {
          id: seq++,
          price: String(price),
          dir,
          timestamp: Date.now(),
        };
        setTicks((prev) => [row, ...prev].slice(0, 60));
      }
      if (!cancelled) timer = setTimeout(tick, TAPE_POLL_MS);
    }

    setTicks([]);
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [market.pool]);

  return { ticks };
}

/** Live real trades from OrderFilled events (price ≈ mark at fill time). */
export function useFills(market: Market, baseDecimals: number) {
  const [fills, setFills] = useState<Fill[]>([]);

  useEffect(() => {
    let cancelled = false;
    let last = 0;

    const unwatch = publicClient.watchEvent({
      address: market.pool,
      event: ORDER_FILLED,
      onLogs: async (logs) => {
        if (cancelled || logs.length === 0) return;
        const price = (await readMark(market.pool, 18)) ?? last;
        const fresh: Fill[] = logs.map((log: any) => {
          const dir: 'up' | 'down' = price >= last ? 'up' : 'down';
          last = price;
          return {
            id: `${log.transactionHash}-${log.logIndex}`,
            price: String(price),
            size: formatUnits(log.args.quantityFilled as bigint, baseDecimals),
            dir,
            timestamp: Date.now(),
          };
        });
        setFills((prev) => [...fresh.reverse(), ...prev].slice(0, 50));
      },
    });

    setFills([]);
    return () => {
      cancelled = true;
      unwatch();
    };
  }, [market.pool, baseDecimals]);

  return { fills };
}

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { publicClient } from './client';
import { SPOT_POOL_ABI, tokenMeta, type Market } from './config';

export type Level = { price: number; qty: number };

export type PoolInfo = {
  base: { symbol: string; decimals: number };
  quote: { symbol: string; decimals: number };
  makerFee: bigint;
  takerFee: bigint;
  tickSize: string;
  lotSize: string;
  minQty: string;
};

export type Book = {
  loading: boolean;
  error?: string;
  info?: PoolInfo;
  markPrice?: number;
  bids: Level[];
  asks: Level[];
  blockNumber?: bigint;
};

const LEVELS = 12;
const POLL_MS = 2000;

export function useOrderbook(market: Market): Book {
  const [book, setBook] = useState<Book>({ loading: true, bids: [], asks: [] });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const pool = market.pool;
        const [params, bidsRaw, asksRaw, ema, blockNumber] = await Promise.all([
          publicClient.readContract({
            address: pool,
            abi: SPOT_POOL_ABI,
            functionName: 'getPoolParams',
          }),
          publicClient.readContract({
            address: pool,
            abi: SPOT_POOL_ABI,
            functionName: 'getBookLevels',
            args: [true, BigInt(LEVELS)],
          }),
          publicClient.readContract({
            address: pool,
            abi: SPOT_POOL_ABI,
            functionName: 'getBookLevels',
            args: [false, BigInt(LEVELS)],
          }),
          publicClient
            .readContract({
              address: pool,
              abi: SPOT_POOL_ABI,
              functionName: 'getMidpointEmaState',
            })
            .catch(() => null),
          publicClient.getBlockNumber(),
        ]);

        const [baseAddr, quoteAddr, makerFee, takerFee, tick, minQty, lot] =
          params as readonly [
            `0x${string}`,
            `0x${string}`,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
          ];

        const base = tokenMeta(baseAddr);
        const quote = tokenMeta(quoteAddr);

        const mapLevels = (rows: readonly { price: bigint; quantity: bigint }[]) =>
          rows.map((l) => ({
            price: Number(formatUnits(l.price, quote.decimals)),
            qty: Number(formatUnits(l.quantity, base.decimals)),
          }));

        const info: PoolInfo = {
          base,
          quote,
          makerFee,
          takerFee,
          tickSize: formatUnits(tick, quote.decimals),
          lotSize: formatUnits(lot, base.decimals),
          minQty: formatUnits(minQty, base.decimals),
        };

        const emaVal = ema ? (ema as readonly [bigint, bigint])[0] : 0n;
        const markPrice =
          emaVal && emaVal > 0n
            ? Number(formatUnits(emaVal, quote.decimals))
            : undefined;

        if (!cancelled) {
          setBook({
            loading: false,
            info,
            markPrice,
            bids: mapLevels(bidsRaw as any),
            asks: mapLevels(asksRaw as any),
            blockNumber,
          });
        }
      } catch (err: any) {
        if (!cancelled)
          setBook((b) => ({ ...b, loading: false, error: err?.message ?? String(err) }));
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    }

    setBook({ loading: true, bids: [], asks: [] });
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [market.pool]);

  return book;
}

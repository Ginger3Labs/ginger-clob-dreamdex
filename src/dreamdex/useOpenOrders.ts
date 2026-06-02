import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { publicClient } from './client';
import { SPOT_POOL_ABI, somniaTestnet, type Market } from './config';
import type { PoolInfo } from './useOrderbook';

export type OpenOrder = {
  id: bigint;
  isBid: boolean;
  price: number;
  full: number;
  remaining: number;
  filled: number;
};

const POLL_MS = 5000;

/** The caller's own open orders (getOwnOpenOrders uses msg.sender → pass account). */
export function useOpenOrders(market: Market, info?: PoolInfo, refreshKey = 0) {
  const { address, chainId } = useAccount();
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const enabled = !!address && chainId === somniaTestnet.id && !!info;
    if (!enabled) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const ids = (await publicClient.readContract({
          account: address,
          address: market.pool,
          abi: SPOT_POOL_ABI,
          functionName: 'getOwnOpenOrders',
        })) as readonly bigint[];

        const rows = await Promise.all(
          ids.map(async (id) => {
            const o = (await publicClient.readContract({
              address: market.pool,
              abi: SPOT_POOL_ABI,
              functionName: 'getOrder',
              args: [id],
            })) as any;
            const price = Number(formatUnits(o.price, info!.quote.decimals));
            const full = Number(formatUnits(o.fullQuantity, info!.base.decimals));
            const remaining = Number(formatUnits(o.quantityRemaining, info!.base.decimals));
            return { id, isBid: o.isBid, price, full, remaining, filled: full - remaining };
          }),
        );
        if (!cancelled) {
          setOrders(rows.filter((r) => r.remaining > 0));
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    }

    setLoading(true);
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, chainId, market.pool, info, refreshKey]);

  return { orders, loading };
}

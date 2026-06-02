import { formatUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { SPOT_POOL_ABI, somniaTestnet, type Market } from './config';
import type { PoolInfo } from './useOrderbook';

/** Reads the caller's withdrawable (free) vault balances for base & quote. */
export function useVault(market: Market, info?: PoolInfo) {
  const { address, chainId } = useAccount();
  const enabled = !!address && chainId === somniaTestnet.id && !!info;

  const base = useReadContract({
    address: market.pool,
    abi: SPOT_POOL_ABI,
    functionName: 'getWithdrawableBalance',
    args: address && info ? [address, info.base.address] : undefined,
    query: { enabled, refetchInterval: 8000 },
  });
  const quote = useReadContract({
    address: market.pool,
    abi: SPOT_POOL_ABI,
    functionName: 'getWithdrawableBalance',
    args: address && info ? [address, info.quote.address] : undefined,
    query: { enabled, refetchInterval: 8000 },
  });

  const baseRaw = (base.data as bigint | undefined) ?? 0n;
  const quoteRaw = (quote.data as bigint | undefined) ?? 0n;

  return {
    baseRaw,
    quoteRaw,
    baseNum: info ? Number(formatUnits(baseRaw, info.base.decimals)) : 0,
    quoteNum: info ? Number(formatUnits(quoteRaw, info.quote.decimals)) : 0,
    refetch: () => {
      base.refetch();
      quote.refetch();
    },
  };
}

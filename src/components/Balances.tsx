import { formatUnits } from 'viem';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { ERC20_ABI, NATIVE_TOKEN, somniaTestnet, type Market } from '../dreamdex/config';
import type { PoolInfo } from '../dreamdex/useOrderbook';
import { useVault } from '../dreamdex/useVault';

function Row({ label, wallet, vault, dp }: { label: string; wallet: number; vault?: number; dp: number }) {
  const f = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: dp });
  return (
    <div className="bal-row">
      <span className="bal-asset">{label}</span>
      <span>{f(wallet)}</span>
      <span>{vault === undefined ? '—' : f(vault)}</span>
    </div>
  );
}

export default function Balances({ market, info }: { market: Market; info?: PoolInfo }) {
  const { address, isConnected, chainId } = useAccount();
  const onChain = chainId === somniaTestnet.id;
  const enabled = !!address && onChain && !!info;
  const isNativeBase = info?.base.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();
  const vault = useVault(market, info);

  const { data: stt } = useBalance({ address, chainId: somniaTestnet.id, query: { enabled, refetchInterval: 10_000 } });
  const { data: baseErc20 } = useReadContract({
    address: info?.base.address, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: enabled && !isNativeBase, refetchInterval: 10_000 },
  });
  const { data: quoteErc20 } = useReadContract({
    address: info?.quote.address, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 10_000 },
  });

  if (!isConnected) return <div className="empty">connect wallet</div>;
  if (!onChain) return <div className="empty">switch to Somnia</div>;

  const baseWallet = info ? Number(formatUnits((isNativeBase ? stt?.value : (baseErc20 as bigint)) ?? 0n, info.base.decimals)) : 0;
  const quoteWallet = info ? Number(formatUnits((quoteErc20 as bigint) ?? 0n, info.quote.decimals)) : 0;
  const sttNum = stt ? Number(formatUnits(stt.value, stt.decimals)) : 0;

  return (
    <div className="balances-tab">
      <div className="bal-head">
        <span>asset</span>
        <span>wallet</span>
        <span>vault</span>
      </div>
      <Row label={info?.base.symbol ?? 'base'} wallet={baseWallet} vault={vault.baseNum} dp={4} />
      <Row label={info?.quote.symbol ?? 'quote'} wallet={quoteWallet} vault={vault.quoteNum} dp={2} />
      {!isNativeBase && <Row label="STT (gas)" wallet={sttNum} dp={4} />}
    </div>
  );
}

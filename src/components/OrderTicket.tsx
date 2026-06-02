import { useEffect, useMemo, useState } from 'react';
import { formatUnits, maxUint256, parseUnits, zeroAddress } from 'viem';
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { publicClient } from '../dreamdex/client';
import {
  ERC20_ABI,
  NATIVE_TOKEN,
  ORDER_TYPE,
  SPOT_POOL_ABI,
  somniaTestnet,
  type Market,
} from '../dreamdex/config';
import type { PoolInfo } from '../dreamdex/useOrderbook';

type Side = 'buy' | 'sell';
type OType = 'market' | 'limit';
type Tif = 'IOC' | 'FOK';

const MARKET_SLIPPAGE = 0.01; // 1% aggressive price for market orders

function num(s: string | undefined) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function OrderTicket({
  market,
  info,
  bestBid,
  bestAsk,
  side,
  setSide,
  price,
  setPrice,
}: {
  market: Market;
  info?: PoolInfo;
  bestBid?: number;
  bestAsk?: number;
  side: Side;
  setSide: (s: Side) => void;
  price: string;
  setPrice: (p: string) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const [otype, setOtype] = useState<OType>('market');
  const [tif, setTif] = useState<Tif>('IOC');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const [okMsg, setOkMsg] = useState<string>();
  const [hash, setHash] = useState<`0x${string}`>();

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  const onChain = chainId === somniaTestnet.id;
  const enabled = !!address && onChain && !!info;
  const isNativeBase = info?.base.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();
  const inputToken = info ? (side === 'buy' ? info.quote : info.base) : undefined;
  const isNativeInput = inputToken?.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();

  // Clicking the book fills a price → jump to limit mode.
  useEffect(() => {
    if (price) setOtype('limit');
  }, [price]);

  // --- Balances ---
  const { data: nativeBal } = useBalance({
    address,
    chainId: somniaTestnet.id,
    query: { enabled: enabled && isNativeBase, refetchInterval: 10_000 },
  });
  const { data: baseErc20 } = useReadContract({
    address: info?.base.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: enabled && !isNativeBase, refetchInterval: 10_000 },
  });
  const { data: quoteErc20 } = useReadContract({
    address: info?.quote.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 10_000 },
  });

  const baseBalNum = info
    ? Number(formatUnits((isNativeBase ? nativeBal?.value : (baseErc20 as bigint)) ?? 0n, info.base.decimals))
    : 0;
  const quoteBalNum = info
    ? Number(formatUnits((quoteErc20 as bigint) ?? 0n, info.quote.decimals))
    : 0;

  // --- Price (market = aggressive tick-aligned, limit = user) ---
  const { priceNum, priceRaw } = useMemo(() => {
    if (!info) return { priceNum: 0, priceRaw: 0n };
    const tickNum = num(info.tickSize);
    if (otype === 'market') {
      const ref = side === 'buy' ? bestAsk : bestBid;
      if (!ref || tickNum <= 0) return { priceNum: 0, priceRaw: 0n };
      const adj = side === 'buy' ? ref * (1 + MARKET_SLIPPAGE) : ref * (1 - MARKET_SLIPPAGE);
      const mult = side === 'buy' ? Math.ceil(adj / tickNum) : Math.floor(adj / tickNum);
      return { priceNum: mult * tickNum, priceRaw: BigInt(mult) * info.tickRaw };
    }
    try {
      return { priceNum: num(price), priceRaw: parseUnits(price || '0', info.quote.decimals) };
    } catch {
      return { priceNum: num(price), priceRaw: 0n };
    }
  }, [info, otype, side, price, bestBid, bestAsk]);

  // --- Order calc + validation ---
  const calc = useMemo(() => {
    if (!info || !amount || priceRaw <= 0n) return undefined;
    try {
      const quantityRaw = parseUnits(amount, info.base.decimals);
      if (quantityRaw <= 0n) return undefined;
      const errs: string[] = [];
      if (quantityRaw % info.lotRaw !== 0n) errs.push(`amount step is ${info.lotSize}`);
      if (quantityRaw < info.minQtyRaw) errs.push(`min amount ${info.minQty}`);
      if (otype === 'limit' && priceRaw % info.tickRaw !== 0n) errs.push(`price step is ${info.tickSize}`);
      const costRaw = (priceRaw * quantityRaw) / 10n ** BigInt(info.base.decimals);
      const needed = side === 'buy' ? costRaw : quantityRaw;
      const costNum = Number(formatUnits(costRaw, info.quote.decimals));
      // balance check
      if (side === 'buy' && costNum > quoteBalNum) errs.push('insufficient USDso');
      if (side === 'sell' && num(amount) > baseBalNum) errs.push(`insufficient ${info.base.symbol}`);
      return { quantityRaw, priceRaw, costRaw, costNum, needed, errs };
    } catch {
      return undefined;
    }
  }, [amount, priceRaw, side, otype, info, quoteBalNum, baseBalNum]);

  // --- Allowance ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, market.pool] : undefined,
    query: { enabled: enabled && !isNativeInput },
  });
  const needsApproval =
    !isNativeInput &&
    !!calc &&
    calc.errs.length === 0 &&
    (allowance === undefined || (allowance as bigint) < calc.needed);

  // --- Helpers ---
  const maxBase = side === 'sell' ? baseBalNum : priceNum > 0 ? quoteBalNum / priceNum : 0;
  function setPct(pct: number) {
    if (!info) return;
    const lot = num(info.lotSize) || 1e-8;
    const raw = (maxBase * pct) / 100;
    const amt = Math.floor(raw / lot) * lot;
    setAmount(amt > 0 ? String(Number(amt.toFixed(8))) : '');
  }

  async function handleApprove() {
    if (!inputToken) return;
    setError(undefined); setOkMsg(undefined);
    try {
      const h = await writeContractAsync({
        address: inputToken.address, abi: ERC20_ABI, functionName: 'approve',
        args: [market.pool, maxUint256],
      });
      setHash(h);
      await publicClient.waitForTransactionReceipt({ hash: h });
      await refetchAllowance();
      setOkMsg('Approved ✓');
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }

  async function handlePlace() {
    if (!info || !calc || !address) return;
    setError(undefined); setOkMsg(undefined);
    const expireNs = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n;
    const ot = otype === 'market' ? ORDER_TYPE.IOC : ORDER_TYPE[tif];
    const args = [side === 'buy', 0n, calc.priceRaw, calc.quantityRaw, expireNs, ot, 0, zeroAddress, 0n] as const;
    const value = isNativeInput ? calc.quantityRaw : 0n;
    try {
      await publicClient.simulateContract({
        account: address, address: market.pool, abi: SPOT_POOL_ABI,
        functionName: 'placeTakerOrderWithoutVault', args, value,
      });
      const h = await writeContractAsync({
        address: market.pool, abi: SPOT_POOL_ABI,
        functionName: 'placeTakerOrderWithoutVault', args, value,
      });
      setHash(h);
      setOkMsg('Order submitted');
      setAmount('');
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }

  const disabled = !calc || calc.errs.length > 0 || isPending || confirming;
  const dp = info ? Math.max(num(info.tickSize) < 1 ? (info.tickSize.split('.')[1]?.length ?? 2) : 2, 2) : 2;

  return (
    <section className="panel ticket">
      <div className="seg otype">
        {(['market', 'limit'] as OType[]).map((t) => (
          <button key={t} className={otype === t ? 'active' : ''} onClick={() => setOtype(t)}>
            {t === 'market' ? 'Market' : 'Limit'}
          </button>
        ))}
      </div>

      <div className="seg side">
        <button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>Buy</button>
        <button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>Sell</button>
      </div>

      {otype === 'limit' ? (
        <label className="field">
          <span>Price ({info?.quote.symbol ?? 'quote'})</span>
          <input
            inputMode="decimal" placeholder={info?.tickSize ?? '0.00'}
            value={price} onChange={(e) => setPrice(e.target.value.trim())}
          />
        </label>
      ) : (
        <div className="field">
          <span>Price</span>
          <div className="market-px">
            Market · ~{priceNum > 0 ? priceNum.toLocaleString('en-US', { maximumFractionDigits: dp }) : '—'} {info?.quote.symbol}
            <em> ({(MARKET_SLIPPAGE * 100).toFixed(0)}% slippage)</em>
          </div>
        </div>
      )}

      <label className="field">
        <span>
          Amount ({info?.base.symbol ?? 'base'})
          <button className="link-max" onClick={() => setPct(100)} type="button">Max</button>
        </span>
        <input
          inputMode="decimal" placeholder={info?.minQty ?? '0.00'}
          value={amount} onChange={(e) => setAmount(e.target.value.trim())}
        />
      </label>

      <input
        className="slider" type="range" min={0} max={100} step={1}
        value={maxBase > 0 ? Math.min(100, (num(amount) / maxBase) * 100) : 0}
        onChange={(e) => setPct(Number(e.target.value))}
      />
      <div className="pcts">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} onClick={() => setPct(p)}>{p}%</button>
        ))}
      </div>

      {otype === 'limit' && (
        <div className="seg tif">
          {(['IOC', 'FOK'] as Tif[]).map((t) => (
            <button key={t} className={tif === t ? 'active' : ''} onClick={() => setTif(t)}>{t}</button>
          ))}
        </div>
      )}

      <div className="balances">
        <span>Avail</span>
        <span>{baseBalNum.toLocaleString('en-US', { maximumFractionDigits: 4 })} {info?.base.symbol}</span>
        <span>{quoteBalNum.toLocaleString('en-US', { maximumFractionDigits: 2 })} {info?.quote.symbol}</span>
      </div>

      {calc && (
        <div className="cost">
          {side === 'buy' ? 'Pay ≈' : 'Receive ≈'}{' '}
          <b>{calc.costNum.toLocaleString('en-US', { maximumFractionDigits: 4 })} {info?.quote.symbol}</b>
          <span className="fee"> · fee 0%</span>
        </div>
      )}

      {calc?.errs?.map((e) => <div className="hint" key={e}>• {e}</div>)}

      {!isConnected ? (
        <div className="hint center">Connect your wallet to trade</div>
      ) : !onChain ? (
        <div className="hint center">Switch to Somnia testnet</div>
      ) : needsApproval ? (
        <button className={`btn-place ${side}`} disabled={isPending} onClick={handleApprove}>
          {isPending ? 'Approving…' : `Approve ${inputToken?.symbol}`}
        </button>
      ) : (
        <button className={`btn-place ${side}`} disabled={disabled} onClick={handlePlace}>
          {isPending || confirming ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${info?.base.symbol ?? ''}`}
        </button>
      )}

      {error && <div className="msg err">⚠ {error}</div>}
      {okMsg && <div className="msg ok">{okMsg}</div>}
      {hash && (
        <a className="txlink" href={`${somniaTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">
          {confirmed ? 'confirmed ↗' : confirming ? 'confirming… ↗' : 'view tx ↗'}
        </a>
      )}
    </section>
  );
}

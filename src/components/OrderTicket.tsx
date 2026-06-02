import { useMemo, useState } from 'react';
import { maxUint256, parseUnits, zeroAddress } from 'viem';
import {
  useAccount,
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
type Tif = 'IOC' | 'FOK';

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
  const [tif, setTif] = useState<Tif>('IOC');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const [okMsg, setOkMsg] = useState<string>();

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash });

  const onChain = chainId === somniaTestnet.id;
  const inputToken = info ? (side === 'buy' ? info.quote : info.base) : undefined;
  const isNativeInput =
    inputToken?.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();

  // Raw order values + validation
  const calc = useMemo(() => {
    if (!info) return undefined;
    try {
      if (!amount || !price) return undefined;
      const quantityRaw = parseUnits(amount, info.base.decimals);
      const priceRaw = parseUnits(price, info.quote.decimals);
      if (quantityRaw <= 0n || priceRaw <= 0n) return undefined;
      const errs: string[] = [];
      if (quantityRaw % info.lotRaw !== 0n)
        errs.push(`amount must be a multiple of ${info.lotSize}`);
      if (quantityRaw < info.minQtyRaw) errs.push(`min amount is ${info.minQty}`);
      if (priceRaw % info.tickRaw !== 0n)
        errs.push(`price must be a multiple of ${info.tickSize}`);
      // quote cost = price * quantity / 10^baseDecimals
      const costRaw =
        (priceRaw * quantityRaw) / 10n ** BigInt(info.base.decimals);
      const needed = side === 'buy' ? costRaw : quantityRaw;
      return { quantityRaw, priceRaw, costRaw, needed, errs };
    } catch {
      return undefined;
    }
  }, [amount, price, side, info]);

  // Allowance (ERC-20 inputs only)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, market.pool] : undefined,
    query: { enabled: !!address && !!inputToken && !isNativeInput && onChain },
  });

  const needsApproval =
    !isNativeInput &&
    !!calc &&
    calc.errs.length === 0 &&
    (allowance === undefined || (allowance as bigint) < calc.needed);

  function fillBest() {
    const p = side === 'buy' ? bestAsk : bestBid;
    if (p) setPrice(String(p));
  }

  async function handleApprove() {
    if (!inputToken) return;
    setError(undefined);
    setOkMsg(undefined);
    try {
      const h = await writeContractAsync({
        address: inputToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
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
    setError(undefined);
    setOkMsg(undefined);
    // The deployed contract treats expireTimestampNs = 0 as already-expired and
    // silently rejects (success=false, 0 fill). Always pass a future ns timestamp.
    const expireNs = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n;
    const args = [
      side === 'buy',
      0n,
      calc.priceRaw,
      calc.quantityRaw,
      expireNs,
      ORDER_TYPE[tif],
      0,
      zeroAddress,
      0n,
    ] as const;
    const value = isNativeInput ? calc.quantityRaw : 0n;
    try {
      // Simulate first for a clean revert reason.
      await publicClient.simulateContract({
        account: address,
        address: market.pool,
        abi: SPOT_POOL_ABI,
        functionName: 'placeTakerOrderWithoutVault',
        args,
        value,
      });
      const h = await writeContractAsync({
        address: market.pool,
        abi: SPOT_POOL_ABI,
        functionName: 'placeTakerOrderWithoutVault',
        args,
        value,
      });
      setHash(h);
      setOkMsg('Order submitted');
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }

  const disabled = !calc || calc.errs.length > 0 || isPending || confirming;

  return (
    <section className="panel ticket">
      <div className="panel-title">Place Order (wallet · {tif})</div>

      <div className="seg side">
        <button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>
          Buy
        </button>
        <button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>
          Sell
        </button>
      </div>

      <label className="field">
        <span>Price ({info?.quote.symbol ?? 'quote'})</span>
        <div className="input-row">
          <input
            inputMode="decimal"
            placeholder={info?.tickSize ?? '0.00'}
            value={price}
            onChange={(e) => setPrice(e.target.value.trim())}
          />
          <button className="mini" onClick={fillBest} type="button">
            best
          </button>
        </div>
      </label>

      <label className="field">
        <span>Amount ({info?.base.symbol ?? 'base'})</span>
        <input
          inputMode="decimal"
          placeholder={info?.minQty ?? '0.00'}
          value={amount}
          onChange={(e) => setAmount(e.target.value.trim())}
        />
      </label>

      <div className="seg tif">
        {(['IOC', 'FOK'] as Tif[]).map((t) => (
          <button key={t} className={tif === t ? 'active' : ''} onClick={() => setTif(t)}>
            {t}
          </button>
        ))}
      </div>

      {calc && (
        <div className="cost">
          {side === 'buy' ? 'Pay ≈' : 'Receive ≈'}{' '}
          <b>
            {(Number(calc.costRaw) / 10 ** (info?.quote.decimals ?? 18)).toLocaleString(
              'en-US',
              { maximumFractionDigits: 4 },
            )}{' '}
            {info?.quote.symbol}
          </b>
        </div>
      )}

      {calc?.errs?.map((e) => (
        <div className="hint" key={e}>
          • {e}
        </div>
      ))}

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
          {isPending || confirming
            ? 'Submitting…'
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${info?.base.symbol ?? ''}`}
        </button>
      )}

      {error && <div className="msg err">⚠ {error}</div>}
      {okMsg && <div className="msg ok">{okMsg}</div>}
      {hash && (
        <a
          className="txlink"
          href={`${somniaTestnet.blockExplorers.default.url}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          {confirmed ? 'confirmed' : confirming ? 'confirming…' : 'view tx'} ↗
        </a>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, maxUint256, parseUnits, zeroAddress } from 'viem';
import { useAccount, useBalance, useReadContract, useWriteContract } from 'wagmi';
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
import { useVault } from '../dreamdex/useVault';
import Help from './Help';
import { useTxToast } from './Toast';

type Side = 'buy' | 'sell';
type Funding = 'wallet' | 'vault';
type WalletType = 'market' | 'limit';
type Tif = 'IOC' | 'FOK';
type VaultType = 'GTC' | 'POST_ONLY' | 'IOC' | 'FOK';

const MARKET_SLIPPAGE = 0.01;
const HOUR_NS = 3600;
const MONTH_NS = 30 * 24 * 3600;

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmtN = (n: number, dp: number) => n.toLocaleString('en-US', { maximumFractionDigits: dp });

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
  const [funding, setFunding] = useState<Funding>('wallet');
  const [wtype, setWtype] = useState<WalletType>('market');
  const [tif, setTif] = useState<Tif>('IOC');
  const [vtype, setVtype] = useState<VaultType>('GTC');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const { writeContractAsync } = useWriteContract();
  const track = useTxToast();
  const vault = useVault(market, info);

  const onChain = chainId === somniaTestnet.id;
  const enabled = !!address && onChain && !!info;
  const isNativeBase = info?.base.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();
  const inputToken = info ? (side === 'buy' ? info.quote : info.base) : undefined;
  const isNativeInput = inputToken?.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();

  // market price only applies to wallet-funded market orders; everything else is limit-priced
  const isLimitPriced = funding === 'vault' || wtype === 'limit';

  useEffect(() => {
    if (price && funding === 'wallet') setWtype('limit');
  }, [price, funding]);

  // --- Wallet balances ---
  const { data: nativeBal } = useBalance({
    address, chainId: somniaTestnet.id,
    query: { enabled: enabled && isNativeBase, refetchInterval: 10_000 },
  });
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
  const walletBase = info ? Number(formatUnits((isNativeBase ? nativeBal?.value : (baseErc20 as bigint)) ?? 0n, info.base.decimals)) : 0;
  const walletQuote = info ? Number(formatUnits((quoteErc20 as bigint) ?? 0n, info.quote.decimals)) : 0;

  const availBase = funding === 'vault' ? vault.baseNum : walletBase;
  const availQuote = funding === 'vault' ? vault.quoteNum : walletQuote;

  // --- Price ---
  const { priceNum, priceRaw } = useMemo(() => {
    if (!info) return { priceNum: 0, priceRaw: 0n };
    const tickNum = num(info.tickSize);
    if (!isLimitPriced) {
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
  }, [info, isLimitPriced, side, price, bestBid, bestAsk]);

  // --- Calc + validation ---
  const calc = useMemo(() => {
    if (!info || !amount || priceRaw <= 0n) return undefined;
    try {
      const quantityRaw = parseUnits(amount, info.base.decimals);
      if (quantityRaw <= 0n) return undefined;
      const errs: string[] = [];
      if (quantityRaw % info.lotRaw !== 0n) errs.push(`amount step ${info.lotSize}`);
      if (quantityRaw < info.minQtyRaw) errs.push(`min amount ${info.minQty}`);
      if (isLimitPriced && priceRaw % info.tickRaw !== 0n) errs.push(`price step ${info.tickSize}`);
      const costRaw = (priceRaw * quantityRaw) / 10n ** BigInt(info.base.decimals);
      const costNum = Number(formatUnits(costRaw, info.quote.decimals));
      const needed = side === 'buy' ? costRaw : quantityRaw;
      if (side === 'buy' && costNum > availQuote) errs.push(`insufficient ${info.quote.symbol}`);
      if (side === 'sell' && num(amount) > availBase) errs.push(`insufficient ${info.base.symbol}`);
      return { quantityRaw, costRaw, costNum, needed, errs };
    } catch {
      return undefined;
    }
  }, [amount, priceRaw, side, isLimitPriced, info, availQuote, availBase]);

  // --- Allowance (wallet-funded ERC-20 only) ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken?.address, abi: ERC20_ABI, functionName: 'allowance',
    args: address ? [address, market.pool] : undefined,
    query: { enabled: enabled && funding === 'wallet' && !isNativeInput },
  });
  const needsApproval =
    funding === 'wallet' && !isNativeInput && !!calc && calc.errs.length === 0 &&
    (allowance === undefined || (allowance as bigint) < calc.needed);

  const maxBase = side === 'sell' ? availBase : priceNum > 0 ? availQuote / priceNum : 0;
  function setPct(pct: number) {
    if (!info) return;
    const lot = num(info.lotSize) || 1e-8;
    const amt = Math.floor(((maxBase * pct) / 100) / lot) * lot;
    setAmount(amt > 0 ? String(Number(amt.toFixed(8))) : '');
  }

  async function handleApprove() {
    if (!inputToken) return;
    setBusy(true);
    try {
      await track(`Approve ${inputToken.symbol}`, () =>
        writeContractAsync({
          address: inputToken.address, abi: ERC20_ABI, functionName: 'approve', args: [market.pool, maxUint256],
        }),
      );
      await refetchAllowance();
    } catch {
      /* toast shows the error */
    } finally {
      setBusy(false);
    }
  }

  async function handlePlace() {
    if (!info || !calc || !address) return;
    setBusy(true);

    let ot: number;
    let ttl: number;
    if (funding === 'wallet') {
      ot = wtype === 'market' ? ORDER_TYPE.IOC : ORDER_TYPE[tif];
      ttl = HOUR_NS;
    } else {
      ot = ORDER_TYPE[vtype];
      ttl = vtype === 'GTC' || vtype === 'POST_ONLY' ? MONTH_NS : HOUR_NS;
    }
    const expireNs = BigInt(Math.floor(Date.now() / 1000) + ttl) * 1_000_000_000n;
    const args = [side === 'buy', 0n, priceRaw, calc.quantityRaw, expireNs, ot, 0, zeroAddress, 0n] as const;
    const base = { address: market.pool, abi: SPOT_POOL_ABI, args } as const;
    const title = `${side === 'buy' ? 'Buy' : 'Sell'} ${info.base.symbol}`;

    try {
      await track(title, async () => {
        if (funding === 'wallet') {
          const value = isNativeInput ? calc.quantityRaw : 0n;
          await publicClient.simulateContract({ account: address, ...base, functionName: 'placeTakerOrderWithoutVault', value });
          return writeContractAsync({ ...base, functionName: 'placeTakerOrderWithoutVault', value });
        }
        await publicClient.simulateContract({ account: address, ...base, functionName: 'placeOrder' });
        return writeContractAsync({ ...base, functionName: 'placeOrder' });
      });
      setAmount('');
      vault.refetch();
    } catch {
      /* toast shows the error */
    } finally {
      setBusy(false);
    }
  }

  const disabled = !calc || calc.errs.length > 0 || busy;
  const dp = info ? Math.max(info.tickSize.split('.')[1]?.length ?? 2, 2) : 2;

  const typeDesc =
    funding === 'wallet'
      ? wtype === 'market'
        ? 'Market — fills now at the best price (aggressive IOC).'
        : tif === 'IOC'
          ? 'Limit IOC — fills what it can at your price now, cancels the rest.'
          : 'Limit FOK — fills the full amount at your price, or nothing.'
      : vtype === 'GTC'
        ? 'GTC — rests on the book until filled or cancelled.'
        : vtype === 'POST_ONLY'
          ? 'Post-Only — joins as maker; rejected if it would fill immediately.'
          : vtype === 'IOC'
            ? 'IOC — fills what it can now, cancels the rest.'
            : 'FOK — fills the full amount at once, or nothing.';

  return (
    <section className="panel ticket">
      <div className="seg-label">
        Funding
        <Help>
          <b>Wallet</b> — funds pulled from your wallet at execution. Instant orders only
          (Market / IOC / FOK); cannot rest on the book.
          <br />
          <br />
          <b>Vault</b> — pre-deposit tokens into the on-chain vault. Required for resting
          limit orders (GTC / Post-Only).
        </Help>
      </div>
      <div className="seg funding">
        {(['wallet', 'vault'] as Funding[]).map((f) => (
          <button key={f} className={funding === f ? 'active' : ''} onClick={() => setFunding(f)}>
            {f === 'wallet' ? 'Wallet' : 'Vault'}
          </button>
        ))}
      </div>

      <div className="seg side">
        <button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>Buy</button>
        <button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>Sell</button>
      </div>

      {/* order type */}
      <div className="seg-label">
        Order type
        <Help>
          <b>Market</b> — buy/sell now at the best price.
          <br />
          <b>Limit</b> — only at your price or better.
          <br />
          <b>GTC</b> — rests on the book until filled/cancelled.
          <br />
          <b>Post-Only</b> — maker only; rejected if it would fill now.
          <br />
          <b>IOC</b> — fill what's available now, cancel the rest.
          <br />
          <b>FOK</b> — fill the whole amount at once, or nothing.
        </Help>
      </div>
      {funding === 'wallet' ? (
        <div className="seg otype">
          {(['market', 'limit'] as WalletType[]).map((t) => (
            <button key={t} className={wtype === t ? 'active' : ''} onClick={() => setWtype(t)}>
              {t === 'market' ? 'Market' : 'Limit'}
            </button>
          ))}
        </div>
      ) : (
        <div className="seg vtype">
          {(['GTC', 'POST_ONLY', 'IOC', 'FOK'] as VaultType[]).map((t) => (
            <button key={t} className={vtype === t ? 'active' : ''} onClick={() => setVtype(t)}>
              {t === 'POST_ONLY' ? 'Post' : t}
            </button>
          ))}
        </div>
      )}

      <div className="type-desc">{typeDesc}</div>

      {isLimitPriced ? (
        <label className="field">
          <span>Price ({info?.quote.symbol ?? 'quote'})</span>
          <input inputMode="decimal" placeholder={info?.tickSize ?? '0.00'} value={price} onChange={(e) => setPrice(e.target.value.trim())} />
        </label>
      ) : (
        <div className="field">
          <span>Price</span>
          <div className="market-px">
            Market · ~{priceNum > 0 ? fmtN(priceNum, dp) : '—'} {info?.quote.symbol}
            <em> ({(MARKET_SLIPPAGE * 100).toFixed(0)}% slippage)</em>
          </div>
        </div>
      )}

      <label className="field">
        <span>
          Amount ({info?.base.symbol ?? 'base'})
          <button className="link-max" onClick={() => setPct(100)} type="button">Max</button>
        </span>
        <input inputMode="decimal" placeholder={info?.minQty ?? '0.00'} value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
      </label>

      <input className="slider" type="range" min={0} max={100} step={1}
        value={maxBase > 0 ? Math.min(100, (num(amount) / maxBase) * 100) : 0}
        onChange={(e) => setPct(Number(e.target.value))} />
      <div className="pcts">
        {[25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)}>{p}%</button>)}
      </div>

      {funding === 'wallet' && wtype === 'limit' && (
        <div className="seg tif">
          {(['IOC', 'FOK'] as Tif[]).map((t) => (
            <button key={t} className={tif === t ? 'active' : ''} onClick={() => setTif(t)}>{t}</button>
          ))}
        </div>
      )}

      <div className="balances">
        <span>Avail · {funding}</span>
        <span>{fmtN(availBase, 4)} {info?.base.symbol}</span>
        <span>{fmtN(availQuote, 2)} {info?.quote.symbol}</span>
      </div>

      {calc && (
        <div className="cost">
          {side === 'buy' ? 'Pay ≈' : 'Receive ≈'}{' '}
          <b>{fmtN(calc.costNum, 4)} {info?.quote.symbol}</b>
          <span className="fee"> · fee 0%</span>
        </div>
      )}

      {calc?.errs?.map((e) => <div className="hint" key={e}>• {e}</div>)}

      {!isConnected ? (
        <div className="hint center">Connect your wallet to trade</div>
      ) : !onChain ? (
        <div className="hint center">Switch to Somnia testnet</div>
      ) : needsApproval ? (
        <button className={`btn-place ${side}`} disabled={busy} onClick={handleApprove}>
          {busy ? 'Approving…' : `Approve ${inputToken?.symbol}`}
        </button>
      ) : (
        <button className={`btn-place ${side}`} disabled={disabled} onClick={handlePlace}>
          {busy ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${info?.base.symbol ?? ''}`}
        </button>
      )}

      {funding === 'vault' && (
        <div className="hint center small">Vault funding enables resting GTC / Post-Only orders.</div>
      )}
    </section>
  );
}

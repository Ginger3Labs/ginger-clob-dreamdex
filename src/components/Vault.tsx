import { useState } from 'react';
import { maxUint256, parseUnits } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { ERC20_ABI, NATIVE_TOKEN, SPOT_POOL_ABI, somniaTestnet, type Market } from '../dreamdex/config';
import type { PoolInfo } from '../dreamdex/useOrderbook';
import { useVault } from '../dreamdex/useVault';
import { useTxToast } from './Toast';

export default function Vault({ market, info }: { market: Market; info?: PoolInfo }) {
  const { address, chainId } = useAccount();
  const vault = useVault(market, info);
  const { writeContractAsync, isPending } = useWriteContract();
  const track = useTxToast();
  const [token, setToken] = useState<'base' | 'quote'>('quote');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string>();

  const onChain = chainId === somniaTestnet.id;
  const t = info ? (token === 'base' ? info.base : info.quote) : undefined;
  const isNative = t?.address.toLowerCase() === NATIVE_TOKEN.toLowerCase();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: t?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, market.pool] : undefined,
    query: { enabled: !!address && !!t && !isNative && onChain },
  });

  async function deposit() {
    if (!t || !info || !amount) return;
    try {
      const raw = parseUnits(amount, t.decimals);
      if (isNative) {
        setBusy('deposit');
        await track(`Deposit ${t.symbol}`, () =>
          writeContractAsync({ address: market.pool, abi: SPOT_POOL_ABI, functionName: 'depositNative', args: [], value: raw }),
        );
      } else {
        if (allowance === undefined || (allowance as bigint) < raw) {
          setBusy('approve');
          await track(`Approve ${t.symbol}`, () =>
            writeContractAsync({ address: t.address, abi: ERC20_ABI, functionName: 'approve', args: [market.pool, maxUint256] }),
          );
          await refetchAllowance();
        }
        setBusy('deposit');
        await track(`Deposit ${t.symbol}`, () =>
          writeContractAsync({ address: market.pool, abi: SPOT_POOL_ABI, functionName: 'deposit', args: [t.address, raw] }),
        );
      }
      setAmount('');
      vault.refetch();
    } catch {
      /* toast shows the error */
    } finally {
      setBusy(undefined);
    }
  }

  async function withdraw() {
    if (!t || !amount) return;
    try {
      const raw = parseUnits(amount, t.decimals);
      setBusy('withdraw');
      await track(`Withdraw ${t.symbol}`, () =>
        writeContractAsync({
          address: market.pool, abi: SPOT_POOL_ABI, functionName: 'withdraw',
          args: [isNative ? NATIVE_TOKEN : t.address, raw],
        }),
      );
      setAmount('');
      vault.refetch();
    } catch {
      /* toast shows the error */
    } finally {
      setBusy(undefined);
    }
  }

  const fmt = (n: number, dp: number) => n.toLocaleString('en-US', { maximumFractionDigits: dp });

  return (
    <section className="panel vault">
      <div className="panel-title">Vault (for resting orders)</div>

      <div className="vault-bals">
        <div><span>{info?.base.symbol ?? 'base'}</span><b>{fmt(vault.baseNum, 4)}</b></div>
        <div><span>{info?.quote.symbol ?? 'quote'}</span><b>{fmt(vault.quoteNum, 2)}</b></div>
      </div>

      <div className="seg token">
        <button className={token === 'base' ? 'active' : ''} onClick={() => setToken('base')}>{info?.base.symbol ?? 'base'}</button>
        <button className={token === 'quote' ? 'active' : ''} onClick={() => setToken('quote')}>{info?.quote.symbol ?? 'quote'}</button>
      </div>

      <input
        className="vault-amt" inputMode="decimal" placeholder="amount"
        value={amount} onChange={(e) => setAmount(e.target.value.trim())}
      />

      <div className="vault-actions">
        <button disabled={!onChain || !amount || isPending} onClick={deposit}>
          {busy === 'approve' ? 'Approving…' : busy === 'deposit' ? 'Depositing…' : 'Deposit'}
        </button>
        <button className="ghost" disabled={!onChain || !amount || isPending} onClick={withdraw}>
          {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
        </button>
      </div>
    </section>
  );
}

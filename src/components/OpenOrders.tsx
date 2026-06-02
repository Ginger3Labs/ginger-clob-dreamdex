import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { SPOT_POOL_ABI, somniaTestnet, type Market } from '../dreamdex/config';
import type { PoolInfo } from '../dreamdex/useOrderbook';
import { useOpenOrders } from '../dreamdex/useOpenOrders';
import { useTxToast } from './Toast';

function fmt(n: number, dp: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
}

export default function OpenOrders({
  market,
  info,
  priceDp,
}: {
  market: Market;
  info?: PoolInfo;
  priceDp: number;
}) {
  const { isConnected, chainId } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const { orders, loading } = useOpenOrders(market, info, refreshKey);
  const { writeContractAsync } = useWriteContract();
  const track = useTxToast();
  const [busyId, setBusyId] = useState<string>();

  const onChain = chainId === somniaTestnet.id;

  async function cancel(id: bigint) {
    setBusyId(id.toString());
    try {
      await track('Cancel order', () =>
        writeContractAsync({ address: market.pool, abi: SPOT_POOL_ABI, functionName: 'cancelOrder', args: [id] }),
      );
      setRefreshKey((k) => k + 1);
    } catch {
      /* toast shows the error */
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="panel open-orders">
      <div className="panel-title with-controls">
        <span>Open Orders {orders.length > 0 && `(${orders.length})`}</span>
        {isConnected && onChain && (
          <button className="mini" onClick={() => setRefreshKey((k) => k + 1)}>refresh</button>
        )}
      </div>

      {!isConnected ? (
        <div className="empty">connect wallet</div>
      ) : !onChain ? (
        <div className="empty">switch to Somnia</div>
      ) : orders.length === 0 ? (
        <div className="empty">{loading ? 'loading…' : 'no open orders'}</div>
      ) : (
        <div className="oo-table">
          <div className="oo-head">
            <span>side</span>
            <span>price</span>
            <span>size</span>
            <span>filled</span>
            <span></span>
          </div>
          {orders.map((o) => (
            <div className="oo-row" key={o.id.toString()}>
              <span className={o.isBid ? 'buy' : 'sell'}>{o.isBid ? 'Buy' : 'Sell'}</span>
              <span>{fmt(o.price, priceDp)}</span>
              <span>{fmt(o.remaining, 4)} {info?.base.symbol}</span>
              <span>{o.full > 0 ? `${Math.round((o.filled / o.full) * 100)}%` : '—'}</span>
              <button
                className="cancel"
                disabled={busyId === o.id.toString()}
                onClick={() => cancel(o.id)}
              >
                {busyId === o.id.toString() ? '…' : 'Cancel'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

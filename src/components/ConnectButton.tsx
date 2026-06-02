import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { somniaTestnet } from '../dreamdex/config';

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtBal(v: bigint, decimals: number) {
  const n = Number(v) / 10 ** decimals;
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 });
}

export default function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({
    address,
    chainId: somniaTestnet.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button
        className="btn-connect"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  if (chainId !== somniaTestnet.id) {
    return (
      <button
        className="btn-connect warn"
        onClick={() => switchChain({ chainId: somniaTestnet.id })}
      >
        Switch to Somnia
      </button>
    );
  }

  return (
    <div className="wallet-info">
      {balance && (
        <span className="bal-chip" title="native gas balance">
          {fmtBal(balance.value, balance.decimals)} {balance.symbol}
        </span>
      )}
      <button className="btn-connect ghost" onClick={() => disconnect()} title="Disconnect">
        {address ? short(address) : 'Connected'}
      </button>
    </div>
  );
}

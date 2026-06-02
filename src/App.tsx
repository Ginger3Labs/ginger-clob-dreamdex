import { useMemo, useState } from 'react';
import { INTERVALS, MARKETS, type Interval } from './dreamdex/config';
import { useOrderbook } from './dreamdex/useOrderbook';
import { useCandles, useFills, usePriceTape } from './dreamdex/useFeeds';
import Chart from './components/Chart';
import Orderbook from './components/Orderbook';
import TradesFeed from './components/TradesFeed';
import OrderTicket from './components/OrderTicket';
import Vault from './components/Vault';
import OpenOrders from './components/OpenOrders';
import MarketHeader from './components/MarketHeader';
import ConnectButton from './components/ConnectButton';

export default function App() {
  const [marketIdx, setMarketIdx] = useState(0);
  const [interval, setInterval] = useState<Interval>('1m');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const market = MARKETS[marketIdx];

  const book = useOrderbook(market);
  const baseDecimals = book.info?.base.decimals ?? 18;
  const { ticks } = usePriceTape(market);
  const { candles, loading: candlesLoading } = useCandles(market, interval);
  const { fills } = useFills(market, baseDecimals);

  const priceDp = useMemo(() => {
    const t = book.info?.tickSize ?? '0.01';
    const frac = t.split('.')[1]?.replace(/0+$/, '').length ?? 2;
    return Math.max(frac, 2);
  }, [book.info?.tickSize]);

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
  const spreadBps =
    bestBid && bestAsk && mid ? ((bestAsk - bestBid) / mid) * 10_000 : undefined;

  // session stats from the mark-price candles we sample
  const stats = useMemo(() => {
    if (candles.length === 0) return {};
    const highs = candles.map((c) => Number(c.high));
    const lows = candles.map((c) => Number(c.low));
    const open = Number(candles[0].open);
    const close = Number(candles[candles.length - 1].close);
    return {
      high: Math.max(...highs),
      low: Math.min(...lows),
      changePct: open ? ((close - open) / open) * 100 : undefined,
    };
  }, [candles]);

  const lastTick = ticks[0];

  function onPick(p: string, s: 'buy' | 'sell') {
    setPrice(p);
    setSide(s);
  }

  return (
    <div className="app pro">
      <MarketHeader
        markets={MARKETS}
        marketIdx={marketIdx}
        onSelect={setMarketIdx}
        priceDp={priceDp}
        last={lastTick ? Number(lastTick.price) : book.markPrice ?? mid}
        lastDir={lastTick?.dir}
        mark={book.markPrice}
        spreadBps={spreadBps}
        high={stats.high}
        low={stats.low}
        changePct={stats.changePct}
        right={<ConnectButton />}
      />

      <div className="grid">
        {/* Chart */}
        <section className="panel chart-panel">
          <div className="panel-title with-controls">
            <span>Price · {market.pair}</span>
            <div className="intervals">
              {INTERVALS.map((iv) => (
                <button key={iv} className={iv === interval ? 'active' : ''} onClick={() => setInterval(iv)}>
                  {iv}
                </button>
              ))}
            </div>
          </div>
          {candlesLoading && candles.length === 0 ? (
            <div className="chart placeholder">sampling mark price…</div>
          ) : (
            <Chart candles={candles} />
          )}
        </section>

        {/* Order book + trades */}
        <div className="col">
          <Orderbook book={book} priceDp={priceDp} onPick={onPick} />
          <TradesFeed
            fills={fills}
            ticks={ticks}
            priceDp={priceDp}
            baseSymbol={book.info?.base.symbol ?? 'size'}
          />
        </div>

        {/* Order ticket + vault */}
        <div className="col">
          <OrderTicket
            market={market}
            info={book.info}
            bestBid={bestBid}
            bestAsk={bestAsk}
            side={side}
            setSide={setSide}
            price={price}
            setPrice={setPrice}
          />
          <Vault market={market} info={book.info} />
        </div>
      </div>

      <OpenOrders market={market} info={book.info} priceDp={priceDp} />

      <footer>
        pool {market.pool} · order book on-chain · trades from OrderFilled · candles from mark price · testnet 50312
      </footer>
    </div>
  );
}

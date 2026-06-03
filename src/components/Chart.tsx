import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../dreamdex/useFeeds';

type ChartType = 'candle' | 'line';

// Robust price range that ignores outlier wicks (e.g. the lone 0.12 / 1.0 prints
// on a thin testnet book) so the scale tracks where price actually trades. Based
// on the 5th/95th percentile of open & close levels, so it adapts per market
// (SOMI, WETH, WBTC) — for SOMI this lands around 0.13–0.18.
function robustRange(data: CandlestickData[]): { minValue: number; maxValue: number } | null {
  if (data.length < 6) return null;
  const levels = data.flatMap((d) => [d.open, d.close]).sort((a, b) => a - b);
  const q = (arr: number[], p: number) =>
    arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
  const lo = q(levels, 0.05);
  const hi = q(levels, 0.95);
  if (!(hi > lo)) return null;
  const pad = (hi - lo) * 0.15;
  return { minValue: lo - pad, maxValue: hi + pad };
}

export default function Chart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const dataRef = useRef<CandlestickData[]>([]);
  const sigRef = useRef<{ len: number; first?: number; last?: number }>({ len: 0 });

  const [type, setType] = useState<ChartType>('candle');
  const [logScale, setLogScale] = useState(false);
  const [grid, setGrid] = useState(true);

  // Create chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.4)' },
        horzLines: { color: 'rgba(31, 41, 55, 0.4)' },
      },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: {
        borderColor: '#1f2937',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      // Defaults: mouse wheel zooms the time scale, drag pans.
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // (Re)create the series whenever the chart type changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    const autoscaleInfoProvider = (base: () => any) => {
      const range = robustRange(dataRef.current);
      if (range) return { priceRange: range };
      return base();
    };
    seriesRef.current =
      type === 'candle'
        ? chart.addCandlestickSeries({
            upColor: '#16c784',
            downColor: '#ea3943',
            borderUpColor: '#16c784',
            borderDownColor: '#ea3943',
            wickUpColor: '#16c784',
            wickDownColor: '#ea3943',
            autoscaleInfoProvider,
          })
        : chart.addLineSeries({ color: '#16c784', lineWidth: 2, autoscaleInfoProvider });
    sigRef.current = { len: 0 }; // force a fresh setData below
  }, [type]);

  // Grid + price-scale mode toggles.
  useEffect(() => {
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.4)', visible: grid },
        horzLines: { color: 'rgba(31, 41, 55, 0.4)', visible: grid },
      },
    });
  }, [grid]);

  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: logScale ? 1 : 0 });
  }, [logScale]);

  // Push data on update. update() the live bar to avoid refit jumps; setData (+
  // fitContent) only when the candle series actually changed or type switched.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: (c.timestamp / 1000) as UTCTimestamp,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));
    dataRef.current = candleData;
    const lineData: LineData[] = candleData.map((c) => ({ time: c.time, value: c.close }));
    const data = type === 'candle' ? candleData : lineData;

    const first = Number(candleData[0].time);
    const last = Number(candleData[candleData.length - 1].time);
    const sig = sigRef.current;
    if (sig.len === data.length && sig.first === first && sig.last === last) {
      (series as ISeriesApi<'Candlestick'>).update(data[data.length - 1] as CandlestickData);
    } else {
      (series as ISeriesApi<'Candlestick'>).setData(data as CandlestickData[]);
      // Sparse testnet history (few bars) otherwise anchors right and leaves a
      // big empty gap on the left — stretch the bars to fill the whole panel.
      chartRef.current?.timeScale().fitContent();
    }
    sigRef.current = { len: data.length, first, last };
  }, [candles, type]);

  return (
    <div className="chart-host">
      <div className="chart-bar">
        <div className="cb-seg">
          <button className={type === 'candle' ? 'active' : ''} onClick={() => setType('candle')}>
            Candles
          </button>
          <button className={type === 'line' ? 'active' : ''} onClick={() => setType('line')}>
            Line
          </button>
        </div>
        <div className="cb-seg">
          <button className={!logScale ? 'active' : ''} onClick={() => setLogScale(false)}>
            Linear
          </button>
          <button className={logScale ? 'active' : ''} onClick={() => setLogScale(true)}>
            Log
          </button>
        </div>
        <label className="cb-check">
          <span className={`cm-toggle ${grid ? 'on' : ''}`} onClick={() => setGrid((v) => !v)}>
            <span className="cm-knob" />
          </span>
          Grid
        </label>
      </div>
      <div className="chart" ref={containerRef} />
    </div>
  );
}

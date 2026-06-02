import { useEffect, useRef } from 'react';
import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../dreamdex/useFeeds';

export default function Chart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const sigRef = useRef<{ len: number; first?: number; last?: number }>({ len: 0 });

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
    });

    const series = chart.addCandlestickSeries({
      upColor: '#16c784',
      downColor: '#ea3943',
      borderUpColor: '#16c784',
      borderDownColor: '#ea3943',
      wickUpColor: '#16c784',
      wickDownColor: '#ea3943',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push data on update. Use update() for the live candle to avoid refit jumps;
  // only setData (which refits) when the series of candles actually changed.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;

    const data: CandlestickData[] = candles.map((c) => ({
      time: (c.timestamp / 1000) as UTCTimestamp,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));

    const first = Number(data[0].time);
    const last = Number(data[data.length - 1].time);
    const sig = sigRef.current;
    if (sig.len === data.length && sig.first === first && sig.last === last) {
      series.update(data[data.length - 1]);
    } else {
      series.setData(data);
    }
    sigRef.current = { len: data.length, first, last };
  }, [candles]);

  return <div className="chart" ref={containerRef} />;
}

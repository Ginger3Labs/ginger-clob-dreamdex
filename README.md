# ginger-clob-dreamdex

Minimal CLOB front-end for **dreamDEX** on Somnia, branded as Somnia Exchange Pro.
Talks **directly** to dreamDEX (on-chain via viem) — no backend.

## Stack

- Vite + React + TypeScript
- [viem](https://viem.sh) for on-chain reads
- [lightweight-charts](https://github.com/tradingview/lightweight-charts) for the price chart

## What it shows (Somnia testnet, chain 50312)

All data is read **live on-chain** from the dreamDEX `SpotPool` contracts:

- **Order book** — `getBookLevels` (deep; testnet runs a constant market-maker bot)
- **Price chart** — candles sampled client-side from the EMA mark price (`getMidpointEmaState`), bucketed by interval; builds up while the page is open
- **Mark-price tape** — one row per price change (testnet has no real fills, only MM quoting)

> dreamDEX's public REST/WS API exists on **mainnet only**, but mainnet order
> books are thin. Testnet has deep books but no REST, so trades/candles here are
> derived from on-chain state.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # type-check + production build
```

## Layout

```
src/
  dreamdex/
    config.ts        chain, tokens, pools, ABI
    client.ts        viem public client
    useOrderbook.ts  on-chain order book (polling)
    useFeeds.ts      live candles + mark-price tape
  components/
    Chart.tsx        candlestick chart
    PriceTape.tsx    live mark-price feed
  App.tsx            layout (chart | book | tape)
```

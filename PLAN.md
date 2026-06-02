# Pro Trade Screen — Plan

Goal: a professional CLOB trading terminal (Hyperliquid / dYdX class) for **dreamDEX**
on Somnia, talking **directly** to the on-chain `SpotPool` contracts (no backend).
Built on top of the existing base (order book + chart + tape + IOC/FOK ticket +
connect / STT balance).

## Target layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◧ Somnia Exchange Pro  [SOMI/USDso ▾]  last ▲  24h%  vol  mark  spread  [bal][0x..] │  market header
├──────────────────────────────────┬──────────────────┬──────────────────────┤
│              CHART                │   ORDER BOOK     │     ORDER TICKET     │
│  (candles, interval, overlays)   │  grouping,       │  Buy │ Sell          │
│                                  │  click-to-fill,  │  Market│Limit         │
│                                  │  depth bars,     │  price / amount      │
│                                  │  spread row      │  % slider, total,fee │
│                                  ├──────────────────┤  funding wallet/vault│
│                                  │  TRADES (live)   │  [Approve] [Place]   │
├──────────────────────────────────┴──────────────────┴──────────────────────┤
│ [ Open Orders ] [ History ] [ Balances ]            bottom tabs             │
└──────────────────────────────────────────────────────────────────────────┘
```

## Constraints
- Everything reads on-chain / dreamDEX directly (no backend).
- Testnet has no public REST/WS → trades & candles are event/state derived.
- Every write call runs `simulateContract` first for a clean revert, then sends.
- **Known quirk:** the deployed `SpotPool` treats `expireTimestampNs = 0` as
  already-expired and silently rejects. Always pass a future Unix-ns timestamp.
- Deployed selector for `placeTakerOrderWithoutVault` is `0x1c792779` (9-arg
  builder-code form).

## Phases

### Phase 0 — Foundation / refactor
- Pro terminal layout grid (above), responsive breakpoints.
- Design primitives: `Panel`, `Button`, `Tabs`, `Modal`, `Tooltip`.
- Global tx-toast system (pending → confirmed → failed, explorer link, error map).
- Shared state/hooks: `useMarket()`, single polling layer; lift `side`/`price`
  to the app so the book can drive the ticket.

### Phase 1 — Market data & depth
- Market header bar: last price (colored), mark (EMA), spread, best bid/ask,
  session high/low/change derived from mark samples, volume from `OrderFilled`.
- Order book upgrades: price **grouping** (x1/x10/x100 tick), cumulative depth
  bars, **click-to-fill** (row → ticket price), centered spread row, hover totals.
- Real **trades** from `OrderFilled` (now that fills work) + live `watchEvent`.
- Contracts: `getBookLevels`, `getMidpointEmaState`, `OrderFilled` / `MarkPriceUpdated`.

### Phase 2 — Pro order ticket
- Type matrix: Buy/Sell × Market/Limit × IOC/FOK (Market = aggressive IOC).
- Amount % slider, live Total/Cost, fee display, min/lot/tick hints.
- Wallet balances (base/quote/STT) + Max button; polished approve flow.
- Contracts: `placeTakerOrderWithoutVault`, `convertToQuoteAtPriceCeil`, ERC-20.

### Phase 3 — Vault + resting (limit) orders
- Vault module: `deposit` / `depositNative` / `withdraw`, `getWithdrawableBalance`.
- Funding source toggle: Wallet (IOC/FOK) ↔ Vault (GTC / Post-Only).
- Resting limit orders via `placeOrder` (maker side).

### Phase 4 — Open orders, history, balances
- Open orders table: `getOwnOpenOrders` + `getOrder`; Cancel (`cancelOrder`),
  Reduce (`reduceOrder`); mark own orders in the book.
- Fill history: user `OrderFilled` events (backfill + live).
- Balances tab: wallet + vault in one place.

### Phase 5 — Advanced
- Stop / take-profit via `SpotStopOrderRegistry.createPendingOrder` (GTE/LTE,
  MARKET/LIMIT, `somiPaymentPerOrder`), cancel, open-stops list.
- Simple Swap tab (testnet) via `SpotRouter.quoteMarketExactIn` → `swapExactIn`.
- Chart polish: trade markers, best bid/ask price lines.

### Phase 6 — Polish
- Multi-wallet (RainbowKit/WalletConnect), chain guard, persisted settings,
  error-message mapping, mobile layout, empty/loading states.

## Suggested order
0 → 1 → 2 → 3 → 4, then advanced. First shippable milestone: **Phase 0 + 1**
(pro layout + click-to-fill order book + real trades).

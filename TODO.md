# TODO

Working backlog. See `PLAN.md` for the full phased plan.

## UX / clarity
- [ ] **Explain order types & funding clearly in the UI.** Add tooltips / an info
      popover / a small help panel describing each control so users aren't lost:
  - Funding: **Wallet** (instant, IOC/FOK only) vs **Vault** (deposit first,
    enables resting GTC/Post-Only).
  - Order types: **Market**, **Limit**, **GTC**, **Post-Only**, **IOC**, **FOK** —
    one-line plain-language explanation each, shown inline (hover `?` or expandable).
  - Vault deposit/withdraw: why you need it for resting orders.
  - First-time hint / short legend near the ticket.

## Layout / polish
- [x] Order book + mark price must not jump — fixed-height rows, scroll inside.
- [ ] Stable column heights across panels (avoid reflow on data updates).
- [ ] Toast notifications for tx lifecycle (pending → confirmed → failed).

## Remaining phases (from PLAN.md)
- [ ] Phase 5 — Stop / take-profit (`SpotStopOrderRegistry`), multi-hop swap
      (`SpotRouter`), chart trade markers + best bid/ask lines.
- [ ] Phase 6 — Multi-wallet (RainbowKit/WalletConnect), persisted settings,
      error-message mapping, mobile layout, empty/loading states.
- [ ] Order history tab (user `OrderFilled` backfill + live).
- [ ] `reduceOrder` action in the Open Orders panel (UI not wired yet).

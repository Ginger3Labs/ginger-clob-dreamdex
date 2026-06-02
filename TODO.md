# TODO

Working backlog. See `PLAN.md` for the full phased plan.

## UX / clarity
- [x] **Explain order types & funding clearly in the UI.** Added `?` Help
      tooltips on Funding and Order type, plus a dynamic one-line description of
      the currently selected type under the type selector.
  - [ ] (follow-up) Vault deposit/withdraw inline help + first-run legend.

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

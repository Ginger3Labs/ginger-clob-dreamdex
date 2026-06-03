import { defineChain } from 'viem';

// --- Somnia testnet (Shannon) ------------------------------------------------
// Testnet has a constant market-maker bot, so the on-chain order book is deep.
// There is NO public dreamDEX REST/WS on testnet — trades & candles are derived
// from on-chain events (see useTrades / useCandles).

export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.infra.testnet.somnia.network/'] },
  },
  blockExplorers: {
    default: { name: 'Shannon Explorer', url: 'https://shannon-explorer.somnia.network' },
  },
  testnet: true,
});

// --- Tokens (testnet) --------------------------------------------------------
// Source: somnia-dex-docs/.gitbook/includes/contract-addresses.md

export const NATIVE_TOKEN = '0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00'; // SOMI sentinel

export const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x9c32f3827a1a99f0cf9b213de8b53ec3d57bb171': { symbol: 'USDso', decimals: 18 },
  '0x4e85dc48a70da1298489d5b6fc2492767d98f384': { symbol: 'WBTC', decimals: 8 },
  '0x4d8e02bbfcf205828a8352af4376b165e123d7b0': { symbol: 'WETH', decimals: 18 },
  [NATIVE_TOKEN.toLowerCase()]: { symbol: 'SOMI', decimals: 18 },
};

export function tokenMeta(address: string) {
  return (
    TOKENS[address.toLowerCase()] ?? { symbol: address.slice(0, 8), decimals: 18 }
  );
}

// --- Spot pools (testnet) ----------------------------------------------------

export type Market = { pair: string; symbol: string; pool: `0x${string}` };

export const MARKETS: Market[] = [
  { pair: 'SOMI/USDso', symbol: 'SOMI:USDso', pool: '0x259fD6559214dd5aD3752322426eA9F9fABEFff4' },
  { pair: 'WETH/USDso', symbol: 'WETH:USDso', pool: '0xD180195da5459C7a0DEA188ed61216ec43682b50' },
  { pair: 'WBTC/USDso', symbol: 'WBTC:USDso', pool: '0x3605f28aA7C50e7441211e77Cb0762d49539326C' },
];

// Indexer aggregates from 5m up (1m comes back empty), so 1m is omitted.
export const INTERVALS = ['5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];

// dreamDEX HTTP API (testnet). Public, no auth. Serves historical OHLCV candles
// keyed by the market `symbol` (e.g. "SOMI:USDso").
export const DREAMDEX_API = 'https://stg.api.dreamdex.io';

// --- Minimal SpotPool ABI ----------------------------------------------------

export const SPOT_POOL_ABI = [
  {
    type: 'function',
    name: 'getPoolParams',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'baseToken_', type: 'address' },
      { name: 'quoteToken_', type: 'address' },
      { name: 'makerFeeBpsTimes1k_', type: 'uint256' },
      { name: 'takerFeeBpsTimes1k_', type: 'uint256' },
      { name: 'tickSize_', type: 'uint256' },
      { name: 'minQuantity_', type: 'uint256' },
      { name: 'lotSize_', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getBookLevels',
    stateMutability: 'view',
    inputs: [
      { name: 'isBid', type: 'bool' },
      { name: 'numLevels', type: 'uint64' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'price', type: 'uint256' },
          { name: 'quantity', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getMidpointEmaState',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'emaValue', type: 'uint256' },
      { name: 'lastUpdateNs', type: 'uint64' },
    ],
  },
  {
    // Wallet-funded taker order (IOC=2 or FOK=1). payable for native input.
    type: 'function',
    name: 'placeTakerOrderWithoutVault',
    stateMutability: 'payable',
    inputs: [
      { name: 'isBid', type: 'bool' },
      { name: 'userData', type: 'uint64' },
      { name: 'price', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'expireTimestampNs', type: 'uint64' },
      { name: 'orderType', type: 'uint8' },
      { name: 'selfMatchingOption', type: 'uint8' },
      { name: 'builder', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint96' },
    ],
    outputs: [
      { name: 'success', type: 'bool' },
      { name: 'orderId', type: 'uint128' },
    ],
  },
  {
    // Vault-funded order (supports all types incl. GTC=0 / PostOnly=3 resting).
    type: 'function',
    name: 'placeOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'isBid', type: 'bool' },
      { name: 'userData', type: 'uint64' },
      { name: 'price', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'expireTimestampNs', type: 'uint64' },
      { name: 'orderType', type: 'uint8' },
      { name: 'selfMatchingOption', type: 'uint8' },
      { name: 'builder', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint96' },
    ],
    outputs: [
      { name: 'success', type: 'bool' },
      { name: 'orderId', type: 'uint128' },
    ],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'depositNative',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getWithdrawableBalance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getOwnOpenOrders',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint128[]' }],
  },
  {
    type: 'function',
    name: 'getOrder',
    stateMutability: 'view',
    inputs: [{ name: 'orderId', type: 'uint128' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'orderId', type: 'uint128' },
          { name: 'isBid', type: 'bool' },
          { name: 'owner', type: 'address' },
          { name: 'userData', type: 'uint64' },
          { name: 'price', type: 'uint256' },
          { name: 'fullQuantity', type: 'uint256' },
          { name: 'quantityRemaining', type: 'uint256' },
          { name: 'expireTimestampNs', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'cancelOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint128' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reduceOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'orderId', type: 'uint128' },
      { name: 'newQuantityRemaining', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// Order type codes. Wallet funding ⇒ IOC/FOK only. Vault ⇒ all four.
export const ORDER_TYPE = { GTC: 0, FOK: 1, IOC: 2, POST_ONLY: 3 } as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

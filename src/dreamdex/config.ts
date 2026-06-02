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

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];

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
] as const;

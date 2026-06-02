import { createPublicClient, http } from 'viem';
import { somniaTestnet } from './config';

export const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
});

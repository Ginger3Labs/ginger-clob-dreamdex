import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { somniaTestnet } from '../dreamdex/config';

export const wagmiConfig = createConfig({
  chains: [somniaTestnet],
  connectors: [injected()],
  transports: {
    [somniaTestnet.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
